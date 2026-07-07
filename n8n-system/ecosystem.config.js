const path = require('path');

// Duong dan tuyet doi den Node.js Portable (khong phu thuoc bien moi truong)
const NODE_DIR = path.join(__dirname, '.bin', 'node-v22.14.0-win-x64');
const nodeExe = path.join(NODE_DIR, 'node.exe');
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
      script: 'd:/HoangDang/IT/Medstand/server.js',
      interpreter: 'node',
      cwd: 'd:/HoangDang/IT/Medstand',
      watch: false,
      env: {
        NODE_PATH: 'd:/HoangDang/IT/Medstand/node_modules'
      }
    }
  ]
};
