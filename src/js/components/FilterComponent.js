/**
 * FilterComponent – Cash.js version
 * Search bar with filter icon + bottom sheet filter modal
 * Persists filter state per page using localStorage
 *
 * Supports async options: pass `options: []` initially, then call
 * filterInstance.setFieldOptions(key, optionsArray) when data arrives.
 */
function FilterComponent(config) {
  var self = this;
  self.config = config || {};
  self.fields = config.fields || [];
  self.values = {};
  self.labels = {};
  self.fields.forEach(function (f) {
    self.values[f.key] = f.defaultValue || '';
    self.labels[f.key] = f.defaultLabel || '';
  });

  // Default dates
  var _now = new Date();
  var _y = _now.getFullYear();
  var _m = String(_now.getMonth() + 1).padStart(2, '0');
  var _d = String(_now.getDate()).padStart(2, '0');
  self.singleDate = !!config.singleDate;
  if (self.singleDate) {
    self.dateFrom = _y + '-' + _m + '-' + _d;
    self.dateTo = self.dateFrom;
  } else {
    self.dateFrom = _y + '-' + _m + '-01';
    self.dateTo = _y + '-' + _m + '-' + _d;
  }

  // Storage key unique per page
  self._storageKey = 'filter_' + (config.storageKey || location.pathname.replace(/[^a-zA-Z0-9]/g, '_'));

  // Restore saved state
  self._restoreState();

  var $container = $(config.container);
  if (!$container.length) return;

  // Render search row immediately (no delay)
  $container.html(self._renderSearchRow());

  // Restore search input value
  if (self._savedSearch) {
    $container.find('.search-input').val(self._savedSearch);
  }

  // Build filter modal + overlay (append to body)
  self.$overlay = $('<div class="filter-overlay"></div>').appendTo('body');
  self.$modal = $('<div class="filter-modal"></div>').html(self._renderModal()).appendTo('body');
  self.$select = $('<div class="select-modal"></div>').appendTo('body');

  // Set date inputs (defaults or restored)
  if (self.singleDate) {
    var singleEl = self.$modal.find('#filter-date-single')[0];
    if (singleEl) singleEl.value = self.dateFrom;
  } else {
    var fromEl = self.$modal.find('#filter-date-from')[0];
    var toEl = self.$modal.find('#filter-date-to')[0];
    if (fromEl) fromEl.value = self.dateFrom;
    if (toEl) toEl.value = self.dateTo;
  }

  // Events
  self._bindEvents($container);

  // Always trigger initial load (with saved state if any)
  setTimeout(function () {
    if (self.config.onInit) {
      self.config.onInit({
        dateFrom: self.dateFrom,
        dateTo: self.dateTo,
        filters: Object.assign({}, self.values),
        search: self._savedSearch || ''
      });
    } else {
      if (self._savedSearch && self.config.onSearch) {
        self.config.onSearch(self._savedSearch);
      } else if (self.config.onApply) {
        self.config.onApply({
          dateFrom: self.dateFrom,
          dateTo: self.dateTo,
          filters: Object.assign({}, self.values)
        });
      }
    }
  }, 0);
}

/**
 * Update options for a field after async load
 */
FilterComponent.prototype.setFieldOptions = function (key, options) {
  var field = this.fields.find(function (f) { return f.key === key; });
  if (field) field.options = options;
};

FilterComponent.prototype._saveState = function () {
  var state = {
    values: this.values,
    labels: this.labels,
    dateFrom: this.dateFrom,
    dateTo: this.dateTo,
    search: this._savedSearch || ''
  };
  try {
    localStorage.setItem(this._storageKey, JSON.stringify(state));
  } catch (e) { /* quota exceeded */ }
};

FilterComponent.prototype._restoreState = function () {
  try {
    var raw = localStorage.getItem(this._storageKey);
    if (raw) {
      var state = JSON.parse(raw);
      this._savedSearch = state.search || '';
      if (state.dateFrom) this.dateFrom = state.dateFrom;
      if (state.dateTo) this.dateTo = state.dateTo;
      if (state.values) {
        var self = this;
        self.fields.forEach(function (f) {
          if (state.values[f.key]) self.values[f.key] = state.values[f.key];
          if (state.labels && state.labels[f.key]) self.labels[f.key] = state.labels[f.key];
        });
      }
    }
  } catch (e) { /* parse error */ }
};

FilterComponent.prototype._renderSearchRow = function () {
  return '<div class="search-filter-row">' +
    Input.renderSearch({ value: this._savedSearch || '', placeholder: 'Tìm kiếm' }) +
    '<button type="button" class="btn-filter" aria-label="Bộ lọc">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>' +
    '</button>' +
    '</div>';
};

FilterComponent.prototype._renderModal = function () {
  var self = this;
  var fieldsHtml = self.fields.map(function (f) {
    var valText = f.locked
      ? (f.defaultLabel || f.defaultValue || '')
      : (self.labels[f.key] || self.values[f.key] || 'Tất cả');

    return Input.renderSelect({
      key: f.key,
      label: f.label,
      value: valText,
      locked: f.locked
    });
  }).join('');

  var dateHtml = '';
  if (self.singleDate) {
    dateHtml = '<div class="filter-date-row">' +
      Input.renderDate({ label: 'Ngày', className: 'style="flex:1"', id: 'filter-date-single', value: self.dateFrom }) +
      '</div>';
  } else {
    dateHtml = '<div class="filter-date-row">' +
      Input.renderDate({ label: 'Từ ngày', id: 'filter-date-from', value: self.dateFrom }) +
      '<span class="filter-date-separator">→</span>' +
      Input.renderDate({ label: 'Đến ngày', id: 'filter-date-to', value: self.dateTo }) +
      '</div>';
  }

  return '<div class="filter-modal-header">' +
    '<button type="button" class="filter-modal-close" aria-label="Đóng">&times;</button>' +
    '<h3>Bộ lọc</h3>' +
    '</div>' +
    '<div class="filter-modal-body">' +
    dateHtml +
    fieldsHtml +
    '<button type="button" class="btn-filter-apply">ÁP DỤNG</button>' +
    '</div>';
};

FilterComponent.prototype._renderSelectModal = function (field) {
  return '<div class="select-modal-header">' +
    '<button type="button" class="btn-back" aria-label="Quay lại">←</button>' +
    '<h3>' + field.label + '</h3>' +
    '</div>' +
    '<div class="select-modal-search">' +
    Input.renderSearch({ placeholder: 'Tìm kiếm' }) +
    '</div>' +
    '<ul class="select-modal-list">' +
    '<li data-value="">Tất cả</li>' +
    field.options.map(function (opt) {
      var val = (typeof opt === 'object') ? opt.value : opt;
      var lbl = (typeof opt === 'object') ? opt.label : opt;
      return '<li data-value="' + val + '">' + lbl + '</li>';
    }).join('') +
    '</ul>';
};

FilterComponent.prototype._bindEvents = function ($container) {
  var self = this;

  // Open filter modal
  $container.find('.btn-filter').on('click', function () {
    self._openModal();
  });

  // Search input
  var searchTimeout;
  $container.find('.search-input').on('input', function () {
    clearTimeout(searchTimeout);
    var val = $(this).val();
    searchTimeout = setTimeout(function () {
      self._savedSearch = val;
      self._saveState();
      if (self.config.onSearch) self.config.onSearch(val);
    }, 300);
  });

  // Close modal
  self.$overlay.on('click', function () { self._closeModal(); });
  self.$modal.find('.filter-modal-close').on('click', function () { self._closeModal(); });

  // Select items -> open select modal (lazy-load options nếu có)
  self.$modal.find('.filter-select-item').on('click', function () {
    var key = $(this).closest('.form-field').attr('data-field');
    var field = self.fields.find(function (f) { return f.key === key; });
    if (!field || field.locked) return;

    // Nếu field có loadOptions và chưa load → gọi API lazy
    if (field.loadOptions && !field._loaded) {
      var $val = $(this).find('.filter-value-text');
      var oldText = $val.text();
      $val.text('Đang tải...');
      field.loadOptions(function (options) {
        field.options = options || [];
        field._loaded = true;
        $val.text(oldText);
        self._openSelectModal(field);
      });
    } else {
      self._openSelectModal(field);
    }
  });

  // Apply button
  self.$modal.find('.btn-filter-apply').on('click', function () {
    if (self.singleDate) {
      self.dateFrom = self.$modal.find('#filter-date-single').val();
      self.dateTo = self.dateFrom;
    } else {
      self.dateFrom = self.$modal.find('#filter-date-from').val();
      self.dateTo = self.$modal.find('#filter-date-to').val();
    }
    self._saveState();
    self._closeModal();
    if (typeof Http !== 'undefined' && Http.clearCache) Http.clearCache();
    if (self.config.onApply) {
      var result = { dateFrom: self.dateFrom, dateTo: self.dateTo, filters: Object.assign({}, self.values) };
      if (self.singleDate) result.date = self.dateFrom;
      self.config.onApply(result);
    }
  });
};

FilterComponent.prototype._openModal = function () {
  this.$overlay.addClass('active');
  this.$modal.addClass('active');
  $('body').css('overflow', 'hidden');
};

FilterComponent.prototype._closeModal = function () {
  this.$overlay.removeClass('active');
  this.$modal.removeClass('active');
  this.$select.removeClass('active');
  $('body').css('overflow', '');
};

FilterComponent.prototype._openSelectModal = function (field) {
  var self = this;
  self.$select.html(self._renderSelectModal(field)).addClass('active');

  // Back button
  self.$select.find('.btn-back').on('click', function () {
    self.$select.removeClass('active');
  });

  // Search within options
  self.$select.find('.search-input').on('input', function () {
    var keyword = Format.removeAccents($(this).val());
    self.$select.find('.select-modal-list li').each(function () {
      var $li = $(this);
      var text = Format.removeAccents($li.text());
      $li.css('display', text.indexOf(keyword) !== -1 ? '' : 'none');
    });
  });

  // Select option
  self.$select.find('.select-modal-list li').each(function () {
    var $li = $(this);
    if (self.values[field.key] === $li.attr('data-value')) {
      $li.addClass('selected');
    }
    $li.on('click', function () {
      var val = $li.attr('data-value');
      var displayText = $li.text();
      self.values[field.key] = val;
      self.labels[field.key] = displayText;
      self._saveState();
      self.$modal.find('.filter-value-text[data-key="' + field.key + '"]').text(displayText || 'Tất cả');
      self.$select.removeClass('active');
    });
  });
};

FilterComponent.prototype.destroy = function () {
  if (this.$overlay) this.$overlay.remove();
  if (this.$modal) this.$modal.remove();
  if (this.$select) this.$select.remove();
};
