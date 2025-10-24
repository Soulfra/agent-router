/**
 * CalOS Voice API Client
 * Cross-platform SDK for voice transcription and analytics
 *
 * Usage:
 *   const client = new CalOSVoiceClient({
 *     baseUrl: 'http://127.0.0.1:5001',
 *     userId: 'your-user-id-here'
 *   });
 *
 * Supports:
 *   - Web (browser)
 *   - Node.js
 *   - React Native / Expo
 *   - Capacitor (iOS/Android)
 */

class CalOSVoiceClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://127.0.0.1:5001';
    this.userId = options.userId || null;
    this.debug = options.debug || false;

    // Auto-detect environment
    this.isNode = typeof window === 'undefined';
    this.isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
    this.isCapacitor = typeof window !== 'undefined' && window.Capacitor;
  }

  /**
   * Set user ID for authentication
   */
  setUserId(userId) {
    this.userId = userId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('calos_user_id', userId);
    }
  }

  /**
   * Get stored user ID
   */
  getUserId() {
    if (this.userId) return this.userId;
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('calos_user_id');
    }
    return null;
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const userId = this.getUserId();
    if (!userId && options.requireAuth !== false) {
      throw new Error('User ID not set. Call setUserId() or pass userId in constructor.');
    }

    const headers = {
      ...options.headers,
      'X-User-Id': userId
    };

    const url = `${this.baseUrl}${endpoint}`;

    if (this.debug) {
      console.log('[CalOS] Request:', options.method || 'GET', url);
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    if (!response.ok) {
      const error = isJson ? await response.json() : { error: await response.text() };
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return isJson ? await response.json() : await response.text();
  }

  /**
   * List all available projects
   */
  async listProjects() {
    return await this.request('/api/voice/projects');
  }

  /**
   * Upload voice recording and get transcription
   * @param {Blob|File|Buffer} audioData - Audio file data
   * @param {string} filename - Optional filename (default: recording.webm)
   */
  async transcribe(audioData, filename = 'recording.webm') {
    const formData = new FormData();

    // Handle different audio data types
    if (this.isNode) {
      // Node.js: audioData should be Buffer
      const { Blob } = await import('buffer');
      const blob = new Blob([audioData]);
      formData.append('audio', blob, filename);
    } else if (this.isReactNative) {
      // React Native: use uri
      formData.append('audio', {
        uri: audioData.uri || audioData,
        type: 'audio/webm',
        name: filename
      });
    } else {
      // Web: Blob or File
      formData.append('audio', audioData, filename);
    }

    return await this.request('/api/voice/yap', {
      method: 'POST',
      body: formData
    });
  }

  /**
   * Get user's transcription history
   * @param {object} filters - Optional filters (limit, offset, projectSlug)
   */
  async getTranscriptions(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request(`/api/voice/transcriptions?${params}`);
  }

  /**
   * Get cumulative usage statistics
   */
  async getCumulativeStats() {
    return await this.request('/api/voice/stats/cumulative');
  }

  /**
   * Get daily usage breakdown
   * @param {string} from - Start date (YYYY-MM-DD)
   * @param {string} to - End date (YYYY-MM-DD)
   */
  async getDailyStats(from, to) {
    const params = new URLSearchParams({ from, to });
    return await this.request(`/api/voice/stats/daily?${params}`);
  }

  /**
   * Get project-specific usage statistics
   * @param {string} projectSlug - Project identifier
   */
  async getProjectStats(projectSlug) {
    return await this.request(`/api/voice/stats/projects/${projectSlug}`);
  }

  /**
   * Export transcriptions to file
   * @param {string} format - 'pdf' or 'markdown'
   * @param {object} options - Export options
   */
  async export(format = 'markdown', options = {}) {
    return await this.request('/api/voice/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        format,
        ...options
      })
    });
  }

  /**
   * Helper: Record audio in browser
   * Returns Promise that resolves with audio Blob when recording stops
   */
  async recordAudio() {
    if (this.isNode) {
      throw new Error('Audio recording not supported in Node.js environment');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        resolve(blob);
      };
      mediaRecorder.onerror = reject;

      mediaRecorder.start();

      // Return stop function
      return {
        stop: () => mediaRecorder.stop(),
        stream
      };
    });
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalOSVoiceClient;
}
if (typeof window !== 'undefined') {
  window.CalOSVoiceClient = CalOSVoiceClient;
}

// ES6 export
export default CalOSVoiceClient;
