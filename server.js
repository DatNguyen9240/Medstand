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

const getN8nUrl = () => {
    let url = process.env.N8N_BASE;
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        try {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const match = envContent.match(/^N8N_BASE\s*=\s*(https:\/\/[^\s#]+)/m);
            if (match) url = match[1].trim();
        } catch (e) {}
    }
    const cfLogPath = path.join(__dirname, 'n8n-system', '.logs', 'cf_tunnel.log');
    if (fs.existsSync(cfLogPath)) {
        try {
            const logContent = fs.readFileSync(cfLogPath, 'utf-8');
            const match = logContent.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) url = match[0];
        } catch (e) {}
    }
    return url || 'https://realized-comfortable-oxygen-played.trycloudflare.com';
};

// ─── 1. PROXY API CHO CHATBOT (Có đính kèm CHAT_API_KEY bảo mật) ───
app.post('/api/chat', async (req, res) => {
    try {
        console.log('[Proxy Gateway] Forwarding chat request to N8N...');
        const response = await fetch(`${getN8nUrl()}/webhook/hook-ai-dainao`, {
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

// ─── NEW: API CUNG CẤP DỮ LIỆU DẠNG FLAT ARRAY CHO GOOGLE SHEETS ───
app.get('/api/sheet-data', async (req, res) => {
    try {
        console.log('[Sheet Gateway] Received request from Google Sheets:', req.url);
        
        // 1. Kiểm tra API Key bảo mật để tránh người ngoài truy cập trái phép
        const apiKey = req.query.apiKey || req.headers['x-api-key'];
        const validKey = process.env.CHAT_API_KEY || 'test123456';
        if (apiKey !== validKey) {
            return res.status(401).json({ error: 'Không có quyền truy cập. Vui lòng cung cấp apiKey hợp lệ.' });
        }

        const { ApiCode, username, ...otherParams } = req.query;
        if (!ApiCode) {
            return res.status(400).json({ error: 'Thiếu tham số ApiCode. Ví dụ: ApiCode=@danh_muc' });
        }

        // Map query params to standard SQL parameters (prefixed with @)
        const params = {};
        for (const [key, val] of Object.entries(otherParams)) {
            // Bỏ qua tham số apiKey khi đưa vào SQL params
            if (key === 'apiKey') continue;
            
            if (key.startsWith('@')) {
                params[key] = val;
            } else {
                params[`@${key}`] = val;
            }
        }

        const requestBody = {
            ApiCode: ApiCode,
            username: username || 'admin', // Mặc định dùng tài khoản admin nếu không truyền
            params: params
        };

        // Gửi truy vấn an toàn qua hệ thống execute API sẵn có của n8n
        const response = await fetch(`${getN8nUrl()}/webhook/api-execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': validKey
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        
        if (result && result.status === 'success' && Array.isArray(result.data)) {
            // Trả về mảng phẳng các object cực kỳ sạch để Google Apps Script duyệt qua tự động
            res.json(result.data);
        } else {
            console.error('[Sheet Gateway Error] n8n response failed:', result);
            res.status(500).json({ error: 'Lỗi thực thi dữ liệu.', details: result.reply || result });
        }
    } catch (error) {
        console.error('[Sheet Gateway Error]:', error);
        res.status(500).json({ error: 'Không thể kết nối đến máy chủ dữ liệu.' });
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
        const targetUrl = `${getN8nUrl()}${req.originalUrl || req.url}`;
        
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
    console.log(`🚀 FRONTEND SERVER IS RUNNING (PROXY ENABLED)`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log('===================================================');
});
