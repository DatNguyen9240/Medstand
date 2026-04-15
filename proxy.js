/**
 * CORS Proxy for n8n Webhooks (Medstand Chatbot)
 * Bypass browser CORS by acting as a middle-man.
 * Port: 8080 -> Forward to: 127.0.0.1:5678
 */

const http = require('http');

const LISTEN_PORT = process.env.PORT || 8080;
const N8N_TARGET = process.env.N8N_TARGET || 'http://127.0.0.1:5678';
const parsedTarget = new URL(N8N_TARGET);

console.log('=======================================================');
console.log('         N8N CORS PROXY - MEDSTAND                     ');
console.log('=======================================================');

const server = http.createServer((req, res) => {
    // 1. Set CORS dynamic headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');

    // 2. Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    console.log(`[Proxy] ${req.method} ${req.url}`);

    // 3. Prepare target request
    const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: { ...req.headers }
    };

    // Remove host header to avoid n8n rejecting it
    delete options.headers['host'];
    delete options.headers['origin'];
    delete options.headers['referer'];

    const proxyReq = http.request(options, (proxyRes) => {
        // Build response headers but keep our CORS ones
        const responseHeaders = { ...proxyRes.headers };
        responseHeaders['Access-Control-Allow-Origin'] = '*';
        
        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error(`[Proxy Error] ${err.message}`);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Proxy Error: Could not reach n8n at ${N8N_TARGET}. Make sure n8n is running!`);
    });

    // Pipe incoming request body to target
    req.pipe(proxyReq, { end: true });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
    console.log(`[SUCCESS] Proxy is listening on http://127.0.0.1:${LISTEN_PORT}`);
    console.log(`[INFO] Forwarding to ${N8N_TARGET}`);
});
