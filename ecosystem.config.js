/**
 * ClockIoT — PM2 Ecosystem Configuration
 * ========================================
 * MQTT Broker (Aedes) + Web Console (FastAPI)
 *
 * Usage:
 *   pm2 start ecosystem.config.js        # start all
 *   pm2 stop  ecosystem.config.js        # stop all
 *   pm2 restart ecosystem.config.js      # restart all
 *   pm2 start ecosystem.config.js --only clockmqtt-broker
 *   pm2 start ecosystem.config.js --only clockmqtt-web
 */

module.exports = {
  apps: [
    {
      // Aedes MQTT Broker — TCP :2080 + WebSocket :2091
      name: 'clockmqtt-broker',
      cwd: '/home/cc/Desktop/IoTPlatform/ClockIoT/broker',
      script: 'server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/cc/.pm2/logs/clockmqtt-broker-error.log',
      out_file: '/home/cc/.pm2/logs/clockmqtt-broker-out.log',
      // Restart if it crashes
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Merge logs from all instances
      merge_logs: true,
    },
    {
      // FastAPI Web Console — :2081
      name: 'clockmqtt-web',
      cwd: '/home/cc/Desktop/IoTPlatform/ClockIoT/backend',
      script: 'app.py',
      interpreter: '/home/cc/Desktop/IoTPlatform/ClockIoT/backend/.venv/bin/python3',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/cc/.pm2/logs/clockmqtt-web-error.log',
      out_file: '/home/cc/.pm2/logs/clockmqtt-web-out.log',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      merge_logs: true,
    },
  ],
};
