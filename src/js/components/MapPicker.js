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
    '.mp-overlay{display:none;position:fixed;inset:0;z-index:9999;flex-direction:column;background:var(--color-surface,#fff)}',
    '.mp-overlay.active{display:flex}',
    '.mp-header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--color-border,#e5e7eb);flex-shrink:0}',
    '.mp-header h3{margin:0;font-size:1rem;font-weight:700;color:var(--color-primary,#1a7c3e)}',
    '.mp-btn-back{background:none;border:none;cursor:pointer;color:var(--color-primary,#1a7c3e);font-size:1.2rem;padding:4px 8px;line-height:1}',
    '.mp-info{font-size:.75rem;color:var(--color-text-muted,#6b7280);padding:7px 16px;background:var(--color-background,#f9fafb);border-bottom:1px solid var(--color-border,#e5e7eb);min-height:32px;display:flex;align-items:center}',
    '#mp-map{flex:1}',
    '.mp-footer{padding:12px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--color-border,#e5e7eb);display:flex;gap:10px;flex-shrink:0}',
    '.mp-btn-cancel{padding:13px 20px;border:1px solid var(--color-border,#e5e7eb);background:var(--color-surface,#fff);color:var(--color-text,#111);border-radius:var(--radius-md,8px);font-size:.875rem;font-weight:600;cursor:pointer}',
    '.mp-btn-confirm{flex:1;padding:13px;background:var(--color-primary,#1a7c3e);color:#fff;border:none;border-radius:var(--radius-md,8px);font-size:.875rem;font-weight:700;cursor:pointer;transition:opacity .15s}',
    '.mp-btn-confirm:disabled{opacity:.5;cursor:not-allowed}',
  ].join('');

  // ── HTML ─────────────────────────────────────────────────────────────────
  var HTML = [
    '<div class="mp-overlay" id="mp-overlay">',
    '  <div class="mp-header">',
    '    <button class="mp-btn-back" id="mp-back" aria-label="Quay lại">←</button>',
    '    <h3>Chọn vị trí trên bản đồ</h3>',
    '  </div>',
    '  <div class="mp-info" id="mp-info">Nhấn vào bản đồ để chọn vị trí</div>',
    '  <div id="mp-map"></div>',
    '  <div class="mp-footer">',
    '    <button class="mp-btn-cancel" id="mp-cancel">Hủy</button>',
    '    <button class="mp-btn-confirm" id="mp-confirm" disabled>Xác nhận vị trí</button>',
    '  </div>',
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
    document.body.appendChild(wrapper.firstChild);

    // Event listeners
    document.getElementById('mp-back').addEventListener('click', close);
    document.getElementById('mp-cancel').addEventListener('click', close);
    document.getElementById('mp-confirm').addEventListener('click', confirm);
  }

  // ── Init map ──────────────────────────────────────────────────────────────
  function initMap(lat, lng) {
    if (_map) {
      _map.setView([lat, lng], 14);
      setTimeout(function () { _map.invalidateSize(); }, 100);
      return;
    }

    _map = L.map('mp-map').setView([lat, lng], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(_map);

    _map.on('click', function (e) {
      var lat = e.latlng.lat.toFixed(6);
      var lng = e.latlng.lng.toFixed(6);
      _selectedLatLng = lat + ', ' + lng;

      if (_marker) _map.removeLayer(_marker);
      _marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(_map)
        .bindPopup('Đang tìm địa chỉ...').openPopup();

      document.getElementById('mp-info').textContent = 'Đang tìm địa chỉ...';
      document.getElementById('mp-confirm').disabled = true;

      fetch(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat +
        '&lon=' + lng + '&accept-language=vi'
      )
        .then(function (r) { return r.json(); })
        .then(function (data) {
          _selectedAddr = data.display_name || _selectedLatLng;
          _marker.setPopupContent(
            '<strong>' + _selectedAddr + '</strong><br><small>' + _selectedLatLng + '</small>'
          ).openPopup();
          document.getElementById('mp-info').textContent = _selectedAddr;
          document.getElementById('mp-confirm').disabled = false;
        })
        .catch(function () {
          _selectedAddr = _selectedLatLng;
          _marker.setPopupContent(_selectedLatLng).openPopup();
          document.getElementById('mp-info').textContent = 'Vị trí: ' + _selectedLatLng;
          document.getElementById('mp-confirm').disabled = false;
        });
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
