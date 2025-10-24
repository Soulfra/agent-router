/**
 * Cross-Platform Keyboard Shortcut Manager
 *
 * Handles keyboard shortcuts across Mac (Cmd), Windows (Ctrl), Linux (Ctrl)
 * with automatic platform detection and normalization.
 *
 * Features:
 * - Platform detection (darwin = Mac, win32 = Windows, linux = Linux)
 * - Shortcut normalization (Cmd+S → Ctrl+S on Windows/Linux)
 * - Event handler wrapper with conflict detection
 * - Global registry for all shortcuts
 * - Visual shortcut display helpers
 *
 * Example:
 *   const manager = new KeyboardShortcutManager();
 *   manager.register('save', 'Mod+S', () => saveDocument());
 *   manager.register('export', 'Mod+E', () => exportData());
 *   manager.install();
 */

class KeyboardShortcutManager {
  constructor(options = {}) {
    this.platform = this._detectPlatform();
    this.shortcuts = new Map(); // { id: { key, callback, description, global } }
    this.conflicts = new Set();
    this.installed = false;
    this.debug = options.debug || false;
  }

  /**
   * Detect current platform
   * @private
   */
  _detectPlatform() {
    if (typeof process !== 'undefined' && process.platform) {
      return process.platform; // Node.js
    }

    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || navigator.platform;
      if (ua.indexOf('Mac') !== -1) return 'darwin';
      if (ua.indexOf('Win') !== -1) return 'win32';
      if (ua.indexOf('Linux') !== -1) return 'linux';
    }

    return 'unknown';
  }

  /**
   * Get modifier key for current platform
   */
  getModifierKey() {
    return this.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  }

  /**
   * Get modifier symbol for display
   */
  getModifierSymbol() {
    return this.platform === 'darwin' ? '⌘' : 'Ctrl';
  }

  /**
   * Normalize shortcut string (Mod+S → Cmd+S or Ctrl+S)
   */
  normalizeShortcut(shortcut) {
    const modKey = this.getModifierKey();

    return shortcut
      .replace(/\bMod\b/gi, modKey)
      .replace(/\bCommand\b/gi, this.platform === 'darwin' ? 'Cmd' : 'Ctrl')
      .split('+')
      .map(k => k.trim().toLowerCase())
      .join('+');
  }

  /**
   * Convert shortcut to display string (Cmd+S → ⌘S)
   */
  toDisplayString(shortcut) {
    const normalized = this.normalizeShortcut(shortcut);

    return normalized
      .replace(/cmd/gi, '⌘')
      .replace(/ctrl/gi, this.platform === 'darwin' ? '⌃' : 'Ctrl+')
      .replace(/shift/gi, '⇧')
      .replace(/alt/gi, this.platform === 'darwin' ? '⌥' : 'Alt+')
      .replace(/meta/gi, '⌘')
      .replace(/\+/g, '');
  }

  /**
   * Register a keyboard shortcut
   */
  register(id, shortcut, callback, options = {}) {
    const normalized = this.normalizeShortcut(shortcut);

    // Check for conflicts
    for (const [existingId, existing] of this.shortcuts) {
      if (existing.normalized === normalized && existingId !== id) {
        this.conflicts.add(normalized);
        console.warn(`[KeyboardShortcut] Conflict detected: ${id} and ${existingId} both use ${normalized}`);
      }
    }

    this.shortcuts.set(id, {
      original: shortcut,
      normalized,
      callback,
      description: options.description || id,
      global: options.global || false,
      enabled: true
    });

    if (this.debug) {
      console.log(`[KeyboardShortcut] Registered: ${id} → ${normalized} (${this.toDisplayString(shortcut)})`);
    }

    return this;
  }

  /**
   * Unregister a shortcut
   */
  unregister(id) {
    this.shortcuts.delete(id);
    return this;
  }

  /**
   * Enable/disable a shortcut
   */
  setEnabled(id, enabled) {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.enabled = enabled;
    }
    return this;
  }

  /**
   * Check if keyboard event matches a shortcut
   */
  matchesShortcut(event, normalized) {
    const parts = normalized.split('+');
    const keyMatches = new Set();

    for (const part of parts) {
      switch (part) {
        case 'cmd':
        case 'meta':
          if (event.metaKey) keyMatches.add(part);
          break;
        case 'ctrl':
          if (event.ctrlKey) keyMatches.add(part);
          break;
        case 'shift':
          if (event.shiftKey) keyMatches.add(part);
          break;
        case 'alt':
          if (event.altKey) keyMatches.add(part);
          break;
        default:
          // Regular key
          if (event.key.toLowerCase() === part || event.code.toLowerCase() === part.toLowerCase()) {
            keyMatches.add(part);
          }
      }
    }

    return keyMatches.size === parts.length;
  }

  /**
   * Install global keyboard event listener
   */
  install(target = document) {
    if (this.installed) {
      console.warn('[KeyboardShortcut] Already installed');
      return this;
    }

    this._keydownHandler = (event) => {
      // Skip if typing in input/textarea
      if (event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.isContentEditable) {
        return;
      }

      for (const [id, shortcut] of this.shortcuts) {
        if (!shortcut.enabled) continue;

        if (this.matchesShortcut(event, shortcut.normalized)) {
          if (this.debug) {
            console.log(`[KeyboardShortcut] Triggered: ${id} (${shortcut.normalized})`);
          }

          event.preventDefault();
          event.stopPropagation();

          try {
            shortcut.callback(event);
          } catch (error) {
            console.error(`[KeyboardShortcut] Error in ${id}:`, error);
          }

          break; // Only trigger one shortcut per event
        }
      }
    };

    target.addEventListener('keydown', this._keydownHandler, true);
    this.installed = true;

    if (this.debug) {
      console.log(`[KeyboardShortcut] Installed ${this.shortcuts.size} shortcuts`);
    }

    return this;
  }

  /**
   * Uninstall global listener
   */
  uninstall(target = document) {
    if (!this.installed) return this;

    target.removeEventListener('keydown', this._keydownHandler, true);
    this.installed = false;

    return this;
  }

  /**
   * Get all registered shortcuts
   */
  getAll() {
    return Array.from(this.shortcuts.entries()).map(([id, shortcut]) => ({
      id,
      shortcut: shortcut.original,
      normalized: shortcut.normalized,
      display: this.toDisplayString(shortcut.original),
      description: shortcut.description,
      enabled: shortcut.enabled,
      global: shortcut.global
    }));
  }

  /**
   * Get shortcuts by category
   */
  getByCategory(category) {
    return this.getAll().filter(s => s.id.startsWith(`${category}:`));
  }

  /**
   * Get conflicts
   */
  getConflicts() {
    const conflicts = {};

    for (const normalized of this.conflicts) {
      const matching = this.getAll().filter(s => s.normalized === normalized);
      if (matching.length > 1) {
        conflicts[normalized] = matching.map(s => s.id);
      }
    }

    return conflicts;
  }

  /**
   * Export shortcuts as HTML help
   */
  toHelpHTML() {
    const shortcuts = this.getAll();

    if (shortcuts.length === 0) {
      return '<p>No shortcuts registered</p>';
    }

    const grouped = {};
    for (const shortcut of shortcuts) {
      const category = shortcut.id.includes(':')
        ? shortcut.id.split(':')[0]
        : 'general';

      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(shortcut);
    }

    let html = '<div class="keyboard-shortcuts-help">';

    for (const [category, items] of Object.entries(grouped)) {
      html += `<div class="shortcut-category">`;
      html += `<h3>${category.charAt(0).toUpperCase() + category.slice(1)}</h3>`;
      html += `<table>`;

      for (const item of items) {
        html += `<tr>`;
        html += `<td class="shortcut-key"><kbd>${item.display}</kbd></td>`;
        html += `<td class="shortcut-desc">${item.description}</td>`;
        html += `</tr>`;
      }

      html += `</table></div>`;
    }

    html += '</div>';

    return html;
  }

  /**
   * Export shortcuts as JSON
   */
  toJSON() {
    return {
      platform: this.platform,
      modifierKey: this.getModifierKey(),
      shortcuts: this.getAll(),
      conflicts: this.getConflicts()
    };
  }
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeyboardShortcutManager;
}

// Browser global
if (typeof window !== 'undefined') {
  window.KeyboardShortcutManager = KeyboardShortcutManager;
}
