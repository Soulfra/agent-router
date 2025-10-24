/**
 * Hosting Service API
 *
 * White-label hosting platform for affiliates and contractors
 *
 * Features:
 * - One-click site deployment (POST /api/hosting/deploy)
 * - Automated VPS provisioning (Hetzner API)
 * - Domain management + SSL
 * - White-label dashboard for affiliates
 * - Billing integration (Stripe)
 * - Revenue share tracking
 *
 * Use Case:
 *   CalRiven's affiliates deploy their own sites via API →
 *   Hosting Service auto-provisions VPS → Charges monthly fee →
 *   CalRiven gets passive revenue
 */

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');

const execPromise = util.promisify(exec);

class HostingServiceAPI {
  constructor(options = {}) {
    this.config = {
      db: options.db,

      // Hetzner API
      hetznerApiKey: options.hetznerApiKey || process.env.HETZNER_API_KEY,
      hetznerServerType: options.hetznerServerType || 'cpx21', // 4GB RAM, €10/mo

      // Pricing
      monthlyPrice: options.monthlyPrice || 15, // USD (€10 cost + $5 profit)
      setupFee: options.setupFee || 0,
      revenueSharePercent: options.revenueSharePercent || 20, // 20% to affiliate

      // Deployment settings
      deploymentRoot: options.deploymentRoot || '/var/www/sites',
      sshKeyPath: options.sshKeyPath || process.env.SSH_KEY_PATH || '~/.ssh/id_rsa'
    };

    console.log('[HostingServiceAPI] Initialized');
  }

  /**
   * Deploy new site for affiliate
   */
  async deploySite(affiliateId, siteConfig) {
    console.log(`[HostingServiceAPI] 🚀 Deploying site for affiliate ${affiliateId}...`);

    const { domain, siteType, files } = siteConfig;

    try {
      // 1. Create database record
      const site = await this.config.db.query(
        `INSERT INTO hosted_sites (affiliate_id, domain, site_type, status, created_at)
         VALUES ($1, $2, $3, 'provisioning', NOW())
         RETURNING site_id`,
        [affiliateId, domain, siteType]
      );

      const siteId = site.rows[0].site_id;

      // 2. Provision VPS via Hetzner API
      const server = await this._provisionServer(siteId, domain);

      // 3. Deploy site files
      await this._deploySiteFiles(server.ip, domain, files);

      // 4. Configure nginx + SSL
      await this._configureNginx(server.ip, domain);
      await this._setupSSL(server.ip, domain);

      // 5. Update database
      await this.config.db.query(
        `UPDATE hosted_sites
         SET status = 'active', server_ip = $1, deployed_at = NOW()
         WHERE site_id = $2`,
        [server.ip, siteId]
      );

      // 6. Create Stripe subscription
      const subscription = await this._createSubscription(affiliateId, siteId);

      console.log(`[HostingServiceAPI] ✅ Site deployed: ${domain} (${server.ip})`);

      return {
        siteId,
        domain,
        serverIp: server.ip,
        sslEnabled: true,
        subscriptionId: subscription.id,
        monthlyPrice: this.config.monthlyPrice,
        url: `https://${domain}`
      };
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ Deployment failed:', err.message);
      throw err;
    }
  }

  /**
   * Provision Hetzner VPS
   */
  async _provisionServer(siteId, domain) {
    console.log(`[HostingServiceAPI] 📦 Provisioning Hetzner VPS for ${domain}...`);

    try {
      // Call Hetzner API to create server
      const response = await fetch('https://api.hetzner.cloud/v1/servers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.hetznerApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `site-${siteId}-${domain}`,
          server_type: this.config.hetznerServerType,
          image: 'ubuntu-24.04',
          location: 'nbg1', // Nuremberg
          ssh_keys: [process.env.HETZNER_SSH_KEY_ID],
          labels: {
            managed_by: 'calriven-hosting-service',
            site_id: String(siteId),
            domain: domain
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Hetzner API error: ${data.error?.message || 'Unknown'}`);
      }

      const server = data.server;

      console.log(`[HostingServiceAPI] ✅ Server provisioned: ${server.public_net.ipv4.ip}`);

      // Wait for server to be ready
      await this._waitForServer(server.public_net.ipv4.ip);

      return {
        id: server.id,
        ip: server.public_net.ipv4.ip,
        name: server.name
      };
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ Server provisioning failed:', err.message);
      throw err;
    }
  }

  /**
   * Wait for server to be ready (SSH accessible)
   */
  async _waitForServer(ip, maxWait = 120000) {
    console.log(`[HostingServiceAPI] ⏳ Waiting for server ${ip} to be ready...`);

    const start = Date.now();

    while (Date.now() - start < maxWait) {
      try {
        await execPromise(`ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@${ip} 'echo ready'`);
        console.log(`[HostingServiceAPI] ✅ Server ${ip} is ready`);
        return;
      } catch (err) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
      }
    }

    throw new Error(`Server ${ip} not ready after ${maxWait}ms`);
  }

  /**
   * Deploy site files to server
   */
  async _deploySiteFiles(serverIp, domain, files) {
    console.log(`[HostingServiceAPI] 📁 Deploying site files to ${serverIp}...`);

    try {
      // Extract files (base64-encoded zip)
      const zipBuffer = Buffer.from(files, 'base64');
      const tmpZip = `/tmp/${domain}.zip`;
      await fs.writeFile(tmpZip, zipBuffer);

      // Create site directory on server
      await execPromise(`ssh root@${serverIp} 'mkdir -p ${this.config.deploymentRoot}/${domain}'`);

      // Copy zip to server
      await execPromise(`scp ${tmpZip} root@${serverIp}:${this.config.deploymentRoot}/${domain}/site.zip`);

      // Extract on server
      await execPromise(`ssh root@${serverIp} 'cd ${this.config.deploymentRoot}/${domain} && unzip -o site.zip && rm site.zip'`);

      // Install dependencies if Node.js site
      const hasPackageJson = await execPromise(
        `ssh root@${serverIp} 'test -f ${this.config.deploymentRoot}/${domain}/package.json && echo yes || echo no'`
      );

      if (hasPackageJson.stdout.trim() === 'yes') {
        console.log('[HostingServiceAPI] 📦 Installing npm dependencies...');
        await execPromise(`ssh root@${serverIp} 'cd ${this.config.deploymentRoot}/${domain} && npm install --production'`);

        // Start with PM2
        await execPromise(`ssh root@${serverIp} 'cd ${this.config.deploymentRoot}/${domain} && pm2 start npm --name ${domain} -- start'`);
      }

      console.log('[HostingServiceAPI] ✅ Site files deployed');
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ File deployment failed:', err.message);
      throw err;
    }
  }

  /**
   * Configure nginx reverse proxy
   */
  async _configureNginx(serverIp, domain) {
    console.log(`[HostingServiceAPI] 🌐 Configuring nginx for ${domain}...`);

    try {
      // Use existing setup-nginx-domain.sh script
      await execPromise(`./scripts/setup-nginx-domain.sh ${serverIp} ${domain}`);

      console.log('[HostingServiceAPI] ✅ Nginx configured');
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ Nginx configuration failed:', err.message);
      throw err;
    }
  }

  /**
   * Setup SSL certificate
   */
  async _setupSSL(serverIp, domain) {
    console.log(`[HostingServiceAPI] 🔒 Setting up SSL for ${domain}...`);

    try {
      // Use existing setup-ssl.sh script
      await execPromise(`./scripts/setup-ssl.sh ${serverIp} ${domain}`);

      console.log('[HostingServiceAPI] ✅ SSL configured');
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ SSL setup failed:', err.message);
      throw err;
    }
  }

  /**
   * Create Stripe subscription for site
   */
  async _createSubscription(affiliateId, siteId) {
    console.log(`[HostingServiceAPI] 💳 Creating Stripe subscription...`);

    try {
      // Get affiliate's Stripe customer ID
      const affiliate = await this.config.db.query(
        'SELECT stripe_customer_id FROM affiliates WHERE affiliate_id = $1',
        [affiliateId]
      );

      let customerId = affiliate.rows[0]?.stripe_customer_id;

      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          metadata: { affiliate_id: affiliateId }
        });
        customerId = customer.id;

        await this.config.db.query(
          'UPDATE affiliates SET stripe_customer_id = $1 WHERE affiliate_id = $2',
          [customerId, affiliateId]
        );
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: process.env.STRIPE_HOSTING_PRICE_ID }],
        metadata: {
          affiliate_id: affiliateId,
          site_id: siteId
        }
      });

      console.log('[HostingServiceAPI] ✅ Subscription created:', subscription.id);

      return subscription;
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ Subscription creation failed:', err.message);
      throw err;
    }
  }

  /**
   * Get site status
   */
  async getSiteStatus(siteId) {
    const site = await this.config.db.query(
      'SELECT * FROM hosted_sites WHERE site_id = $1',
      [siteId]
    );

    if (site.rows.length === 0) {
      throw new Error(`Site not found: ${siteId}`);
    }

    const siteData = site.rows[0];

    // Check site health
    let health = 'unknown';
    if (siteData.server_ip && siteData.status === 'active') {
      try {
        const response = await fetch(`https://${siteData.domain}/health`, {
          signal: AbortSignal.timeout(5000)
        });
        health = response.ok ? 'healthy' : 'unhealthy';
      } catch (err) {
        health = 'unreachable';
      }
    }

    return {
      ...siteData,
      health,
      uptime: siteData.deployed_at ? Date.now() - new Date(siteData.deployed_at).getTime() : 0
    };
  }

  /**
   * Delete site (cancel subscription + destroy server)
   */
  async deleteSite(siteId) {
    console.log(`[HostingServiceAPI] 🗑️  Deleting site ${siteId}...`);

    try {
      const site = await this.config.db.query(
        'SELECT * FROM hosted_sites WHERE site_id = $1',
        [siteId]
      );

      if (site.rows.length === 0) {
        throw new Error(`Site not found: ${siteId}`);
      }

      const siteData = site.rows[0];

      // Cancel Stripe subscription
      if (siteData.subscription_id) {
        await stripe.subscriptions.cancel(siteData.subscription_id);
        console.log('[HostingServiceAPI] ✅ Subscription canceled');
      }

      // Destroy Hetzner server
      if (siteData.hetzner_server_id) {
        await fetch(`https://api.hetzner.cloud/v1/servers/${siteData.hetzner_server_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${this.config.hetznerApiKey}` }
        });
        console.log('[HostingServiceAPI] ✅ Server destroyed');
      }

      // Update database
      await this.config.db.query(
        `UPDATE hosted_sites SET status = 'deleted', deleted_at = NOW() WHERE site_id = $1`,
        [siteId]
      );

      console.log(`[HostingServiceAPI] ✅ Site deleted: ${siteId}`);
    } catch (err) {
      console.error('[HostingServiceAPI] ❌ Site deletion failed:', err.message);
      throw err;
    }
  }

  /**
   * Get affiliate revenue report
   */
  async getAffiliateRevenue(affiliateId) {
    const sites = await this.config.db.query(
      `SELECT COUNT(*) as total_sites, SUM(monthly_price) as monthly_revenue
       FROM hosted_sites
       WHERE affiliate_id = $1 AND status = 'active'`,
      [affiliateId]
    );

    const totalRevenue = sites.rows[0]?.monthly_revenue || 0;
    const affiliateShare = totalRevenue * (this.config.revenueSharePercent / 100);

    return {
      affiliateId,
      totalSites: sites.rows[0]?.total_sites || 0,
      monthlyRevenue: totalRevenue,
      affiliateShare,
      revenueSharePercent: this.config.revenueSharePercent
    };
  }
}

module.exports = HostingServiceAPI;
