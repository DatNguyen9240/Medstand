/**
 * DashboardService — stats, revenue, chart, birthdays
 */
const DashboardService = (() => {
  const EP = API_CONFIG.ENDPOINTS.DASHBOARD;

  function getStats(fromDate, toDate) {
    return Http.get(EP.STATS, { q: JSON.stringify({ FromDate: fromDate, ToDate: toDate }) });
  }

  function getRevenue(fromDate, toDate) {
    return Http.get(EP.CHART1, { q: JSON.stringify({ FromDate: fromDate, ToDate: toDate }) });
  }


  function getChart2(fromDate, toDate) {
    return Http.get(EP.CHART2, { q: JSON.stringify({ FromDate: fromDate, ToDate: toDate }) });
  }

  function getRevenueChart(fromDate, toDate) {
    return Http.get(EP.REVENUE, { q: JSON.stringify({ FromDate: fromDate, ToDate: toDate }) });
  }

  function getOrders(fromDate, toDate) {
    return Http.get(API_CONFIG.ENDPOINTS.ORDERS.LIST, { q: JSON.stringify({ FromDate: fromDate, ToDate: toDate }) });
  }

  function getBirthdays() {
    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return Http.get(EP.BIRTHDAYS, {
      q: JSON.stringify({
        User: user.UserName || '',
        BranchID: user.BranchID || '',
        CeoID: user.CeoID || '',
        ManagerID: user.ManagerID || '',
        EmployeeID: user.EmployeeID || ''
      })
    });
  }

  function getInformations(fromDate, toDate) {
    return Http.get(EP.INFORMATIONS, { q: JSON.stringify({ FromDate: fromDate, ToDate: toDate }) });
  }

  return { getStats, getRevenue, getChart2, getRevenueChart, getOrders, getBirthdays, getInformations };
})();
