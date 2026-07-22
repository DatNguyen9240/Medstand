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
    var absVal = Math.abs(val);
    if (absVal >= 1e9) return (val / 1e9).toFixed(2).replace(/\.00$/, '') + ' Tỷ';
    if (absVal >= 1e6) return (val / 1e6).toFixed(1).replace(/\.0$/, '') + ' Tr';
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
      var roleText = typeof getUserRoleLabel === 'function' ? getUserRoleLabel(p) : (p.RoleName || '');
      var roleBadge = document.getElementById('dashboard-role-badge');
      var homePage = document.getElementById('home-page');
      if (roleBadge && roleText) {
        roleBadge.textContent = roleText;
        roleBadge.hidden = false;
      }
      if (homePage) {
        var roleCode = String(p.roleCode || p.RoleCode || p.UserGroupID || '').toLowerCase();
        var manager = Number(p.Manager || p.IsManager || 0) === 1 || roleCode.indexOf('admin') >= 0 || roleCode.indexOf('manager') >= 0 || roleCode === 'ql';
        homePage.setAttribute('data-dashboard-role', manager ? 'manager' : 'tdv');
      }
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
  var hasCustomDateRange = savedDates.isCustom === true || (
    !!(savedDates.fromDate || savedDates.toDate) &&
    (currentFrom !== defaultFrom || currentTo !== defaultTo)
  );
  
  // Prevent date range inversion causing server SQL crash
  if (new Date(currentFrom) > new Date(currentTo)) {
    currentFrom = defaultFrom;
    currentTo = defaultTo;
    hasCustomDateRange = false;
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

  function parseFilterDate(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function isValidChartRange(fromDate, toDate) {
    var startDate = parseFilterDate(fromDate);
    var endDate = parseFilterDate(toDate);
    if (!startDate || !endDate || startDate > endDate) return false;
    var maxEndDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
    if (maxEndDate.getMonth() !== startDate.getMonth()) maxEndDate.setDate(0);
    return endDate <= maxEndDate;
  }

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

    if (!isValidChartRange(fromDate, toDate)) {
      Alert.warning('Khoảng ngày không hợp lệ hoặc vượt quá một năm.');
      return;
    }

    // Lưu lại vào localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify({ fromDate: fromDate, toDate: toDate, isCustom: hasCustomDateRange }));
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
  function handleDateRangeChange() {
    hasCustomDateRange = true;
    loadAll();
  }
  if (elFrom) elFrom.addEventListener('change', handleDateRangeChange);
  if (elTo) elTo.addEventListener('change', handleDateRangeChange);

  // ── Khi thay đổi tab biểu đồ ──
  $('.analytics-tabs').on('click', '.tab-btn', function () {
    var $btn = $(this);
    if ($btn.hasClass('active')) return;
    if (!isValidChartRange(getFromDate(), getToDate())) {
      Alert.warning('Khoảng ngày không hợp lệ hoặc vượt quá một năm.');
      return;
    }

    $('.analytics-tabs .tab-btn').removeClass('active');
    $btn.addClass('active');
    
    currentTab = $btn.attr('data-tab') || 'day';

    var subtitleMap = {
      day: 'Theo ngày trong kỳ',
      week: 'Theo tuần trong kỳ',
      month: 'Theo tháng trong kỳ',
      quarter: 'Theo quý trong kỳ'
    };
    $('.analytics-subtitle').text(subtitleMap[currentTab] || 'Theo ngày trong kỳ');

    // Quay lại chế độ Ngày: mặc định chỉ xem từ đầu tháng hiện tại đến hôm nay.
    if (currentTab === 'day' && elFrom && elTo) {
      hasCustomDateRange = false;
      if (elFrom.value !== defaultFrom || elTo.value !== defaultTo) {
        elFrom.value = defaultFrom;
        elTo.value = defaultTo;
        loadAll();
        return;
      }
    }

    // Tự động mở rộng khoảng ngày khi xem theo tháng/quý.
    if ((currentTab === 'month' || currentTab === 'quarter') && !hasCustomDateRange && elFrom && elTo) {
      var currentDate = new Date();
      var yearStart = currentDate.getFullYear() + '-01-01';
      var today = currentDate.getFullYear() + '-'
        + String(currentDate.getMonth() + 1).padStart(2, '0') + '-'
        + String(currentDate.getDate()).padStart(2, '0');
      if (elFrom.value !== yearStart || elTo.value !== today) {
        elFrom.value = yearStart;
        elTo.value = today;
        loadAll();
        return;
      }
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
  function legacyLoadChartAndRevenue(fromDate, toDate) {
    return DashboardService.getRevenue(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];
        var hasData = records.length > 0;
        $('#revenue-chart-empty').prop('hidden', hasData);
        $('#revenue-chart').prop('hidden', !hasData);

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
            var hasAmount = false;
            
            for (var k in r) {
                if (!r.hasOwnProperty(k)) continue;
                var kl = String(k).toLowerCase();
                if (['ngay', 'date', 'ngaylap', 'documentdate', 'createddate', 'label', 'thoigian', 'ngày', 'columndate'].indexOf(kl) !== -1) {
                    if (String(r[k]).match(/\d/)) rawDate = r[k];
                }
                if (['basetotal', 'amount', 'doanhso', 'thanhtien', 'tongtien', 'column1', 'value', 'giatri', 'doanhthu'].indexOf(kl) !== -1) {
                    v = parseFloat(r[k]) || 0;
                    hasAmount = true;
                }
            }
            
            if (!rawDate) {
                for (var key in r) {
                    var strVal = String(r[key]);
                    if ((strVal.match(/\d{4}-\d{2}-\d{2}/) || strVal.match(/\d{2}\/\d{2}/) || strVal.match(/\d{4}\/\d{2}\/\d{2}/)) && !strVal.match(/^[a-zA-Z]+$/)) {
                        rawDate = strVal; break;
                    }
                }
            }
            if (!hasAmount) {
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
        $('#revenue-chart-empty').prop('hidden', false);
        $('#revenue-chart').prop('hidden', true);
        $('#kpi-revenue-value').text('0 ₫');
        $('#qs-max-value').text('--');
        $('#qs-min-value').text('--');
        $('#qs-avg-value').text('--');
        $('#qs-total-value').text('--');
        renderChart({ labels: [], values: [] });
      });
  }

  // ── Birthdays ──
  function loadChartAndRevenue(fromDate, toDate) {
    function parseLocalDate(value, fallbackDate) {
      var text = String(value || '').trim();
      var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      var year, month, day;

      if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
      } else {
        match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (match) {
          day = Number(match[1]);
          month = Number(match[2]);
          year = Number(match[3]);
        } else {
          match = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
          if (match) {
            year = Number(match[1]);
            month = Number(match[2]);
            day = Number(match[3]);
          } else {
            match = text.match(/^(\d{2})\/(\d{2})$/);
            if (!match || !fallbackDate) return null;
            day = Number(match[1]);
            month = Number(match[2]);
            year = fallbackDate.getFullYear();
            if (month < fallbackDate.getMonth() + 1) year++;
          }
        }
      }

      var date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }

    function dateKey(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function shortDate(date) {
      return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0');
    }

    function fullDate(date) {
      return shortDate(date) + '/' + date.getFullYear();
    }

    function parseAmount(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value !== 'string') return null;
      var normalized = value.trim().replace(/,/g, '');
      if (!normalized) return null;
      var parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function getRecordDate(record, startDate) {
      var dateFields = ['ngay', 'date', 'ngaylap', 'documentdate', 'createddate', 'label', 'thoigian', 'ngÃ y', 'columndate'];
      var fallback = null;
      for (var field in record) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
        var value = record[field];
        var lowerField = String(field).toLowerCase();
        if (dateFields.indexOf(lowerField) !== -1) {
          var parsed = parseLocalDate(value, startDate);
          if (parsed) return parsed;
        }
        if (!fallback && /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{4}\/\d{2}\/\d{2}/.test(String(value))) {
          fallback = parseLocalDate(value, startDate);
        }
      }
      return fallback;
    }

    function getRecordAmount(record) {
      var amountFields = ['basetotal', 'amount', 'doanhso', 'thanhtien', 'tongtien', 'column1', 'value', 'giatri', 'doanhthu'];
      for (var field in record) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
        if (amountFields.indexOf(String(field).toLowerCase()) !== -1) return parseAmount(record[field]);
      }
      return null;
    }

    function setEmptyState() {
      $('#revenue-chart-empty').prop('hidden', false);
      $('#revenue-chart').prop('hidden', true);
      $('#kpi-revenue-value').attr('title', '0 Ä‘').text('0 Ä‘');
      $('#qs-max-value, #qs-min-value, #qs-avg-value, #qs-total-value').text('--');
      $('#qs-max-date, #qs-min-date').text('');
      _progress.revenue = 0;
      renderChart({ labels: [], values: [] });
      renderTargetProgress();
      updateHeroSummary();
    }

    var startDate = parseLocalDate(fromDate);
    var endDate = parseLocalDate(toDate);
    if (!startDate || !endDate || startDate > endDate) {
      setEmptyState();
      return Promise.resolve();
    }

    return DashboardService.getRevenue(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = Array.isArray(data.records) ? data.records : [];
        var dayValues = {};
        var cursor = new Date(startDate);
        var validRecordCount = 0;

        for (; cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
          dayValues[dateKey(cursor)] = 0;
        }

        records.forEach(function (record) {
          var transactionDate = getRecordDate(record, startDate);
          var amount = getRecordAmount(record);
          if (!transactionDate || amount === null || transactionDate < startDate || transactionDate > endDate) return;
          if (amount < 0) {
            console.warn('[Revenue chart] Negative net-sales amount returned by API:', {
              amount: amount,
              date: dateKey(transactionDate),
              record: record
            });
          }
          dayValues[dateKey(transactionDate)] += amount;
          validRecordCount++;
        });

        if (!validRecordCount) {
          setEmptyState();
          return;
        }

        $('#revenue-chart-empty').prop('hidden', true);
        $('#revenue-chart').prop('hidden', false);

        var keys = Object.keys(dayValues).sort();
        var labels = [];
        var values = [];
        var tooltipLabels = [];

        if (currentTab === 'week') {
          var weekValues = {};
          keys.forEach(function (key) {
            var weekStart = getMonday(parseLocalDate(key));
            var weekKey = dateKey(weekStart);
            if (weekValues[weekKey] === undefined) weekValues[weekKey] = 0;
            weekValues[weekKey] += dayValues[key];
          });
          Object.keys(weekValues).sort().forEach(function (weekKey) {
            var weekStart = parseLocalDate(weekKey);
            var weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            labels.push(shortDate(weekStart) + '-' + shortDate(weekEnd));
            tooltipLabels.push(fullDate(weekStart) + '-' + fullDate(weekEnd));
            values.push(weekValues[weekKey]);
          });
        } else if (currentTab === 'month') {
          var monthValues = {};
          keys.forEach(function (key) {
            var date = parseLocalDate(key);
            var monthKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
            if (monthValues[monthKey] === undefined) monthValues[monthKey] = 0;
            monthValues[monthKey] += dayValues[key];
          });
          Object.keys(monthValues).sort().forEach(function (monthKey) {
            var date = parseLocalDate(monthKey + '-01');
            labels.push('T' + (date.getMonth() + 1) + '/' + date.getFullYear());
            tooltipLabels.push('ThÃ¡ng ' + (date.getMonth() + 1) + '/' + date.getFullYear());
            values.push(monthValues[monthKey]);
          });
        } else if (currentTab === 'quarter') {
          var quarterValues = {};
          keys.forEach(function (key) {
            var date = parseLocalDate(key);
            var quarter = Math.floor(date.getMonth() / 3) + 1;
            var quarterKey = date.getFullYear() + '-Q' + quarter;
            if (quarterValues[quarterKey] === undefined) quarterValues[quarterKey] = 0;
            quarterValues[quarterKey] += dayValues[key];
          });
          Object.keys(quarterValues).sort().forEach(function (quarterKey) {
            var parts = quarterKey.split('-Q');
            labels.push('Q' + parts[1] + '/' + parts[0]);
            tooltipLabels.push('QuÃ½ ' + parts[1] + '/' + parts[0]);
            values.push(quarterValues[quarterKey]);
          });
        } else {
          keys.forEach(function (key) {
            var date = parseLocalDate(key);
            labels.push(shortDate(date));
            tooltipLabels.push(fullDate(date));
            values.push(dayValues[key]);
          });
        }

        var total = values.reduce(function (sum, value) { return sum + value; }, 0);
        var maxValue = Math.max.apply(null, values);
        var minValue = Math.min.apply(null, values);
        var maxIndex = values.indexOf(maxValue);
        var minIndex = values.indexOf(minValue);
        var average = total / values.length;

        _progress.revenue = total;
        $('#kpi-revenue-value').attr('title', Number(total).toLocaleString('vi-VN') + ' Ä‘').text(formatRevenue(total));
        $('#qs-max-value').text(formatRevenue(maxValue));
        $('#qs-max-date').text('(' + labels[maxIndex] + ')');
        $('#qs-min-value').text(formatRevenue(minValue));
        $('#qs-min-date').text('(' + labels[minIndex] + ')');
        $('#qs-avg-value').text(formatRevenue(average));
        $('#qs-total-value').text(formatRevenue(total));

        renderChart({ labels: labels, values: values, tooltipLabels: tooltipLabels });
        renderTargetProgress();
        updateHeroSummary();
      })
      .catch(function (error) {
        console.error('[Revenue chart] Failed to load data:', error);
        setEmptyState();
      });
  }

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
          $list.html(items.slice(0, 5).map(function (item) {
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
        label: 'Doanh số thuần',
        tooltipLabels: chart.tooltipLabels
      });
    });
  }

  // ── Tuyến hôm nay từ API ──
  function loadTodayRoutes() {
    var user = {};
    try { user = JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch (e) {}
    var userName = user.UserName || '';
    if (!userName) {
      renderTasks([], 0);
      renderCareTasks([], 0);
      return Promise.resolve();
    }

    var today = new Date();
    var docDate = today.getFullYear() + '-'
      + String(today.getMonth() + 1).padStart(2, '0') + '-'
      + String(today.getDate()).padStart(2, '0');

    return Http.get(API_CONFIG.ENDPOINTS.ROUTES.YOUR_ROUTES, {
      User: userName,
      DocumentDate: docDate
    }).then(function (res) {
      var data = res.data || res;
      var routeRecords = data.records || (Array.isArray(data) ? data : []);
      var careRecords = Array.isArray(data.careItems) ? data.careItems : [];
      var seenRoutes = {};
      routeRecords = routeRecords.filter(function (item) {
        var visitId = item.VisitID || item.RouteVisitID || item.ScheduleID || '';
        var key = visitId
          ? 'visit|' + visitId
          : [item.ObjectID || '', item.RouteID || item.Tuyen || item.ThuDiTuyen || '', item.WorkDate || docDate, item.VisitOrder || item.ThuTuGhe || ''].join('|');
        if (seenRoutes[key]) return false;
        seenRoutes[key] = true;
        return true;
      });
      var routeTotal = routeRecords.length;
      var careTotal = Number.isFinite(Number(data.careTotalCount)) ? Number(data.careTotalCount) : careRecords.length;
      renderTasks(routeRecords.slice(0, 8), routeTotal);
      renderCareTasks(careRecords.slice(0, 8), careTotal);
    }).catch(function () {
      renderTasks([], 0);
      renderCareTasks([], 0);
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

  function renderCareTasks(tasks, total) {
    $('#care-total').text(total || 0);

    if (!tasks || tasks.length === 0) {
      $('#care-tasks-grid').html('<p class="visit-empty">Chưa có khách được đề xuất chăm sóc.</p>');
      return;
    }

    $('#care-tasks-grid').html(tasks.map(function (task) {
      var reasons = Array.isArray(task.reasons) ? task.reasons : [];
      var reasonText = reasons.map(function (reason) { return reason.text || reason.reasonText || reason.code || ''; }).filter(Boolean).join(' · ');
      reasonText = reasonText || task.reasonText || task.ReasonText || '';
      return '<div class="task-item">' +
        '<div class="task-name">' + (task.customerName || task.ObjectName || '') + '</div>' +
        '<div class="task-addr">' + (task.address || task.Address || task.ADDRESS || '') + '</div>' +
        (reasonText ? '<div class="care-reason">' + reasonText + '</div>' : '') +
        '</div>';
    }).join(''));
  }

  function renderTasks(tasks, total) {
    var $section = $('#route-visit-section');
    $('#route-total').text(total || 0);

    if (!tasks || tasks.length === 0) {
      $section.find('.widget-see-all').remove();
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
    var $seeAll = $section.find('.widget-see-all');
    if (total > 8 && !$seeAll.length) $section.append('<a href="#/routes" class="widget-see-all">Xem tất cả ' + total + ' điểm <span>›</span></a>');
    if (total <= 8) $seeAll.remove();
  }


  // ── Initial load ──
  loadAll();
}

// Init — called directly since in SPA mode template is already in DOM
initDashboard();
