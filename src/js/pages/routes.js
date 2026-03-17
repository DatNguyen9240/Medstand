    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var _searchText = '';
    var _filterValues = {};
    var _filterDate = '';
    var _routeData = [];

    var filter = new FilterComponent({
      container: '#search-container',
      storageKey: 'routes',
      singleDate: true,
      fields: [
        {
          key: 'status', label: 'Trạng thái',
          options: [],
          loadOptions: function (done) {
            Http.get(API_CONFIG.ENDPOINTS.ROUTES.ROUTE_STATUSES)
              .then(function (res) {
                var records = (res.data || res).records || res.data || res || [];
                done(records.map(function (r) { return { value: String(r.StatusID), label: r.StatusName || '' }; }));
              }).catch(function () { done([]); });
          }
        },
        {
          key: 'loaiKhachHang', label: 'Loại khách hàng',
          options: [],
          loadOptions: function (done) {
            Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMER_GROUPS, {
              q: JSON.stringify({ User: user.UserName || '', ObjectGroupID: '', ManagerID: '', EmployeeID: '', SearchText: '' })
            }).then(function (res) {
              var records = (res.data || res).records || res.data || res || [];
              done(records.map(function (r) { return { value: r.ObjectGroupID || r.LoaiHopDong || '', label: r.ObjectGroupName || r.LoaiHopDong || '' }; }));
            }).catch(function () { done([]); });
          }
        },
        {
          key: 'kenhBan', label: 'Kênh bán',
          options: [],
          loadOptions: function (done) {
            Http.get(API_CONFIG.ENDPOINTS.FILTER.CHANNELS, {
              q: JSON.stringify({ User: user.UserName || '', PhanLoaiKhach: '', SearchText: '' })
            }).then(function (res) {
              var records = (res.data || res).records || res.data || res || [];
              done(records.map(function (r) { return { value: r.KenhBan || '', label: r.TenKenhBan || r.KenhBan || '' }; }));
            }).catch(function () { done([]); });
          }
        }
      ],
      onSearch: function (q) {
        _searchText = q;
        loadRoutes();
      },
      onApply: function (result) {
        _filterDate = result.date || '';
        _filterValues = result.filters || {};
        loadRoutes();
      }
    });

    function loadRoutes() {
      var $list = $('#tab-list');
      $list.html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Đang tải...</p>');

      Http.get(API_CONFIG.ENDPOINTS.ROUTES.YOUR_ROUTES, {
        q: JSON.stringify({
          User: user.UserName || '',
          DocumentDate: _filterDate || new Date().toISOString(),
          StatusID: _filterValues.status ? parseInt(_filterValues.status) : null,
          LoaiKhachHang: _filterValues.loaiKhachHang || '',
          KenhBan: _filterValues.kenhBan || '',
          SearchText: _searchText
        })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        if (!Array.isArray(records)) records = [];
        _routeData = records;
        renderList(records);
        renderMapMarkers(records);
      }).catch(function (err) {
        $list.html('<p style="text-align:center;color:var(--color-danger);padding:48px 0">Lỗi tải dữ liệu</p>');
        console.error('Routes API error:', err);
      });
    }

    function renderList(records) {
      var $list = $('#tab-list');
      if (!records.length) {
        $list.html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có dữ liệu để hiển thị</p>');
        return;
      }
      var html = records.map(function (r) {
        var statusLabel = r.StatusID === 0 ? 'Chưa ghé' : (r.StatusID === 1 ? 'Đã ghé' : 'Trạng thái ' + r.StatusID);
        var statusColor = r.StatusID === 0 ? 'var(--color-warning)' : 'var(--color-success)';
        var bgColor = r.LoaiKhachBackColor || 'transparent';
        return '<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:8px;cursor:pointer" onclick="goToOrder(\'' + (r.ObjectID || '') + '\')">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-weight:600;color:var(--color-text);font-size:var(--font-size-sm)">' + (r.ObjectName || r.ObjectID || '') + '</span>' +
          '<span style="font-size:var(--font-size-xs);color:' + statusColor + ';font-weight:600">' + statusLabel + '</span>' +
          '</div>' +
          '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px">' + (r.Address || '') + '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-text-secondary)">' +
          (r.LoaiKhachHang ? '<span style="display:inline-block;padding:2px 8px;border-radius:var(--radius-sm);background:' + bgColor + ';font-size:10px">' + r.LoaiKhachHang + '</span>' : '<span></span>') +
          '<span>Đơn hàng: ' + (r.SoDonHang || 0) + '</span>' +
          '</div>' +
          (r.ThuDiTuyen ? '<div style="font-size:10px;color:var(--color-text-muted);margin-top:4px">Tuyến: ' + r.ThuDiTuyen + '</div>' : '') +
          '</div>';
      }).join('');
      $list.html(html);
    }

    function goToOrder(objectId) {
      navigate('#/create-order?customerId=' + encodeURIComponent(objectId));
    }

    // ── Tabs + Map ──────────────────────────────────────────────────────────────
    (function () {
      var map = null;
      var markersLayer = null;
      var $toast = $('#location-toast');

      window.renderMapMarkers = function (records) {
        if (!map || !markersLayer) return;
        markersLayer.clearLayers();
        records.forEach(function (r) {
          if (r.Latitude && r.Longitude && (r.Latitude !== 0 || r.Longitude !== 0)) {
            L.marker([r.Latitude, r.Longitude])
              .bindPopup('<strong>' + (r.ObjectName || '') + '</strong><br><small>' + (r.Address || '') + '</small>')
              .addTo(markersLayer);
          }
        });
        if (markersLayer.getLayers().length > 0) {
          map.fitBounds(markersLayer.getBounds(), { padding: [30, 30] });
        }
      };

      $('.segment-item').on('click', function () {
        var $this = $(this);
        $('.segment-item').removeClass('active');
        $this.addClass('active');
        $('.tab-content').removeClass('active');
        $('#tab-' + $this.attr('data-tab')).addClass('active');

        if ($this.attr('data-tab') === 'map' && !map) {
          map = L.map('map-container').setView([21.0285, 105.8542], 13);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
          }).addTo(map);
          markersLayer = L.layerGroup().addTo(map);
          renderMapMarkers(_routeData);

          // Hiện vị trí hiện tại
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
              var lat = pos.coords.latitude;
              var lng = pos.coords.longitude;
              L.marker([lat, lng], {
                icon: L.divIcon({
                  className: '',
                  html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>',
                  iconSize: [18, 18],
                  iconAnchor: [9, 9]
                })
              }).addTo(map);
              var popupText = '<strong>Vị trí của bạn</strong><br><small>' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</small>';
              var myMarker = L.marker([lat, lng]).setIcon(L.divIcon({
                className: '',
                html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>',
                iconSize: [18, 18], iconAnchor: [9, 9]
              })).addTo(map).bindPopup(popupText).openPopup();

              // Reverse geocode để lấy tên địa chỉ
              fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=vi')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                  if (data && data.display_name) {
                    myMarker.setPopupContent('<strong>' + data.display_name + '</strong><br><small>' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</small>').openPopup();
                  }
                }).catch(function () {});
              map.setView([lat, lng], 15);
            });
          }
        }
        if ($this.attr('data-tab') === 'map' && map) {
          setTimeout(function () { map.invalidateSize(); }, 100);
        }
      });
    })();

    // FilterComponent tự gọi onApply khi init → không cần gọi loadRoutes() thủ công
