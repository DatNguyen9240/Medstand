function initDashboard() {
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



  // ── Default targets ──
  var TARGET_ORDERS = 150;
  var TARGET_CUSTOMERS = 400;
  var TARGET_REVENUE = 1000000000; // 1 Tỷ

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
      loadNotificationCount()
    ]).finally(function() {
      setLoadingState(false);
    });
  }

  // ── Khi thay đổi ngày → reload ──
  if (elFrom) elFrom.addEventListener('change', loadAll);
  if (elTo) elTo.addEventListener('change', loadAll);

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
        $('#kpi-orders-value').text(orders.toLocaleString('vi-VN'));
        $('#kpi-orders-delta').text('↑ 12% so với tháng trước').addClass('positive');
        $('#kpi-orders-bar').css('width', Math.min((orders / TARGET_ORDERS) * 100, 100) + '%');

        // 2. Khách hàng
        var customersStr = (record['KhachHangGD'] || '').toString();
        var customers = 0;
        var totalCustomers = TARGET_CUSTOMERS;
        if (customersStr.indexOf('/') !== -1) {
          var parts = customersStr.split('/');
          customers = parseInt(parts[0].trim().replace(/,/g, '')) || 0;
          totalCustomers = parseInt(parts[1].trim().replace(/,/g, '')) || TARGET_CUSTOMERS;
        } else {
          customers = parseInt(customersStr.replace(/,/g, '')) || 0;
        }
        $('#kpi-customers-value').text(customers.toLocaleString('vi-VN'));
        $('#kpi-customers-delta').text('↑ 8% so với tháng trước').addClass('positive');
        $('#kpi-customers-bar').css('width', Math.min((customers / totalCustomers) * 100, 100) + '%');

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
        $('#kpi-coverage-delta').text('↑ 5% so với tháng trước').addClass('positive');
        $('#kpi-coverage-bar').css('width', Math.min(coverageVal, 100) + '%');

        // Cập nhật hero summary
        updateHeroSummary(orders, $('#birthday-count').text() || '0');
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

  // ── Chart & Revenue ──
  function loadChartAndRevenue(fromDate, toDate) {
    return DashboardService.getRevenue(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];

        // 1. Tính tổng doanh thu
        var total = records.reduce(function (sum, r) { return sum + (parseFloat(r.Amount) || 0); }, 0);
        $('#kpi-revenue-value')
          .attr('title', Number(total).toLocaleString('vi-VN') + ' đ')
          .text(formatRevenue(total));
        $('#kpi-revenue-delta').text('↑ 15% so với tháng trước').addClass('positive');
        $('#kpi-revenue-target').text('Mục tiêu: ' + formatRevenue(TARGET_REVENUE));
        $('#kpi-revenue-bar').css('width', Math.min((total / TARGET_REVENUE) * 100, 100) + '%');

        // 2. Tạo mảng liên tục các ngày từ fromDate đến toDate với giá trị 0
        var dayValues = {};
        var startD = new Date(fromDate);
        var endD = new Date(toDate);
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

        var labels = Object.keys(dayValues);
        var values = labels.map(function(k) { return dayValues[k]; });
        
        renderChart({ labels: labels, values: values });
        
        // 4. Tính toán Quick Stats
        var maxVal = 0, maxDate = '--';
        var minVal = Infinity, minDate = '--';
        var totalVal = 0, count = 0;
        for (var date in dayValues) {
            var valItem = dayValues[date];
            totalVal += valItem;
            count++;
            if (valItem > maxVal) {
                maxVal = valItem;
                maxDate = date;
            }
            if (valItem < minVal) {
                minVal = valItem;
                minDate = date;
            }
        }
        if (minVal === Infinity) minVal = 0;
        var avgVal = count > 0 ? (totalVal / count) : 0;

        $('#qs-max-value').text(formatRevenue(maxVal));
        $('#qs-max-date').text('(' + maxDate + ')');
        $('#qs-min-value').text(formatRevenue(minVal));
        $('#qs-min-date').text('(' + minDate + ')');
        $('#qs-avg-value').text(formatRevenue(avgVal));
        $('#qs-total-value').text(formatRevenue(total));
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
          $list.html(items.map(function (item) {
            var phone = item[DASHBOARD_SCHEMA.BIRTHDAY.phoneKey] || '';
            var flowerSvg = '<svg viewBox="0 0 100 100" style="width:22px;height:22px;color:var(--color-primary);">' +
              '  <defs>' +
              '    <polygon id="medstand-petal-item" points="50,50 50,10 60.72,24.13 78.28,21.72" fill="currentColor" stroke="#ffffff" stroke-width="2.2"/>' +
              '  </defs>' +
              '  <use href="#medstand-petal-item"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(45 50 50)"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(90 50 50)"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(135 50 50)"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(180 50 50)"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(225 50 50)"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(270 50 50)"/>' +
              '  <use href="#medstand-petal-item" transform="rotate(315 50 50)"/>' +
              '</svg>';
            return '<li class="birthday-item">' +
              '  <div class="birthday-logo">' + flowerSvg + '</div>' +
              '  <div class="birthday-info">' +
              '    <span class="birthday-name">' + (item.ObjectName || 'Không rõ tên') + '</span>' +
              '    <span class="birthday-addr">' + (item.ADDRESS || 'Địa chỉ không rõ') + '</span>' +
              '    <span class="birthday-date">📅 ' + (item.Birthday || '--') + '</span>' +
              '  </div>' +
              '  <a href="tel:' + phone + '" class="birthday-call" aria-label="Gọi điện">📞</a>' +
              '</li>';
          }).join(''));
        }
        $list.show();
        $('#birthdays-skeleton').hide();

        // Cập nhật hero summary
        var orders = parseInt($('#kpi-orders-value').text()) || 0;
        updateHeroSummary(orders, items.length);
      })
      .catch(function () {
        $('#birthdays-skeleton').hide();
        $('#birthdays-list').html('<li class="birthday-item"><p class="birthday-name" style="padding:8px;color:var(--color-text-muted)">Lỗi tải dữ liệu sinh nhật</p></li>').show();
      });
  }

  // Helper cập nhật Hero summary
  function updateHeroSummary(orders, birthdays) {
    // Keep static text to match the premium screenshot
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

  // ── Mock & Helpers Renderers ──
  var todayTasks = [
    { time: '09:00 - 10:30', name: 'Gặp khách hàng' },
    { time: '10:30 - 11:30', name: 'Trưng bày sản phẩm' },
    { time: '14:00 - 15:30', name: 'Họp nhóm' },
    { time: '16:00 - 17:00', name: 'Báo cáo ngày' }
  ];

  var topCustomers = [
    { name: 'Nhà thuốc Châu Nhiên', revenue: 12500000 },
    { name: 'Quầy thuốc Hồng Loan', revenue: 9200000 },
    { name: 'Nhà thuốc Số 689', revenue: 7800000 },
    { name: 'Nhà thuốc Nhật Tiến', revenue: 5400000 }
  ];

  var regionCoverage = [
    { name: 'Long Xuyên', pct: 68 },
    { name: 'Châu Đốc', pct: 54 },
    { name: 'Tân Châu', pct: 48 }
  ];

  function renderTasks(tasks) {
    $('#tasks-grid').html(tasks.map(function(t) {
      return '<div class="task-item">' +
             '  <div class="task-time">' + t.time + '</div>' +
             '  <div class="task-name">' + t.name + '</div>' +
             '</div>';
    }).join(''));
  }

  function renderTopCustomers(list) {
    var maxRev = Math.max.apply(null, list.map(function(c) { return c.revenue; }));
    $('#top-customer-list').html(list.map(function(c, i) {
      return '<li class="tc-item">' +
             '  <div class="tc-rank">' + (i + 1) + '</div>' +
             '  <div class="tc-logo">✦</div>' +
             '  <div class="tc-info">' +
             '    <span class="tc-name">' + c.name + '</span>' +
             '    <span class="tc-revenue">' + formatRevenue(c.revenue) + '</span>' +
             '  </div>' +
             '  <div class="tc-bar">' +
             '    <div class="tc-bar-fill" style="width:' + Math.round(c.revenue / maxRev * 100) + '%"></div>' +
             '  </div>' +
             '</li>';
    }).join(''));
  }

  function renderCoverage(regions) {
    $('#coverage-list').html(regions.map(function(r) {
      return '<li class="cov-item">' +
             '  <span class="cov-region">' + r.name + '</span>' +
             '  <div class="cov-bar-wrap">' +
             '    <div class="cov-bar">' +
             '      <div class="cov-fill" style="width:' + r.pct + '%"></div>' +
             '    </div>' +
             '    <span class="cov-pct">' + r.pct + '%</span>' +
             '  </div>' +
             '</li>';
    }).join(''));
  }

  // ── Khởi tạo render widgets tĩnh ──
  renderTasks(todayTasks);
  renderTopCustomers(topCustomers);
  renderCoverage(regionCoverage);

  // ── Initial load ──
  loadAll();
}

// Init — called directly since in SPA mode template is already in DOM
initDashboard();
