/**
 * VM Orchestrator
 *
 * Manages isolated Chrome instances (virtual machines) for running
 * automation tasks across multiple sites/clients/affiliates
 *
 * Features:
 * - Launch 100+ isolated Chrome profiles
 * - Run parallel automation tasks (one per client)
 * - Resource pooling + cleanup
 * - Sandboxed environments (no cross-contamination)
 * - Task scheduling (queue management)
 *
 * Use Case:
 *   CalRiven manages 50 affiliate sites → VM Orchestrator runs
 *   isolated automation for each site in parallel
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

class VMOrchestrator {
  constructor(options = {}) {
    this.config = {
      // VM pool settings
      maxVMs: options.maxVMs || 100,
      vmBaseDir: options.vmBaseDir || './chrome-vms',
      headless: options.headless !== false,

      // Resource limits
      maxMemoryPerVM: options.maxMemoryPerVM || 512, // MB
      maxCPUPerVM: options.maxCPUPerVM || 50, // % (0.5 core)

      // Browser settings
      defaultTimeout: options.defaultTimeout || 30000,
      defaultViewport: options.defaultViewport || { width: 1920, height: 1080 },

      // Task queue
      maxConcurrentTasks: options.maxConcurrentTasks || 10,
      taskTimeout: options.taskTimeout || 300000 // 5 min
    };

    // VM pool
    this.vms = new Map(); // { vmId: { browser, page, status, clientId } }
    this.taskQueue = [];
    this.runningTasks = 0;

    // Ensure VM directory exists
    if (!fs.existsSync(this.config.vmBaseDir)) {
      fs.mkdirSync(this.config.vmBaseDir, { recursive: true });
    }

    console.log('[VMOrchestrator] Initialized (max VMs:', this.config.maxVMs + ')');
  }

  /**
   * Launch a new VM for a client/affiliate
   */
  async launchVM(clientId, options = {}) {
    if (this.vms.size >= this.config.maxVMs) {
      throw new Error(`VM limit reached (${this.config.maxVMs})`);
    }

    const vmId = `${clientId}_${Date.now()}`;
    const profilePath = path.join(this.config.vmBaseDir, clientId);

    console.log(`[VMOrchestrator] 🚀 Launching VM for ${clientId}...`);

    try {
      // Launch isolated browser instance
      const browser = await puppeteer.launch({
        headless: this.config.headless ? 'new' : false,
        userDataDir: profilePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          `--memory-pressure-off`,
          `--max-old-space-size=${this.config.maxMemoryPerVM}`,
          ...( options.extraArgs || [])
        ]
      });

      const page = await browser.newPage();

      // Set default viewport
      await page.setViewport(this.config.defaultViewport);

      // Set user agent
      const userAgent = options.userAgent || `CalRiven-VM-${clientId}/1.0`;
      await page.setUserAgent(userAgent);

      // Set default timeout
      page.setDefaultTimeout(this.config.defaultTimeout);

      // Store VM
      this.vms.set(vmId, {
        browser,
        page,
        status: 'idle',
        clientId,
        launchedAt: Date.now(),
        tasksCompleted: 0
      });

      console.log(`[VMOrchestrator] ✅ VM launched: ${vmId}`);

      return vmId;
    } catch (err) {
      console.error(`[VMOrchestrator] ❌ Failed to launch VM for ${clientId}:`, err.message);
      throw err;
    }
  }

  /**
   * Execute task in a VM
   */
  async executeTask(clientId, task) {
    // Find or create VM for client
    let vmId = this._findIdleVM(clientId);

    if (!vmId) {
      // No idle VM found, launch new one
      vmId = await this.launchVM(clientId);
    }

    const vm = this.vms.get(vmId);
    if (!vm) {
      throw new Error(`VM not found: ${vmId}`);
    }

    vm.status = 'busy';

    try {
      console.log(`[VMOrchestrator] 📋 Executing task for ${clientId}...`);

      // Execute task function
      const result = await Promise.race([
        task(vm.page, vm.browser),
        this._timeout(this.config.taskTimeout)
      ]);

      vm.tasksCompleted++;
      vm.status = 'idle';

      console.log(`[VMOrchestrator] ✅ Task completed for ${clientId}`);

      return result;
    } catch (err) {
      console.error(`[VMOrchestrator] ❌ Task failed for ${clientId}:`, err.message);
      vm.status = 'error';
      throw err;
    }
  }

  /**
   * Queue a task (runs when VM becomes available)
   */
  async queueTask(clientId, task) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ clientId, task, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Process task queue
   */
  async _processQueue() {
    while (this.taskQueue.length > 0 && this.runningTasks < this.config.maxConcurrentTasks) {
      const { clientId, task, resolve, reject } = this.taskQueue.shift();

      this.runningTasks++;

      this.executeTask(clientId, task)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.runningTasks--;
          this._processQueue(); // Continue processing
        });
    }
  }

  /**
   * Find idle VM for client
   */
  _findIdleVM(clientId) {
    for (const [vmId, vm] of this.vms.entries()) {
      if (vm.clientId === clientId && vm.status === 'idle') {
        return vmId;
      }
    }
    return null;
  }

  /**
   * Destroy VM
   */
  async destroyVM(vmId) {
    const vm = this.vms.get(vmId);
    if (!vm) return;

    console.log(`[VMOrchestrator] 🗑️  Destroying VM: ${vmId}`);

    try {
      await vm.browser.close();
      this.vms.delete(vmId);
      console.log(`[VMOrchestrator] ✅ VM destroyed: ${vmId}`);
    } catch (err) {
      console.error(`[VMOrchestrator] ❌ Failed to destroy VM ${vmId}:`, err.message);
    }
  }

  /**
   * Destroy all VMs for a client
   */
  async destroyClientVMs(clientId) {
    const vmIds = Array.from(this.vms.entries())
      .filter(([_, vm]) => vm.clientId === clientId)
      .map(([vmId]) => vmId);

    for (const vmId of vmIds) {
      await this.destroyVM(vmId);
    }

    console.log(`[VMOrchestrator] ✅ Destroyed ${vmIds.length} VMs for ${clientId}`);
  }

  /**
   * Destroy all VMs
   */
  async destroyAll() {
    console.log(`[VMOrchestrator] 🗑️  Destroying all ${this.vms.size} VMs...`);

    const promises = Array.from(this.vms.keys()).map(vmId => this.destroyVM(vmId));
    await Promise.all(promises);

    console.log('[VMOrchestrator] ✅ All VMs destroyed');
  }

  /**
   * Get VM status
   */
  getVMStatus(vmId) {
    const vm = this.vms.get(vmId);
    if (!vm) return null;

    return {
      vmId,
      clientId: vm.clientId,
      status: vm.status,
      launchedAt: vm.launchedAt,
      uptime: Date.now() - vm.launchedAt,
      tasksCompleted: vm.tasksCompleted
    };
  }

  /**
   * Get status of all VMs
   */
  getAllStatus() {
    return {
      totalVMs: this.vms.size,
      maxVMs: this.config.maxVMs,
      queuedTasks: this.taskQueue.length,
      runningTasks: this.runningTasks,
      vms: Array.from(this.vms.keys()).map(vmId => this.getVMStatus(vmId))
    };
  }

  /**
   * Screenshot from VM
   */
  async screenshot(vmId, filePath) {
    const vm = this.vms.get(vmId);
    if (!vm) throw new Error(`VM not found: ${vmId}`);

    await vm.page.screenshot({ path: filePath, fullPage: true });
    console.log(`[VMOrchestrator] 📸 Screenshot saved: ${filePath}`);
  }

  /**
   * Get HTML from VM page
   */
  async getHTML(vmId) {
    const vm = this.vms.get(vmId);
    if (!vm) throw new Error(`VM not found: ${vmId}`);

    return await vm.page.content();
  }

  /**
   * Execute script in VM
   */
  async evaluateInVM(vmId, script) {
    const vm = this.vms.get(vmId);
    if (!vm) throw new Error(`VM not found: ${vmId}`);

    return await vm.page.evaluate(script);
  }

  /**
   * Timeout helper
   */
  _timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), ms);
    });
  }

  /**
   * Clean up idle VMs (garbage collection)
   */
  async garbageCollect(maxIdleTime = 600000) { // 10 min default
    const now = Date.now();
    const toDestroy = [];

    for (const [vmId, vm] of this.vms.entries()) {
      if (vm.status === 'idle' && (now - vm.launchedAt) > maxIdleTime) {
        toDestroy.push(vmId);
      }
    }

    for (const vmId of toDestroy) {
      await this.destroyVM(vmId);
    }

    console.log(`[VMOrchestrator] 🧹 Garbage collected ${toDestroy.length} idle VMs`);
  }

  /**
   * Start auto garbage collection
   */
  startAutoGC(interval = 300000) { // 5 min
    this.gcInterval = setInterval(() => {
      this.garbageCollect();
    }, interval);

    console.log('[VMOrchestrator] ♻️  Auto garbage collection started');
  }

  /**
   * Stop auto garbage collection
   */
  stopAutoGC() {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
      console.log('[VMOrchestrator] ♻️  Auto garbage collection stopped');
    }
  }
}

module.exports = VMOrchestrator;
