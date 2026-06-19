function initDashboard() {
  var currentTab = 'day';

  function getMonday(d) {
    var date = new Date(d);
    var day = date.getDay();
    var diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  function getWeekRangeLabel(d) {
    var mon = getMonday(d);
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    var monStr = String(mon.getDate()).padStart(2, '0') + '/' + String(mon.getMonth() + 1).padStart(2, '0');
    var sunStr = String(sun.getDate()).padStart(2, '0') + '/' + String(sun.getMonth() + 1).padStart(2, '0');
    return monStr + '-' + sunStr;
  }

  // ── Time-based greeting ──
  function getGreeting() {
    var h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Chào buổi sáng,';
    if (h >= 12 && h < 18) return 'Chào buổi chiều,';
    return 'Chào buổi tối,';
  }

  // ── Today's date formatting ──
  function getTodayLabel() {
    var d = new Date();
    var days = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return days[d.getDay()] + ', ' + dd + '/' + mm + '/' + yyyy;
  }

  // ── Format sales currency short ──
  function formatRevenue(value) {
    var val = parseFloat(value);
    if (isNaN(val) || val === 0) return '0 ₫';
    if (val >= 1e9) return (val / 1e9).toFixed(2).replace(/\.00$/, '') + ' Tỷ';
    if (val >= 1e6) return (val / 1e6).toFixed(1).replace(/\.0$/, '') + ' Tr';
    return val.toLocaleString('vi-VN') + ' ₫';
  }

  // Set greeting & today label
  $('#greeting-text').text(getGreeting());
  $('#today-date').text(getTodayLabel());

  // ── Sync User Display ──
  AuthService.syncUserDisplay('.header-username', '.header-avatar');
  try {
    var authRaw = localStorage.getItem('auth_user') || localStorage.getItem('currentUser');
    if (authRaw) {
      var p = JSON.parse(authRaw);
      var dName = p.DisplayName || p.UserName || '';
      if (dName) {
        var words = dName.trim().split(/\s+/);
        var shortName = words.length <= 2 ? dName : words.slice(-2).join(' ');
        $('#user-name').text(shortName);
      }
    }
  } catch (e) { }



  // ── Shared state cho widget tiến độ (targets lấy từ API_KeHoachBanHang) ──
  var _progress = {
    revenue: 0,      orders: 0,       customers: 0,
    revenueTarget: 0, customersTarget: 0,
    planRevenuePct: -1,   // -1 = chưa load xong
    planCustPct:    -1
  };

  // ── Default dates: đầu tháng → hôm nay ──
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var defaultFrom = y + '-' + m + '-01';
  var defaultTo = y + '-' + m + '-' + d;

  // ── Khôi phục ngày từ localStorage (nếu có) ──
  var storageKey = 'dashboard_dates';
  var savedDates = {};
  try {
    savedDates = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (e) { }

  var currentFrom = savedDates.fromDate || defaultFrom;
  var currentTo = savedDates.toDate || defaultTo;
  
  // Prevent date range inversion causing server SQL crash
  if (new Date(currentFrom) > new Date(currentTo)) {
    currentFrom = defaultFrom;
    currentTo = defaultTo;
  }

  // ── Render Date Inputs dùng Input component ──
  var $dateContainer = $('#revenue-date-container');
  if ($dateContainer.length) {
    $dateContainer.html(
      Input.renderDate({ label: 'Từ', id: 'chart-date-from', value: currentFrom }) +
      '<span class="revenue-arrow">→</span>' +
      Input.renderDate({ label: 'Đến', id: 'chart-date-to', value: currentTo })
    );
  }

  var elFrom = document.getElementById('chart-date-from');
  var elTo = document.getElementById('chart-date-to');

  // ── Load data theo dates ──
  function getFromDate() { return elFrom ? elFrom.value : defaultFrom; }
  function getToDate() { return elTo ? elTo.value : defaultTo; }

  // ── Load Notification Count ──
  function loadNotificationCount() {
    var user = {};
    try {
      user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    } catch (e) {}
    var userName = user.UserName || '';
    if (!userName) return Promise.resolve();

    return Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.LIST, { User: userName })
      .then(function (res) {
        var records = res.records || res.data || [];
        if (!Array.isArray(records)) records = [];
        var unreadCount = 0;
        records.forEach(function (n) { if (!n.isView) unreadCount++; });
        
        var $headerBadge = $('#notif-badge');
        var $heroBadge = $('#hero-notif-badge');
        
        if (unreadCount > 0) {
          $headerBadge.text(unreadCount).prop('hidden', false);
          $heroBadge.text(unreadCount).prop('hidden', false);
        } else {
          $headerBadge.prop('hidden', true);
          $heroBadge.prop('hidden', true);
        }
      })
      .catch(function (err) {
        console.warn('[Dashboard loadNotificationCount Error]:', err);
      });
  }

  function loadAll() {
    var fromDate = getFromDate();
    var toDate = getToDate();

    // Lưu lại vào localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify({ fromDate: fromDate, toDate: toDate }));
    } catch (e) { }

    setLoadingState(true);
    
    Promise.all([
      loadStats(fromDate, toDate),
      loadChartAndRevenue(fromDate, toDate),
      loadBirthdays(fromDate, toDate),
      loadNotificationCount(),
      loadTodayRoutes(),
      loadSalesPlan(fromDate, toDate)
    ]).finally(function() {
      setLoadingState(false);
    });
  }

  // ── Khi thay đổi ngày → reload ──
  if (elFrom) elFrom.addEventListener('change', loadAll);
  if (elTo) elTo.addEventListener('change', loadAll);

  // ── Khi thay đổi tab biểu đồ ──
  $('.analytics-tabs').on('click', '.tab-btn', function () {
    var $btn = $(this);
    if ($btn.hasClass('active')) return;

    $('.analytics-tabs .tab-btn').removeClass('active');
    $btn.addClass('active');
    
    currentTab = $btn.attr('data-tab') || 'day';

    var subtitleMap = {
      day: 'Theo ngày trong kỳ',
      week: 'Theo tuần trong kỳ',
      month: 'Theo tháng trong năm',
      quarter: 'Theo quý trong năm'
    };
    $('.analytics-subtitle').text(subtitleMap[currentTab] || 'Theo ngày trong kỳ');

    // Tự động mở rộng khoảng ngày khi xem theo tháng/quý
    if ((currentTab === 'month' || currentTab === 'quarter') && elFrom && elTo) {
      var nowD = new Date();
      var yearFrom = nowD.getFullYear() + '-01-01';
      var yearTo = nowD.getFullYear() + '-'
        + String(nowD.getMonth() + 1).padStart(2, '0') + '-'
        + String(nowD.getDate()).padStart(2, '0');
      if (elFrom.value !== yearFrom) elFrom.value = yearFrom;
      if (elTo.value !== yearTo) elTo.value = yearTo;
    }

    loadChartAndRevenue(getFromDate(), getToDate());
  });

  // ── Loading Skeleton ──
  function setLoadingState(isLoading) {
    $('.kpi-card, .chart-wrapper').toggleClass('loading', isLoading);
  }

  // ── Stats ──
  function loadStats(fromDate, toDate) {
    return DashboardService.getInformations(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];
        var record = {};
        DASHBOARD_SCHEMA.STATS.forEach(function (item, i) {
          record[item.key] = (records[i] && records[i].Value) || '';
        });

        // 1. Đơn hàng
        var ordersStr = (record['DonHang'] || '').toString().replace(/,/g, '');
        var orders = parseInt(ordersStr) || 0;
        _progress.orders = orders;
        $('#kpi-orders-value').text(orders.toLocaleString('vi-VN'));
        // Bar cập nhật sau khi loadSalesPlan xong (trong renderTargetProgress)

        // 2. Khách hàng
        var customersStr = (record['KhachHangGD'] || '').toString();
        var customers = 0;
        var totalCustomersDB = 1;
        if (customersStr.indexOf('/') !== -1) {
          var parts = customersStr.split('/');
          customers = parseInt(parts[0].trim().replace(/,/g, '')) || 0;
          totalCustomersDB = parseInt(parts[1].trim().replace(/,/g, '')) || 1;
        } else {
          customers = parseInt(customersStr.replace(/,/g, '')) || 0;
        }
        _progress.customers = customers;
        $('#kpi-customers-value').text(customers.toLocaleString('vi-VN'));
        $('#kpi-customers-bar').css('width', Math.min((customers / Math.max(totalCustomersDB, 1)) * 100, 100) + '%');

        // 3. Độ phủ
        var coverageStr = (record['TyLe'] || '').toString();
        var coverageVal = 0;
        if (coverageStr.indexOf('/') !== -1) {
          var parts = coverageStr.split('/');
          var covAct = parseFloat(parts[0].trim().replace(/,/g, '')) || 0;
          var covTotal = parseFloat(parts[1].trim().replace(/,/g, '')) || 1;
          coverageVal = Math.round((covAct / covTotal) * 100);
        } else {
          coverageVal = parseFloat(coverageStr.replace('%', '')) || 0;
        }
        $('#kpi-coverage-value').text(coverageVal + '%');
        $('#kpi-coverage-bar').css('width', Math.min(coverageVal, 100) + '%');

        renderTargetProgress();
        updateHeroSummary();
      })
      .catch(function (err) {
        console.error('[Dashboard LoadStats Error]:', err);
        $('#kpi-orders-value').text('0');
        $('#kpi-customers-value').text('0');
        $('#kpi-coverage-value').text('0%');
        $('#kpi-orders-bar').css('width', '0%');
        $('#kpi-customers-bar').css('width', '0%');
        $('#kpi-coverage-bar').css('width', '0%');
      });
  }

  // ── Kế hoạch bán hàng → lấy chỉ tiêu thực tế ──
  function loadSalesPlan(fromDate, toDate) {
    return Http.get(API_CONFIG.ENDPOINTS.SALES.PLAN, {
      q: JSON.stringify({ FromDate: fromDate, ToDate: toDate })
    }).then(function (res) {
      var data = res.data || res;
      var records = data.records || [];
      if (!records.length) return;

      // Lấy % đã tính sẵn từ BE (PhanTramThucHienDS, PhanTramDoPhuKH)
      // Nếu nhiều records (manager): tính trung bình có trọng số theo DoanhSoKeHoach
      var totalRevTarget = 0, totalCustTarget = 0;
      var weightedRevPct = 0, weightedCustPct = 0;
      records.forEach(function (r) {
        var rt  = parseFloat(r.DoanhSoKeHoach) || 0;
        var ct  = parseInt(r.DoPhuKhachHang)   || 0;
        var rp  = parseFloat(r.PhanTramThucHienDS) || 0;
        var cp  = parseFloat(r.PhanTramDoPhuKH)    || 0;
        totalRevTarget  += rt;
        totalCustTarget += ct;
        weightedRevPct  += rp * (rt || 1);
        weightedCustPct += cp * (ct || 1);
      });

      _progress.planRevenuePct = totalRevTarget > 0
        ? Math.min(Math.round(weightedRevPct / totalRevTarget), 999)
        : Math.min(Math.round(weightedRevPct / records.length), 999);

      _progress.planCustPct = totalCustTarget > 0
        ? Math.min(Math.round(weightedCustPct / totalCustTarget), 999)
        : Math.min(Math.round(weightedCustPct / records.length), 999);

      if (totalRevTarget  > 0) _progress.revenueTarget   = totalRevTarget;
      if (totalCustTarget > 0) _progress.customersTarget  = totalCustTarget;

      renderTargetProgress();
    }).catch(function () {
      // Giữ nguyên fallback mặc định
    });
  }

  // ── Chart & Revenue ──
  function loadChartAndRevenue(fromDate, toDate) {
    return DashboardService.getRevenue(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];

        // 1. Tính tổng doanh thu
        var total = records.reduce(function (sum, r) { return sum + (parseFloat(r.Amount) || 0); }, 0);

        var dayValues = {};
        var startD = new Date(fromDate);
        var endD = new Date(toDate);

        _progress.revenue = total;
        $('#kpi-revenue-value')
          .attr('title', Number(total).toLocaleString('vi-VN') + ' đ')
          .text(formatRevenue(total));
        // Bar cập nhật sau khi loadSalesPlan xong (trong renderTargetProgress)

        if (records.length > 0) {
          // 2. Tạo mảng liên tục các ngày từ fromDate đến toDate với giá trị 0
          if (!isNaN(startD) && !isNaN(endD) && startD <= endD) {
            for (var d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
              var dayStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
              dayValues[dayStr] = 0;
            }
          }

          // 3. Đưa dữ liệu vào từng ngày
          records.forEach(function (r) {
            var rawDate = '';
            var v = 0;
            
            for (var k in r) {
                if (!r.hasOwnProperty(k)) continue;
                var kl = String(k).toLowerCase();
                if (['ngay', 'date', 'ngaylap', 'documentdate', 'createddate', 'label', 'thoigian', 'ngày', 'columndate'].indexOf(kl) !== -1) {
                    if (String(r[k]).match(/\d/)) rawDate = r[k];
                }
                if (['basetotal', 'amount', 'doanhso', 'thanhtien', 'tongtien', 'column1', 'value', 'giatri', 'doanhthu'].indexOf(kl) !== -1) v = parseFloat(r[k]) || 0;
            }
            
            if (!rawDate) {
                for (var key in r) {
                    var strVal = String(r[key]);
                    if ((strVal.match(/\d{4}-\d{2}-\d{2}/) || strVal.match(/\d{2}\/\d{2}/) || strVal.match(/\d{4}\/\d{2}\/\d{2}/)) && !strVal.match(/^[a-zA-Z]+$/)) {
                        rawDate = strVal; break;
                    }
                }
            }
            if (!v) {
                for (var key in r) {
                    var parsed = parseFloat(r[key]);
                    if (!isNaN(parsed) && String(r[key]) !== rawDate && r[key] !== null && r[key] !== '') {
                        v = parsed; 
                    }
                }
            }

            var mappedDate = '';
            if (rawDate) {
                var strD = String(rawDate);
                var matchISO = strD.match(/(\d{4})-(\d{2})-(\d{2})/);
                var matchSlash1 = strD.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                var matchSlash2 = strD.match(/(\d{4})\/(\d{2})\/(\d{2})/);
                var matchSlash3 = strD.match(/^(\d{2})\/(\d{2})$/);
                var matchNumber = strD.match(/^(\d{1,2})$/);
                
                if (matchISO) {
                    mappedDate = matchISO[3] + '/' + matchISO[2];
                } else if (matchSlash1) {
                    mappedDate = matchSlash1[1] + '/' + matchSlash1[2];
                } else if (matchSlash2) {
                    mappedDate = matchSlash2[3] + '/' + matchSlash2[2];
                } else if (matchSlash3) {
                    mappedDate = matchSlash3[1] + '/' + matchSlash3[2];
                } else if (matchNumber && !isNaN(parseInt(matchNumber[1]))) {
                    mappedDate = matchNumber[1].padStart(2, '0') + '/' + String(startD.getMonth() + 1).padStart(2, '0');
                } else {
                    mappedDate = strD;
                }
            }

            if (mappedDate && dayValues[mappedDate] !== undefined) {
               dayValues[mappedDate] += v;
            } else if (mappedDate) {
               dayValues[mappedDate] = (dayValues[mappedDate] || 0) + v;
            }
          });
        }

        var finalLabels = [];
        var finalValues = [];

        if (currentTab === 'week') {
          var weekValues = {};

          if (!isNaN(startD) && !isNaN(endD) && startD <= endD) {
            for (var d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
              var wLabel = getWeekRangeLabel(d);
              weekValues[wLabel] = 0;
            }
          }

          for (var dayStr in dayValues) {
            var parts = dayStr.split('/');
            if (parts.length === 2) {
              var dayVal = parseInt(parts[0]);
              var monthVal = parseInt(parts[1]);
              var yearVal = !isNaN(startD) ? startD.getFullYear() : new Date().getFullYear();
              var monthIndex = !isNaN(startD) ? startD.getMonth() : new Date().getMonth();
              if (monthVal < monthIndex + 1) yearVal++;
              var rDate = new Date(yearVal, monthVal - 1, dayVal);
              var wLabel = getWeekRangeLabel(rDate);
              weekValues[wLabel] = (weekValues[wLabel] || 0) + dayValues[dayStr];
            }
          }

          finalLabels = Object.keys(weekValues);
          finalValues = finalLabels.map(function(k) { return weekValues[k]; });

        } else if (currentTab === 'month') {
          var monthValues = {};

          if (!isNaN(startD) && !isNaN(endD)) {
            var curM = new Date(startD.getFullYear(), startD.getMonth(), 1);
            var endM = new Date(endD.getFullYear(), endD.getMonth(), 1);
            while (curM <= endM) {
              var mLabel = 'T' + (curM.getMonth() + 1) + '/' + curM.getFullYear();
              monthValues[mLabel] = 0;
              curM.setMonth(curM.getMonth() + 1);
            }
          }

          for (var dayStr in dayValues) {
            var parts = dayStr.split('/');
            if (parts.length === 2) {
              var mo = parseInt(parts[1]);
              var yr = !isNaN(startD) ? startD.getFullYear() : new Date().getFullYear();
              var mLabel = 'T' + mo + '/' + yr;
              if (monthValues[mLabel] !== undefined) {
                monthValues[mLabel] += dayValues[dayStr];
              }
            }
          }

          finalLabels = Object.keys(monthValues);
          finalValues = finalLabels.map(function(k) { return monthValues[k]; });

        } else if (currentTab === 'quarter') {
          var quarterValues = {};

          if (!isNaN(startD) && !isNaN(endD)) {
            var startY = startD.getFullYear(), endY = endD.getFullYear();
            var startQ = Math.ceil((startD.getMonth() + 1) / 3);
            var endQ = Math.ceil((endD.getMonth() + 1) / 3);
            for (var qy = startY; qy <= endY; qy++) {
              var firstQ = (qy === startY) ? startQ : 1;
              var lastQ = (qy === endY) ? endQ : 4;
              for (var q = firstQ; q <= lastQ; q++) {
                quarterValues['Q' + q + '/' + qy] = 0;
              }
            }
          }

          for (var dayStr in dayValues) {
            var parts = dayStr.split('/');
            if (parts.length === 2) {
              var mo = parseInt(parts[1]);
              var yr = !isNaN(startD) ? startD.getFullYear() : new Date().getFullYear();
              var qLabel = 'Q' + Math.ceil(mo / 3) + '/' + yr;
              if (quarterValues[qLabel] !== undefined) {
                quarterValues[qLabel] += dayValues[dayStr];
              }
            }
          }

          finalLabels = Object.keys(quarterValues);
          finalValues = finalLabels.map(function(k) { return quarterValues[k]; });

        } else {
          finalLabels = Object.keys(dayValues);
          finalValues = finalLabels.map(function(k) { return dayValues[k]; });
        }

        // 4. Tính toán Quick Stats
        var maxVal = 0, maxDate = '--';
        var minVal = Infinity, minDate = '--';
        var totalVal = 0, count = 0;

        finalLabels.forEach(function (lbl, idx) {
          var valItem = finalValues[idx];
          totalVal += valItem;
          count++;
          if (valItem > maxVal) {
            maxVal = valItem;
            maxDate = lbl;
          }
          if (valItem < minVal) {
            minVal = valItem;
            minDate = lbl;
          }
        });

        if (minVal === Infinity) minVal = 0;
        var avgVal = count > 0 ? (totalVal / count) : 0;

        $('#qs-max-value').text(formatRevenue(maxVal));
        $('#qs-max-date').text('(' + maxDate + ')');
        $('#qs-min-value').text(formatRevenue(minVal));
        $('#qs-min-date').text('(' + minDate + ')');
        $('#qs-avg-value').text(formatRevenue(avgVal));
        $('#qs-total-value').text(formatRevenue(total));

        renderChart({ labels: finalLabels, values: finalValues });
        renderTargetProgress();
        updateHeroSummary();
      })
      .catch(function () {
        $('#kpi-revenue-value').text('0 ₫');
        $('#qs-max-value').text('--');
        $('#qs-min-value').text('--');
        $('#qs-avg-value').text('--');
        $('#qs-total-value').text('--');
        renderChart({ labels: [], values: [] });
      });
  }

  // ── Birthdays ──
  function loadBirthdays(fromDate, toDate) {
    return DashboardService.getBirthdays(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var items = data.records || (Array.isArray(data) ? data : []);
        var $list = $('#birthdays-list');

        if (!items || items.length === 0) {
          $list.html('<li class="birthday-item"><p class="birthday-name" style="padding:8px 0;color:var(--color-text-muted)">Không có sinh nhật nào trong kỳ</p></li>');
          $('#birthday-count').text('0');
        } else {
          $('#birthday-count').text(items.length);
          var calendarIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
          var phoneIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.71 12 19.79 19.79 0 0 1 1.64 3.47 2 2 0 0 1 3.62 1.27h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.65 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.91.3 1.85.52 2.81.65A2 2 0 0 1 22 16.92z"/></svg>';
          var flowerSvg = '<svg viewBox="0 0 100 100" width="20" height="20" style="color:#0b8a43">' +
            '<polygon points="47.97,45.43 36.98,20.77 42.37,10.73 50,24 57.63,10.73 63.02,20.77 52.03,45.43" fill="currentColor" stroke="#fff" stroke-width="1.2"/>' +
            '<polygon points="47.97,45.43 36.98,20.77 42.37,10.73 50,24 57.63,10.73 63.02,20.77 52.03,45.43" fill="currentColor" stroke="#fff" stroke-width="1.2" transform="rotate(60 50 50)"/>' +
            '<polygon points="47.97,45.43 36.98,20.77 42.37,10.73 50,24 57.63,10.73 63.02,20.77 52.03,45.43" fill="currentColor" stroke="#fff" stroke-width="1.2" transform="rotate(120 50 50)"/>' +
            '<polygon points="47.97,45.43 36.98,20.77 42.37,10.73 50,24 57.63,10.73 63.02,20.77 52.03,45.43" fill="currentColor" stroke="#fff" stroke-width="1.2" transform="rotate(180 50 50)"/>' +
            '<polygon points="47.97,45.43 36.98,20.77 42.37,10.73 50,24 57.63,10.73 63.02,20.77 52.03,45.43" fill="currentColor" stroke="#fff" stroke-width="1.2" transform="rotate(240 50 50)"/>' +
            '<polygon points="47.97,45.43 36.98,20.77 42.37,10.73 50,24 57.63,10.73 63.02,20.77 52.03,45.43" fill="currentColor" stroke="#fff" stroke-width="1.2" transform="rotate(300 50 50)"/>' +
            '</svg>';
          $list.html(items.map(function (item) {
            var phone = item[DASHBOARD_SCHEMA.BIRTHDAY.phoneKey] || '';
            var phoneBtn = phone
              ? '<a href="tel:' + phone + '" class="birthday-call" aria-label="Gọi điện">' + phoneIcon + '</a>'
              : '';
            return '<li class="birthday-item">' +
              '<div class="birthday-logo">' + flowerSvg + '</div>' +
              '<div class="birthday-info">' +
              '  <span class="birthday-name">' + (item.ObjectName || 'Không rõ tên') + '</span>' +
              '  <span class="birthday-addr">' + (item.ADDRESS || '') + '</span>' +
              '  <span class="birthday-date">' + calendarIcon + ' ' + (item.Birthday || '--') + '</span>' +
              '</div>' +
              phoneBtn +
              '</li>';
          }).join(''));
        }
        $list.show();
        $('#birthdays-skeleton').hide();

        updateHeroSummary();
      })
      .catch(function () {
        $('#birthdays-skeleton').hide();
        $('#birthdays-list').html('<li class="birthday-item"><p class="birthday-name" style="padding:8px;color:var(--color-text-muted)">Lỗi tải dữ liệu sinh nhật</p></li>').show();
      });
  }

  // Helper cập nhật Hero summary
  function updateHeroSummary() {
    $('#hero-summary').text('Chúc bạn một ngày làm việc hiệu quả!');
  }

  // ── Render Chart ──
  function renderChart(chart) {
    requestAnimationFrame(function () {
      drawLineChart('revenue-chart', chart.labels, chart.values, {
        lineColor: '#0b8a43',
        primaryRgb: '11, 138, 67',
        label: 'Doanh số'
      });
    });
  }

  // ── Tuyến hôm nay từ API ──
  function loadTodayRoutes() {
    var user = {};
    try { user = JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch (e) {}
    var userName = user.UserName || '';
    if (!userName) { renderTasks([]); return Promise.resolve(); }

    var today = new Date();
    var docDate = today.getFullYear() + '-'
      + String(today.getMonth() + 1).padStart(2, '0') + '-'
      + String(today.getDate()).padStart(2, '0');

    return Http.get(API_CONFIG.ENDPOINTS.ROUTES.YOUR_ROUTES, {
      User: userName,
      DocumentDate: docDate
    }).then(function (res) {
      var data = res.data || res;
      var records = data.records || (Array.isArray(data) ? data : []);
      var total = records.length;
      renderTasks(records.slice(0, 8), total);
    }).catch(function () {
      renderTasks([], 0);
    });
  }

  // ── Render tiến độ chỉ tiêu ──
  function renderTargetProgress() {
    // Chờ loadSalesPlan xong (planRevenuePct = -1 khi chưa load)
    if (_progress.planRevenuePct < 0 || _progress.planCustPct < 0) return;

    // Doanh số: ưu tiên % từ plan, fallback tính từ thực tế / chỉ tiêu
    var hasRevTarget = _progress.revenueTarget > 0;
    var revenuePct = 0;
    var hasRevPct = false;
    if (_progress.planRevenuePct > 0) {
      revenuePct = Math.min(_progress.planRevenuePct, 100);
      hasRevPct = true;
    } else if (hasRevTarget && _progress.revenue > 0) {
      revenuePct = Math.min(Math.round((_progress.revenue / _progress.revenueTarget) * 100), 100);
      hasRevPct = true;
    }

    var custPct = Math.min(_progress.planCustPct, 100);
    var hasCustPct = _progress.planCustPct > 0 || _progress.customersTarget > 0;

    // Donut: chỉ tính dựa trên dữ liệu có sẵn
    var sumPct = 0, divisor = 0;
    if (hasRevPct) { sumPct += revenuePct * 2; divisor += 2; }
    if (hasCustPct) { sumPct += custPct; divisor += 1; }
    var avgPct = divisor > 0 ? Math.round(sumPct / divisor) : 0;
    $('#target-pct').text(avgPct + '%');

    // Row doanh số
    if (hasRevPct) {
      $('#target-revenue-pct').text(revenuePct + '%').show();
      $('#target-revenue-fill').css('width', revenuePct + '%');
    } else {
      $('#target-revenue-pct').text('—').show();
      $('#target-revenue-fill').css('width', '0%');
    }
    var revSub = formatRevenue(_progress.revenue);
    if (hasRevTarget) revSub += ' / ' + formatRevenue(_progress.revenueTarget);
    else if (!hasRevPct) revSub += ' — Chưa có chỉ tiêu';
    $('#target-revenue-sub').text(revSub);

    // Row khách GD
    $('#target-customers-pct').text(hasCustPct ? custPct + '%' : '—');
    $('#target-customers-fill').css('width', hasCustPct ? custPct + '%' : '0%');
    var custSub = _progress.customers.toLocaleString('vi-VN');
    if (_progress.customersTarget > 0) custSub += ' / ' + _progress.customersTarget.toLocaleString('vi-VN') + ' KH';
    $('#target-customers-sub').text(custSub);

    // KPI revenue bar
    if (hasRevPct) $('#kpi-revenue-bar').css('width', revenuePct + '%');

    // Donut chart
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var remaining = Math.max(0, 100 - avgPct);
    var canvas = document.getElementById('target-donut-chart');
    if (!canvas) return;
    if (canvas._chartInstance) { canvas._chartInstance.destroy(); }
    canvas._chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [avgPct, remaining],
          backgroundColor: ['#0b8a43', isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'],
          borderWidth: 0,
          hoverOffset: 0
        }]
      },
      options: {
        cutout: '75%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 700, easing: 'easeInOutQuart' }
      }
    });
  }

  function renderTasks(tasks, total) {
    var $widget = $('.widget-tasks');
    // Cập nhật header badge tổng số
    var $badge = $widget.find('.tasks-total');
    if (!$badge.length) {
      $widget.find('.widget-header h3').after('<span class="widget-badge tasks-total"></span>');
      $badge = $widget.find('.tasks-total');
    }
    $badge.text(total || 0);

    if (!tasks || tasks.length === 0) {
      $('#tasks-grid').html('<p style="color:var(--color-text-muted);font-size:var(--font-size-sm);padding:8px 0">Không có tuyến nào hôm nay.</p>');
      return;
    }

    var isRoute = tasks[0] && tasks[0].ObjectName !== undefined;
    $('#tasks-grid').html(tasks.map(function(t) {
      if (!isRoute) {
        return '<div class="task-item">' +
               '<div class="task-time">' + t.time + '</div>' +
               '<div class="task-name">' + t.name + '</div>' +
               '</div>';
      }
      var visited = t.StatusID && String(t.StatusID) !== '0';
      return '<div class="task-item">' +
             '<span class="task-status-dot' + (visited ? ' visited' : '') + '"></span>' +
             '<div class="task-name">' + (t.ObjectName || '') + '</div>' +
             '<div class="task-addr">' + (t.Address || t.ADDRESS || '') + '</div>' +
             (t.SoDonHang ? '<div class="task-orders">' + t.SoDonHang + ' đơn</div>' : '') +
             '</div>';
    }).join(''));

    // Hiện link "Xem tất cả" nếu có nhiều hơn 8
    if (total > 8 && !$widget.find('.widget-see-all').length) {
      $widget.append('<a href="#/routes" class="widget-see-all">Xem tất cả ' + total + ' điểm <span>›</span></a>');
    }
  }


  // ── Initial load ──
  loadAll();
}

// Init — called directly since in SPA mode template is already in DOM
initDashboard();
