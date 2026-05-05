// Medstand CORS Proxy (Fallback Dummy)
// Script này được tạo tự động bởi AI để giữ nhịp chạy PM2.
// Nếu Frontend dùng N8N_BASE trực tiếp tới N8N / Cloudflare thì Proxy này sẽ nhàn rỗi.
const http = require('http');
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Medstand CORS Proxy Engine - Online');
});

const PORT = process.env.PORT || 8199;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Proxy] CORS Proxy Engine đang chạy ngầm ở port ${PORT}`);
});
