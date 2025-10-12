/**
 * Handle Pool
 * Memory management system for expandable lists with stable handles
 *
 * Features:
 * - Stable handles (IDs that persist even if memory moves)
 * - Expandable pools (grow to handle 1000+ elements)
 * - Defragmentation with callbacks
 * - Free list for efficient allocation/deallocation
 * - Generational tracking for handle validity
 *
 * Use case: Window manager with 1000+ windows, RSS feed with 1000+ posts
 */

class HandlePool {
  constructor(options = {}) {
    this.initialSize = options.initialSize || 100;
    this.maxSize = options.maxSize || 10000;
    this.growthFactor = options.growthFactor || 2.0;

    // Main storage
    this.data = new Array(this.initialSize);
    this.generation = new Uint32Array(this.initialSize); // Track handle validity
    this.occupied = new Uint8Array(this.initialSize);    // 1 = occupied, 0 = free

    // Free list (linked list of free slots)
    this.freeList = [];
    for (let i = 0; i < this.initialSize; i++) {
      this.freeList.push(i);
    }

    // Defrag callbacks
    this.defragCallbacks = [];

    // Stats
    this.allocCount = 0;
    this.freeCount = 0;
    this.defragCount = 0;
  }

  /**
   * Allocate a new handle and store data
   * @param {*} data - Data to store
   * @returns {object} - Handle { index, generation }
   */
  allocate(data) {
    // Check if we need to grow
    if (this.freeList.length === 0) {
      this._grow();
    }

    // Pop from free list
    const index = this.freeList.pop();
    const generation = this.generation[index];

    // Store data
    this.data[index] = data;
    this.occupied[index] = 1;

    this.allocCount++;

    return {
      index,
      generation
    };
  }

  /**
   * Get data by handle
   * @param {object} handle - Handle { index, generation }
   * @returns {*} - Data or null if invalid
   */
  get(handle) {
    if (!this._isValid(handle)) {
      return null;
    }

    return this.data[handle.index];
  }

  /**
   * Free a handle (mark for reclamation)
   * @param {object} handle - Handle { index, generation }
   * @returns {boolean} - True if freed successfully
   */
  free(handle) {
    if (!this._isValid(handle)) {
      return false;
    }

    const index = handle.index;

    // Clear data
    this.data[index] = null;
    this.occupied[index] = 0;

    // Increment generation (invalidates old handles)
    this.generation[index]++;

    // Add to free list
    this.freeList.push(index);

    this.freeCount++;
    return true;
  }

  /**
   * Update data at handle
   * @param {object} handle - Handle { index, generation }
   * @param {*} data - New data
   * @returns {boolean} - True if updated successfully
   */
  set(handle, data) {
    if (!this._isValid(handle)) {
      return false;
    }

    this.data[handle.index] = data;
    return true;
  }

  /**
   * Check if handle is valid
   * @param {object} handle - Handle { index, generation }
   * @returns {boolean} - True if valid
   */
  _isValid(handle) {
    if (!handle || typeof handle.index !== 'number') {
      return false;
    }

    const index = handle.index;

    // Out of bounds
    if (index < 0 || index >= this.data.length) {
      return false;
    }

    // Not occupied
    if (this.occupied[index] === 0) {
      return false;
    }

    // Generation mismatch
    if (this.generation[index] !== handle.generation) {
      return false;
    }

    return true;
  }

  /**
   * Grow the pool
   */
  _grow() {
    const oldSize = this.data.length;
    const newSize = Math.min(
      Math.floor(oldSize * this.growthFactor),
      this.maxSize
    );

    if (newSize <= oldSize) {
      throw new Error(`Handle pool at max size (${this.maxSize})`);
    }

    console.log(`📈 Growing handle pool: ${oldSize} → ${newSize}`);

    // Grow arrays
    const newData = new Array(newSize);
    const newGeneration = new Uint32Array(newSize);
    const newOccupied = new Uint8Array(newSize);

    // Copy old data
    for (let i = 0; i < oldSize; i++) {
      newData[i] = this.data[i];
      newGeneration[i] = this.generation[i];
      newOccupied[i] = this.occupied[i];
    }

    // Add new slots to free list
    for (let i = oldSize; i < newSize; i++) {
      this.freeList.push(i);
    }

    // Replace arrays
    this.data = newData;
    this.generation = newGeneration;
    this.occupied = newOccupied;
  }

  /**
   * Defragment (compact memory, remove fragmentation)
   * This moves data to eliminate gaps from freed slots
   * Fires callbacks with old_handle → new_handle mapping
   */
  defrag() {
    console.log('🔧 Defragmenting handle pool...');

    const mapping = new Map(); // old index → new index
    const newData = new Array(this.data.length);
    const newGeneration = new Uint32Array(this.data.length);
    const newOccupied = new Uint8Array(this.data.length);
    const newFreeList = [];

    let writePos = 0;

    // Copy occupied slots to front
    for (let i = 0; i < this.data.length; i++) {
      if (this.occupied[i] === 1) {
        newData[writePos] = this.data[i];
        newGeneration[writePos] = this.generation[i];
        newOccupied[writePos] = 1;

        // Track mapping
        if (i !== writePos) {
          mapping.set(i, writePos);
        }

        writePos++;
      }
    }

    // Remaining slots are free
    for (let i = writePos; i < this.data.length; i++) {
      newFreeList.push(i);
    }

    // Fire callbacks with mapping
    for (const callback of this.defragCallbacks) {
      callback(mapping);
    }

    // Replace arrays
    this.data = newData;
    this.generation = newGeneration;
    this.occupied = newOccupied;
    this.freeList = newFreeList;

    this.defragCount++;

    console.log(`✓ Defragmented: compacted ${mapping.size} slots`);
  }

  /**
   * Register a defrag callback
   * Callback receives: (mapping) => { /* update your handles */ }
   * @param {Function} callback - Callback function
   */
  onDefrag(callback) {
    this.defragCallbacks.push(callback);
  }

  /**
   * Get all valid handles
   * @returns {Array} - Array of { handle, data }
   */
  getAllValid() {
    const result = [];

    for (let i = 0; i < this.data.length; i++) {
      if (this.occupied[i] === 1) {
        result.push({
          handle: { index: i, generation: this.generation[i] },
          data: this.data[i]
        });
      }
    }

    return result;
  }

  /**
   * Get pool statistics
   * @returns {object} - Statistics
   */
  getStats() {
    const occupiedCount = this.occupied.reduce((sum, val) => sum + val, 0);
    const freeCount = this.freeList.length;
    const capacity = this.data.length;
    const fragmentation = (freeCount - (capacity - occupiedCount)) / capacity;

    return {
      capacity,
      occupied: occupiedCount,
      free: freeCount,
      fragmentation: fragmentation.toFixed(2),
      allocCount: this.allocCount,
      freeCount: this.freeCount,
      defragCount: this.defragCount
    };
  }

  /**
   * Should defrag? (check if fragmentation is high)
   * @param {number} threshold - Fragmentation threshold (0-1)
   * @returns {boolean} - True if should defrag
   */
  shouldDefrag(threshold = 0.3) {
    const stats = this.getStats();
    return parseFloat(stats.fragmentation) > threshold;
  }

  /**
   * Clear the pool
   */
  clear() {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = null;
      this.occupied[i] = 0;
      this.generation[i] = 0;
    }

    this.freeList = [];
    for (let i = 0; i < this.data.length; i++) {
      this.freeList.push(i);
    }

    this.allocCount = 0;
    this.freeCount = 0;
    this.defragCount = 0;
  }

  /**
   * Iterator support
   */
  *[Symbol.iterator]() {
    for (let i = 0; i < this.data.length; i++) {
      if (this.occupied[i] === 1) {
        yield {
          handle: { index: i, generation: this.generation[i] },
          data: this.data[i]
        };
      }
    }
  }
}

module.exports = HandlePool;
