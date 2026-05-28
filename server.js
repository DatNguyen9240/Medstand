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
const N8N_INTERNAL_URL = process.env.N8N_BASE || 'https://realized-comfortable-oxygen-played.trycloudflare.com';

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

// Serve static files from the root directory
app.use(express.static(__dirname));

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
