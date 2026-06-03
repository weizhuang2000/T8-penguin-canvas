module.exports = {
  apps: [
    {
      name: 't8-penguin-canvas',
      script: 'backend/src/server.js',
      interpreter: 'node',
      cwd: 'C:\\wwwroot\\expo-AI-CanvasPro',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1024M',
      autorestart: true,
      watch: false,
      ignore_watch: [
        'node_modules',
        '.git',
        'dist',
        'data',
        'input',
        'output',
        'thumbnails',
        'logs',
        '*.log',
      ],
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '18766',

        // Enable Express to serve the built Vite frontend from dist/.
        T8PC_PACKAGED: '1',
        T8PC_FRONTEND_DIST: 'C:\\wwwroot\\expo-AI-CanvasPro\\dist',
        T8PC_USER_DATA: 'C:\\wwwroot\\expo-AI-CanvasPro-data',

        // Design management system MySQL.
        MYSQL_HOST: '127.0.0.1',
        MYSQL_PORT: '3306',
        MYSQL_DATABASE: 'design_team_db',
        MYSQL_USER: 'root',
        MYSQL_PASSWORD: 'zw246888',

        // Must match the design management system JWT_SECRET.
        JWT_SECRET: 'design_team_jwt_secret_key_2024_very_secure',
      },
      error_file: 'C:\\wwwroot\\expo-AI-CanvasPro-data\\logs\\err.log',
      out_file: 'C:\\wwwroot\\expo-AI-CanvasPro-data\\logs\\out.log',
      log_file: 'C:\\wwwroot\\expo-AI-CanvasPro-data\\logs\\combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};
