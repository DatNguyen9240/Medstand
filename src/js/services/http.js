/**
 * HTTP Client — wrapper dùng chung cho toàn app
 * Tự động gắn Authorization header, xử lý lỗi tập trung, timeout
 */
const Http = (() => {
  const TIMEOUT_MS = 60000; // Tăng timeout lên 60s để các truy vấn báo cáo lớn có đủ thời gian chạy
  
  // ─── CIPHER HELPER (XOR + Base64) ───
  const Cipher = {
      encrypt: (str, key = 107) => {
          const b64 = btoa(unescape(encodeURIComponent(str)));
          let xor = '';
          for (let i = 0; i < b64.length; i++) {
              xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
          }
          return btoa(xor);
      },
      decrypt: (b64Cipher, key = 107) => {
          const xor = atob(b64Cipher);
          let b64 = '';
          for (let i = 0; i < xor.length; i++) {
              b64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
          }
          return decodeURIComponent(escape(atob(b64)));
      }
  };

  const CACHE_TTL_MS = 3 * 60 * 1000; // 3 phút
  const CACHE_PREFIX = '_hc_'; // prefix cho sessionStorage keys
  const _inflightGets = new Map();
  const _inflightMutations = new Map();

  // ─── Cache layer (sessionStorage) ─────────────────────────────────────────
  // Dùng sessionStorage thay vì Map để cache tồn tại khi chuyển trang

  /** Tạo cache key từ URL */
  function _cacheKey(url) {
    return CACHE_PREFIX + url;
  }

  /** Lấy dữ liệu từ cache nếu chưa hết hạn */
  function _getFromCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.t > CACHE_TTL_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      return entry.d;
    } catch (e) { return null; }
  }

  /** Lưu vào cache */
  function _setCache(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ d: data, t: Date.now() }));
    } catch (e) { /* quota exceeded — bỏ qua */ }
  }

  /** Xóa toàn bộ cache (dùng khi mutate data) */
  function clearCache() {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    console.log('[HTTP] Cache cleared (' + keysToRemove.length + ' entries)');
  }

  /** Lấy token từ cookie `auth_token` */
  function _getToken() {
    const match = document.cookie.match(/(?:^|;\s*)auth_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  /** Build URL đầy đủ */
  function _url(endpoint) {
    return API_CONFIG.BASE_URL + endpoint;
  }

  /** Headers mặc định */
  function _headers(extra = {}) {
    const token = _getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  /** Helper: hiện Alert nếu component đã load */
  function _alert(type, msg) {
    if (typeof Alert !== 'undefined' && Alert[type]) {
      Alert[type](msg);
    }
  }

  /** Xử lý response tập trung */
  async function _handleResponse(res) {
    console.log('[HTTP] Response:', res.status, res.url);

    if (res.status === 401) {
      if (window.__isLoggingOut) return { code: 0, msg: 'Logged out' };
      _alert('warning', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      document.cookie = 'auth_token=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      localStorage.removeItem('auth_user');
      window.location.href = 'pages/login.html';
      return;
    }

    // Luôn thử parse JSON (server .NET đôi khi không set content-type)
    const raw = await res.text().catch(() => '');
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // Backend đôi khi trả "code":A003 (không quote) → fix rồi parse lại
      try {
        var fixed = raw.replace(/"code"\s*:\s*([A-Za-z0-9]+)(?=[,\s}])/g, '"code":"$1"');
        data = JSON.parse(fixed);
      } catch {
        console.log('[HTTP] Raw response (unparseable):', raw.substring(0, 200));
      }
    }

    // Response rỗng hoặc parse JSON thất bại
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      const msg = 'Không nhận được dữ liệu từ máy chủ.';
      console.warn('[HTTP]', msg);
      _alert('error', msg);
      throw new Error(msg);
    }

    // Log code/msg để debug (convention: {code, msg})
    if (data.code !== undefined || data.msg !== undefined) {
      console.log('[HTTP] code:', data.code, '| msg:', data.msg);
    }

    // Xử lý code: 2 (Phiên hết hạn)
    if (data.code === 2) {
      if (window.__isLoggingOut) return { code: 0, msg: 'Logged out' };
      console.warn('[HTTP] Session expired (code: 2), redirecting to login...');
      _alert('warning', data.msg || 'Phiên đăng nhập đã hết hạn.');
      document.cookie = 'auth_token=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      localStorage.removeItem('auth_user');
      window.location.href = 'pages/login.html';
      return;
    }

    // Server trả code lỗi (chỉ số != 0 mới là lỗi, string code như "A003" = OK)
    if (data.code !== undefined && typeof data.code === 'number' && data.code !== 0) {
      const msg = data.msg || data.message || 'Có lỗi xảy ra từ máy chủ.';
      console.warn('[HTTP] Server error code:', data.code, msg);
      _alert('error', msg);
      throw new Error(msg);
    }

    if (!res.ok) {
      const msg = data?.msg || data?.message || `Lỗi ${res.status}`;
      _alert('error', msg);
      throw new Error(msg);
    }

    return data;
  }

  /** Thêm timeout + retry cho fetch */
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000; // delay cơ bản, sẽ nhân đôi mỗi lần retry

  async function _fetchWithTimeout(url, options, retries = MAX_RETRIES) {
    const requestMethod = String(options?.method || 'GET').toUpperCase();
    const safeToRetry = ['GET', 'HEAD', 'OPTIONS'].includes(requestMethod);
    const maxAttempts = safeToRetry ? Math.max(1, retries) : 1;
    const gatewayUrl = (typeof API_CONFIG !== 'undefined' && API_CONFIG.GATEWAY_URL) || '/api/gateway';
    const bypassGateway = false; // Chạy qua cổng Gateway mã hóa bảo mật

    // 1. Kiểm tra điều kiện bỏ qua (không qua Gateway)
    const isGatewayCall = url === gatewayUrl;
    const isExternalMap = url.includes('openstreetmap.org');
    const isLocalHtml = url.endsWith('.html') || url.includes('.html?');
    const isMultipart = options.body instanceof FormData;

    let targetUrl = url;
    let targetOptions = { ...options };

    if (!isGatewayCall && !isExternalMap && !isLocalHtml && !bypassGateway) {
      // 2. Chuyển đổi endpoint tương đối
      let relativeEndpoint = url;
      const baseUrl = (typeof API_CONFIG !== 'undefined' && API_CONFIG.BASE_URL) || '';
      if (baseUrl && url.startsWith(baseUrl)) {
        relativeEndpoint = url.substring(baseUrl.length);
      }

      // Đóng gói request payload
      let reqBody = null;
      if (options.body && typeof options.body === 'string') {
        try { reqBody = JSON.parse(options.body); } catch(e) { reqBody = options.body; }
      }

      let multipart = null;
      if (isMultipart) {
        const entries = [];
        const jobs = [];
        options.body.forEach((value, name) => {
          if (value instanceof Blob) {
            jobs.push(value.arrayBuffer().then(buffer => {
              const bytes = new Uint8Array(buffer);
              let binary = '';
              const chunkSize = 0x8000;
              for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
              }
              entries.push({
                kind: 'file', name,
                filename: value.name || 'upload.bin',
                contentType: value.type || 'application/octet-stream',
                data: btoa(binary)
              });
            }));
          } else {
            entries.push({ kind: 'field', name, value: String(value) });
          }
        });
        await Promise.all(jobs);
        multipart = { entries };
      }

      const payload = {
        method: options.method || 'GET',
        endpoint: relativeEndpoint,
        body: reqBody,
        ...(multipart ? { multipart } : {})
      };

      const encryptedData = Cipher.encrypt(JSON.stringify(payload));
      
      targetUrl = gatewayUrl;
      targetOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers?.Authorization ? { Authorization: options.headers.Authorization } : {}),
          ...(options.headers?.['Idempotency-Key'] ? { 'Idempotency-Key': options.headers['Idempotency-Key'] } : {})
        },
        body: JSON.stringify({ data: encryptedData }),
        signal: options.signal
      };
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const requestTimeout = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : TIMEOUT_MS;
        const tid = setTimeout(() => controller.abort(), requestTimeout);
        const res = await fetch(targetUrl, { ...targetOptions, signal: controller.signal || targetOptions.signal });
        clearTimeout(tid);
        if (!res.ok && res.status >= 500) {
          throw new Error('Server error: ' + res.status);
        }
        
        // 3. Giải mã kết quả trả về từ Gateway
        if (!isGatewayCall && !isExternalMap && !isLocalHtml && !bypassGateway) {
          const resJson = await res.json();
          if (!resJson || !resJson.data) {
             throw new Error('Cổng Gateway phản hồi dữ liệu không hợp lệ.');
          }
          const decryptedText = Cipher.decrypt(resJson.data);
          
          return new Response(decryptedText, {
             status: res.status,
             statusText: res.statusText,
             headers: res.headers
          });
        }

        return res;
      } catch (err) {
        console.warn(`[HTTP] Attempt ${attempt}/${maxAttempts} failed:`, err.message);
        
        const isTimeout = err.name === 'AbortError';
        if (isTimeout || attempt === maxAttempts) {
          const msg = !safeToRetry
            ? 'Chưa thể xác nhận thao tác đã thành công. Vui lòng kiểm tra dữ liệu trước khi thực hiện lại.'
            : isTimeout
              ? 'Kết nối quá thời gian chờ (Timeout). Vui lòng thử lại sau.'
              : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.';
          _alert('error', msg);
          throw new Error(msg);
        }
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
      }
    }
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async function get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = _url(endpoint) + (qs ? `?${qs}` : '');
    const cacheKey = _cacheKey(url);

    // Kiểm tra cache trước
    const cached = _getFromCache(cacheKey);
    if (cached) {
      console.log('[HTTP] Cache HIT:', url);
      return cached;
    }

    // Router và page script có thể cùng tải một tài nguyên trong lúc chuyển
    // trang. Dùng chung request đang chạy để tránh gửi GET trùng lên backend.
    if (_inflightGets.has(cacheKey)) {
      console.log('[HTTP] Reusing in-flight GET:', url);
      return _inflightGets.get(cacheKey);
    }

    const promise = (async function () {
      showGlobalSpinner();
      try {
        console.log('[HTTP] Cache MISS:', url);
        const res = await _fetchWithTimeout(url, {
          method: 'GET',
          headers: _headers(),
        });
        const data = await _handleResponse(res);

        // Chỉ lưu cache khi response thành công (code === 0) VÀ có dữ liệu
        const recs = data?.records || data?.data?.records;
        const hasData = !Array.isArray(recs) || recs.length > 0;
        if (data && data.code === 0 && hasData) _setCache(cacheKey, data);

        return data;
      } finally {
        hideGlobalSpinner();
      }
    })();

    _inflightGets.set(cacheKey, promise);
    promise.finally(function () {
      if (_inflightGets.get(cacheKey) === promise) _inflightGets.delete(cacheKey);
    }).catch(function () {});

    return promise;
  }
  function post(endpoint, body = {}, options = {}) {
    const idempotencyKey = String(options.idempotencyKey || '').trim();
    if (idempotencyKey && _inflightMutations.has(idempotencyKey)) {
      return _inflightMutations.get(idempotencyKey);
    }

    const promise = (async function () {
      showGlobalSpinner();
      try {
        clearCache(); // Dữ liệu đã thay đổi → xóa cache
        const res = await _fetchWithTimeout(_url(endpoint), {
          method: 'POST',
          headers: _headers(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          body: JSON.stringify(body),
          timeoutMs: options.timeoutMs,
        });
        return _handleResponse(res);
      } finally {
        hideGlobalSpinner();
      }
    })();

    if (idempotencyKey) {
      _inflightMutations.set(idempotencyKey, promise);
      promise.finally(function () {
        if (_inflightMutations.get(idempotencyKey) === promise) _inflightMutations.delete(idempotencyKey);
      }).catch(function () {});
    }
    return promise;
  }

  async function put(endpoint, body = {}) {
    showGlobalSpinner();
    try {
      clearCache(); // Dữ liệu đã thay đổi → xóa cache
      const res = await _fetchWithTimeout(_url(endpoint), {
        method: 'PUT',
        headers: _headers(),
        body: JSON.stringify(body),
      });
      return _handleResponse(res);
    } finally {
      hideGlobalSpinner();
    }
  }

  async function del(endpoint) {
    showGlobalSpinner();
    try {
      clearCache(); // Dữ liệu đã thay đổi → xóa cache
      const res = await _fetchWithTimeout(_url(endpoint), {
        method: 'DELETE',
        headers: _headers(),
      });
      return _handleResponse(res);
    } finally {
      hideGlobalSpinner();
    }
  }

  /** POST dạng form (multipart) — dùng cho upload ảnh */
  async function postForm(endpoint, formData) {
    showGlobalSpinner();
    try {
      clearCache(); // Dữ liệu đã thay đổi → xóa cache
      const token = _getToken();
      const res = await _fetchWithTimeout(_url(endpoint), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      return _handleResponse(res);
    } finally {
      hideGlobalSpinner();
    }
  }

  return { get, post, put, del, postForm, clearCache };
})();
