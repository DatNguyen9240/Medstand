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

      // State variables for routing and location tracking
      var watchId = null;
      var myMarker = null;
      var currentRouteLine = null;
      var routeCache = {}; // Cache format: key: { data, ts }
      var activeDest = null; // { lat, lng, name }

      var currentLocation = {
        lat: null,
        lng: null,
        accuracy: null,
        timestamp: null
      };

      // Helper function to calculate distance in meters
      function getDistanceMetres(lat1, lon1, lat2, lon2) {
        var R = 6371e3; // metres
        var phi1 = lat1 * Math.PI/180;
        var phi2 = lat2 * Math.PI/180;
        var deltaPhi = (lat2-lat1) * Math.PI/180;
        var deltaLambda = (lon2-lon1) * Math.PI/180;

        var a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                Math.cos(phi1) * Math.cos(phi2) *
                Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // in metres
      }

      function initLocationWatcher(mapInstance) {
        if (!navigator.geolocation) {
          console.warn('Geolocation not supported by this browser.');
          return;
        }

        watchId = navigator.geolocation.watchPosition(function (pos) {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          var acc = pos.coords.accuracy;
          var ts = Date.now();

          var prevLat = currentLocation.lat;
          var prevLng = currentLocation.lng;

          currentLocation.lat = lat;
          currentLocation.lng = lng;
          currentLocation.accuracy = acc;
          currentLocation.timestamp = ts;

          // Update my position marker on map
          if (!myMarker) {
            myMarker = L.marker([lat, lng], {
              icon: L.divIcon({
                className: '',
                html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
              })
            }).addTo(mapInstance).bindPopup('<strong>Vị trí của bạn</strong>');
          } else {
            myMarker.setLatLng([lat, lng]);
          }

          // If currently navigating and user moved > 100m, recalculate route
          if (activeDest) {
            var distMoved = getDistanceMetres(prevLat || lat, prevLng || lng, lat, lng);
            if (distMoved > 100) {
              console.log('GPS moved ' + distMoved.toFixed(0) + 'm, recalculating route...');
              drawRoute(activeDest.lat, activeDest.lng, activeDest.name);
            }
          }

          // Center map on my location on first GPS lock
          if (prevLat === null) {
            mapInstance.setView([lat, lng], 15);
          }
        }, function (err) {
          console.warn('Geolocation error:', err);
          $toast.text('Không thể lấy vị trí hiện tại. Vui lòng bật định vị.').addClass('show');
          setTimeout(function () { $toast.removeClass('show'); }, 4000);
        }, {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 10000
        });
      }

      window.renderMapMarkers = function (records) {
        if (!map || !markersLayer) return;
        markersLayer.clearLayers();
        records.forEach(function (r) {
          if (r.Latitude && r.Longitude && (r.Latitude !== 0 || r.Longitude !== 0)) {
            var marker = L.marker([r.Latitude, r.Longitude]);
            marker.customerName = r.ObjectName || ''; // Store for search

            var statusLabel = r.StatusID === 0 ? '🔴 Chưa ghé' : '🟢 Đã ghé';
            var phone = r.Phone || 'Không có';
            var address = r.Address || '';
            
            // Build rich popup HTML
            var popupContent = '<div class="map-popup-container">' +
              '<strong>🏥 ' + (r.ObjectName || '') + '</strong><br>' +
              '<span style="font-size:10px;color:var(--color-text-muted)">' + address + '</span><br>' +
              '<span style="font-size:10px">Trạng thái: <strong>' + statusLabel + '</strong></span><br>' +
              '<span style="font-size:10px">SĐT: <strong>' + phone + '</strong></span><br>' +
              (r.ThuDiTuyen ? '<span style="font-size:10px">Tuyến: ' + r.ThuDiTuyen + '</span><br>' : '') +
              '<button class="map-popup-btn" onclick="drawRoute(' + r.Latitude + ',' + r.Longitude + ',\'' + (r.ObjectName || '').replace(/'/g, "\\'") + '\')">🧭 Dẫn đường (Mini Map)</button>' +
              '<a class="map-popup-btn secondary" href="https://www.google.com/maps/dir/?api=1&origin=' +
                (currentLocation.lat || '') + ',' + (currentLocation.lng || '') +
                '&destination=' + r.Latitude + ',' + r.Longitude + '&travelmode=driving" target="_blank" rel="noopener noreferrer">🚗 Google Maps</a>' +
              (r.Phone ? '<a class="map-popup-btn phone" href="tel:' + r.Phone + '">📞 Gọi điện</a>' : '') +
              '</div>';

            marker.bindPopup(popupContent).addTo(markersLayer);
          }
        });

        if (markersLayer.getLayers().length > 0) {
          map.fitBounds(markersLayer.getBounds(), { padding: [30, 30] });
        }
      };

      window.drawRoute = function (destLat, destLng, destName) {
        if (!currentLocation.lat || !currentLocation.lng) {
          alert('Chưa có vị trí GPS của bạn. Vui lòng bật định vị trình duyệt.');
          return;
        }

        map.closePopup();

        // Clear old line
        if (currentRouteLine) {
          map.removeLayer(currentRouteLine);
          currentRouteLine = null;
        }

        // Remove old panel
        $('#route-panel').remove();

        // Add floating panel with loading state
        var $panel = $('<div id="route-panel" class="route-summary-panel">' +
          '<div class="route-summary-header">' +
          '<span class="route-summary-title">Dẫn đường đến: ' + destName + '</span>' +
          '<button class="route-summary-close" onclick="clearRoute()">×</button>' +
          '</div>' +
          '<div class="route-summary-body">' +
          '<div class="route-summary-info">' +
          '<span class="route-summary-meta">🚗 Đang tính toán tuyến đường...</span>' +
          '</div>' +
          '</div>' +
          '</div>').appendTo('#tab-map');

        activeDest = { lat: destLat, lng: destLng, name: destName };

        var cacheKey = currentLocation.lat.toFixed(5) + ',' + currentLocation.lng.toFixed(5) + ';' + destLat.toFixed(5) + ',' + destLng.toFixed(5);
        var cached = routeCache[cacheKey];
        var now = Date.now();
        var CACHE_TTL = 5 * 60 * 1000; // 5 mins cache TTL

        if (cached && (now - cached.ts < CACHE_TTL)) {
          console.log('Using cached route data');
          processRouteResponse(cached.data, destLat, destLng, destName);
        } else {
          if (!navigator.onLine) {
            showRouteError('Không có kết nối Internet. Không thể tính tuyến đường.');
            return;
          }

          // Use OSRM demo server for development/UAT as noted in plan
          var url = 'https://router.project-osrm.org/route/v1/driving/' +
            currentLocation.lng + ',' + currentLocation.lat + ';' + destLng + ',' + destLat +
            '?overview=full&geometries=geojson';

          fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data && data.routes && data.routes.length > 0) {
                routeCache[cacheKey] = { data: data, ts: now };
                processRouteResponse(data, destLat, destLng, destName);
              } else {
                showRouteError('Không thể tìm thấy tuyến đường phù hợp.');
              }
            })
            .catch(function (err) {
              console.error('OSRM route error:', err);
              showRouteError('Lỗi kết nối dịch vụ định tuyến OSRM.');
            });
        }
      };

      function processRouteResponse(data, destLat, destLng, destName) {
        var route = data.routes[0];
        var coords = route.geometry.coordinates.map(function (c) {
          return [c[1], c[0]]; // [lat, lng]
        });

        currentRouteLine = L.polyline(coords, {
          color: '#3b82f6',
          weight: 6,
          opacity: 0.85
        }).addTo(map);

        map.fitBounds(currentRouteLine.getBounds(), { padding: [40, 40] });

        var distanceKm = (route.distance / 1000).toFixed(1);
        var durationMin = Math.round(route.duration / 60);

        var now = new Date();
        var etaTime = new Date(now.getTime() + durationMin * 60000);
        var etaStr = ('0' + etaTime.getHours()).slice(-2) + ':' + ('0' + etaTime.getMinutes()).slice(-2);
        var updateTimeStr = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);

        var googleMapsUrl = 'https://www.google.com/maps/dir/?api=1&origin=' +
          currentLocation.lat + ',' + currentLocation.lng +
          '&destination=' + destLat + ',' + destLng +
          '&travelmode=driving';

        var distToDest = getDistanceMetres(currentLocation.lat, currentLocation.lng, destLat, destLng);
        var checkInHtml = '';
        if (distToDest < 30) {
          checkInHtml = '<div style="color:var(--color-success);font-weight:600;font-size:10px;margin-top:4px">✅ Bạn đã đến nơi! [Sẵn sàng Ghé thăm]</div>';
        }

        $('#route-panel').html(
          '<div class="route-summary-header">' +
          '<span class="route-summary-title">🧭 Chỉ đường đến: ' + destName + '</span>' +
          '<button class="route-summary-close" onclick="clearRoute()">×</button>' +
          '</div>' +
          '<div class="route-summary-body">' +
          '<div class="route-summary-info">' +
          '<span class="route-summary-meta">🚗 Di chuyển: ' + distanceKm + ' km (' + durationMin + ' phút)</span>' +
          '<span class="route-summary-eta">ETA: <strong>' + etaStr + '</strong> | Cập nhật lúc ' + updateTimeStr + '</span>' +
          checkInHtml +
          '</div>' +
          '<div class="route-summary-actions">' +
          '<a class="route-summary-action" href="' + googleMapsUrl + '" target="_blank" rel="noopener noreferrer">Mở Google Maps</a>' +
          '<button class="route-summary-action cancel" onclick="clearRoute()">Hủy</button>' +
          '</div>' +
          '</div>'
        );
      }

      function showRouteError(msg) {
        var googleMapsUrl = activeDest ? ('https://www.google.com/maps/dir/?api=1&origin=' +
          (currentLocation.lat || '') + ',' + (currentLocation.lng || '') +
          '&destination=' + activeDest.lat + ',' + activeDest.lng +
          '&travelmode=driving') : '#';

        $('#route-panel').html(
          '<div class="route-summary-header">' +
          '<span class="route-summary-title" style="color:var(--color-danger)">⚠️ Lỗi dẫn đường</span>' +
          '<button class="route-summary-close" onclick="clearRoute()">×</button>' +
          '</div>' +
          '<div class="route-summary-body">' +
          '<div class="route-summary-info">' +
          '<span class="route-summary-meta" style="color:var(--color-text-secondary)">' + msg + '</span>' +
          '</div>' +
          '<div class="route-summary-actions">' +
          (activeDest ? '<a class="route-summary-action" href="' + googleMapsUrl + '" target="_blank" rel="noopener noreferrer">Mở Google Maps</a>' : '') +
          '<button class="route-summary-action cancel" onclick="clearRoute()">Đóng</button>' +
          '</div>' +
          '</div>'
        );
      }

      window.clearRoute = function () {
        activeDest = null;
        if (currentRouteLine) {
          map.removeLayer(currentRouteLine);
          currentRouteLine = null;
        }
        $('#route-panel').remove();
      };

      $('.segment-item').on('click', function () {
        var $this = $(this);
        $('.segment-item').removeClass('active');
        $this.addClass('active');
        $('.tab-content').removeClass('active');
        $('#tab-' + $this.attr('data-tab')).addClass('active');

        if ($this.attr('data-tab') === 'map' && !map) {
          map = L.map('map-container').setView([21.0285, 105.8542], 13);
          L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=vi&gl=VN&x={x}&y={y}&z={z}', {
            attribution: 'Map data &copy; Google',
            maxZoom: 20
          }).addTo(map);
          markersLayer = L.layerGroup().addTo(map);
          renderMapMarkers(_routeData);

          // Geolocation tracking start
          initLocationWatcher(map);

          // ── Map Search Bar Logic (local search debounced) ──
          var $searchContainer = $('#map-search-container');
          if ($searchContainer.length) {
            $searchContainer.html(Input.renderSearch({ id: 'map-search-input', placeholder: 'Tìm khách hàng trong tuyến của bạn...' }));
            
            var searchTimeout = null;
            $('#map-search-input').on('input', function () {
              var kw = $(this).val().toLowerCase().trim();
              if (kw.length < 2) return;
              
              clearTimeout(searchTimeout);
              searchTimeout = setTimeout(function () {
                var found = false;
                
                // Only search in assigned routes markers
                markersLayer.eachLayer(function (layer) {
                  if (found) return;
                  if (layer.customerName && layer.customerName.toLowerCase().indexOf(kw) !== -1) {
                    map.flyTo(layer.getLatLng(), 16);
                    layer.openPopup();
                    found = true;
                  }
                });

                if (!found) {
                  // Fallback global search debounced
                  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(kw) + '&accept-language=vi&countrycodes=vn')
                    .then(function (r) { return r.json(); })
                    .then(function (results) {
                      if (results && results.length > 0) {
                        var first = results[0];
                        map.flyTo([parseFloat(first.lat), parseFloat(first.lon)], 14);
                        L.popup()
                          .setLatLng([parseFloat(first.lat), parseFloat(first.lon)])
                          .setContent('<strong>' + first.display_name + '</strong>')
                          .openOn(map);
                      }
                    }).catch(function (e) { console.error('Geocoding error', e); });
                }
              }, 300); // 300ms search debounce
            });
          }
        }
        if ($this.attr('data-tab') === 'map' && map) {
          setTimeout(function () { map.invalidateSize(); }, 100);
        }
      });

      // Cleanup watchPosition if script executes again or page changes
      $(window).on('hashchange', function() {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
      });
    })();

    // FilterComponent tự gọi onApply khi init → không cần gọi loadRoutes() thủ công
