/**
 * Input Component
 * Cung cấp các hàm render cho các loại ô nhập liệu dùng chung toàn app.
 * Hỗ trợ trạng thái locked (khóa/tối) và clickable (sáng/chọn được).
 */
var Input = (function () {

  /**
   * Render ô nhập liệu tổng quát (Text, Email, Phone, etc.)
   */
  function renderField(config) {
    var label = config.label || '';
    var value = config.value || '';
    var placeholder = config.placeholder || '';
    var type = config.type || 'text';
    var id = config.id || '';
    var className = config.className || '';
    var isLocked = !!config.locked || !!config.readonly;
    var lockedClass = isLocked ? ' locked' : '';
    var readonlyAttr = isLocked ? ' readonly' : '';
    var requiredAttr = config.required ? ' required' : '';
    var requiredMark = config.required ? ' <span class="req">*</span>' : '';

    return '<div class="form-field ' + className + lockedClass + '">' +
      (label ? '<label>' + label + requiredMark + '</label>' : '') +
      '<input type="' + type + '" id="' + id + '" class="field-input" placeholder="' + placeholder + '" ' +
      'value="' + value + '"' + readonlyAttr + requiredAttr + '>' +
      '</div>';
  }

  /**
   * Render ô tìm kiếm (Search Bar) - Giữ nguyên cho FilterComponent
   */
  function renderSearch(config) {
    var placeholder = config.placeholder || 'Tìm kiếm';
    var value = config.value || '';
    var className = config.className || '';
    var id = config.id || '';
    var label = config.label || '';
    var iconHtml = config.icon !== false ?
      '<span class="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>' : '';

    return '<div class="form-field ' + className + '" ' + (id ? 'id="ff-' + id + '"' : '') + '>' +
      (label ? '<label>' + label + '</label>' : '') +
      '<div class="search-bar">' +
      iconHtml +
      '<input type="search" id="' + id + '" class="search-input" placeholder="' + placeholder + '" value="' + value + '">' +
      '</div>' +
      '</div>';
  }

  /**
   * Render ô chọn ngày (Date Picker)
   */
  function renderDate(config) {
    var label = config.label || '';
    var value = config.value || '';
    var className = config.className || '';
    var id = config.id || '';

    var isLocked = !!config.locked || !!config.readonly;
    var lockedClass = isLocked ? ' locked' : '';
    var readonlyAttr = isLocked ? ' readonly' : '';
    var requiredMark = config.required ? ' <span class="req">*</span>' : '';

    return '<div class="form-field ' + lockedClass + ' ' + className + '">' +
      (label ? '<label>' + label + requiredMark + '</label>' : '') +
      '<input type="date" id="' + id + '" class="field-input" value="' + value + '"' + readonlyAttr + '>' +
      '</div>';
  }

  /**
   * Render ô chọn giá trị (Select Field dùng trong Filter/Form)
   * config: { key, label, value, locked, icon, required }
   */
  function renderSelect(config) {
    var key = config.key || '';
    var label = config.label || '';
    var value = config.value || 'Tất cả';
    var isLocked = !!config.locked || !!config.readonly;
    var lockedClass = isLocked ? ' locked' : ' clickable';
    var requiredMark = config.required ? ' <span class="req">*</span>' : '';

    return '<div class="form-field ' + lockedClass + '" data-field="' + key + '">' +
      (label ? '<label>' + label + requiredMark + '</label>' : '') +
      '<div class="filter-select-item ' + lockedClass + '">' +
      '<span class="filter-select-value">' +
      '<span class="filter-value-text" data-key="' + key + '">' + value + '</span>' +
      (isLocked ? '' : '<span class="arrow">›</span>') +
      '</span>' +
      '</div>' +
      '</div>';
  }

  return {
    renderField: renderField,
    renderSearch: renderSearch,
    renderDate: renderDate,
    renderSelect: renderSelect
  };
})();
