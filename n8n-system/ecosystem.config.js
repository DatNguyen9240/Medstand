const path = require('path');

// PM2 se ke thua bien moi truong (env variables) tu file .bat
const nodeExe = process.env.NODE_EXE || 'node';
const n8nDir = process.env.N8N_USER_FOLDER || path.join(__dirname, 'n8n_data');

module.exports = {
  apps: [
    {
      name: "Medstand_Redis",
      script: "redis\\redis-server.exe",
      args: "redis\\medstand.conf",
      cwd: __dirname,
      watch: false
    },
    {
      name: "Medstand_RedisProxy",
      script: "redis\\redis-proxy.js",
      interpreter: nodeExe,
      cwd: __dirname,
      watch: false
    },
    {
      name: "Medstand_Qdrant",
      script: "qdrant\\qdrant.exe",
      cwd: __dirname,
      watch: false,
      max_memory_restart: "1G"
    },
    {
      name: "Medstand_CORSProxy",
      script: "..\\proxy.js",
      interpreter: nodeExe,
      cwd: __dirname,
      watch: false
    },
    {
      name: "Medstand_N8N",
      script: path.join(n8nDir, 'npm_global', 'node_modules', 'n8n', 'bin', 'n8n'),
      interpreter: nodeExe,
      args: "start",
      cwd: __dirname,
      watch: false,
      max_memory_restart: "2G"
    }
  ]
};
