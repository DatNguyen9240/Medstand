const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ============================================================
//  MEDSTAND — TỰ ĐỘNG ĐỌC BẢN CẤU HÌNH CỤC BỘ .ENV
// ============================================================
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const index = trimmed.indexOf('=');
            if (index > -1) {
                const key = trimmed.substring(0, index).trim();
                const val = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, '');
                if (key) process.env[key] = val;
            }
        }
    });
    console.log('[Server Startup] Loaded environment variables from .env');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Enable JSON body parsing

// Backend URLs ẩn hoàn toàn phía server
const API_INTERNAL_URL = process.env.API_BASE || 'https://medtest.bms79.com';
const N8N_INTERNAL_URL = 'http://127.0.0.1:5678';

// ─── CIPHER HELPER (XOR + Base64) ───
const Cipher = {
    encrypt: (str, key = 107) => {
        const b64 = Buffer.from(str, 'utf-8').toString('base64');
        let xor = '';
        for (let i = 0; i < b64.length; i++) {
            xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
        }
        return Buffer.from(xor, 'utf-8').toString('base64');
    },
    decrypt: (b64Cipher, key = 107) => {
        const xor = Buffer.from(b64Cipher, 'base64').toString('utf-8');
        let b64 = '';
        for (let i = 0; i < xor.length; i++) {
            b64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
        }
        return Buffer.from(b64, 'base64').toString('utf-8');
    }
};

// ─── GLOBAL API GATEWAY (Encrypted Tunnel) ───
app.post('/api/gateway', async (req, res) => {
    try {
        if (!req.body || !req.body.data) {
            return res.status(400).json({ error: 'Yêu cầu không hợp lệ.' });
        }

        // 1. Giải mã yêu cầu từ Client
        const decryptedRaw = Cipher.decrypt(req.body.data);
        const requestPayload = JSON.parse(decryptedRaw);
        const { method, endpoint, body } = requestPayload;

        if (!endpoint) {
            return res.status(400).json({ error: 'Thiếu endpoint xử lý.' });
        }

        // 2. Định tuyến đến máy chủ đích thật
        const isN8n = endpoint.startsWith('/webhook');
        const baseUrl = isN8n ? N8N_INTERNAL_URL : API_INTERNAL_URL;
        const targetUrl = `${baseUrl}${endpoint}`;

        console.log(`[Proxy Gateway] Forwarding ${method} to ${targetUrl}`);
        
        const headers = {
            'Content-Type': 'application/json',
            ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {}),
            ...(isN8n ? { 'x-api-key': process.env.CHAT_API_KEY || '' } : {})
        };

        console.log('[Proxy Gateway] Request headers:', JSON.stringify(headers));
        console.log('[Proxy Gateway] Request body:', JSON.stringify(body));

        const options = {
            method: method,
            headers: headers
        };

        if (method !== 'GET' && method !== 'HEAD' && body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(targetUrl, options);
        const contentType = response.headers.get('content-type') || '';
        let resDataText = '';

        if (contentType.includes('application/json')) {
            const json = await response.json();
            resDataText = JSON.stringify(json);
        } else {
            resDataText = await response.text();
        }

        console.log(`[Proxy Gateway] Response status: ${response.status}`);
        console.log(`[Proxy Gateway] Response text snippet: ${resDataText.substring(0, 300)}`);

        // 3. Mã hóa kết quả trả về cho Client
        const encryptedRes = Cipher.encrypt(resDataText);
        res.status(response.status).json({ data: encryptedRes });

    } catch (error) {
        console.error('[Proxy Gateway Dynamic Error]:', error);
        res.status(500).json({ error: 'Không thể kết nối đến máy chủ hệ thống.' });
    }
});

// ─── 1. PROXY API CHO CHATBOT (Có đính kèm CHAT_API_KEY bảo mật) ───
app.post('/api/chat', async (req, res) => {
    try {
        console.log('[Proxy Gateway] Forwarding chat request to N8N...');
        const response = await fetch(`${N8N_INTERNAL_URL}/webhook/hook-ai-dainao`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers['authorization'] || '',
                'x-api-key': process.env.CHAT_API_KEY || ''
            },
            body: JSON.stringify(req.body)
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            res.status(response.status).json(data);
        } else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
    } catch (error) {
        console.error('[Proxy Gateway Error]:', error);
        res.status(500).json({ error: 'Không thể kết nối đến Trợ lý AI.' });
    }
});

// ─── 2. PROXY CHO TOÀN BỘ CÁC API ENDPOINT KHÁC SANG BACKEND THẬT ───
app.all('/api/*all', async (req, res) => {
    try {
        console.log(`[Proxy Gateway] Forwarding ${req.method} request to Backend: ${req.url}`);
        const targetUrl = `${API_INTERNAL_URL}${req.originalUrl || req.url}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
        };

        const options = {
            method: req.method,
            headers: headers
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            options.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, options);
        const contentType = response.headers.get('content-type') || '';

        res.status(response.status);
        if (contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            res.send(text);
        }
    } catch (error) {
        console.error('[Proxy Gateway API Error]:', error);
        res.status(500).json({ error: 'Không thể kết nối đến Máy chủ Backend.' });
    }
});

// ─── 3. PROXY CHO CÁC ENDPOINT N8N BẮT ĐẦU BẰNG /WEBHOOK/ (Có đính kèm CHAT_API_KEY bảo mật) ───
app.all('/webhook/*all', async (req, res) => {
    try {
        console.log(`[Proxy Gateway] Forwarding ${req.method} request to N8N: ${req.url}`);
        const targetUrl = `${N8N_INTERNAL_URL}${req.originalUrl || req.url}`;
        
        const options = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers['authorization'] || '',
                'x-api-key': process.env.CHAT_API_KEY || ''
            }
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            options.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, options);
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const data = await response.json();
            res.status(response.status).json(data);
        } else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
    } catch (error) {
        console.error('[Proxy Gateway Error]:', error);
        res.status(500).json({ error: 'Không thể kết nối đến Trợ lý AI.' });
    }
});

// Serve static files from the root directory (Tắt tự động trả về index.html mặc định)
app.use(express.static(__dirname, { index: false }));

// Định tuyến rõ ràng cho trang chủ và index.html để ưu tiên bản index.prod.html
app.get('/', (req, res) => {
    const prodFile = path.join(__dirname, 'index.prod.html');
    if (fs.existsSync(prodFile)) {
        res.sendFile(prodFile);
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.get('/index.html', (req, res) => {
    const prodFile = path.join(__dirname, 'index.prod.html');
    if (fs.existsSync(prodFile)) {
        res.sendFile(prodFile);
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// Direct all other requests to index.prod.html (if exists) or index.html (SPA routing support)
app.get('*all', (req, res) => {
    const prodFile = path.join(__dirname, 'index.prod.html');
    if (fs.existsSync(prodFile)) {
        res.sendFile(prodFile);
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log('===================================================');
    console.log(`🚀 MEDSTAND FRONTEND SERVER IS RUNNING (PROXY ENABLED)`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log('===================================================');
});
