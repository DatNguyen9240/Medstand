function initDashboard() {
  $('#nav-container').html(renderNavBar('home'));

  // ── User Profile ──
  AuthService.syncUserDisplay('.header-username', '.header-avatar');

  // ── Default dates: đầu tháng → hôm nay ──
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var defaultFrom = y + '-' + m + '-01';
  var defaultTo = y + '-' + m + '-' + d;

  var elFrom = document.getElementById('chart-date-from');
  var elTo = document.getElementById('chart-date-to');
  if (elFrom) elFrom.value = defaultFrom;
  if (elTo) elTo.value = defaultTo;

  // ── Load data theo dates ──
  function getFromDate() { return elFrom ? elFrom.value : defaultFrom; }
  function getToDate() { return elTo ? elTo.value : defaultTo; }

  function loadAll() {
    var fromDate = getFromDate();
    var toDate = getToDate();
    loadStats(fromDate, toDate);
    loadChart(fromDate, toDate);
    loadRevenue(fromDate, toDate);
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

  // ── Chart ──
  function loadChart(fromDate, toDate) {
    $('#chart-skeleton').prop('hidden', false).show();
    $('#revenue-chart').hide();

    DashboardService.getChart2(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];
        var labels = records.map(function (r) { return r.LocationID || ''; });
        var values = records.map(function (r) { return parseFloat(r.Column1) || 0; });
        renderChart({ labels: labels, values: values });
      })
      .catch(function () { renderChart({ labels: [], values: [] }); })
      .finally(function () {
        $('#chart-skeleton').prop('hidden', true).hide();
        $('#revenue-chart').show();
      });
  }

  // ── Revenue ──
  function loadRevenue(fromDate, toDate) {
    $('#revenue-value').prop('hidden', true);
    $('#revenue-skeleton').prop('hidden', false);

    DashboardService.getRevenue(fromDate, toDate)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];
        var total = records.reduce(function (sum, r) { return sum + (parseFloat(r.Amount) || 0); }, 0);
        $('#revenue-value').text(Number(total).toLocaleString('vi-VN')).prop('hidden', false);
        $('#revenue-skeleton').prop('hidden', true);
      })
      .catch(function () {
        $('#revenue-value').text('0').prop('hidden', false);
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
    '<div class="stats-row">' +
    stats.map(function (s) {
      return '<div class="stat-card"><div class="stat-label">' + s.label + '</div><div class="stat-value">' + s.value + '</div></div>';
    }).join('') +
    '</div>'
  );
}

function renderChart(chart) {
  requestAnimationFrame(function () {
    drawLineChart('revenue-chart', chart.labels, chart.values);
  });
}

// Auto-init khi load
$(initDashboard);
