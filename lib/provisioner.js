/**
 * Container Provisioner
 *
 * Auto-provisions Docker containers or AWS infrastructure based on service manifests
 * Supports local-first (Docker on laptop) with cloud fallback (AWS)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const execAsync = promisify(exec);

class Provisioner {
  constructor(options = {}) {
    this.mode = options.mode || 'auto'; // 'auto', 'local', 'cloud'
    this.projectRoot = options.projectRoot || path.join(__dirname, '..');
    this.composeDir = path.join(this.projectRoot, '..');
  }

  /**
   * Provision services based on manifest
   *
   * @param {object} manifest - Service manifest
   * @returns {object} - Provisioning result with endpoints
   */
  async provision(manifest) {
    console.log(`[Provisioner] Provisioning ${manifest.serviceId}...`);

    // Detect environment
    const environment = await this.detectEnvironment();
    console.log(`[Provisioner] Detected environment: ${environment}`);

    // Choose provisioning strategy
    const strategy = this._chooseStrategy(manifest, environment);
    console.log(`[Provisioner] Using strategy: ${strategy}`);

    switch (strategy) {
      case 'local-docker':
        return await this.provisionLocalDocker(manifest);

      case 'cloud-aws':
        return await this.provisionCloudAWS(manifest);

      case 'hybrid':
        // Try local first, fallback to cloud
        try {
          return await this.provisionLocalDocker(manifest);
        } catch (error) {
          console.warn('[Provisioner] Local provisioning failed, falling back to cloud:', error.message);
          return await this.provisionCloudAWS(manifest);
        }

      default:
        throw new Error(`Unknown provisioning strategy: ${strategy}`);
    }
  }

  /**
   * Detect current environment
   */
  async detectEnvironment() {
    const checks = {
      dockerAvailable: await this._checkDocker(),
      postgresRunning: await this._checkPostgres(),
      ollamaRunning: await this._checkOllama(),
      isLaptop: process.platform === 'darwin' || process.platform === 'linux',
      hasInternet: await this._checkInternet()
    };

    console.log('[Provisioner] Environment checks:', checks);

    if (checks.dockerAvailable && checks.isLaptop) {
      return 'local';
    } else if (checks.hasInternet) {
      return 'cloud';
    } else {
      return 'unknown';
    }
  }

  /**
   * Provision using local Docker
   */
  async provisionLocalDocker(manifest) {
    console.log('[Provisioner] Provisioning with local Docker...');

    // Generate docker-compose.yml
    const composeFile = await this._generateDockerCompose(manifest);
    const composePath = path.join(this.composeDir, `docker-compose.${manifest.serviceId}.yml`);

    await fs.writeFile(composePath, yaml.dump(composeFile));
    console.log(`[Provisioner] Generated ${composePath}`);

    // Start containers
    try {
      const { stdout, stderr } = await execAsync(
        `docker-compose -f "${composePath}" up -d`,
        { cwd: this.composeDir }
      );

      console.log('[Provisioner] Docker Compose output:', stdout);

      if (stderr) {
        console.warn('[Provisioner] Docker Compose stderr:', stderr);
      }

      // Get container endpoints
      const endpoints = await this._getLocalEndpoints(manifest);

      return {
        strategy: 'local-docker',
        status: 'running',
        endpoints,
        composePath
      };

    } catch (error) {
      console.error('[Provisioner] Docker provisioning failed:', error);
      throw error;
    }
  }

  /**
   * Provision using AWS (placeholder for now)
   */
  async provisionCloudAWS(manifest) {
    console.log('[Provisioner] Provisioning with AWS...');

    // This would integrate with AWS SDK to:
    // 1. Create ECS/Fargate tasks
    // 2. Provision RDS for Postgres
    // 3. Setup load balancers
    // 4. Configure security groups

    throw new Error('AWS provisioning not yet implemented. Please run locally with Docker.');

    // Placeholder return structure:
    // return {
    //   strategy: 'cloud-aws',
    //   status: 'running',
    //   endpoints: {
    //     api: 'https://api.your-domain.com',
    //     postgres: 'your-rds-instance.amazonaws.com:5432',
    //     ...
    //   },
    //   resourceIds: {
    //     cluster: 'arn:aws:ecs:...',
    //     database: 'arn:aws:rds:...'
    //   }
    // };
  }

  /**
   * Deprovision services
   */
  async deprovision(manifest) {
    const composePath = path.join(this.composeDir, `docker-compose.${manifest.serviceId}.yml`);

    try {
      await execAsync(
        `docker-compose -f "${composePath}" down -v`,
        { cwd: this.composeDir }
      );

      console.log(`[Provisioner] Deprovisioned ${manifest.serviceId}`);
      return { status: 'stopped' };

    } catch (error) {
      console.error('[Provisioner] Deprovision failed:', error);
      throw error;
    }
  }

  /**
   * Get status of provisioned services
   */
  async getStatus(manifest) {
    const composePath = path.join(this.composeDir, `docker-compose.${manifest.serviceId}.yml`);

    try {
      const { stdout } = await execAsync(
        `docker-compose -f "${composePath}" ps --format json`,
        { cwd: this.composeDir }
      );

      const containers = JSON.parse(stdout);

      return {
        status: containers.every(c => c.State === 'running') ? 'running' : 'partial',
        containers: containers.map(c => ({
          name: c.Name,
          state: c.State,
          status: c.Status
        }))
      };

    } catch (error) {
      return { status: 'not-found' };
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Choose provisioning strategy
   */
  _chooseStrategy(manifest, environment) {
    if (this.mode === 'local') return 'local-docker';
    if (this.mode === 'cloud') return 'cloud-aws';

    // Auto mode
    if (manifest.preferLocal && environment === 'local') {
      return 'local-docker';
    } else if (environment === 'cloud') {
      return 'cloud-aws';
    } else {
      return 'hybrid';
    }
  }

  /**
   * Generate docker-compose.yml from manifest
   */
  async _generateDockerCompose(manifest) {
    const services = {};

    // Map manifest requirements to Docker services
    if (manifest.requires.containers) {
      for (const container of manifest.requires.containers) {
        switch (container) {
          case 'postgres':
            services.postgres = {
              image: 'postgres:16-alpine',
              environment: {
                POSTGRES_DB: 'calos',
                POSTGRES_USER: 'calos',
                POSTGRES_PASSWORD: 'calos_dev_password'
              },
              ports: ['5432:5432'],
              volumes: ['postgres-data:/var/lib/postgresql/data'],
              healthcheck: {
                test: ['CMD-SHELL', 'pg_isready -U calos'],
                interval: '10s',
                timeout: '5s',
                retries: 5
              }
            };
            break;

          case 'ollama':
            services.ollama = {
              image: 'ollama/ollama:latest',
              ports: ['11434:11434'],
              volumes: ['ollama-data:/root/.ollama'],
              healthcheck: {
                test: ['CMD', 'curl', '-f', 'http://localhost:11434/api/tags'],
                interval: '30s',
                timeout: '10s',
                retries: 3
              }
            };
            break;

          case 'redis':
            services.redis = {
              image: 'redis:7-alpine',
              ports: ['6379:6379'],
              volumes: ['redis-data:/data'],
              healthcheck: {
                test: ['CMD', 'redis-cli', 'ping'],
                interval: '10s',
                timeout: '5s',
                retries: 5
              }
            };
            break;
        }
      }
    }

    // Add API server
    services['agent-router'] = {
      build: {
        context: '.',
        dockerfile: 'Dockerfile'
      },
      ports: ['5001:5001'],
      environment: {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://calos:calos_dev_password@postgres:5432/calos',
        OLLAMA_URL: 'http://ollama:11434'
      },
      depends_on: Object.keys(services),
      volumes: [
        './agent-router:/app',
        '/app/node_modules'
      ]
    };

    return {
      version: '3.8',
      services,
      volumes: {
        'postgres-data': {},
        'ollama-data': {},
        'redis-data': {}
      },
      networks: {
        default: {
          name: 'calos-network'
        }
      }
    };
  }

  /**
   * Get local Docker endpoints
   */
  async _getLocalEndpoints(manifest) {
    // Determine local IP for mobile access
    const localIp = await this._getLocalIp();

    const endpoints = {
      api: `http://localhost:5001`,
      apiMobile: `http://${localIp}:5001` // For mobile devices on same network
    };

    if (manifest.requires.containers) {
      for (const container of manifest.requires.containers) {
        switch (container) {
          case 'postgres':
            endpoints.postgres = 'postgresql://calos:calos_dev_password@localhost:5432/calos';
            break;
          case 'ollama':
            endpoints.ollama = 'http://localhost:11434';
            break;
          case 'redis':
            endpoints.redis = 'redis://localhost:6379';
            break;
        }
      }
    }

    return endpoints;
  }

  /**
   * Get local IP address for mobile access
   */
  async _getLocalIp() {
    try {
      const { stdout } = await execAsync(
        process.platform === 'darwin'
          ? "ipconfig getifaddr en0"
          : "hostname -I | awk '{print $1}'"
      );
      return stdout.trim() || 'localhost';
    } catch {
      return 'localhost';
    }
  }

  /**
   * Check if Docker is available
   */
  async _checkDocker() {
    try {
      await execAsync('docker --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Postgres is running
   */
  async _checkPostgres() {
    try {
      await execAsync('docker ps --filter name=postgres --format "{{.Names}}"');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Ollama is running
   */
  async _checkOllama() {
    try {
      const { stdout } = await execAsync('curl -s http://localhost:11434/api/tags');
      return !!stdout;
    } catch {
      return false;
    }
  }

  /**
   * Check internet connectivity
   */
  async _checkInternet() {
    try {
      await execAsync('ping -c 1 8.8.8.8', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Provisioner;
