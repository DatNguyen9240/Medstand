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
      name: "Medstand_N8N",
      script: "run_n8n.js",
      interpreter: nodeExe,
      cwd: __dirname,
      watch: false,
      max_memory_restart: "2G"
    },
    {
      name: "Medstand_WebGateway",
      script: path.join(__dirname, '..', 'server.js'),
      interpreter: nodeExe,
      cwd: path.join(__dirname, '..'),
      watch: false
    }
  ]
};
