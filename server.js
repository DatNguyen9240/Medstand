const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

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

// ─── PRODUCTION OPTIMIZATION & SECURITY HEADERS ───
app.use(compression());

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content-Security-Policy (CSP) - Tối ưu cho SPA Medstand
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https:; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "frame-src 'none';"
    );
    next();
});

// ─── DEFENSE-IN-DEPTH: CHẶN TRUY CẬP TRỰC TIẾP FILE NGUỒN THÔ ───
app.use((req, res, next) => {
    const url = req.path.toLowerCase();
    
    // Ngăn chặn các thư mục mã nguồn thô nhạy cảm
    const sensitiveFolders = [
        '/src/js/pages/',
        '/src/js/core/',
        '/src/js/services/',
        '/src/js/utils/',
        '/src/js/components/',
        '/src/js/config/',
        '/src/js/schemas/',
        '/chatbot-widget/js/core/',
        '/chatbot-widget/js/utils/',
        '/scripts/',
        '/n8n-system/'
    ];
    
    const isSensitiveFolder = sensitiveFolders.some(folder => url.startsWith(folder.toLowerCase()) || url.includes(folder.toLowerCase()));
    
    // Ngăn chặn các file backend/config của hệ thống
    const isSensitiveFile = [
        '/server.js',
        '/package.json',
        '/package-lock.json',
        '/.env',
        '/start_everything.bat',
        '/env.js'
    ].includes(url);
    
    if (isSensitiveFolder || isSensitiveFile) {
        console.warn(`[Security Alert] Chặn truy cập trực tiếp vào file nhạy cảm: ${req.url}`);
        return res.status(403).send('Forbidden: Access denied.');
    }
    
    next();
});

// Backend URLs ẩn hoàn toàn phía server
const API_INTERNAL_URL = process.env.API_BASE || 'https://medtest.bms79.com';

const getN8nUrl = () => {
    return 'http://127.0.0.1:5678';
};

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

        // Khóa chức năng tự đăng ký tài khoản tự do theo đặc tả phân quyền hệ thống
        if (endpoint === '/api/API_UserRegister') {
            console.warn('[Security Warning] Chặn yêu cầu đăng ký tài khoản mới tự do qua endpoint /api/API_UserRegister');
            return res.status(403).json({ error: 'Tính năng đăng ký tài khoản tự do bị vô hiệu hóa theo tài liệu đặc tả phân quyền.' });
        }

        // 2. Định tuyến đến máy chủ đích thật
        const isN8n = endpoint.startsWith('/webhook');
        const baseUrl = isN8n ? getN8nUrl() : API_INTERNAL_URL;
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

        const text = await response.text();
        if (contentType.includes('application/json') && text.trim()) {
            try {
                const json = JSON.parse(text);
                resDataText = JSON.stringify(json);
            } catch (e) {
                console.error('[Proxy Gateway JSON Parse Error 1]:', e.message);
                resDataText = text;
            }
        } else {
            resDataText = text;
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
            const text = await response.text();
            let data = {};
            if (text.trim()) {
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    console.error('[Proxy Gateway JSON Parse Error 2]:', e.message);
                }
            }
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
            const text = await response.text();
            let data = {};
            if (text.trim()) {
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    console.error('[Proxy Gateway JSON Parse Error 3]:', e.message);
                }
            }
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

// Thiết lập Cache-Control dài hạn (1 năm, immutable) cho các tệp đã đóng gói (.min.js, .min.css)
app.use((req, res, next) => {
    const url = req.path.toLowerCase();
    if (url.endsWith('.min.js') || url.endsWith('.min.css')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    next();
});

// Chuyển hướng trang đăng ký cũ về trang đăng nhập kèm cờ cảnh báo theo đặc tả phân quyền
app.get('/pages/register.html', (req, res) => {
    res.redirect('/pages/login.html?register=disabled');
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
    console.log(`🚀 FRONTEND SERVER IS RUNNING (PROXY ENABLED)`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log('===================================================');
});
