let revenueChartInstance = null;

function drawLineChart(canvasId, labels, values, options = {}) {
  const $canvas = $('#' + canvasId);
  if (!$canvas.length) return;

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  const canvas = $canvas[0];
  const ctx = canvas.getContext('2d');

  // Detect dark mode
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Color palette
  const primaryColor   = options.lineColor || '#3c50e0';
  const primaryRgb     = options.primaryRgb || '60, 80, 224';
  const gridColor      = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor      = isDark ? '#8a99af' : '#64748b';
  const tooltipBg      = isDark ? '#1c2536' : '#ffffff';
  const tooltipBorder  = isDark ? '#2e3a47' : '#e2e8f0';
  const tooltipText    = isDark ? '#dee4ee' : '#1c2434';

  // Vertical gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 260);
  gradient.addColorStop(0,   `rgba(${primaryRgb}, 0.30)`);
  gradient.addColorStop(0.6, `rgba(${primaryRgb}, 0.08)`);
  gradient.addColorStop(1,   `rgba(${primaryRgb}, 0.00)`);

  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: options.label || 'Doanh số',
        data: values,
        borderColor: primaryColor,
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: primaryColor,
        pointBorderWidth: 2,
        pointRadius: function (context) {
          return options.peakIndex === context.dataIndex ? 6 : (options.pointRadius || 3);
        },
        pointHoverRadius: 7,
        pointHoverBackgroundColor: primaryColor,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: options.tension === undefined ? 0.42 : options.tension
      }]
    },
    options: {
      animation: {
        duration: 700,
        easing: 'easeInOutQuart'
      },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          titleColor: tickColor,
          bodyColor: tooltipText,
          titleFont: { size: 11, weight: '500' },
          bodyFont: { size: 13, weight: '600' },
          padding: { x: 14, y: 10 },
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            title: function (items) {
              return options.tooltipLabels && options.tooltipLabels[items[0].dataIndex]
                ? options.tooltipLabels[items[0].dataIndex]
                : items[0].label;
            },
            label: function (context) {
              const v = context.parsed.y;
              if (v === null) return '';
              return new Intl.NumberFormat('vi-VN').format(v) + ' đ';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false
          },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            autoSkip: true,
            maxTicksLimit: options.maxTicksLimit || 12,
            maxRotation: options.maxRotation === undefined ? 45 : options.maxRotation,
            minRotation: options.minRotation === undefined ? 0 : options.minRotation
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor,
            drawBorder: false
          },
          border: { display: false, dash: [4, 4] },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            padding: 8,
            callback: function (value) {
              var absValue = Math.abs(value);
              if (absValue >= 1000000000) return (value / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' Tỷ';
              if (absValue >= 1000000) return (value / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' Tr';
              if (absValue >= 1000)    return (value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'k';
              return value;
            }
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
}
