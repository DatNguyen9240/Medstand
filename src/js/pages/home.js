function initDashboard() {
  // ── User Profile ──
  AuthService.syncUserDisplay('.header-username', '.header-avatar');

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

  // ── Render Date Inputs dùng Input component ──
  var $dateContainer = $('#revenue-date-container');
  if ($dateContainer.length) {
    $dateContainer.html(
      Input.renderDate({ label: 'Từ ngày', id: 'chart-date-from', value: currentFrom }) +
      '<span class="revenue-arrow">→</span>' +
      Input.renderDate({ label: 'Đến ngày', id: 'chart-date-to', value: currentTo })
    );
  }

  var elFrom = document.getElementById('chart-date-from');
  var elTo = document.getElementById('chart-date-to');

  // ── Load data theo dates ──
  function getFromDate() { return elFrom ? elFrom.value : defaultFrom; }
  function getToDate() { return elTo ? elTo.value : defaultTo; }

  function loadAll() {
    var fromDate = getFromDate();
    var toDate = getToDate();

    // Lưu lại vào localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify({ fromDate: fromDate, toDate: toDate }));
    } catch (e) { }

    loadStats(fromDate, toDate);
    loadChartAndRevenue(fromDate, toDate);
    loadBirthdays(fromDate, toDate);
  }

  // ── Khi thay đổi ngày → reload ──
  if (elFrom) elFrom.addEventListener('change', loadAll);
  if (elTo) elTo.addEventListener('change', loadAll);

  // ── Stats ──
  function loadStats(fromDate, toDate) {
    $('#stats-skeleton').prop('hidden', false).show();
    $('#stats-content').prop('hidden', true).hide();

    DashboardService.getInformations(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];
        var record = {};
        DASHBOARD_SCHEMA.STATS.forEach(function (item, i) {
          record[item.key] = (records[i] && records[i].Value) || '';
        });
        var stats = DASHBOARD_SCHEMA.STATS.map(function (item) {
          return { label: item.label, value: record[item.key] || '0' };
        });
        renderStats(stats);
      })
      .catch(function () { renderStats([]); })
      .finally(function () {
        $('#stats-skeleton').prop('hidden', true).hide();
        $('#stats-content').prop('hidden', false).show();
      });
  }

  // ── Chart & Revenue (Merged for 2x performance - only 1 API request) ──
  function loadChartAndRevenue(fromDate, toDate) {
    $('#chart-skeleton').prop('hidden', false).show();
    $('#revenue-chart').hide();
    $('#revenue-value').prop('hidden', true);
    $('#revenue-skeleton').prop('hidden', false);

    DashboardService.getRevenue(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];

        // 1. Tính tổng doanh thu
        var total = records.reduce(function (sum, r) { return sum + (parseFloat(r.Amount) || 0); }, 0);
        $('#revenue-value').text(Number(total).toLocaleString('vi-VN')).prop('hidden', false);

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
      })
      .catch(function () {
        $('#revenue-value').text('0').prop('hidden', false);
        renderChart({ labels: [], values: [] });
      })
      .finally(function () {
        $('#chart-skeleton').prop('hidden', true).hide();
        $('#revenue-chart').show();
        $('#revenue-skeleton').prop('hidden', true);
      });
  }

  // ── Birthdays ──
  function loadBirthdays(fromDate, toDate) {
    DashboardService.getBirthdays(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var items = data.records || (Array.isArray(data) ? data : []);
        var $list = $('#birthdays-list');

        if (!items || items.length === 0) {
          $list.html('<li class="list-item"><p class="list-title" style="padding:12px;color:var(--color-text-muted)">Hôm nay không có sinh nhật nào</p></li>');
          $('#birthday-count').prop('hidden', true);
        } else {
          $('#birthday-count').text('🎁 ' + items.length).prop('hidden', false);
          $list.html(items.map(function (item) {
            var contentHtml = DASHBOARD_SCHEMA.BIRTHDAY.displayFields
              .map(function (f) {
                var val = item[f.key] || f.placeholder || '';
                if (!val && !f.placeholder) return '';
                return '<p class="' + (f.cssClass || '') + '"' + (f.style ? ' style="' + f.style + '"' : '') + '>' + (f.icon || '') + ' ' + val + '</p>';
              })
              .join('');

            var phone = item[DASHBOARD_SCHEMA.BIRTHDAY.phoneKey] || '';

            return '<li class="list-item">' +
              '<div class="list-content">' + contentHtml + '</div>' +
              '<button type="button" class="btn-call" aria-label="Gọi" onclick="window.location.href=\'tel:' + phone + '\'">📞</button>' +
              '</li>';
          }).join(''));
        }
        $list.prop('hidden', false);
        $('#birthdays-skeleton').prop('hidden', true);
      })
      .catch(function () {
        $('#birthdays-skeleton').prop('hidden', true);
        $('#birthdays-list').html('<li class="list-item"><p class="list-title" style="padding:12px;color:var(--color-text-muted)">Không thể tải dữ liệu sinh nhật</p></li>').prop('hidden', false);
      });
  }

  // ── Initial load ──
  loadAll();
}

function renderStats(stats) {
  $('#stats-content').html(
    stats.map(function (s) {
      return '<div class="stat-card"><div class="stat-label">' + s.label + '</div><div class="stat-value">' + s.value + '</div></div>';
    }).join('')
  );
}

function renderChart(chart) {
  requestAnimationFrame(function () {
    drawLineChart('revenue-chart', chart.labels, chart.values);
  });
}

// Init — called directly since in SPA mode template is already in DOM
initDashboard();
