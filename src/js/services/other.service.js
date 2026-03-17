/**
 * RouteService — tuyến bán hàng
 */
const RouteService = (() => {
  const EP = API_CONFIG.ENDPOINTS.ROUTES;

  function getList(filters = {}) {
    return Http.get(EP.LIST, filters);
  }

  function getDetail(routeId) {
    return Http.get(EP.DETAIL, { routeId });
  }

  return { getList, getDetail };
})();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SurveyService — khảo sát
 */
const SurveyService = (() => {
  const EP = API_CONFIG.ENDPOINTS.SURVEY;

  function getList() {
    return Http.get(EP.LIST);
  }

  function getDetail(surveyId) {
    return Http.get(EP.DETAIL, { surveyId });
  }

  function submit(surveyId, answers) {
    return Http.post(EP.SUBMIT, { surveyId, answers });
  }

  function checkDailySurvey() {
    return Http.get(EP.CHECK_DAILY);
  }

  return { getList, getDetail, submit, checkDailySurvey };
})();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * FilterService — danh sách lookup cho bộ lọc (trạng thái, chi nhánh, KH, sản phẩm)
 */
const FilterService = (() => {
  const EP = API_CONFIG.ENDPOINTS.FILTER;

  function getBranches() { return Http.get(EP.BRANCHES); }
  function getCustomers(keyword = '') { return Http.get(EP.CUSTOMERS, { keyword }); }
  function getProducts(keyword = '') { return Http.get(EP.PRODUCTS, { keyword }); }
  function getStatuses() { return Http.get(EP.STATUSES); }

  return { getBranches, getCustomers, getProducts, getStatuses };
})();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * ContractService — hợp đồng / điểm tích lũy
 */
const ContractService = (() => {
  const EP = API_CONFIG.ENDPOINTS.CONTRACTS;

  function getList(filters = {}) {
    return Http.get(EP.LIST, filters);
  }

  function getDetail(contractId) {
    return Http.get(EP.DETAIL, { contractId });
  }

  return { getList, getDetail };
})();

