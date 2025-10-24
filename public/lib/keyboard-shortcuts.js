/**
 * Global Keyboard Shortcuts Registry for CALOS
 *
 * Pre-configured shortcuts for the entire platform:
 * - Navigation (launcher, hub, docs)
 * - Data operations (export, save, refresh)
 * - UI controls (search, help, settings)
 * - Dev tools (ragebait, error viewer, knowledge browser)
 *
 * Usage:
 *   <script src="/lib/keyboard-shortcuts.js"></script>
 *   <script>
 *     // Auto-installs all shortcuts for current page
 *     // Or customize:
 *     window.calosShortcuts.setEnabled('nav:launcher', false);
 *   </script>
 */

(function() {
  'use strict';

  // Load KeyboardShortcutManager
  if (typeof KeyboardShortcutManager === 'undefined') {
    console.error('[CALOS Shortcuts] KeyboardShortcutManager not loaded. Include it first.');
    return;
  }

  // Global manager instance
  const manager = new KeyboardShortcutManager({ debug: false });

  // ===========================================
  // NAVIGATION SHORTCUTS
  // ===========================================

  manager.register('nav:launcher', 'Mod+K', () => {
    window.location.href = '/launcher.html';
  }, {
    description: 'Open Launcher',
    global: true
  });

  manager.register('nav:hub', 'Mod+H', () => {
    window.location.href = '/hub.html';
  }, {
    description: 'Open Hub',
    global: true
  });

  manager.register('nav:docs', 'Mod+D', () => {
    window.location.href = '/docs.html';
  }, {
    description: 'Open Documentation',
    global: true
  });

  manager.register('nav:ragebait', 'Mod+R', () => {
    window.location.href = '/ragebait-generator.html';
  }, {
    description: 'Open Ragebait Generator',
    global: true
  });

  manager.register('nav:knowledge', 'Mod+Shift+K', () => {
    window.location.href = '/cal-knowledge-viewer.html';
  }, {
    description: 'Open CAL Knowledge Browser',
    global: true
  });

  manager.register('nav:back', 'Mod+[', () => {
    window.history.back();
  }, {
    description: 'Go Back',
    global: true
  });

  manager.register('nav:forward', 'Mod+]', () => {
    window.history.forward();
  }, {
    description: 'Go Forward',
    global: true
  });

  // ===========================================
  // DATA OPERATIONS
  // ===========================================

  manager.register('data:export-csv', 'Mod+E', () => {
    if (typeof window.exportToCSV === 'function') {
      window.exportToCSV();
    } else {
      console.log('[CALOS Shortcuts] No exportToCSV function found on this page');
    }
  }, {
    description: 'Export to CSV',
    global: false
  });

  manager.register('data:save', 'Mod+S', () => {
    if (typeof window.saveData === 'function') {
      window.saveData();
    } else {
      console.log('[CALOS Shortcuts] No saveData function found on this page');
    }
  }, {
    description: 'Save Data',
    global: false
  });

  manager.register('data:refresh', 'Mod+Shift+R', () => {
    if (typeof window.refreshData === 'function') {
      window.refreshData();
    } else {
      window.location.reload();
    }
  }, {
    description: 'Refresh Data',
    global: true
  });

  manager.register('data:download', 'Mod+Shift+D', () => {
    if (typeof window.downloadData === 'function') {
      window.downloadData();
    }
  }, {
    description: 'Download Data',
    global: false
  });

  // ===========================================
  // UI CONTROLS
  // ===========================================

  manager.register('ui:search', 'Mod+F', (event) => {
    const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i], #search');
    if (searchInput) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }, {
    description: 'Focus Search',
    global: true
  });

  manager.register('ui:help', 'Mod+/', () => {
    if (typeof window.showKeyboardHelp === 'function') {
      window.showKeyboardHelp();
    } else {
      showDefaultHelp();
    }
  }, {
    description: 'Show Keyboard Shortcuts',
    global: true
  });

  manager.register('ui:settings', 'Mod+,', () => {
    if (typeof window.openSettings === 'function') {
      window.openSettings();
    } else {
      console.log('[CALOS Shortcuts] No settings dialog found');
    }
  }, {
    description: 'Open Settings',
    global: true
  });

  manager.register('ui:close', 'Escape', () => {
    // Close any open modals/dialogs
    const modals = document.querySelectorAll('.modal.is-active, dialog[open], [data-modal-open="true"]');
    modals.forEach(modal => {
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.classList.remove('is-active');
        modal.removeAttribute('data-modal-open');
      }
    });
  }, {
    description: 'Close Dialog/Modal',
    global: true
  });

  // ===========================================
  // DEV TOOLS
  // ===========================================

  manager.register('dev:console', 'Mod+Shift+J', () => {
    // Browser will handle this natively
  }, {
    description: 'Open Console',
    global: true
  });

  manager.register('dev:error-viewer', 'Mod+Shift+E', () => {
    if (typeof window.showErrorViewer === 'function') {
      window.showErrorViewer();
    } else {
      window.open('/cal-knowledge-viewer.html#errors', '_blank');
    }
  }, {
    description: 'Show Error Viewer',
    global: true
  });

  manager.register('dev:copy-debug', 'Mod+Shift+C', () => {
    const debugInfo = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      shortcuts: manager.toJSON()
    };

    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
      .then(() => console.log('[CALOS Shortcuts] Debug info copied to clipboard'))
      .catch(err => console.error('[CALOS Shortcuts] Failed to copy:', err));
  }, {
    description: 'Copy Debug Info',
    global: true
  });

  // ===========================================
  // TABLE OPERATIONS (for pages with tables)
  // ===========================================

  manager.register('table:select-all', 'Mod+A', (event) => {
    const table = document.querySelector('table[data-keyboard-nav="true"]');
    if (table && typeof window.selectAllRows === 'function') {
      event.preventDefault();
      window.selectAllRows();
    }
  }, {
    description: 'Select All Rows',
    global: false
  });

  manager.register('table:copy', 'Mod+C', (event) => {
    if (typeof window.copySelectedRows === 'function') {
      event.preventDefault();
      window.copySelectedRows();
    }
  }, {
    description: 'Copy Selected Rows',
    global: false
  });

  manager.register('table:export-selected', 'Mod+Shift+E', () => {
    if (typeof window.exportSelectedRows === 'function') {
      window.exportSelectedRows();
    }
  }, {
    description: 'Export Selected Rows',
    global: false
  });

  // ===========================================
  // CHART OPERATIONS (for data dashboard)
  // ===========================================

  manager.register('chart:toggle-type', 'Mod+T', () => {
    if (typeof window.toggleChartType === 'function') {
      window.toggleChartType();
    }
  }, {
    description: 'Toggle Chart Type',
    global: false
  });

  manager.register('chart:fullscreen', 'Mod+Shift+F', () => {
    if (typeof window.toggleChartFullscreen === 'function') {
      window.toggleChartFullscreen();
    }
  }, {
    description: 'Toggle Fullscreen',
    global: false
  });

  manager.register('chart:download', 'Mod+Shift+S', () => {
    if (typeof window.downloadChart === 'function') {
      window.downloadChart();
    }
  }, {
    description: 'Download Chart',
    global: false
  });

  // ===========================================
  // HELPER FUNCTIONS
  // ===========================================

  function showDefaultHelp() {
    const helpHTML = manager.toHelpHTML();

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'keyboard-shortcuts-modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          ${helpHTML}
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .keyboard-shortcuts-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
      }
      .modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
      }
      .modal-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        border-radius: 8px;
        max-width: 600px;
        max-height: 80vh;
        overflow: auto;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      }
      .modal-header {
        padding: 20px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .modal-header h2 {
        margin: 0;
        font-size: 24px;
      }
      .modal-close {
        background: none;
        border: none;
        font-size: 32px;
        cursor: pointer;
        color: #999;
        padding: 0;
        width: 32px;
        height: 32px;
        line-height: 1;
      }
      .modal-close:hover {
        color: #333;
      }
      .modal-body {
        padding: 20px;
      }
      .shortcut-category {
        margin-bottom: 30px;
      }
      .shortcut-category h3 {
        margin: 0 0 10px 0;
        font-size: 18px;
        color: #333;
      }
      .shortcut-category table {
        width: 100%;
        border-collapse: collapse;
      }
      .shortcut-category td {
        padding: 8px 0;
        vertical-align: middle;
      }
      .shortcut-key {
        width: 120px;
      }
      .shortcut-key kbd {
        display: inline-block;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 12px;
        background: #f5f5f5;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      }
      .shortcut-desc {
        color: #666;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    // Close handlers
    const close = () => {
      modal.remove();
      style.remove();
    };

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-backdrop').addEventListener('click', close);
  }

  // ===========================================
  // AUTO-INSTALL
  // ===========================================

  // Install on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.install());
  } else {
    manager.install();
  }

  // ===========================================
  // EXPORT GLOBAL
  // ===========================================

  window.calosShortcuts = manager;
  window.showKeyboardHelp = showDefaultHelp;

  console.log(`[CALOS Shortcuts] Loaded ${manager.shortcuts.size} shortcuts (Platform: ${manager.platform})`);

})();
