/**
 * Filter Fields Config — dùng chung cho tất cả các trang
 * Import file này sau api.config.js và http.js
 *
 * Usage:
 *   var filter = new FilterComponent({
 *     container: '#filter-container',
 *     fields: FilterFields.getDefault(),
 *     onApply: function (values) { ... },
 *     onSearch: function (keyword) { ... }
 *   });
 */
var FilterFields = (function () {

  function getDefault() {
    var authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return [
      {
        key: 'status', label: 'Trạng thái', options: [], loadOptions: function (cb) {
          Http.get(API_CONFIG.ENDPOINTS.FILTER.STATUSES, { q: '{}' }).then(function (res) {
            cb(((res.data || res).records || []).map(function (s) {
              return { value: s.OrderStatusID || s.StatusID || s.ID || '', label: s.StatusName || s.Name || '' };
            }).filter(function (o) { return o.label; }));
          }).catch(function () { cb([]); });
        }
      },
      {
        key: 'branch', label: 'Chi nhánh', options: [],
        defaultValue: authUser.BranchID || '',
        defaultLabel: authUser.BranchName || '',
        locked: !!authUser.BranchID,
        loadOptions: function (cb) {
          Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: '{}' }).then(function (res) {
            cb(((res.data || res).records || []).map(function (b) {
              return { value: b.BranchID || b.ID || '', label: b.BranchName || b.Name || '' };
            }).filter(function (o) { return o.label; }));
          }).catch(function () { cb([]); });
        }
      },
      {
        key: 'customer', label: 'Khách hàng', options: [], loadOptions: function (cb) {
          Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, { q: '{}' }).then(function (res) {
            cb(((res.data || res).records || []).map(function (c) {
              return { value: c.ObjectID || c.ID || '', label: c.ObjectName || c.Name || '' };
            }).filter(function (o) { return o.label; }));
          }).catch(function () { cb([]); });
        }
      },
      {
        key: 'product', label: 'Sản phẩm', options: [], loadOptions: function (cb) {
          Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, { q: '{}' }).then(function (res) {
            cb(((res.data || res).records || []).map(function (p) {
              return { value: p.ItemID || p.ID || '', label: p.ItemName || p.Name || '' };
            }).filter(function (o) { return o.label; }));
          }).catch(function () { cb([]); });
        }
      }
    ];
  }

  /**
   * Map filter values → API params
   * filterValues = { status: 'xxx', branch: 'xxx', customer: 'xxx', product: 'xxx' }
   * returns { StatusID: 'xxx', BranchID: 'xxx', ... } (only non-empty)
   */
  function toApiParams(filterValues) {
    var params = {};
    if (filterValues.status) params.StatusID = filterValues.status;
    if (filterValues.branch) params.BranchID = filterValues.branch;
    if (filterValues.customer) params.ObjectID = filterValues.customer;
    if (filterValues.product) params.ItemID = filterValues.product;
    return params;
  }

  return { getDefault: getDefault, toApiParams: toApiParams };
})();
