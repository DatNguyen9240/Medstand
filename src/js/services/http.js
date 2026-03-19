/**
 * HTTP Client — wrapper dùng chung cho toàn app
 * Tự động gắn Authorization header, xử lý lỗi tập trung, timeout
 */
const Http = (() => {
  const TIMEOUT_MS = 15000; // 15s
  const CACHE_TTL_MS = 3 * 60 * 1000; // 3 phút
  const CACHE_PREFIX = '_hc_'; // prefix cho sessionStorage keys

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
    const match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
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
      _alert('warning', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      document.cookie = 'auth_token=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      localStorage.removeItem('auth_user');
      window.location.href = 'login.html';
      return;
    }

    // Luôn thử parse JSON (server .NET đôi khi không set content-type)
    const raw = await res.text().catch(() => '');
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      console.log('[HTTP] Raw response:', raw);
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
      console.warn('[HTTP] Session expired (code: 2), redirecting to login...');
      _alert('warning', data.msg || 'Phiên đăng nhập đã hết hạn.');
      document.cookie = 'auth_token=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      localStorage.removeItem('auth_user');
      window.location.href = 'login.html';
      return;
    }

    // Server trả code lỗi (code !== 0)
    if (data.code !== undefined && data.code !== 0) {
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

    // Kiểm tra response có records rỗng
    const records = data.records || data.data?.records;
    if (Array.isArray(records) && records.length === 0) {
      console.log('[HTTP] Response trả về danh sách rỗng.');
      _alert('warning', 'Không có dữ liệu.');
    }

    return data;
  }

  /** Thêm timeout + retry cho fetch */
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000; // delay cơ bản, sẽ nhân đôi mỗi lần retry

  async function _fetchWithTimeout(url, options, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(tid);
        return res;
      } catch (err) {
        console.warn(`[HTTP] Attempt ${attempt}/${retries} failed:`, err.message);
        if (attempt === retries) {
          // Phân biệt lỗi timeout vs mất mạng
          const isTimeout = err.name === 'AbortError';
          const msg = isTimeout
            ? 'Kết nối quá thời gian chờ. Vui lòng thử lại.'
            : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.';
          _alert('error', msg);
          throw new Error(msg);
        }
        // Chờ trước khi retry (exponential backoff)
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
      }
    }
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async function get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = _url(endpoint) + (qs ? `?${qs}` : '');

    // Kiểm tra cache trước
    const cached = _getFromCache(_cacheKey(url));
    if (cached) {
      console.log('[HTTP] Cache HIT:', url);
      return cached;
    }

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
      if (data && data.code === 0 && hasData) _setCache(_cacheKey(url), data);

      return data;
    } finally {
      hideGlobalSpinner();
    }
  }

  async function post(endpoint, body = {}) {
    showGlobalSpinner();
    try {
      clearCache(); // Dữ liệu đã thay đổi → xóa cache
      const res = await _fetchWithTimeout(_url(endpoint), {
        method: 'POST',
        headers: _headers(),
        body: JSON.stringify(body),
      });
      return _handleResponse(res);
    } finally {
      hideGlobalSpinner();
    }
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
