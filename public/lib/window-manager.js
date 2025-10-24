/**
 * Window Manager
 *
 * Provides desktop-style window management within the CalOS PWA:
 * - Create, destroy windows
 * - Drag and drop
 * - Resize (8 directions)
 * - Minimize, maximize, restore
 * - Z-index management (bring to front)
 * - Snap to edges
 * - Multi-window support
 * - Window state persistence
 *
 * Usage:
 *   const wm = new WindowManager();
 *   wm.createWindow({
 *     title: 'Calculator',
 *     content: '<div>App content</div>',
 *     width: 400,
 *     height: 300
 *   });
 */

class WindowManager {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.windows = new Map(); // windowId => window element
    this.nextId = 1;
    this.topZIndex = 1000;
    this.snapThreshold = 20; // Pixels from edge to snap

    // Active dragging/resizing state
    this.activeWindow = null;
    this.dragMode = null; // 'move', 'resize-n', 'resize-ne', etc.
    this.dragStart = { x: 0, y: 0, windowX: 0, windowY: 0, windowWidth: 0, windowHeight: 0 };

    // Minimized windows
    this.minimizedWindows = [];

    // Initialize event listeners
    this._initEvents();

    console.log('[WindowManager] Initialized');
  }

  /**
   * Create a new window
   * @param {Object} options - Window configuration
   * @returns {number} - Window ID
   */
  createWindow(options = {}) {
    const windowId = this.nextId++;

    const config = {
      title: options.title || 'Window',
      content: options.content || '',
      width: options.width || 600,
      height: options.height || 400,
      x: options.x !== undefined ? options.x : this._centerX(options.width || 600),
      y: options.y !== undefined ? options.y : this._centerY(options.height || 400),
      minWidth: options.minWidth || 300,
      minHeight: options.minHeight || 200,
      resizable: options.resizable !== false,
      maximizable: options.maximizable !== false,
      minimizable: options.minimizable !== false,
      closable: options.closable !== false,
      icon: options.icon || '📄',
      onClose: options.onClose,
      onMinimize: options.onMinimize,
      onMaximize: options.onMaximize
    };

    // Create window element
    const windowEl = document.createElement('div');
    windowEl.className = 'calos-window';
    windowEl.dataset.windowId = windowId;
    windowEl.style.cssText = `
      position: fixed;
      left: ${config.x}px;
      top: ${config.y}px;
      width: ${config.width}px;
      height: ${config.height}px;
      z-index: ${++this.topZIndex};
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border, #333);
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Create titlebar
    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    titlebar.style.cssText = `
      background: var(--bg-tertiary, #252525);
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
      user-select: none;
      border-bottom: 1px solid var(--border, #333);
    `;

    // Title section
    const titleSection = document.createElement('div');
    titleSection.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    titleSection.innerHTML = `
      <span style="font-size: 18px;">${config.icon}</span>
      <span style="color: var(--text-primary, #e0e0e0); font-weight: 500;">${config.title}</span>
    `;

    // Window controls
    const controls = document.createElement('div');
    controls.className = 'window-controls';
    controls.style.cssText = 'display: flex; gap: 8px;';

    if (config.minimizable) {
      const minimizeBtn = this._createControlButton('−', 'Minimize', () => this.minimizeWindow(windowId));
      controls.appendChild(minimizeBtn);
    }

    if (config.maximizable) {
      const maximizeBtn = this._createControlButton('□', 'Maximize', () => this.toggleMaximize(windowId));
      maximizeBtn.dataset.action = 'maximize';
      controls.appendChild(maximizeBtn);
    }

    if (config.closable) {
      const closeBtn = this._createControlButton('×', 'Close', () => this.closeWindow(windowId));
      controls.appendChild(closeBtn);
    }

    titlebar.appendChild(titleSection);
    titlebar.appendChild(controls);

    // Create content area
    const contentArea = document.createElement('div');
    contentArea.className = 'window-content';
    contentArea.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 16px;
      background: var(--bg-secondary, #1a1a1a);
      color: var(--text-primary, #e0e0e0);
    `;

    if (typeof config.content === 'string') {
      contentArea.innerHTML = config.content;
    } else if (config.content instanceof HTMLElement) {
      contentArea.appendChild(config.content);
    }

    // Create resize handles (8 directions)
    if (config.resizable) {
      const resizeHandles = this._createResizeHandles();
      windowEl.append(...resizeHandles);
    }

    // Assemble window
    windowEl.appendChild(titlebar);
    windowEl.appendChild(contentArea);

    // Store window data
    this.windows.set(windowId, {
      element: windowEl,
      config,
      state: {
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        maximized: false,
        minimized: false,
        preMaximizeState: null
      }
    });

    // Add to DOM
    this.container.appendChild(windowEl);

    // Make window draggable
    titlebar.addEventListener('mousedown', (e) => this._startDrag(e, windowId, 'move'));

    // Bring to front on click
    windowEl.addEventListener('mousedown', () => this.bringToFront(windowId));

    // Double-click titlebar to maximize
    if (config.maximizable) {
      titlebar.addEventListener('dblclick', () => this.toggleMaximize(windowId));
    }

    console.log(`[WindowManager] Created window ${windowId}: ${config.title}`);

    return windowId;
  }

  /**
   * Close a window
   */
  closeWindow(windowId) {
    const window = this.windows.get(windowId);
    if (!window) return;

    // Call onClose callback if provided
    if (window.config.onClose) {
      const shouldClose = window.config.onClose(windowId);
      if (shouldClose === false) return;
    }

    // Remove from DOM
    window.element.remove();

    // Remove from windows map
    this.windows.delete(windowId);

    // Remove from minimized list
    this.minimizedWindows = this.minimizedWindows.filter(id => id !== windowId);

    console.log(`[WindowManager] Closed window ${windowId}`);
  }

  /**
   * Minimize a window
   */
  minimizeWindow(windowId) {
    const window = this.windows.get(windowId);
    if (!window) return;

    window.element.style.display = 'none';
    window.state.minimized = true;
    this.minimizedWindows.push(windowId);

    // Call onMinimize callback
    if (window.config.onMinimize) {
      window.config.onMinimize(windowId);
    }

    console.log(`[WindowManager] Minimized window ${windowId}`);
  }

  /**
   * Restore a minimized window
   */
  restoreWindow(windowId) {
    const window = this.windows.get(windowId);
    if (!window) return;

    window.element.style.display = 'flex';
    window.state.minimized = false;
    this.minimizedWindows = this.minimizedWindows.filter(id => id !== windowId);

    this.bringToFront(windowId);

    console.log(`[WindowManager] Restored window ${windowId}`);
  }

  /**
   * Toggle maximize/restore
   */
  toggleMaximize(windowId) {
    const window = this.windows.get(windowId);
    if (!window) return;

    if (window.state.maximized) {
      this._restoreWindow(window);
    } else {
      this._maximizeWindow(window);
    }
  }

  /**
   * Maximize window to full screen
   */
  _maximizeWindow(window) {
    // Save current state
    window.state.preMaximizeState = {
      x: window.state.x,
      y: window.state.y,
      width: window.state.width,
      height: window.state.height
    };

    // Get viewport size
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Maximize
    window.element.style.left = '0px';
    window.element.style.top = '0px';
    window.element.style.width = `${width}px`;
    window.element.style.height = `${height}px`;
    window.element.style.borderRadius = '0';

    window.state.x = 0;
    window.state.y = 0;
    window.state.width = width;
    window.state.height = height;
    window.state.maximized = true;

    // Update maximize button
    const maximizeBtn = window.element.querySelector('[data-action="maximize"]');
    if (maximizeBtn) {
      maximizeBtn.textContent = '❐';
      maximizeBtn.title = 'Restore';
    }

    // Call onMaximize callback
    if (window.config.onMaximize) {
      window.config.onMaximize(window.id, true);
    }

    console.log(`[WindowManager] Maximized window ${window.id}`);
  }

  /**
   * Restore window from maximized state
   */
  _restoreWindow(window) {
    const preState = window.state.preMaximizeState;
    if (!preState) return;

    // Restore previous size and position
    window.element.style.left = `${preState.x}px`;
    window.element.style.top = `${preState.y}px`;
    window.element.style.width = `${preState.width}px`;
    window.element.style.height = `${preState.height}px`;
    window.element.style.borderRadius = '8px';

    window.state.x = preState.x;
    window.state.y = preState.y;
    window.state.width = preState.width;
    window.state.height = preState.height;
    window.state.maximized = false;
    window.state.preMaximizeState = null;

    // Update maximize button
    const maximizeBtn = window.element.querySelector('[data-action="maximize"]');
    if (maximizeBtn) {
      maximizeBtn.textContent = '□';
      maximizeBtn.title = 'Maximize';
    }

    // Call onMaximize callback
    if (window.config.onMaximize) {
      window.config.onMaximize(window.id, false);
    }

    console.log(`[WindowManager] Restored window ${window.id}`);
  }

  /**
   * Bring window to front (topmost z-index)
   */
  bringToFront(windowId) {
    const window = this.windows.get(windowId);
    if (!window) return;

    window.element.style.zIndex = ++this.topZIndex;
  }

  /**
   * Get list of all windows
   */
  getWindows() {
    return Array.from(this.windows.entries()).map(([id, window]) => ({
      id,
      title: window.config.title,
      icon: window.config.icon,
      minimized: window.state.minimized,
      maximized: window.state.maximized
    }));
  }

  /**
   * Get minimized windows (for taskbar)
   */
  getMinimizedWindows() {
    return this.minimizedWindows.map(id => {
      const window = this.windows.get(id);
      return {
        id,
        title: window.config.title,
        icon: window.config.icon
      };
    });
  }

  // ========================================================================
  // INTERNAL METHODS
  // ========================================================================

  /**
   * Create control button (minimize, maximize, close)
   */
  _createControlButton(symbol, title, onClick) {
    const btn = document.createElement('button');
    btn.textContent = symbol;
    btn.title = title;
    btn.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--text-secondary, #888);
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    `;

    btn.addEventListener('mouseover', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.1)';
      btn.style.color = 'var(--text-primary, #e0e0e0)';
    });

    btn.addEventListener('mouseout', () => {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-secondary, #888)';
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    return btn;
  }

  /**
   * Create resize handles (8 directions)
   */
  _createResizeHandles() {
    const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const handles = [];

    for (const dir of directions) {
      const handle = document.createElement('div');
      handle.className = `resize-handle resize-${dir}`;
      handle.dataset.direction = dir;

      // Position styles
      const positions = {
        n: 'top: 0; left: 50%; transform: translateX(-50%); width: 100%; height: 4px; cursor: ns-resize;',
        ne: 'top: 0; right: 0; width: 10px; height: 10px; cursor: nesw-resize;',
        e: 'top: 50%; right: 0; transform: translateY(-50%); width: 4px; height: 100%; cursor: ew-resize;',
        se: 'bottom: 0; right: 0; width: 10px; height: 10px; cursor: nwse-resize;',
        s: 'bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; height: 4px; cursor: ns-resize;',
        sw: 'bottom: 0; left: 0; width: 10px; height: 10px; cursor: nesw-resize;',
        w: 'top: 50%; left: 0; transform: translateY(-50%); width: 4px; height: 100%; cursor: ew-resize;',
        nw: 'top: 0; left: 0; width: 10px; height: 10px; cursor: nwse-resize;'
      };

      handle.style.cssText = `
        position: absolute;
        ${positions[dir]}
        z-index: 10;
      `;

      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const windowId = parseInt(handle.closest('.calos-window').dataset.windowId);
        this._startDrag(e, windowId, `resize-${dir}`);
      });

      handles.push(handle);
    }

    return handles;
  }

  /**
   * Calculate center X position
   */
  _centerX(width) {
    return (window.innerWidth - width) / 2;
  }

  /**
   * Calculate center Y position
   */
  _centerY(height) {
    return (window.innerHeight - height) / 2;
  }

  /**
   * Start dragging/resizing
   */
  _startDrag(e, windowId, mode) {
    const window = this.windows.get(windowId);
    if (!window) return;

    // Can't drag/resize maximized windows
    if (window.state.maximized && mode === 'move') return;

    this.activeWindow = window;
    this.dragMode = mode;
    this.dragStart = {
      x: e.clientX,
      y: e.clientY,
      windowX: window.state.x,
      windowY: window.state.y,
      windowWidth: window.state.width,
      windowHeight: window.state.height
    };

    this.bringToFront(windowId);

    e.preventDefault();
  }

  /**
   * Initialize global event listeners
   */
  _initEvents() {
    // Mouse move - handle dragging/resizing
    document.addEventListener('mousemove', (e) => {
      if (!this.activeWindow || !this.dragMode) return;

      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;

      if (this.dragMode === 'move') {
        this._handleMove(dx, dy);
      } else if (this.dragMode.startsWith('resize-')) {
        this._handleResize(dx, dy);
      }
    });

    // Mouse up - stop dragging/resizing
    document.addEventListener('mouseup', () => {
      this.activeWindow = null;
      this.dragMode = null;
    });
  }

  /**
   * Handle window movement
   */
  _handleMove(dx, dy) {
    let newX = this.dragStart.windowX + dx;
    let newY = this.dragStart.windowY + dy;

    // Snap to edges
    if (Math.abs(newX) < this.snapThreshold) newX = 0;
    if (Math.abs(newY) < this.snapThreshold) newY = 0;
    if (Math.abs(newX + this.activeWindow.state.width - window.innerWidth) < this.snapThreshold) {
      newX = window.innerWidth - this.activeWindow.state.width;
    }
    if (Math.abs(newY + this.activeWindow.state.height - window.innerHeight) < this.snapThreshold) {
      newY = window.innerHeight - this.activeWindow.state.height;
    }

    // Keep window in bounds (at least 50px visible)
    newX = Math.max(-this.activeWindow.state.width + 50, newX);
    newX = Math.min(window.innerWidth - 50, newX);
    newY = Math.max(0, newY);
    newY = Math.min(window.innerHeight - 50, newY);

    this.activeWindow.element.style.left = `${newX}px`;
    this.activeWindow.element.style.top = `${newY}px`;
    this.activeWindow.state.x = newX;
    this.activeWindow.state.y = newY;
  }

  /**
   * Handle window resizing
   */
  _handleResize(dx, dy) {
    const dir = this.dragMode.replace('resize-', '');
    const minW = this.activeWindow.config.minWidth;
    const minH = this.activeWindow.config.minHeight;

    let newX = this.activeWindow.state.x;
    let newY = this.activeWindow.state.y;
    let newWidth = this.activeWindow.state.width;
    let newHeight = this.activeWindow.state.height;

    // Handle each direction
    if (dir.includes('n')) {
      newY = this.dragStart.windowY + dy;
      newHeight = this.dragStart.windowHeight - dy;
      if (newHeight < minH) {
        newY = this.activeWindow.state.y;
        newHeight = minH;
      }
    }

    if (dir.includes('s')) {
      newHeight = this.dragStart.windowHeight + dy;
      if (newHeight < minH) newHeight = minH;
    }

    if (dir.includes('w')) {
      newX = this.dragStart.windowX + dx;
      newWidth = this.dragStart.windowWidth - dx;
      if (newWidth < minW) {
        newX = this.activeWindow.state.x;
        newWidth = minW;
      }
    }

    if (dir.includes('e')) {
      newWidth = this.dragStart.windowWidth + dx;
      if (newWidth < minW) newWidth = minW;
    }

    // Apply new size and position
    this.activeWindow.element.style.left = `${newX}px`;
    this.activeWindow.element.style.top = `${newY}px`;
    this.activeWindow.element.style.width = `${newWidth}px`;
    this.activeWindow.element.style.height = `${newHeight}px`;

    this.activeWindow.state.x = newX;
    this.activeWindow.state.y = newY;
    this.activeWindow.state.width = newWidth;
    this.activeWindow.state.height = newHeight;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WindowManager;
} else {
  window.WindowManager = WindowManager;
}
