/**
 * SalesService — doanh số và kế hoạch bán hàng
 */
const SalesService = (() => {
  const EP = API_CONFIG.ENDPOINTS.SALES;
  const EP_PLAN = API_CONFIG.ENDPOINTS.SALES_PLAN;

  function getDoanhSo(filters = {}) {
    return Http.get(EP.LIST, { q: JSON.stringify(filters) });
  }

  function getPlanList(filters = {}) {
    return Http.get(EP_PLAN.LIST, filters);
  }

  function getPlanDetail(planId) {
    return Http.get(EP_PLAN.DETAIL, { planId });
  }

  return { getDoanhSo, getPlanList, getPlanDetail };
})();
