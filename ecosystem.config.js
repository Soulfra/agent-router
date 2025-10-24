/**
 * PM2 Ecosystem Configuration
 *
 * Deploy Cal and the main API server with pm2.
 *
 * Usage:
 *   # Start all services
 *   pm2 start ecosystem.config.js
 *
 *   # Start only Cal daemon
 *   pm2 start ecosystem.config.js --only cal-autonomous
 *
 *   # Start only API server
 *   pm2 start ecosystem.config.js --only agent-router-api
 *
 *   # View logs
 *   pm2 logs cal-autonomous
 *   pm2 logs agent-router-api
 *
 *   # Monitor
 *   pm2 monit
 *
 *   # Save configuration (auto-restart on reboot)
 *   pm2 save
 *   pm2 startup
 *
 *   # Stop all
 *   pm2 stop ecosystem.config.js
 *
 *   # Restart all
 *   pm2 restart ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      // Cal Autonomous Daemon
      name: 'cal-autonomous',
      script: './bin/cal-daemon',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        CAL_INTERVAL: '1h',           // How often Cal runs
        CAL_AUTO_PUBLISH: 'false',    // Set to 'true' to auto-publish
        CAL_AUTO_SIGN: 'true',        // Set to 'false' to skip signing
      },
      error_file: './logs/cal-daemon-error.log',
      out_file: './logs/cal-daemon-out.log',
      log_file: './logs/cal-daemon-combined.log',
      time: true,
      merge_logs: true,
      // Restart at 3am daily (fresh start)
      cron_restart: '0 3 * * *'
    },

    {
      // Main API Server
      name: 'agent-router-api',
      script: './router.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      merge_logs: true
    },

    // Optional: Gmail Poller (if using Gmail webhook system)
    // {
    //   name: 'gmail-poller',
    //   script: './lib/gmail-poller.js',
    //   cwd: __dirname,
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '300M',
    //   env: {
    //     NODE_ENV: 'production',
    //     POLL_INTERVAL: '60000'  // 60 seconds
    //   },
    //   error_file: './logs/gmail-poller-error.log',
    //   out_file: './logs/gmail-poller-out.log',
    //   time: true
    // }
  ]
};
