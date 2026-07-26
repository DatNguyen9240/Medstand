const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const crypto = require('crypto');

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
                if (key && process.env[key] === undefined) process.env[key] = val;
            }
        }
    });
    console.log('[Server Startup] Loaded environment variables from .env');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use((req, res, next) => {
    // Encrypted/base64 gateway uploads need more room than normal JSON calls.
    // Keep the default small limit for every other route.
    const parser = req.path === '/api/gateway'
        ? express.json({ limit: '32mb' })
        : express.json();
    return parser(req, res, next);
});

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
        '/n8n-system/',
        // Thư mục hạ tầng/tài liệu bị express.static(__dirname) phơi ra internet
        '/sql/',
        '/n8n/',
        '/reports/',
        '/config/',
        '/docs/',
        '/.runtime-backups/'
    ];
    
    const isSensitiveFolder = sensitiveFolders.some(folder => url.startsWith(folder.toLowerCase()) || url.includes(folder.toLowerCase()));

    // Source thô ở tầng gốc /chatbot-widget/js/ (chatbot.js, chatbot-api-engine.js...)
    // vẫn bị express.static phơi ra: gần 500 KB code chưa nén kèm toàn bộ comment.
    // Production chỉ nạp bản .min.js nên chặn phần còn lại không ảnh hưởng gì.
    const isRawWidgetSource = url.startsWith('/chatbot-widget/js/')
        && url.endsWith('.js')
        && !url.endsWith('.min.js');
    
    // Ngăn chặn các file backend/config của hệ thống
    const isSensitiveFile = [
        '/server.js',
        '/package.json',
        '/package-lock.json',
        '/.env',
        '/start_everything.bat',
        '/env.js'
    ].includes(url);
    
    if (isSensitiveFolder || isSensitiveFile || isRawWidgetSource) {
        console.warn(`[Security Alert] Chặn truy cập trực tiếp vào file nhạy cảm: ${req.url}`);
        return res.status(403).send('Forbidden: Access denied.');
    }
    
    next();
});

// Backend URLs ẩn hoàn toàn phía server
const API_INTERNAL_URL = process.env.API_BASE || 'https://medtest.bms7.net';

const getN8nUrl = () => {
    const configuredUrl = process.env.N8N_INTERNAL_URL
        || process.env.N8N_BASE
        || 'http://127.0.0.1:5678';
    return String(configuredUrl).replace(/\/+$/, '');
};

const getGatewayTimeoutMs = () => {
    const configuredTimeout = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS);
    return Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
        ? configuredTimeout
        : 30000;
};

const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getGatewayTimeoutMs());
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const classifyUpstreamError = (error) => {
    const causeCode = String(error && error.cause && error.cause.code || '').toUpperCase();
    if (error && error.name === 'AbortError') {
        return {
            code: 'UPSTREAM_TIMEOUT',
            message: 'Hệ thống xử lý quá thời gian cho phép. Vui lòng thử lại.'
        };
    }
    if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'].includes(causeCode)) {
        return {
            code: 'UPSTREAM_CONNECTION_FAILED',
            message: 'Không thể kết nối đến hệ thống xử lý. Vui lòng thử lại hoặc liên hệ quản trị viên.'
        };
    }
    return {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Hệ thống xử lý hiện chưa sẵn sàng. Vui lòng thử lại.'
    };
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

const getBearerAuthorization = (req) => {
    const authorization = String(req.headers['authorization'] || '').trim();
    if (/^Bearer\s+\S+$/i.test(authorization)) return authorization;

    // Remote login stores the token in an HttpOnly auth_token cookie.
    const cookieHeader = String(req.headers.cookie || '');
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/i);
    return match && match[1] ? 'Bearer ' + decodeURIComponent(match[1]) : '';
};

const requestIdOf = (req) => String(req.headers['x-request-id'] || req.headers['x-correlation-id'] || crypto.randomUUID());

const authRequiredPayload = (requestId) => ({
    success: false,
    status: 'AUTH_REQUIRED',
    code: 'AUTH_REQUIRED',
    errorCode: 'AUTH_REQUIRED',
    message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    requestId
});

const upstreamErrorPayload = (requestId, code, message) => ({
    success: false,
    status: 'SYSTEM_ERROR',
    code,
    errorCode: code,
    message,
    requestId
});

// Mọi nhánh lỗi của /api/gateway đều phải trả envelope { data: <chuỗi đã mã hóa> },
// vì client luôn gọi Cipher.decrypt(resJson.data) trước khi đọc nội dung phản hồi.
const sendGatewayError = (res, statusCode, requestId, code, message) => {
    const encryptedRes = Cipher.encrypt(JSON.stringify({
        success: false,
        code,
        message,
        requestId
    }));
    return res.status(statusCode).json({ data: encryptedRes });
};

// ─── GLOBAL API GATEWAY (Encrypted Tunnel) ───
const PUBLIC_GATEWAY_ENDPOINTS = new Set([
    '/api/login',
    '/api/changepassword'
]);

const normalizeGatewayRequest = (requestPayload) => {
    const method = String(requestPayload && requestPayload.method || 'GET').toUpperCase();
    const endpoint = String(requestPayload && requestPayload.endpoint || '').trim();
    const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

    if (!allowedMethods.has(method)) throw new Error('INVALID_GATEWAY_METHOD');
    if (!endpoint.startsWith('/api/') && !endpoint.startsWith('/webhook/')) {
        throw new Error('INVALID_GATEWAY_ENDPOINT');
    }
    if (/^(?:\/\/)|[\\\u0000-\u001f\u007f]/.test(endpoint)) {
        throw new Error('INVALID_GATEWAY_ENDPOINT');
    }

    let decodedPath = endpoint.split('?')[0];
    try { decodedPath = decodeURIComponent(decodedPath); } catch (_) {
        throw new Error('INVALID_GATEWAY_ENDPOINT');
    }
    if (decodedPath.split('/').includes('..') || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) {
        throw new Error('INVALID_GATEWAY_ENDPOINT');
    }

    return { method, endpoint };
};

const buildGatewayMultipartBody = (multipart) => {
    const entries = multipart && Array.isArray(multipart.entries) ? multipart.entries : [];
    if (!entries.length || entries.length > 30) throw new Error('INVALID_MULTIPART_PAYLOAD');

    const formData = new FormData();
    let totalFileBytes = 0;
    entries.forEach((entry) => {
        const name = String(entry && entry.name || '').trim();
        if (!name || name.length > 100) throw new Error('INVALID_MULTIPART_PAYLOAD');

        if (entry.kind === 'file') {
            const encoded = String(entry.data || '');
            const buffer = Buffer.from(encoded, 'base64');
            totalFileBytes += buffer.length;
            if (!encoded || totalFileBytes > 10 * 1024 * 1024) throw new Error('INVALID_MULTIPART_PAYLOAD');
            const filename = path.basename(String(entry.filename || 'upload.bin')).slice(0, 255);
            const contentType = String(entry.contentType || 'application/octet-stream').slice(0, 150);
            formData.append(name, new Blob([buffer], { type: contentType }), filename);
            return;
        }

        formData.append(name, String(entry.value == null ? '' : entry.value));
    });
    return formData;
};

app.post('/api/gateway', async (req, res) => {
    const requestId = requestIdOf(req);
    let targetUrl = '';
    const startedAt = Date.now();
    try {
        if (!req.body || !req.body.data) {
            return sendGatewayError(res, 400, requestId, 'INVALID_GATEWAY_REQUEST', 'Yêu cầu không hợp lệ.');
        }

        // 1. Giải mã yêu cầu từ Client
        const decryptedRaw = Cipher.decrypt(req.body.data);
        const requestPayload = JSON.parse(decryptedRaw);
        let normalizedRequest;
        try {
            normalizedRequest = normalizeGatewayRequest(requestPayload);
        } catch (validationError) {
            return sendGatewayError(res, 400, requestId, validationError.message, 'Invalid gateway endpoint or method.');
        }
        const { method, endpoint } = normalizedRequest;
        const { body, multipart } = requestPayload;

        // Lưu ý: nhánh này hiện không thể chạy tới — normalizeGatewayRequest() đã ném
        // INVALID_GATEWAY_ENDPOINT cho endpoint rỗng (không bắt đầu bằng /api/ hoặc /webhook/).
        // Giữ lại làm lớp phòng vệ nếu điều kiện kiểm tra ở trên thay đổi.
        if (!endpoint) {
            return sendGatewayError(res, 400, requestId, 'MISSING_GATEWAY_ENDPOINT', 'Thiếu endpoint xử lý.');
        }

        // Khóa chức năng tự đăng ký tài khoản tự do theo đặc tả phân quyền hệ thống
        if (endpoint === '/api/API_UserRegister') {
            console.warn('[Security Warning] Chặn yêu cầu đăng ký tài khoản mới tự do qua endpoint /api/API_UserRegister');
            return sendGatewayError(
                res,
                403,
                requestId,
                'REGISTRATION_DISABLED',
                'Tính năng đăng ký tài khoản tự do bị vô hiệu hóa theo tài liệu đặc tả phân quyền.'
            );
        }

        // 2. Định tuyến đến máy chủ đích thật
        const isN8n = endpoint.startsWith('/webhook');
        const baseUrl = isN8n ? getN8nUrl() : API_INTERNAL_URL;
        targetUrl = `${baseUrl}${endpoint}`;

        // Chat/business webhooks are never anonymous. Login and other ERP APIs
        // remain reachable because they do not use the /webhook namespace.
        const authorization = getBearerAuthorization(req);
        const endpointPath = endpoint.split('?')[0];
        if (!PUBLIC_GATEWAY_ENDPOINTS.has(endpointPath) && !authorization) {
            const encryptedRes = Cipher.encrypt(JSON.stringify(authRequiredPayload(requestId)));
            return res.status(401).json({ data: encryptedRes });
        }

        console.log(`[Proxy Gateway] Forwarding ${method} to ${targetUrl}`);
        
        const headers = {
            ...(authorization ? { 'Authorization': authorization } : {}),
            ...(req.headers['idempotency-key'] ? { 'Idempotency-Key': req.headers['idempotency-key'] } : {}),
            ...(isN8n ? { 'x-api-key': process.env.CHAT_API_KEY || '' } : {}),
            ...(endpointPath === '/webhook/admin-upload'
                ? { 'x-admin-key': process.env.ADMIN_UPLOAD_KEY || 'Medstand@Admin2026' }
                : {})
        };

        let upstreamBody = null;
        if (multipart) {
            try {
                upstreamBody = buildGatewayMultipartBody(multipart);
            } catch (multipartError) {
                return sendGatewayError(res, 400, requestId, multipartError.message, 'Invalid upload payload or file exceeds 10 MB.');
            }
        } else {
            headers['Content-Type'] = 'application/json';
        }

        // Chỉ log metadata, không ghi Authorization, password hoặc payload nghiệp vụ.
        const requestHeaderNames = Object.keys(headers);
        const requestBodyKeys = body && typeof body === 'object' && !Array.isArray(body)
            ? Object.keys(body)
            : [];
        console.log(`[Proxy Gateway] Request metadata: headers=${requestHeaderNames.join(',')}; bodyKeys=${requestBodyKeys.join(',')}`);

        const options = {
            method: method,
            headers: headers
        };

        if (method !== 'GET' && method !== 'HEAD') {
            if (upstreamBody) options.body = upstreamBody;
            else if (body !== undefined && body !== null) options.body = JSON.stringify(body);
        }

        let response;
        try {
            response = await fetchWithTimeout(targetUrl, options);
        } catch (error) {
            const classified = classifyUpstreamError(error);
            const causeCode = String(error && error.cause && error.cause.code || '');
            console.error(
                `[Proxy Gateway Upstream Error] requestId=${requestId}; target=${targetUrl}; `
                + `durationMs=${Date.now() - startedAt}; code=${classified.code}; cause=${causeCode || error.name || 'UNKNOWN'}`
            );
            const encryptedError = Cipher.encrypt(JSON.stringify(
                upstreamErrorPayload(requestId, classified.code, classified.message)
            ));
            return res.status(502).json({ data: encryptedError });
        }
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

        console.log(`[Proxy Gateway] Response metadata: requestId=${requestId}; status=${response.status}; durationMs=${Date.now() - startedAt}`);
        // Login response có thể chứa access/refresh token, vì vậy chỉ log kích thước.
        console.log(`[Proxy Gateway] Response bytes: ${Buffer.byteLength(resDataText, 'utf8')}`);

        if (isN8n && !resDataText.trim()) {
            const payload = upstreamErrorPayload(
                requestId,
                'EMPTY_UPSTREAM_RESPONSE',
                'Hệ thống nghiệp vụ chưa trả dữ liệu. Vui lòng thử lại hoặc liên hệ quản trị viên.',
            );
            const encryptedRes = Cipher.encrypt(JSON.stringify(payload));
            return res.status(502).json({ data: encryptedRes });
        }

        // 3. Mã hóa kết quả trả về cho Client
        const encryptedRes = Cipher.encrypt(resDataText);
        res.status(response.status).json({ data: encryptedRes });

    } catch (error) {
        const classified = classifyUpstreamError(error);
        console.error(
            `[Proxy Gateway Request Error] requestId=${requestId}; durationMs=${Date.now() - startedAt}; `
            + `code=${classified.code}; cause=${error.name || 'UNKNOWN'}`
        );
        const encryptedError = Cipher.encrypt(JSON.stringify(
            upstreamErrorPayload(requestId, classified.code, classified.message)
        ));
        res.status(502).json({ data: encryptedError });
    }
});

// ─── 1. PROXY API CHO CHATBOT (Có đính kèm CHAT_API_KEY bảo mật) ───
app.post('/api/chat', async (req, res) => {
    return res.status(404).json({
        success: false,
        code: 'GATEWAY_REQUIRED',
        message: 'Chat is only available through /api/gateway.'
    });
    /* c8 ignore start -- retained temporarily for rollback reference
    const requestId = requestIdOf(req);
    try {
        const authorization = getBearerAuthorization(req);
        if (!authorization) {
            return res.status(401).json(authRequiredPayload(requestId));
        }

        console.log('[Proxy Gateway] Forwarding chat request to N8N...');
        const response = await fetch(`${getN8nUrl()}/webhook/hook-ai-dainao`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorization,
                'x-api-key': process.env.CHAT_API_KEY || ''
            },
            body: JSON.stringify(req.body)
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const text = await response.text();
            if (!text.trim()) {
                return res.status(502).json(upstreamErrorPayload(
                    requestId,
                    'EMPTY_UPSTREAM_RESPONSE',
                    'Trợ lý AI chưa trả dữ liệu. Vui lòng thử lại.',
                ));
            }
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
            if (!text.trim()) {
                return res.status(502).json(upstreamErrorPayload(
                    requestId,
                    'EMPTY_UPSTREAM_RESPONSE',
                    'Trợ lý AI chưa trả dữ liệu. Vui lòng thử lại.',
                ));
            }
            res.status(response.status).send(text);
        }
    } catch (error) {
        console.error('[Proxy Gateway Error]:', error);
        res.status(502).json(upstreamErrorPayload(requestId, 'UPSTREAM_UNAVAILABLE', 'Không thể kết nối đến Trợ lý AI.'));
    }
    c8 ignore stop */
});

// ─── NEW: API CUNG CẤP DỮ LIỆU DẠNG FLAT ARRAY CHO GOOGLE SHEETS ───
// Đã vô hiệu hóa: route không theo mô hình fail-closed — xác thực bằng apiKey trên
// query string (bị ghi nguyên vào log qua req.url), mặc định username='admin' và
// gọi n8n không có timeout. Mọi truy vấn dữ liệu phải đi qua /api/gateway.
app.get('/api/sheet-data', async (req, res) => {
    return res.status(404).json({
        success: false,
        code: 'GATEWAY_REQUIRED',
        message: 'Sheet data is only available through /api/gateway.'
    });
    /* c8 ignore start -- retained temporarily for rollback reference
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
    c8 ignore stop */
});

// ─── 2. PROXY CHO TOÀN BỘ CÁC API ENDPOINT KHÁC SANG BACKEND THẬT ───
app.all('/api/*all', async (req, res) => {
    return res.status(404).json({
        success: false,
        code: 'GATEWAY_REQUIRED',
        message: 'Business APIs are only available through /api/gateway.'
    });
    /* c8 ignore start -- retained temporarily for rollback reference
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
    c8 ignore stop */
});

// ─── 3. PROXY CHO CÁC ENDPOINT N8N BẮT ĐẦU BẰNG /WEBHOOK/ (Có đính kèm CHAT_API_KEY bảo mật) ───
app.all('/webhook/*all', async (req, res) => {
    return res.status(404).json({
        success: false,
        code: 'GATEWAY_REQUIRED',
        message: 'Business webhooks are only available through /api/gateway.'
    });
    /* c8 ignore start -- retained temporarily for rollback reference
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
    c8 ignore stop */
});

// Thiết lập Cache-Control dài hạn (1 năm, immutable) cho các tệp đã đóng gói (.min.js, .min.css)
app.use((req, res, next) => {
    const url = req.path.toLowerCase();
    if (url === '/sw.js' || url.endsWith('.html')) {
        // HTML và Service Worker phải luôn được xác thực lại để nhận bản deploy mới.
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    } else if (url.endsWith('.min.js') || url.endsWith('.min.css')) {
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

// ─── ERROR MIDDLEWARE (bắt lỗi body-parser: JSON hỏng, payload vượt giới hạn) ───
// Phải khai báo SAU toàn bộ route và đủ 4 tham số thì Express mới nhận là error handler.
// Không có lớp này, Express trả trang HTML mặc định kèm stack trace ra ngoài internet.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const requestId = requestIdOf(req);
    const errorType = String(err && err.type || '');
    const isPayloadTooLarge = errorType === 'entity.too.large';
    const isMalformedBody = errorType === 'entity.parse.failed' || errorType === 'entity.verify.failed';

    let statusCode = Number(err && (err.status || err.statusCode));
    if (!Number.isFinite(statusCode) || statusCode < 400 || statusCode > 599) statusCode = 500;

    const code = isPayloadTooLarge
        ? 'PAYLOAD_TOO_LARGE'
        : isMalformedBody
            ? 'INVALID_REQUEST_BODY'
            : 'INTERNAL_SERVER_ERROR';
    const message = isPayloadTooLarge
        ? 'Dữ liệu gửi lên vượt quá dung lượng cho phép.'
        : isMalformedBody
            ? 'Yêu cầu không hợp lệ.'
            : 'Hệ thống gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại.';

    // Chỉ log metadata an toàn: không ghi body, header, query string hay stack trace.
    console.error(
        `[Server Error] requestId=${requestId}; method=${req.method}; path=${req.path}; `
        + `status=${statusCode}; code=${code}; cause=${errorType || (err && err.name) || 'UNKNOWN'}`
    );

    // Client của /api/gateway luôn giải mã resJson.data nên phải giữ đúng envelope mã hóa.
    if (req.path === '/api/gateway') {
        return sendGatewayError(res, statusCode, requestId, code, message);
    }

    return res.status(statusCode).json({
        success: false,
        code,
        errorCode: code,
        message,
        requestId
    });
});

app.listen(PORT, () => {
    console.log('===================================================');
    console.log(`🚀 FRONTEND SERVER IS RUNNING (PROXY ENABLED)`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log('===================================================');
});
