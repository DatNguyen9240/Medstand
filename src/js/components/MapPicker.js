/**
 * MapPicker — Reusable Leaflet map picker component
 *
 * Usage:
 *   MapPicker.open(function(latlng, address) {
 *     console.log(latlng);   // "21.028500, 105.854200"
 *     console.log(address);  // "Số 1, Hàng Bài, Hoàn Kiếm, Hà Nội"
 *   });
 *
 * Requires: Leaflet CSS + JS loaded before or lazy-loaded by this file.
 * The component injects its own HTML overlay and CSS into <body> on first call.
 */
var MapPicker = (function () {
  var _initialized = false;
  var _map = null;
  var _marker = null;
  var _selectedLatLng = null;
  var _selectedAddr = '';
  var _callback = null;

  // ── CSS ──────────────────────────────────────────────────────────────────
  var CSS = [
    '.mp-overlay{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(2px)}',
    '.mp-overlay.active{display:flex}',
    '.mp-sheet{background:var(--color-surface,#fff);width:95%;max-width:800px;height:90vh;display:flex;flex-direction:column;border-radius:var(--radius-xl,16px);overflow:hidden;box-shadow:var(--shadow-xl);animation:mp-fade-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)}',
    '@keyframes mp-fade-in{from{opacity:0;transform:scale(0.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}',
    '.mp-header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--color-border,#e5e7eb);flex-shrink:0}',
    '.mp-header h3{margin:0;font-size:1rem;font-weight:700;color:var(--color-primary,#1a7c3e)}',
    '.mp-btn-back{background:none;border:none;cursor:pointer;color:var(--color-text-muted,#6b7280);font-size:1.2rem;padding:4px 8px;line-height:1}',
    '.mp-info{font-size:.75rem;color:var(--color-text-muted,#6b7280);padding:7px 16px;background:var(--color-background,#f9fafb);border-bottom:1px solid var(--color-border,#e5e7eb);min-height:32px;display:flex;align-items:center}',
    '.mp-search-box{padding:10px 16px;background:var(--color-surface,#fff);border-bottom:1px solid var(--color-border,#e5e7eb);position:relative;z-index:10}',
    '.mp-search-input{width:100%;padding:10px 12px;padding-left:36px;border:1.5px solid var(--color-border,#e5e7eb);border-radius:var(--radius-md,8px);font-size:.875rem;font-family:inherit;outline:none;transition:border-color .2s}',
    '.mp-search-input:focus{border-color:var(--color-primary,#1a7c3e)}',
    '.mp-search-icon{position:absolute;left:28px;top:50%;transform:translateY(-50%);color:var(--color-text-muted,#9ca3af)}',
    '#mp-map{flex:1;min-height:300px}',
    '.mp-footer{padding:12px 16px;border-top:1px solid var(--color-border,#e5e7eb);display:flex;gap:10px;flex-shrink:0;background:var(--color-surface)}',
    '.mp-btn-cancel{padding:12px 20px;border:1px solid var(--color-border,#e5e7eb);background:var(--color-surface,#fff);color:var(--color-text,#111);border-radius:var(--radius-md,8px);font-size:.875rem;font-weight:600;cursor:pointer}',
    '.mp-btn-confirm{flex:1;padding:12px;background:var(--color-primary,#1a7c3e);color:#fff;border:none;border-radius:var(--radius-md,8px);font-size:.875rem;font-weight:700;cursor:pointer;transition:opacity .15s}',
    '.mp-btn-confirm:disabled{opacity:.5;cursor:not-allowed}',
  ].join('');

  // ── HTML ─────────────────────────────────────────────────────────────────
  var HTML = [
    '<div class="mp-overlay" id="mp-overlay">',
    ' <div class="mp-sheet">',
    '  <div class="mp-header">',
    '    <button class="mp-btn-back" id="mp-back" aria-label="Quay lại">←</button>',
    '    <h3>Chọn vị trí trên bản đồ</h3>',
    '  </div>',
    '  <div class="mp-search-box">',
    '    <span class="mp-search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></span>',
    '    <input type="text" class="mp-search-input" id="mp-search" placeholder="Tìm địa chỉ hoặc địa điểm...">',
    '  </div>',
    '  <div class="mp-info" id="mp-info">Nhấn vào bản đồ để chọn vị trí</div>',
    '  <div id="mp-map"></div>',
    '  <div class="mp-footer">',
    '    <button class="mp-btn-cancel" id="mp-cancel">Hủy</button>',
    '    <button class="mp-btn-confirm" id="mp-confirm" disabled>Xác nhận vị trí</button>',
    '  </div>',
    ' </div>',
    '</div>',
  ].join('');

  // ── Leaflet lazy loader ───────────────────────────────────────────────────
  function loadLeaflet(done) {
    if (window.L) { done(); return; }

    var cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(cssLink);

    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = done;
    document.head.appendChild(script);
  }

  // ── Init DOM ──────────────────────────────────────────────────────────────
  function initDOM() {
    if (_initialized) return;
    _initialized = true;

    // Inject CSS
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Inject HTML
    var wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    var overlay = wrapper.firstChild;
    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('mp-back').addEventListener('click', close);
    document.getElementById('mp-cancel').addEventListener('click', close);
    document.getElementById('mp-confirm').addEventListener('click', confirm);

    // Search Logic
    var searchInput = document.getElementById('mp-search');
    var searchTimeout = null;
    searchInput.addEventListener('input', function() {
      var kw = this.value.trim();
      if (kw.length < 3) return;

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function() {
        fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(kw) + '&accept-language=vi&countrycodes=vn')
          .then(function(r) { return r.json(); })
          .then(function(results) {
            if (results && results.length > 0) {
              var first = results[0];
              var lat = parseFloat(first.lat);
              var lng = parseFloat(first.lon);
              
              _map.flyTo([lat, lng], 16);
              
              // Simulate click to select this location
              updateSelection(lat, lng, first.display_name);
            }
          }).catch(function(e) { console.error('MapPicker search error', e); });
      }, 800);
    });
  }

  function updateSelection(lat, lng, address) {
    _selectedLatLng = lat.toFixed(6) + ', ' + lng.toFixed(6);

    if (_marker) _map.removeLayer(_marker);
    _marker = L.marker([lat, lng]).addTo(_map);

    if (address) {
      _selectedAddr = address;
      _marker.bindPopup('<strong>' + _selectedAddr + '</strong><br><small>' + _selectedLatLng + '</small>').openPopup();
      document.getElementById('mp-info').textContent = _selectedAddr;
      document.getElementById('mp-confirm').disabled = false;
    } else {
      document.getElementById('mp-info').textContent = 'Đang tìm địa chỉ...';
      document.getElementById('mp-confirm').disabled = true;
      _marker.bindPopup('Đang tìm địa chỉ...').openPopup();

      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&accept-language=vi')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          _selectedAddr = data.display_name || _selectedLatLng;
          _marker.setPopupContent('<strong>' + _selectedAddr + '</strong><br><small>' + _selectedLatLng + '</small>').openPopup();
          document.getElementById('mp-info').textContent = _selectedAddr;
          document.getElementById('mp-confirm').disabled = false;
        })
        .catch(function () {
          _selectedAddr = _selectedLatLng;
          _marker.setPopupContent(_selectedLatLng).openPopup();
          document.getElementById('mp-info').textContent = 'Vị trí: ' + _selectedLatLng;
          document.getElementById('mp-confirm').disabled = false;
        });
    }
  }

  // ── Init map ──────────────────────────────────────────────────────────────
  function initMap(lat, lng) {
    if (_map) {
      _map.setView([lat, lng], 14);
      setTimeout(function () { _map.invalidateSize(); }, 100);
      return;
    }

    _map = L.map('mp-map').setView([lat, lng], 14);
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=vi&gl=VN&x={x}&y={y}&z={z}', {
      attribution: 'Map data &copy; Google',
      maxZoom: 20
    }).addTo(_map);

    _map.on('click', function (e) {
      updateSelection(e.latlng.lat, e.latlng.lng);
    });
  }

  // ── open / close / confirm ────────────────────────────────────────────────
  function open(callback, options) {
    options = options || {};
    _callback = callback;
    _selectedLatLng = null;
    _selectedAddr = '';

    loadLeaflet(function () {
      initDOM();

      var lat = options.lat || 21.0285;
      var lng = options.lng || 105.8542;

      // Parse existing value if passed
      if (options.value) {
        var parts = options.value.split(',');
        if (parts.length === 2) {
          var parsedLat = parseFloat(parts[0]);
          var parsedLng = parseFloat(parts[1]);
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            lat = parsedLat;
            lng = parsedLng;
          }
        }
      }

      document.getElementById('mp-info').textContent = 'Nhấn vào bản đồ để chọn vị trí';
      document.getElementById('mp-confirm').disabled = true;
      document.getElementById('mp-overlay').classList.add('active');
      document.body.style.overflow = 'hidden';

      initMap(lat, lng);
    });
  }

  function close() {
    var overlay = document.getElementById('mp-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function confirm() {
    if (_selectedLatLng && typeof _callback === 'function') {
      _callback(_selectedLatLng, _selectedAddr);
    }
    close();
  }

  return { open: open };
})();
