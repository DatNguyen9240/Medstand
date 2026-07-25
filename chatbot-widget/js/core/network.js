// js/core/network.js
import { emit, EVENTS } from './event-bus.js';
import { logger } from '../utils/logger.js';

// Khởi tạo Base Params từ Window/Env 
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000;
const encodeBase64 = (value) => typeof btoa === 'function'
    ? btoa(value)
    : Buffer.from(value, 'binary').toString('base64');
const decodeBase64 = (value) => typeof atob === 'function'
    ? atob(value)
    : Buffer.from(value, 'base64').toString('binary');

// ---------- CIRCUIT BREAKER ----------
const CIRCUIT_BREAKER = {
    failCount: 0,
    blockedUntil: 0,
    THRESHOLD: 5,
    BLOCK_TIME_MS: 30000, // khoá 30 giây
    isBlocked() {
        if (window.MS_CHAT_DEBUG) return false; // Dev Mode bỏ qua
        return Date.now() < this.blockedUntil;
    },
    recordFail() {
        this.failCount++;
        if (this.failCount >= this.THRESHOLD) {
            this.blockedUntil = Date.now() + this.BLOCK_TIME_MS;
            logger.error('NETWORK', `💥 CIRCUIT BREAKER TRIPPED! Blocked for ${this.BLOCK_TIME_MS/1000}s`);
        }
    },
    recordSuccess() {
        this.failCount = 0;
        this.blockedUntil = 0;
    }
};

// ---------- DEDUPLICATION ----------
const InFlightPayloads = new Set();
const getPayloadHash = (payloadObj) => {
    // Hash đơn giản từ đoạn action + text
    return payloadObj.action + '|' + payloadObj.text + '|' + (payloadObj.session_id||'');
};

// ---------- HEADERS ----------
export const getHeaders = () => {
    // Lấy cookie token
    const tokenMatch = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
    let token = '';
    if (tokenMatch && tokenMatch[1]) {
        try {
            token = decodeURIComponent(tokenMatch[1]);
        } catch (error) {
            logger.error('NETWORK', 'Invalid encoded auth cookie; using raw value.');
            token = tokenMatch[1];
        }
    }
    const config = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};
    const apiKey = config.CHAT_API_KEY || '';
    
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'x-api-key': apiKey // Header này gây trigger CORS Preflight
    };
};

const cipher = {
    encrypt(value, key = 107) {
        const b64 = encodeBase64(unescape(encodeURIComponent(value)));
        let xor = '';
        for (let index = 0; index < b64.length; index++) xor += String.fromCharCode(b64.charCodeAt(index) ^ key);
        return encodeBase64(xor);
    },
    decrypt(value, key = 107) {
        const xor = decodeBase64(value);
        let b64 = '';
        for (let index = 0; index < xor.length; index++) b64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
        return decodeURIComponent(escape(decodeBase64(b64)));
    }
};

/**
 * Hàm gọi API nền tảng với Exponential Backoff & Timeout
 */
const fetchWithRetry = async (url, options, retryCount = 0) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    options.signal = controller.signal;

    try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            // Lỗi 4xx (User) -> Ném lỗi ngay không thử lại
            if (response.status >= 400 && response.status < 500) {
                throw new Error(`Client Error [${response.status}]`);
            }
            // Lỗi 5xx (Server) -> Ném lỗi để bắt retry
            throw new Error(`Server Error [${response.status}]`);
        }

        const text = await response.text();
        if (!text) throw new Error("Empty Response");
        
        try {
            const envelope = JSON.parse(text);
            const data = envelope && typeof envelope.data === 'string'
                ? JSON.parse(cipher.decrypt(envelope.data))
                : envelope;
            return data;
        } catch (e) {
            throw new Error("Invalid JSON formatting from Server");
        }
    } catch (err) {
        clearTimeout(timeoutId);
        
        // Quản lý huỷ giữa dòng (Abort do Timeout hoặc User huỷ)
        if (err.name === 'AbortError') {
            throw new Error("Request Time Out or Aborted");
        }

        // Retry logic với Backoff: 1s, 2s, 4s
        if (retryCount < MAX_RETRIES && (err.message.includes('Server Error') || err.message === 'Failed to fetch')) {
            const waitTime = Math.pow(2, retryCount) * 1000;
            logger.info('NETWORK', `[Retry ${retryCount+1}/${MAX_RETRIES}] waiting ${waitTime}ms...`);
            await new Promise(r => setTimeout(r, waitTime));
            return fetchWithRetry(url, options, retryCount + 1);
        }
        
        // Nếu đã hết số lần Retry
        throw err;
    }
};

/**
 * Gửi tin nhắn và Nhận thông tin về
 */
export const NetworkService = {
    abortController: null,

    async sendChat(payload, bypassCircuit = false) {
        // Kiểm Tra Cầu Dao
        if (!bypassCircuit && CIRCUIT_BREAKER.isBlocked()) {
            throw new Error("Hệ thống máy chủ bồn bề chập chờn. Xin đợi 30 giây rồi thử lại!");
        }

        // Deduplication
        const pHash = getPayloadHash(payload);
        if (InFlightPayloads.has(pHash)) {
            logger.warn('NETWORK', 'DEDUPE: Bỏ qua request spam', pHash);
            throw new Error("RequestSpam");
        }
        InFlightPayloads.add(pHash);

        // Chuẩn bị Fetch
        const config = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};
        let endpoint = payload.overrideUrl || config.CHAT_WEBHOOK || '/webhook/hook-ai-dainao';
        const n8nBase = config.N8N_BASE || '';
        const apiBase = config.BASE_URL || '';
        if (n8nBase && endpoint.indexOf(n8nBase) === 0) endpoint = endpoint.substring(n8nBase.length);
        if (apiBase && endpoint.indexOf(apiBase) === 0) endpoint = endpoint.substring(apiBase.length);
        const targetUrl = config.GATEWAY_URL || '/api/gateway';
        const gatewayBody = cipher.encrypt(JSON.stringify({ method: 'POST', endpoint, body: payload }));
        this.abortController = new AbortController(); // lưu lại ngộ nhỡ user ấn DỪNG

        emit(EVENTS.NETWORK_REQUEST, payload);
        logger.debug('NETWORK', 'Sending', payload);

        try {
            const data = await fetchWithRetry(targetUrl, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ data: gatewayBody }),
                signal: this.abortController.signal
            });
            
            // Xoá Spam cache
            InFlightPayloads.delete(pHash);

            // Response Validation khắt khe
            if (!data) throw new Error("Server trả về rỗng.");
            // Giả sử server N8N của ta trả về mảng / object - Ta kiểm tra object cơ bản
            if (typeof data !== 'object') throw new Error("Dữ liệu không đúng cấu trúc (Not an JSON object)");

            CIRCUIT_BREAKER.recordSuccess();
            emit(EVENTS.NETWORK_SUCCESS, data);
            
            return data;

        } catch (error) {
            InFlightPayloads.delete(pHash);
            
            if (error.message !== 'RequestSpam' && error.message !== 'Request Time Out or Aborted') {
                CIRCUIT_BREAKER.recordFail();
            }

            logger.error('NETWORK', 'Send Failed:', error.message);
            emit(EVENTS.NETWORK_ERROR, error);
            throw error;
        }
    },

    stop() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            logger.info('NETWORK', 'User aborted request');
        }
    }
};
