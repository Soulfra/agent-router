/**
 * macOS App Controller
 *
 * Controls native macOS applications using AppleScript/JXA.
 * Integrates with CommandVerifier and RLCommandLearner for reliability tracking.
 *
 * Supported Apps:
 * - Spotify: Play, pause, skip, volume, current track
 * - Xcode: Build, test, open projects, read logs
 * - General: Launch, quit, activate any app
 *
 * All actions are verified and learned from via RL system.
 */

const { spawn } = require('child_process');
const CommandVerifier = require('./command-verifier');
const RLCommandLearner = require('./rl-command-learner');

class MacOSAppController {
  constructor(options = {}) {
    this.verifier = new CommandVerifier(options.verifier);
    this.learner = new RLCommandLearner(options.learner);
    this.platform = process.platform;

    if (this.platform !== 'darwin') {
      throw new Error('MacOSAppController only works on macOS');
    }
  }

  /**
   * Control Spotify
   * @param {string} action - Action: play, pause, skip, back, volume, current, search
   * @param {object} params - Action parameters
   * @returns {Promise<object>}
   */
  async spotify(action, params = {}) {
    const context = this.learner.getCurrentContext();

    switch (action.toLowerCase()) {
      case 'play':
        return await this.executeWithRL(
          'spotify-play',
          () => this.spotifyPlayPause(true),
          context
        );

      case 'pause':
      case 'stop':
        return await this.executeWithRL(
          'spotify-pause',
          () => this.spotifyPlayPause(false),
          context
        );

      case 'skip':
      case 'next':
        return await this.executeWithRL(
          'spotify-next',
          () => this.spotifySkip('next'),
          context
        );

      case 'back':
      case 'previous':
      case 'prev':
        return await this.executeWithRL(
          'spotify-previous',
          () => this.spotifySkip('previous'),
          context
        );

      case 'volume':
        if (!params.level) {
          throw new Error('Volume level required (0-100)');
        }
        return await this.executeWithRL(
          `spotify-volume-${params.level}`,
          () => this.spotifyVolume(params.level),
          context
        );

      case 'current':
      case 'status':
      case 'now':
        return await this.executeWithRL(
          'spotify-current',
          () => this.spotifyCurrentTrack(),
          context
        );

      case 'shuffle':
        return await this.executeWithRL(
          `spotify-shuffle-${params.enabled !== false}`,
          () => this.spotifyToggleShuffle(params.enabled !== false),
          context
        );

      case 'repeat':
        return await this.executeWithRL(
          `spotify-repeat-${params.mode || 'toggle'}`,
          () => this.spotifyToggleRepeat(params.mode),
          context
        );

      default:
        throw new Error(`Unknown Spotify action: ${action}`);
    }
  }

  /**
   * Control Xcode
   * @param {string} action - Action: build, test, clean, run, stop, open
   * @param {object} params - Action parameters
   * @returns {Promise<object>}
   */
  async xcode(action, params = {}) {
    const context = this.learner.getCurrentContext();

    switch (action.toLowerCase()) {
      case 'build':
        return await this.executeWithRL(
          'xcode-build',
          () => this.xcodeBuild(params.project),
          context
        );

      case 'test':
        return await this.executeWithRL(
          'xcode-test',
          () => this.xcodeTest(params.project, params.scheme),
          context
        );

      case 'clean':
        return await this.executeWithRL(
          'xcode-clean',
          () => this.xcodeClean(params.project),
          context
        );

      case 'run':
        return await this.executeWithRL(
          'xcode-run',
          () => this.xcodeRun(params.project),
          context
        );

      case 'stop':
        return await this.executeWithRL(
          'xcode-stop',
          () => this.xcodeStop(),
          context
        );

      case 'open':
        if (!params.project) {
          throw new Error('Project path required');
        }
        return await this.executeWithRL(
          `xcode-open-${params.project}`,
          () => this.xcodeOpen(params.project),
          context
        );

      default:
        throw new Error(`Unknown Xcode action: ${action}`);
    }
  }

  /**
   * General app control
   * @param {string} action - Action: launch, quit, activate, hide, show
   * @param {string} appName - Application name
   * @returns {Promise<object>}
   */
  async app(action, appName) {
    const context = this.learner.getCurrentContext();

    switch (action.toLowerCase()) {
      case 'launch':
      case 'open':
      case 'start':
        return await this.executeWithRL(
          `app-launch-${appName}`,
          () => this.launchApp(appName),
          context
        );

      case 'quit':
      case 'close':
        return await this.executeWithRL(
          `app-quit-${appName}`,
          () => this.quitApp(appName),
          context
        );

      case 'activate':
      case 'focus':
        return await this.executeWithRL(
          `app-activate-${appName}`,
          () => this.activateApp(appName),
          context
        );

      case 'hide':
        return await this.executeWithRL(
          `app-hide-${appName}`,
          () => this.hideApp(appName),
          context
        );

      case 'is-running':
      case 'status':
        return await this.executeWithRL(
          `app-status-${appName}`,
          () => this.isAppRunning(appName),
          context
        );

      default:
        throw new Error(`Unknown app action: ${action}`);
    }
  }

  /**
   * Execute command with RL learning
   */
  async executeWithRL(commandKey, commandFn, context) {
    const startTime = Date.now();
    let success = false;
    let error = null;
    let result = null;

    try {
      result = await commandFn();
      success = true;
    } catch (err) {
      error = err.message;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // Record observation for RL
      await this.learner.observe({
        command: commandKey,
        args: [],
        context,
        success,
        duration,
        error
      });
    }

    return result;
  }

  // ===== Spotify AppleScript Commands =====

  async spotifyPlayPause(play) {
    const script = `
      tell application "Spotify"
        ${play ? 'play' : 'pause'}
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: play ? 'play' : 'pause',
      app: 'Spotify'
    };
  }

  async spotifySkip(direction) {
    const command = direction === 'next' ? 'next track' : 'previous track';
    const script = `
      tell application "Spotify"
        ${command}
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: direction,
      app: 'Spotify'
    };
  }

  async spotifyVolume(level) {
    const volume = Math.max(0, Math.min(100, parseInt(level)));
    const script = `
      tell application "Spotify"
        set sound volume to ${volume}
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'volume',
      level: volume,
      app: 'Spotify'
    };
  }

  async spotifyCurrentTrack() {
    const script = `
      tell application "Spotify"
        set trackName to name of current track
        set artistName to artist of current track
        set albumName to album of current track
        set playerState to player state as string
        set trackDuration to duration of current track
        set trackPosition to player position

        return trackName & "|" & artistName & "|" & albumName & "|" & playerState & "|" & trackDuration & "|" & trackPosition
      end tell
    `;

    const output = await this.runAppleScript(script);
    const [track, artist, album, state, duration, position] = output.split('|');

    return {
      success: true,
      track: track.trim(),
      artist: artist.trim(),
      album: album.trim(),
      state: state.trim(),
      duration: parseInt(duration),
      position: parseFloat(position),
      app: 'Spotify'
    };
  }

  async spotifyToggleShuffle(enabled) {
    const script = `
      tell application "Spotify"
        set shuffling to ${enabled}
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'shuffle',
      enabled,
      app: 'Spotify'
    };
  }

  async spotifyToggleRepeat(mode = 'toggle') {
    // Mode: off, track, context (playlist/album)
    const script = `
      tell application "Spotify"
        set repeating to ${mode === 'track'}
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'repeat',
      mode,
      app: 'Spotify'
    };
  }

  // ===== Xcode Commands =====

  async xcodeBuild(project) {
    // Use xcodebuild command
    const args = ['build'];
    if (project) {
      args.push('-project', project);
    }

    const result = await this.runCommand('xcodebuild', args);
    return {
      success: result.code === 0,
      action: 'build',
      output: result.stdout,
      error: result.stderr,
      app: 'Xcode'
    };
  }

  async xcodeTest(project, scheme) {
    const args = ['test'];
    if (project) {
      args.push('-project', project);
    }
    if (scheme) {
      args.push('-scheme', scheme);
    }

    const result = await this.runCommand('xcodebuild', args);
    return {
      success: result.code === 0,
      action: 'test',
      output: result.stdout,
      error: result.stderr,
      app: 'Xcode'
    };
  }

  async xcodeClean(project) {
    const args = ['clean'];
    if (project) {
      args.push('-project', project);
    }

    const result = await this.runCommand('xcodebuild', args);
    return {
      success: result.code === 0,
      action: 'clean',
      app: 'Xcode'
    };
  }

  async xcodeRun(project) {
    // Open Xcode and run (via AppleScript)
    const script = `
      tell application "Xcode"
        activate
        tell application "System Events"
          keystroke "r" using command down
        end tell
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'run',
      app: 'Xcode'
    };
  }

  async xcodeStop() {
    const script = `
      tell application "Xcode"
        tell application "System Events"
          keystroke "." using command down
        end tell
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'stop',
      app: 'Xcode'
    };
  }

  async xcodeOpen(project) {
    const result = await this.runCommand('open', ['-a', 'Xcode', project]);
    return {
      success: result.code === 0,
      action: 'open',
      project,
      app: 'Xcode'
    };
  }

  // ===== General App Commands =====

  async launchApp(appName) {
    const result = await this.runCommand('open', ['-a', appName]);
    return {
      success: result.code === 0,
      action: 'launch',
      app: appName
    };
  }

  async quitApp(appName) {
    const script = `
      tell application "${appName}"
        quit
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'quit',
      app: appName
    };
  }

  async activateApp(appName) {
    const script = `
      tell application "${appName}"
        activate
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'activate',
      app: appName
    };
  }

  async hideApp(appName) {
    const script = `
      tell application "System Events"
        set visible of process "${appName}" to false
      end tell
    `;

    await this.runAppleScript(script);
    return {
      success: true,
      action: 'hide',
      app: appName
    };
  }

  async isAppRunning(appName) {
    const script = `
      tell application "System Events"
        set appList to name of every process
        return appList contains "${appName}"
      end tell
    `;

    const output = await this.runAppleScript(script);
    const isRunning = output.trim() === 'true';

    return {
      success: true,
      action: 'status',
      app: appName,
      running: isRunning
    };
  }

  // ===== Helper Methods =====

  /**
   * Run AppleScript
   */
  async runAppleScript(script) {
    return new Promise((resolve, reject) => {
      const proc = spawn('osascript', ['-e', script]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`AppleScript failed: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Run shell command
   */
  async runCommand(command, args = []) {
    return new Promise((resolve) => {
      const proc = spawn(command, args);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      proc.on('error', (error) => {
        resolve({ code: -1, stdout, stderr: error.message });
      });
    });
  }

  /**
   * Get recommended action based on past performance
   */
  async getRecommendedAction(intent) {
    return await this.learner.recommend(intent, this.learner.getCurrentContext());
  }

  /**
   * Get command health
   */
  async getCommandHealth() {
    return await this.verifier.getStatistics();
  }
}

module.exports = MacOSAppController;
