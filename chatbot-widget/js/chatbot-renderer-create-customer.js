// ============================================================
//  Medstand — Renderer: CREATE_CUSTOMER (CORE-002 + CORE-003)
//  Khung nhập liệu tạo khách hàng trong bong bóng chat.
//
//  Load SAU chatbot.js và chatbot-renderers-medstand.js:
//    <script src="chatbot-renderers-medstand.js"></script>
//    <script src="chatbot-renderer-create-customer.js"></script>
//
//  Phụ thuộc global:
//    - ApiChatbot (chatbot.js)
//    - Http (app.bundle.min.js / auth.bundle.min.js)
//    - API_CONFIG (env.js)
// ============================================================
(function () {
    'use strict';

    // Guard
    if (typeof window.ApiChatbot === 'undefined' || typeof window.ApiChatbot.registerRenderer !== 'function') {
        console.error('[CreateCustomer] ApiChatbot chưa sẵn sàng. Hãy load chatbot.js trước.');
        return;
    }

    var h = window.ApiChatbot.helpers;
    var _cfg = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};
    var _endpoints = (_cfg.ENDPOINTS || {});
    var _filterEp = _endpoints.FILTER || {};
    var _aiEp = _endpoints.AI || {};
    var _custEp = _endpoints.CUSTOMER || {};

    // ── Cache cho cascade dropdowns ──────────────────────────────
    var _provincesCache = null;
    var _districtsCache = {};
    var _wardsCache = {};

    // ── Trạng thái các form đang mở (tránh submit form cũ) ──────
    var _activeForms = {};

    // ── Hàm tiện ích ─────────────────────────────────────────────
    function _esc(s) { return h.esc(String(s || '')); }

    function _uuid() {
        // Sinh UUID v4 đơn giản cho Idempotency-Key
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function _cleanPhone(raw) {
        // Bỏ . ␣ - _ , theo SP API_KhachHang_Insert
        return String(raw || '').replace(/[.\s\-_,]/g, '');
    }

    function _getUser() {
        try { return JSON.parse(localStorage.getItem('auth_user') || '{}'); }
        catch (_) { return {}; }
    }

    // ── API helper: dùng Http global (đi qua gateway, đã mã hoá) ─
    function _apiGet(endpoint, params) {
        if (typeof Http !== 'undefined' && Http.get) {
            return Http.get(endpoint, params);
        }
        // Fallback: fetch trực tiếp (không mã hoá — chỉ dùng khi Http chưa load)
        var qs = new URLSearchParams(params || {}).toString();
        var url = endpoint + (qs ? '?' + qs : '');
        return fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + h.getToken()
            }
        }).then(function (r) { return r.json(); });
    }

    function _apiPost(endpoint, body, idempotencyKey) {
        if (typeof Http !== 'undefined' && Http.post) {
            return Http.post(endpoint, body, idempotencyKey ? { idempotencyKey: idempotencyKey } : {});
        }
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + h.getToken() };
        if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
        return fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    // ── Load dữ liệu cascade ────────────────────────────────────
    function _loadProvinces(cb) {
        if (_provincesCache) { cb(_provincesCache); return; }
        var user = _getUser();
        _apiGet(_filterEp.PROVINCES || '/api/API_TinhThanh', {
            q: JSON.stringify({ User: user.UserName || '', LocationID: '', SearchText: '' })
        }).then(function (res) {
            var records = (res.data || res).records || res.data || res || [];
            _provincesCache = Array.isArray(records) ? records.map(function (r) {
                return { value: r.LocationID || '', label: r.LocationName || r.LocationID || '' };
            }) : [];
            cb(_provincesCache);
        }).catch(function () { cb([]); });
    }

    function _loadDistricts(provinceId, cb) {
        if (!provinceId) { cb([]); return; }
        if (_districtsCache[provinceId]) { cb(_districtsCache[provinceId]); return; }
        var user = _getUser();
        _apiGet(_filterEp.DISTRICTS || '/api/API_QuanHuyen', {
            q: JSON.stringify({ User: user.UserName || '', LocationID: provinceId, QuanHuyen: '', SearchText: '' })
        }).then(function (res) {
            var records = (res.data || res).records || res.data || res || [];
            _districtsCache[provinceId] = Array.isArray(records) ? records.map(function (r) {
                return { value: r.QuanHuyen || '', label: r.QuanHuyen || '' };
            }) : [];
            cb(_districtsCache[provinceId]);
        }).catch(function () { cb([]); });
    }

    function _loadWards(provinceId, districtId, cb) {
        if (!provinceId) { cb([]); return; }
        var key = provinceId + '|' + (districtId || '');
        if (_wardsCache[key]) { cb(_wardsCache[key]); return; }
        var user = _getUser();
        _apiGet(_filterEp.WARDS || '/api/API_PhuongXa', {
            q: JSON.stringify({ User: user.UserName || '', LocationID: provinceId, QuanHuyen: districtId || '', XaPhuong: '', SearchText: '' })
        }).then(function (res) {
            var records = (res.data || res).records || res.data || res || [];
            _wardsCache[key] = Array.isArray(records) ? records.map(function (r) {
                return { value: r.XaPhuong || '', label: r.XaPhuong || '' };
            }) : [];
            cb(_wardsCache[key]);
        }).catch(function () { cb([]); });
    }

    // ── Searchable Dropdown builder (thuần HTML/JS) ──────────────
    function _buildDropdownHtml(fieldId, formId, label, placeholder, required) {
        var reqMark = required ? ' <span style="color:var(--color-danger)">*</span>' : '';
        return '<div class="ccf-field" data-field="' + fieldId + '">'
            + '<label class="ccf-label">' + _esc(label) + reqMark + '</label>'
            + '<div class="ccf-dropdown" id="' + formId + '-dd-' + fieldId + '">'
            + '<input type="text" class="ccf-dd-input" placeholder="' + _esc(placeholder) + '" autocomplete="off"'
            + ' data-value="" readonly />'
            + '<div class="ccf-dd-list" style="display:none"></div>'
            + '</div>'
            + '<div class="ccf-error" style="display:none"></div>'
            + '</div>';
    }

    function _initDropdown(formEl, formId, fieldId, options) {
        var dd = formEl.querySelector('#' + formId + '-dd-' + fieldId);
        if (!dd) return;
        var input = dd.querySelector('.ccf-dd-input');
        var list = dd.querySelector('.ccf-dd-list');
        if (!input || !list) return;

        input.removeAttribute('readonly');

        function render(filter) {
            var f = (filter || '').toLowerCase();
            var html = '';
            var count = 0;
            for (var i = 0; i < options.length && count < 50; i++) {
                var opt = options[i];
                if (f && opt.label.toLowerCase().indexOf(f) === -1) continue;
                html += '<div class="ccf-dd-item" data-val="' + _esc(opt.value) + '">' + _esc(opt.label) + '</div>';
                count++;
            }
            if (!html) html = '<div class="ccf-dd-empty">Không tìm thấy</div>';
            list.innerHTML = html;
        }

        input.addEventListener('focus', function () {
            render(input.value);
            list.style.display = '';
        });

        input.addEventListener('input', function () {
            input.setAttribute('data-value', ''); // Clear selection on type
            render(input.value);
            list.style.display = '';
        });

        list.addEventListener('click', function (e) {
            var item = e.target.closest('.ccf-dd-item');
            if (!item) return;
            input.value = item.textContent;
            input.setAttribute('data-value', item.getAttribute('data-val') || '');
            list.style.display = 'none';
            // Trigger change event for cascade
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function (e) {
            if (!dd.contains(e.target)) {
                list.style.display = 'none';
            }
        });
    }

    function _setDropdownValue(formEl, formId, fieldId, value, label) {
        var dd = formEl.querySelector('#' + formId + '-dd-' + fieldId);
        if (!dd) return;
        var input = dd.querySelector('.ccf-dd-input');
        if (!input) return;
        input.value = label || value || '';
        input.setAttribute('data-value', value || '');
    }

    function _getDropdownValue(formEl, formId, fieldId) {
        var dd = formEl.querySelector('#' + formId + '-dd-' + fieldId);
        if (!dd) return '';
        var input = dd.querySelector('.ccf-dd-input');
        return input ? (input.getAttribute('data-value') || '') : '';
    }

    function _getDropdownLabel(formEl, formId, fieldId) {
        var dd = formEl.querySelector('#' + formId + '-dd-' + fieldId);
        if (!dd) return '';
        var input = dd.querySelector('.ccf-dd-input');
        return input ? (input.value || '') : '';
    }

    function _clearDropdown(formEl, formId, fieldId) {
        _setDropdownValue(formEl, formId, fieldId, '', '');
        var dd = formEl.querySelector('#' + formId + '-dd-' + fieldId);
        if (dd) {
            var list = dd.querySelector('.ccf-dd-list');
            if (list) list.innerHTML = '';
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  MAIN RENDERER: CREATE_CUSTOMER
    // ══════════════════════════════════════════════════════════════
    function _renderCreateCustomerForm(rows, headerMsg, apiCode, meta) {
        var formId = 'ccf-' + h.nextId() + '-' + Date.now();
        var idempotencyKey = _uuid();
        var metaData = (meta && meta.responseMetadata) ? meta.responseMetadata : (meta || {});

        // Dữ liệu suy từ n8n response
        var objectGroups = metaData.objectGroups || [];
        var employees = metaData.employees || [];
        var isManager = !!metaData.isManager;
        var userBranch = metaData.userBranch || '';

        // ── BUILD FORM HTML ──────────────────────────────────────
        var html = '';
        html += '<div class="ccf-container" id="' + formId + '" data-state="form" data-idempotency="' + idempotencyKey + '">';

        // Header với thanh tiêu đề nhẹ và nút (-) (✕)
        html += '<div class="ccf-header">'
            + '<div class="ccf-header-left">'
            + '<span class="ccf-icon">👤</span>'
            + '<div>'
            + '<div class="ccf-title">Thêm khách hàng mới</div>'
            + '<div class="ccf-subtitle">Khung tạo khách hàng Medstand AI</div>'
            + '</div>'
            + '</div>'
            + '<div class="ccf-header-controls">'
            + '<button type="button" class="ccf-ctrl-btn ccf-btn-min" id="' + formId + '-btn-min" title="Thu gọn">−</button>'
            + '<button type="button" class="ccf-ctrl-btn ccf-btn-close" id="' + formId + '-btn-close" title="Đóng">✕</button>'
            + '</div>'
            + '</div>';

        // Form section
        html += '<div class="ccf-form-section" id="' + formId + '-form">';

        // 1. Tên khách hàng
        html += '<div class="ccf-field" data-field="name">'
            + '<label class="ccf-label">Tên khách hàng <span style="color:var(--color-danger)">*</span></label>'
            + '<input type="text" class="ccf-input" id="' + formId + '-name" maxlength="150" placeholder="VD: Nhà thuốc An Bình" />'
            + '<div class="ccf-error" style="display:none"></div>'
            + '</div>';

        // 2. Số điện thoại
        html += '<div class="ccf-field" data-field="phone">'
            + '<label class="ccf-label">Số điện thoại <span style="color:var(--color-danger)">*</span></label>'
            + '<input type="tel" class="ccf-input" id="' + formId + '-phone" maxlength="50" inputmode="numeric" pattern="[0-9]*" placeholder="VD: 0901234567" />'
            + '<div class="ccf-error" style="display:none"></div>'
            + '</div>';

        // Mã số thuế: bắt buộc và chỉ nhận chữ số.
        html += '<div class="ccf-field" data-field="tax">'
            + '<label class="ccf-label">Mã số thuế <span style="color:var(--color-danger)">*</span></label>'
            + '<input type="text" class="ccf-input" id="' + formId + '-tax" maxlength="13" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="VD: 0312345678" />'
            + '<div class="ccf-error" style="display:none"></div>'
            + '</div>';

        // 3. Tỉnh/Thành phố (searchable dropdown)
        html += _buildDropdownHtml('province', formId, 'Tỉnh/Thành phố', 'Chọn tỉnh/thành phố', true);

        // 4. Quận/Huyện (cascade)
        html += _buildDropdownHtml('district', formId, 'Quận/Huyện', 'Chọn quận/huyện', true);

        // 5. Phường/Xã (cascade)
        html += _buildDropdownHtml('ward', formId, 'Phường/Xã', 'Chọn phường/xã', true);

        // 6. Địa chỉ cụ thể
        html += '<div class="ccf-field" data-field="address">'
            + '<label class="ccf-label">Địa chỉ cụ thể <span style="color:var(--color-danger)">*</span></label>'
            + '<input type="text" class="ccf-input" id="' + formId + '-address" maxlength="250" placeholder="VD: 12 Lê Lợi, Phường 1" />'
            + '<div class="ccf-error" style="display:none"></div>'
            + '</div>';

        // 7. Ngày sinh — API_KhachHang_Insert yêu cầu có giá trị
        html += '<div class="ccf-field" data-field="birthday">'
            + '<label class="ccf-label">Ngày sinh <span style="color:var(--color-danger)">*</span></label>'
            + '<input type="text" class="ccf-input" id="' + formId + '-birthday" maxlength="10" placeholder="dd/mm/yyyy" />'
            + '<div class="ccf-error" style="display:none"></div>'
            + '</div>';

        // 8. Nhóm đối tượng — quyết định theo CORE-001 mục 5
        if (objectGroups.length === 1) {
            // Sale có 1 nhóm → tự lấy, không hỏi
            html += '<input type="hidden" id="' + formId + '-group-value" value="' + _esc(objectGroups[0].value || objectGroups[0].ObjectGroupID || '') + '" />';
            html += '<input type="hidden" id="' + formId + '-group-label" value="' + _esc(objectGroups[0].label || objectGroups[0].ObjectGroupName || '') + '" />';
        } else if (objectGroups.length > 1) {
            // Sale có nhiều nhóm → cho chọn
            html += _buildDropdownHtml('group', formId, 'Nhóm đối tượng', 'Chọn nhóm', true);
        }
        // Nếu objectGroups rỗng → sẽ báo FORBIDDEN khi submit

        // 9. Manager: giao cho sale nào
        if (isManager && employees.length > 0) {
            html += _buildDropdownHtml('employee', formId, 'Giao cho nhân viên', 'Chọn nhân viên phụ trách', true);
        }

        // Buttons
        html += '<div class="ccf-actions">'
            + '<button class="ccf-btn ccf-btn-preview" id="' + formId + '-btn-preview">Xem lại</button>'
            + '</div>';

        html += '</div>'; // end form-section

        // Preview section (hidden by default)
        html += '<div class="ccf-preview-section" id="' + formId + '-preview" style="display:none">'
            + '<div class="ccf-preview-body" id="' + formId + '-preview-body"></div>'
            + '<div class="ccf-actions">'
            + '<button class="ccf-btn ccf-btn-secondary" id="' + formId + '-btn-edit">✏️ Sửa lại</button>'
            + '<button class="ccf-btn ccf-btn-submit" id="' + formId + '-btn-submit">✅ Xác nhận gửi</button>'
            + '</div>'
            + '</div>';

        // Result section (hidden by default)
        html += '<div class="ccf-result-section" id="' + formId + '-result" style="display:none"></div>';

        html += '</div>'; // end container

        // ── POST-RENDER: attach events ───────────────────────────
        setTimeout(function () {
            var formEl = document.getElementById(formId);
            if (!formEl) return;

            _activeForms[formId] = true;

            // ── Birthday auto-format dd/mm/yyyy ──────────────────
            var birthdayInput = formEl.querySelector('#' + formId + '-birthday');
            if (birthdayInput) {
                birthdayInput.addEventListener('input', function () {
                    var v = this.value.replace(/[^0-9]/g, '').substring(0, 8);
                    if (v.length > 4) v = v.substring(0, 2) + '/' + v.substring(2, 4) + '/' + v.substring(4);
                    else if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
                    this.value = v;
                });
            }

            ['phone', 'tax'].forEach(function (field) {
                var numericInput = formEl.querySelector('#' + formId + '-' + field);
                if (!numericInput) return;
                numericInput.addEventListener('input', function () {
                    this.value = this.value.replace(/[^0-9]/g, '');
                });
                numericInput.addEventListener('keydown', function (event) {
                    if (event.key.length === 1 && !/[0-9]/.test(event.key)) event.preventDefault();
                });
            });

            // ── Load và init tỉnh dropdown ───────────────────────
            _loadProvinces(function (options) {
                _initDropdown(formEl, formId, 'province', options);
            });

            // ── Cascade: tỉnh → quận ────────────────────────────
            var provinceDd = formEl.querySelector('#' + formId + '-dd-province');
            if (provinceDd) {
                var provinceInput = provinceDd.querySelector('.ccf-dd-input');
                if (provinceInput) {
                    provinceInput.addEventListener('change', function () {
                        var provinceId = this.getAttribute('data-value') || '';
                        // Reset quận và phường
                        _clearDropdown(formEl, formId, 'district');
                        _clearDropdown(formEl, formId, 'ward');
                        if (provinceId) {
                            _loadDistricts(provinceId, function (options) {
                                _initDropdown(formEl, formId, 'district', options);
                            });
                        }
                    });
                }
            }

            // ── Cascade: quận → phường ───────────────────────────
            var districtDd = formEl.querySelector('#' + formId + '-dd-district');
            if (districtDd) {
                var districtInput = districtDd.querySelector('.ccf-dd-input');
                if (districtInput) {
                    districtInput.addEventListener('change', function () {
                        var provinceId = _getDropdownValue(formEl, formId, 'province');
                        var districtId = this.getAttribute('data-value') || '';
                        _clearDropdown(formEl, formId, 'ward');
                        if (provinceId && districtId) {
                            _loadWards(provinceId, districtId, function (options) {
                                _initDropdown(formEl, formId, 'ward', options);
                            });
                        }
                    });
                }
            }

            // ── Init nhóm đối tượng dropdown (nếu nhiều nhóm) ───
            if (objectGroups.length > 1) {
                var groupOptions = objectGroups.map(function (g) {
                    return { value: g.value || g.ObjectGroupID || '', label: g.label || g.ObjectGroupName || '' };
                });
                _initDropdown(formEl, formId, 'group', groupOptions);
            }

            // ── Init nhân viên dropdown (nếu manager) ────────────
            if (isManager && employees.length > 0) {
                var empOptions = employees.map(function (e) {
                    return { value: e.value || e.EmployeeID || '', label: e.label || e.EmployeeName || '' };
                });
                _initDropdown(formEl, formId, 'employee', empOptions);

                // Nếu sale chỉ có một nhóm thì chọn sẵn nhóm đó. Sale có nhiều
                // nhóm vẫn phải để manager chọn, và server kiểm tra lại cả hai.
                var employeeDropdown = formEl.querySelector('#' + formId + '-dd-employee .ccf-dd-input');
                if (employeeDropdown) {
                    employeeDropdown.addEventListener('change', function () {
                        var selectedEmployeeId = employeeDropdown.getAttribute('data-value') || '';
                        var selectedEmployee = employees.find(function (e) {
                            return String(e.value || e.EmployeeID || '') === selectedEmployeeId;
                        });
                        var employeeGroupId = selectedEmployee && (selectedEmployee.ObjectGroupID || selectedEmployee.objectGroupID || '');
                        if (!employeeGroupId) return;
                        var group = objectGroups.find(function (g) {
                            return String(g.value || g.ObjectGroupID || '') === String(employeeGroupId);
                        });
                        if (group) {
                            _setDropdownValue(
                                formEl,
                                formId,
                                'group',
                                employeeGroupId,
                                group.label || group.ObjectGroupName || employeeGroupId
                            );
                        }
                    });
                }
            }

            // ── NÚT "XEM LẠI" ───────────────────────────────────
            var btnPreview = formEl.querySelector('#' + formId + '-btn-preview');
            if (btnPreview) {
                btnPreview.addEventListener('click', function () {
                    if (!_activeForms[formId]) return;
                    var errors = _validateForm(formEl, formId, objectGroups, isManager, employees);
                    if (errors.length > 0) {
                        _showErrors(formEl, formId, errors);
                        return;
                    }
                    _clearErrors(formEl);
                    _showPreview(formEl, formId, objectGroups, isManager);
                });
            }

            // ── NÚT "SỬA LẠI" ───────────────────────────────────
            var btnEdit = formEl.querySelector('#' + formId + '-btn-edit');
            if (btnEdit) {
                btnEdit.addEventListener('click', function () {
                    if (!_activeForms[formId]) return;
                    formEl.querySelector('#' + formId + '-form').style.display = '';
                    formEl.querySelector('#' + formId + '-preview').style.display = 'none';
                    formEl.setAttribute('data-state', 'form');
                });
            }

            // ── NÚT "XÁC NHẬN GỬI" (CORE-003) ──────────────────
            var btnSubmit = formEl.querySelector('#' + formId + '-btn-submit');
            if (btnSubmit) {
                btnSubmit.addEventListener('click', function () {
                    if (!_activeForms[formId]) return;
                    _submitForm(formEl, formId, idempotencyKey, objectGroups, isManager, employees, userBranch);
                });
            }

            // ── NÚT "THU GỌN / MỞ RỘNG" (-) ───────────────────
            var btnMin = formEl.querySelector('#' + formId + '-btn-min');
            if (btnMin) {
                btnMin.addEventListener('click', function () {
                    var formSec = formEl.querySelector('#' + formId + '-form');
                    var prevSec = formEl.querySelector('#' + formId + '-preview');
                    var resSec = formEl.querySelector('#' + formId + '-result');
                    var isMin = formEl.getAttribute('data-minimized') === 'true';
                    if (isMin) {
                        formEl.setAttribute('data-minimized', 'false');
                        btnMin.textContent = '−';
                        btnMin.title = 'Thu gọn';
                        var state = formEl.getAttribute('data-state') || 'form';
                        if (state === 'preview' && prevSec) prevSec.style.display = '';
                        else if (state === 'done' && resSec) resSec.style.display = '';
                        else if (formSec) formSec.style.display = '';
                    } else {
                        formEl.setAttribute('data-minimized', 'true');
                        btnMin.textContent = '+';
                        btnMin.title = 'Mở rộng';
                        if (formSec) formSec.style.display = 'none';
                        if (prevSec) prevSec.style.display = 'none';
                        if (resSec) resSec.style.display = 'none';
                    }
                });
            }

            // ── NÚT "ĐÓNG" (✕) ──────────────────────────────────
            var btnClose = formEl.querySelector('#' + formId + '-btn-close');
            if (btnClose) {
                btnClose.addEventListener('click', function () {
                    if (!_activeForms[formId] || confirm('Bạn có muốn đóng khung tạo khách hàng này?')) {
                        formEl.style.display = 'none';
                        _activeForms[formId] = false;
                    }
                });
            }

        }, 80);

        return html;
    }

    // ── VALIDATE ─────────────────────────────────────────────────
    function _validateForm(formEl, formId, objectGroups, isManager, employees) {
        var errors = [];

        var name = (formEl.querySelector('#' + formId + '-name') || {}).value || '';
        if (!name.trim()) errors.push({ field: 'name', msg: 'Vui lòng nhập tên khách hàng' });

        var rawPhone = (formEl.querySelector('#' + formId + '-phone') || {}).value || '';
        var phone = _cleanPhone(rawPhone);
        if (!phone) errors.push({ field: 'phone', msg: 'Vui lòng nhập số điện thoại' });
        else if (!/^\d{10,11}$/.test(phone)) errors.push({ field: 'phone', msg: 'Số điện thoại phải gồm 10–11 chữ số' });

        var tax = (formEl.querySelector('#' + formId + '-tax') || {}).value || '';
        if (!/^\d{10,13}$/.test(tax)) errors.push({ field: 'tax', msg: 'Mã số thuế phải gồm 10–13 chữ số' });

        var province = _getDropdownValue(formEl, formId, 'province');
        if (!province) errors.push({ field: 'province', msg: 'Vui lòng chọn tỉnh/thành phố' });

        var district = _getDropdownValue(formEl, formId, 'district');
        if (!district) errors.push({ field: 'district', msg: 'Vui lòng chọn quận/huyện' });

        var ward = _getDropdownValue(formEl, formId, 'ward');
        if (!ward) errors.push({ field: 'ward', msg: 'Vui lòng chọn phường/xã' });

        var address = (formEl.querySelector('#' + formId + '-address') || {}).value || '';
        if (!address.trim()) errors.push({ field: 'address', msg: 'Vui lòng nhập địa chỉ' });

        // Ngày sinh bắt buộc theo contract của API_KhachHang_Insert
        var birthday = (formEl.querySelector('#' + formId + '-birthday') || {}).value || '';
        if (!birthday) {
            errors.push({ field: 'birthday', msg: 'Vui lòng nhập ngày sinh' });
        } else {
            var parts = birthday.split('/');
            if (parts.length !== 3 || parts[2].length !== 4) {
                errors.push({ field: 'birthday', msg: 'Ngày sinh phải theo định dạng dd/mm/yyyy' });
            } else {
                var d = parseInt(parts[0], 10), m = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
                var testDate = new Date(y, m - 1, d);
                if (testDate.getFullYear() !== y || testDate.getMonth() !== m - 1 || testDate.getDate() !== d) {
                    errors.push({ field: 'birthday', msg: 'Ngày sinh không hợp lệ' });
                }
            }
        }

        // Nhóm đối tượng
        if (objectGroups.length === 0) {
            errors.push({ field: 'group', msg: 'Tài khoản chưa được gán nhóm đối tượng. Không thể tạo khách.' });
        } else if (objectGroups.length > 1) {
            var group = _getDropdownValue(formEl, formId, 'group');
            if (!group) errors.push({ field: 'group', msg: 'Vui lòng chọn nhóm đối tượng' });
        }

        // Manager phải chọn nhân viên
        if (isManager && employees && employees.length > 0) {
            var emp = _getDropdownValue(formEl, formId, 'employee');
            if (!emp) errors.push({ field: 'employee', msg: 'Vui lòng chọn nhân viên phụ trách' });
        }

        return errors;
    }

    function _showErrors(formEl, formId, errors) {
        _clearErrors(formEl);
        for (var i = 0; i < errors.length; i++) {
            var err = errors[i];
            var fieldEl = formEl.querySelector('.ccf-field[data-field="' + err.field + '"]');
            if (fieldEl) {
                fieldEl.classList.add('ccf-has-error');
                var errDiv = fieldEl.querySelector('.ccf-error');
                if (errDiv) {
                    errDiv.textContent = err.msg;
                    errDiv.style.display = '';
                }
            }
        }
        // Scroll to first error
        var firstErr = formEl.querySelector('.ccf-has-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function _clearErrors(formEl) {
        var fields = formEl.querySelectorAll('.ccf-has-error');
        for (var i = 0; i < fields.length; i++) {
            fields[i].classList.remove('ccf-has-error');
            var errDiv = fields[i].querySelector('.ccf-error');
            if (errDiv) {
                errDiv.textContent = '';
                errDiv.style.display = 'none';
            }
        }
    }

    // ── PREVIEW ──────────────────────────────────────────────────
    function _showPreview(formEl, formId, objectGroups, isManager) {
        var name = (formEl.querySelector('#' + formId + '-name') || {}).value || '';
        var rawPhone = (formEl.querySelector('#' + formId + '-phone') || {}).value || '';
        var phone = _cleanPhone(rawPhone);
        var tax = (formEl.querySelector('#' + formId + '-tax') || {}).value || '';
        var provinceLabel = _getDropdownLabel(formEl, formId, 'province');
        var districtLabel = _getDropdownLabel(formEl, formId, 'district');
        var wardLabel = _getDropdownLabel(formEl, formId, 'ward');
        var address = (formEl.querySelector('#' + formId + '-address') || {}).value || '';
        var birthday = (formEl.querySelector('#' + formId + '-birthday') || {}).value || '';

        var groupLabel = '';
        if (objectGroups.length === 1) {
            groupLabel = (formEl.querySelector('#' + formId + '-group-label') || {}).value || objectGroups[0].label || objectGroups[0].ObjectGroupName || '';
        } else if (objectGroups.length > 1) {
            groupLabel = _getDropdownLabel(formEl, formId, 'group');
        }

        var empLabel = '';
        if (isManager) {
            empLabel = _getDropdownLabel(formEl, formId, 'employee');
        }

        var previewHtml = '<div class="ccf-preview-card">';
        previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Tên khách hàng</span><span class="ccf-preview-value">' + _esc(name) + '</span></div>';
        previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Số điện thoại</span><span class="ccf-preview-value">' + _esc(phone) + '</span></div>';
        previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Mã số thuế</span><span class="ccf-preview-value">' + _esc(tax) + '</span></div>';
        previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Địa chỉ</span><span class="ccf-preview-value">' + _esc(address) + ', ' + _esc(wardLabel) + ', ' + _esc(districtLabel) + ', ' + _esc(provinceLabel) + '</span></div>';
        if (birthday) {
            previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Ngày sinh</span><span class="ccf-preview-value">' + _esc(birthday) + '</span></div>';
        }
        if (groupLabel) {
            previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Nhóm đối tượng</span><span class="ccf-preview-value">' + _esc(groupLabel) + '</span></div>';
        }
        if (empLabel) {
            previewHtml += '<div class="ccf-preview-row"><span class="ccf-preview-label">Nhân viên phụ trách</span><span class="ccf-preview-value">' + _esc(empLabel) + '</span></div>';
        }
        previewHtml += '</div>';

        previewHtml += '<div class="ccf-preview-notice">⚠️ Khi xác nhận, khách hàng sẽ được tạo ngay và có thể dùng cho các nghiệp vụ tiếp theo.</div>';

        var previewBody = formEl.querySelector('#' + formId + '-preview-body');
        if (previewBody) previewBody.innerHTML = previewHtml;

        formEl.querySelector('#' + formId + '-form').style.display = 'none';
        formEl.querySelector('#' + formId + '-preview').style.display = '';
        formEl.setAttribute('data-state', 'preview');
    }

    // ── SUBMIT (CORE-003) ────────────────────────────────────────
    function _submitForm(formEl, formId, idempotencyKey, objectGroups, isManager, employees, userBranch) {
        var btnSubmit = formEl.querySelector('#' + formId + '-btn-submit');
        var btnEdit = formEl.querySelector('#' + formId + '-btn-edit');
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = '⏳ Đang gửi…'; }
        if (btnEdit) btnEdit.disabled = true;

        var user = _getUser();
        var name = (formEl.querySelector('#' + formId + '-name') || {}).value || '';
        var rawPhone = (formEl.querySelector('#' + formId + '-phone') || {}).value || '';
        var phone = _cleanPhone(rawPhone);
        var tax = (formEl.querySelector('#' + formId + '-tax') || {}).value || '';
        var provinceId = _getDropdownValue(formEl, formId, 'province');
        var districtId = _getDropdownValue(formEl, formId, 'district');
        var wardId = _getDropdownValue(formEl, formId, 'ward');
        var address = (formEl.querySelector('#' + formId + '-address') || {}).value || '';
        var birthday = (formEl.querySelector('#' + formId + '-birthday') || {}).value || '';

        // Chuyển dd/mm/yyyy → yyyy-mm-dd cho SQL
        var birthdayISO = '';
        if (birthday && birthday.length === 10) {
            var parts = birthday.split('/');
            if (parts.length === 3) birthdayISO = parts[2] + '-' + parts[1] + '-' + parts[0];
        }

        // Nhóm đối tượng
        var groupId = '';
        if (objectGroups.length === 1) {
            groupId = (formEl.querySelector('#' + formId + '-group-value') || {}).value || '';
        } else if (objectGroups.length > 1) {
            groupId = _getDropdownValue(formEl, formId, 'group');
        }

        // Server kiểm tra nhân viên được chọn có thuộc quyền manager và nhóm
        // khách có thực sự thuộc sale đó trước khi ghi SaleID.
        var assignedEmployeeId = isManager ? _getDropdownValue(formEl, formId, 'employee') : '';

        var payload = {
            User: user.UserName || '',
            ObjectID: '',           // SP sinh NEWID()
            ObjectName: name,
            Address: address,
            Phone: phone,
            TaxCode: tax,
            Birthday: birthdayISO,
            LoaiKhachHang: '',      // Giai đoạn 1 gửi rỗng (chờ ERP clarification)
            KenhBan: '',            // Giai đoạn 1 gửi rỗng
            AccountNoHD: '',
            AccountNameHD: '',
            ChuTaiKhoan: '',
            BranchID: userBranch || user.BranchID || user.branchId || '',
            ObjectGroupID: groupId,
            LocationID: provinceId,
            QuanHuyen: districtId,
            XaPhuong: wardId,
            ThuDiTuyen: '',         // Giai đoạn 1 gửi rỗng
            Latitude: 0,
            Longitude: 0
        };
        if (assignedEmployeeId) payload.AssignedEmployeeID = assignedEmployeeId;

        var endpoint = _aiEp.CREATE_CUSTOMER || '/api/API_KhachHang_Insert_AI';

        _apiPost(endpoint, payload, idempotencyKey)
            .then(function (res) {
                var data = res.data || res;
                var record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
                var msg = (record && record.Msg) ? record.Msg : '';
                var msgType = (record && record.MsgType !== undefined) ? record.MsgType : null;
                var objectId = (record && (record.ObjectID || record.NewObjectID || record.MaKhachHang)) || '';

                // Chỉ xác nhận thành công khi SP trả cả mã trạng thái thành công và ObjectID.
                // Response thiếu contract không chứng minh được bản ghi đã được tạo.
                if (msgType === 1 || msgType === '1') {
                    // Lỗi từ SP — có thể là trùng SĐT, validate, v.v.
                    _showResult(formEl, formId, 'error', msg || 'Có lỗi xảy ra khi tạo khách hàng.', null);
                } else if ((msgType !== 5 && msgType !== '5') || !objectId) {
                    _showResult(
                        formEl,
                        formId,
                        'error',
                        msg || 'Máy chủ chưa xác nhận tạo khách hàng. Vui lòng kiểm tra tài khoản và thử lại.',
                        null
                    );
                } else {
                    // Thành công → khách hàng đã được tạo trực tiếp.
                    var successMsg = msg || 'Đã tạo khách hàng <strong>' + _esc(name) + '</strong>.';
                    successMsg += '<br>Khách đã có thể sử dụng cho các nghiệp vụ tiếp theo.';
                    _showResult(formEl, formId, 'success', successMsg, objectId);
                    // Khoá form vĩnh viễn
                    _activeForms[formId] = false;
                }
            })
            .catch(function (err) {
                _showResult(formEl, formId, 'error', err.message || 'Không thể kết nối đến máy chủ.', null);
            })
            .finally(function () {
                if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = '✅ Xác nhận gửi'; }
                if (btnEdit) btnEdit.disabled = false;
            });
    }

    // ── SHOW RESULT ──────────────────────────────────────────────
    function _showResult(formEl, formId, type, message, objectId) {
        var resultEl = formEl.querySelector('#' + formId + '-result');
        if (!resultEl) return;

        var icon = type === 'success' ? '✅' : '❌';
        var cssClass = type === 'success' ? 'ccf-result-success' : 'ccf-result-error';

        var html = '<div class="' + cssClass + '">';
        html += '<div class="ccf-result-icon">' + icon + '</div>';
        html += '<div class="ccf-result-msg">' + message + '</div>';
        if (objectId) {
            html += '<div class="ccf-result-detail">Mã khách hàng: <code>' + _esc(objectId) + '</code></div>';
        }
        html += '</div>';

        resultEl.innerHTML = html;
        resultEl.style.display = '';

        // Ẩn preview section
        var previewEl = formEl.querySelector('#' + formId + '-preview');
        if (previewEl) previewEl.style.display = 'none';

        // Nếu thành công → ẩn luôn form
        if (type === 'success') {
            var formSection = formEl.querySelector('#' + formId + '-form');
            if (formSection) formSection.style.display = 'none';
            formEl.setAttribute('data-state', 'done');
        } else {
            // Lỗi → hiện lại nút sửa
            var previewSection = formEl.querySelector('#' + formId + '-preview');
            if (previewSection) previewSection.style.display = '';
            formEl.setAttribute('data-state', 'preview');
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  CSS — inject vào <head> một lần
    // ══════════════════════════════════════════════════════════════
    (function injectStyles() {
        if (document.getElementById('ccf-styles')) return;
        var style = document.createElement('style');
        style.id = 'ccf-styles';
        style.textContent = ''
            // Container & Header
            + '.ccf-container { max-width: 100%; font-family: var(--font-family, system-ui, sans-serif); font-size: var(--font-size-sm, 13px); background: #ffffff; border: 1px solid var(--color-border, #e2e8f0); border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); overflow: hidden; margin: 8px 0; }'
            + '.ccf-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--color-bg, #f8fafc); border-bottom: 1px solid var(--color-border, #e2e8f0); }'
            + '.ccf-header-left { display: flex; align-items: center; gap: 10px; }'
            + '.ccf-icon { font-size: 18px; background: #eef2ff; padding: 5px 7px; border-radius: 8px; }'
            + '.ccf-title { font-weight: 600; font-size: var(--font-size-base, 14px); color: var(--color-text, #1f2937); line-height: 1.2; }'
            + '.ccf-subtitle { font-size: 11px; color: var(--color-text-muted, #64748b); margin-top: 1px; }'
            + '.ccf-header-controls { display: flex; align-items: center; gap: 4px; }'
            + '.ccf-ctrl-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--color-border, #cbd5e1); background: #ffffff; color: var(--color-text, #475569); font-size: 14px; font-weight: bold; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s ease; outline: none; }'
            + '.ccf-ctrl-btn:hover { background: #f1f5f9; color: #0f172a; }'
            + '.ccf-btn-close:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }'
            + '.ccf-form-section, .ccf-preview-section, .ccf-result-section { padding: 14px; }'

            // Fields
            + '.ccf-field { margin-bottom: 10px; }'
            + '.ccf-label { display: block; font-weight: 500; margin-bottom: 3px; color: var(--color-text-secondary, #6b7280); font-size: 12px; }'
            + '.ccf-input { width: 100%; padding: 8px 10px; border: 1.5px solid var(--color-border, #d1d5db); border-radius: var(--radius-md, 8px); font-size: var(--font-size-sm, 13px); background: var(--color-surface, #fff); color: var(--color-text, #1f2937); outline: none; transition: border-color 0.15s; box-sizing: border-box; }'
            + '.ccf-input:focus { border-color: var(--color-primary, #3c50e0); }'

            // Dropdown
            + '.ccf-dropdown { position: relative; }'
            + '.ccf-dd-input { width: 100%; padding: 8px 10px; border: 1.5px solid var(--color-border, #d1d5db); border-radius: var(--radius-md, 8px); font-size: var(--font-size-sm, 13px); background: var(--color-surface, #fff); color: var(--color-text, #1f2937); outline: none; transition: border-color 0.15s; box-sizing: border-box; cursor: pointer; }'
            + '.ccf-dd-input:focus { border-color: var(--color-primary, #3c50e0); }'
            + '.ccf-dd-list { position: absolute; top: 100%; left: 0; right: 0; max-height: 180px; overflow-y: auto; background: var(--color-surface, #fff); border: 1.5px solid var(--color-border, #d1d5db); border-radius: var(--radius-md, 8px); margin-top: 2px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }'
            + '.ccf-dd-item { padding: 8px 10px; cursor: pointer; font-size: var(--font-size-sm, 13px); transition: background 0.1s; }'
            + '.ccf-dd-item:hover { background: var(--color-primary-light, #eef2ff); }'
            + '.ccf-dd-empty { padding: 8px 10px; color: var(--color-text-muted, #9ca3af); font-style: italic; }'

            // Errors
            + '.ccf-error { font-size: 11px; color: var(--color-danger, #ef4444); margin-top: 2px; }'
            + '.ccf-has-error .ccf-input, .ccf-has-error .ccf-dd-input { border-color: var(--color-danger, #ef4444); }'

            // Actions
            + '.ccf-actions { display: flex; gap: 8px; margin-top: 14px; }'
            + '.ccf-btn { flex: 1; padding: 10px 16px; border: none; border-radius: var(--radius-md, 8px); font-weight: 600; font-size: var(--font-size-sm, 13px); cursor: pointer; transition: opacity 0.15s; }'
            + '.ccf-btn:disabled { opacity: 0.5; cursor: not-allowed; }'
            + '.ccf-btn-preview { background: var(--color-primary, #3c50e0); color: #fff; }'
            + '.ccf-btn-preview:hover:not(:disabled) { opacity: 0.9; }'
            + '.ccf-btn-secondary { background: var(--color-surface, #fff); color: var(--color-text, #1f2937); border: 1.5px solid var(--color-border, #d1d5db); }'
            + '.ccf-btn-secondary:hover:not(:disabled) { background: var(--color-bg, #f9fafb); }'
            + '.ccf-btn-submit { background: var(--color-success, #22c55e); color: #fff; }'
            + '.ccf-btn-submit:hover:not(:disabled) { opacity: 0.9; }'

            // Preview
            + '.ccf-preview-card { background: var(--color-bg, #f9fafb); border-radius: var(--radius-md, 8px); padding: 12px; }'
            + '.ccf-preview-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--color-border, #e5e7eb); gap: 8px; }'
            + '.ccf-preview-row:last-child { border-bottom: none; }'
            + '.ccf-preview-label { color: var(--color-text-muted, #9ca3af); font-size: 12px; white-space: nowrap; }'
            + '.ccf-preview-value { font-weight: 500; color: var(--color-text, #1f2937); text-align: right; word-break: break-word; }'
            + '.ccf-preview-notice { margin-top: 10px; padding: 8px 10px; background: var(--color-warning-bg, #fefce8); border: 1px solid var(--color-warning, #f59e0b); border-radius: var(--radius-md, 8px); font-size: 12px; color: var(--color-text, #1f2937); }'

            // Result
            + '.ccf-result-success, .ccf-result-error { padding: 14px; border-radius: var(--radius-md, 8px); text-align: center; }'
            + '.ccf-result-success { background: var(--color-success-bg, #f0fdf4); border: 1px solid var(--color-success, #22c55e); }'
            + '.ccf-result-error { background: var(--color-danger-bg, #fef2f2); border: 1px solid var(--color-danger, #ef4444); }'
            + '.ccf-result-icon { font-size: 24px; margin-bottom: 6px; }'
            + '.ccf-result-msg { font-size: var(--font-size-sm, 13px); color: var(--color-text, #1f2937); line-height: 1.5; }'
            + '.ccf-result-detail { margin-top: 6px; font-size: 11px; color: var(--color-text-muted, #9ca3af); }'
            + '.ccf-result-detail code { background: var(--color-bg, #f3f4f6); padding: 2px 6px; border-radius: 4px; font-size: 11px; }';

        document.head.appendChild(style);
    })();

    // ── REGISTER ─────────────────────────────────────────────────
    ApiChatbot.registerRenderer('CREATE_CUSTOMER', _renderCreateCustomerForm);

    console.log('[Medstand Renderers] Đã đăng ký: CREATE_CUSTOMER');

})();
