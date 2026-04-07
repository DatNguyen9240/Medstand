/**
 * Meta Admin Dashboard - FULL OPTION Version
 * Quản trị Metadata toàn diện: Modules, Actions, Fields, Filters
 */

let activeModule = null;
let allModules = []; 
let currentDetails = { actions: [], fields: [], filters: [] };
let N8N_URL = localStorage.getItem('n8n_admin_url') || ''; 

// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    if (N8N_URL) {
        loadMetadata();
    } else {
        alert('Vui lòng cấu hình URL n8n Webhook trong phần Cài đặt (sidebar) để bắt đầu!');
    }
    initTabs();
    initEvents();
});

// --- API FETCH LOGIC ---
async function fetchAdmin(action, body = {}) {
    if (!N8N_URL) return null;
    try {
        const res = await fetch(N8N_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...body })
        });
        return await res.json();
    } catch (err) {
        console.error(`Lỗi action ${action}:`, err);
        return null;
    }
}

async function loadMetadata() {
    const elList = document.getElementById('moduleList');
    elList.innerHTML = '<div class="loading-spinner">Đang đồng bộ...</div>';
    
    const data = await fetchAdmin('load_all');
    allModules = Array.isArray(data) ? data : (data?.data || []);
    renderModuleList();
    
    if (allModules.length > 0 && !activeModule) {
        selectModule(allModules[0]);
    }
}

async function selectModule(mod) {
    activeModule = mod;
    renderModuleList();
    
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('editorContainer').style.display = 'block';
    document.getElementById('activeModuleName').innerText = `${mod.IconEmoji || '📦'} ${mod.ApiName}`;

    // Fill Basic Info
    document.getElementById('apiCode').value = mod.ApiCode || '';
    document.getElementById('apiName').value = mod.ApiName || '';
    document.getElementById('storedProcedure').value = mod.StoredProcedure || '';
    document.getElementById('apiCategory').value = mod.Category || '';
    document.getElementById('apiIcon').value = mod.IconEmoji || '';

    // Load full details
    const details = await fetchAdmin('load_details', { apiCode: mod.ApiCode });
    if (details) {
        currentDetails.actions = details[1] || [];
        currentDetails.fields = details[2] || [];
        currentDetails.filters = details[3] || [];
        
        renderActions(currentDetails.actions);
        renderFields(currentDetails.fields);
        renderFilters(currentDetails.filters);
    }
}

// --- RENDER LOGIC ---
function renderModuleList(filter = '') {
    const elList = document.getElementById('moduleList');
    elList.innerHTML = '';
    allModules.filter(m => (m.ApiName || '').toLowerCase().includes(filter.toLowerCase())).forEach(mod => {
        const div = document.createElement('div');
        div.className = `module-item ${activeModule?.ApiCode === mod.ApiCode ? 'active' : ''}`;
        div.innerHTML = `<span>${mod.IconEmoji || '📦'}</span> <span>${mod.ApiName}</span>`;
        div.onclick = () => selectModule(mod);
        elList.appendChild(div);
    });
}

function renderFields(fields) {
    const container = document.getElementById('fieldContainer');
    container.innerHTML = fields.map(f => `
        <div class="field-card" data-code="${f.FieldCode}">
            <div class="field-card-header">
                <strong>${f.FieldCode}</strong>
                <button class="btn-icon text-danger" onclick="deleteField('${f.FieldCode}')"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="field-card-body">
                <input type="text" value="${f.FieldName}" placeholder="Tên hiển thị" onchange="updateField('${f.FieldCode}', 'FieldName', this.value)">
                <select onchange="updateField('${f.FieldCode}', 'ControlType', this.value)">
                    <option value="text" ${f.ControlType === 'text' ? 'selected' : ''}>Text</option>
                    <option value="number" ${f.ControlType === 'number' ? 'selected' : ''}>Number</option>
                    <option value="combobox" ${f.ControlType === 'combobox' ? 'selected' : ''}>Combobox</option>
                    <option value="select" ${f.ControlType === 'select' ? 'selected' : ''}>Select</option>
                    <option value="date" ${f.ControlType === 'date' ? 'selected' : ''}>Date</option>
                    <option value="hidden" ${f.ControlType === 'hidden' ? 'selected' : ''}>Hidden (System)</option>
                </select>
                <div class="field-meta">
                    <label><input type="checkbox" ${f.IsRequired ? 'checked' : ''} onchange="updateField('${f.FieldCode}', 'IsRequired', this.checked)"> Bắt buộc</label>
                    <label><input type="checkbox" ${f.IsSystemParam ? 'checked' : ''} onchange="updateField('${f.FieldCode}', 'IsSystemParam', this.checked)"> System (@)</label>
                </div>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderFilters(filters) {
    const container = document.getElementById('filterContainer');
    container.innerHTML = filters.map(f => `
        <div class="field-card filter-card" data-code="${f.FieldCode}">
            <div class="field-card-header">
                <strong>${f.FieldCode}</strong>
                <button class="btn-icon text-danger" onclick="deleteFilter('${f.FieldCode}')"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="field-card-body">
                <input type="text" value="${f.FieldName}" placeholder="Tên bộ lọc" onchange="updateFilter('${f.FieldCode}', 'FieldName', this.value)">
                <select onchange="updateFilter('${f.FieldCode}', 'ControlType', this.value)">
                    <option value="text" ${f.ControlType === 'text' ? 'selected' : ''}>Text</option>
                    <option value="date" ${f.ControlType === 'date' ? 'selected' : ''}>Date</option>
                    <option value="select" ${f.ControlType === 'select' ? 'selected' : ''}>Select</option>
                    <option value="combobox" ${f.ControlType === 'combobox' ? 'selected' : ''}>Combobox</option>
                </select>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderActions(actions) {
    const tbody = document.querySelector('#tableActions tbody');
    tbody.innerHTML = actions.map(a => `
        <tr>
            <td><input type="text" value="${a.ActionCode}" class="flat-input" disabled></td>
            <td><input type="text" value="${a.ActionName}" class="flat-input" onchange="updateAction('${a.ActionCode}', 'ActionName', this.value)"></td>
            <td>
                <select class="flat-select" onchange="updateAction('${a.ActionCode}', 'ExecutionType', this.value)">
                    <option value="QUERY" ${a.ExecutionType === 'QUERY' ? 'selected' : ''}>QUERY</option>
                    <option value="COMMAND" ${a.ExecutionType === 'COMMAND' ? 'selected' : ''}>COMMAND</option>
                    <option value="CART" ${a.ExecutionType === 'CART' ? 'selected' : ''}>CART</option>
                </select>
            </td>
            <td><input type="checkbox" ${a.IsConfirm ? 'checked' : ''} onchange="updateAction('${a.ActionCode}', 'IsConfirm', this.checked)"></td>
            <td>
                <button class="btn-icon text-danger" onclick="deleteAction('${a.ActionCode}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

// --- ACTION HANDLERS ---
async function saveBasic() {
    if (!activeModule) return;
    const res = await fetchAdmin('save', {
        apiCode: document.getElementById('apiCode').value,
        apiName: document.getElementById('apiName').value,
        storedProcedure: document.getElementById('storedProcedure').value,
        category: document.getElementById('apiCategory').value,
        iconEmoji: document.getElementById('apiIcon').value
    });
    if (res) alert('✅ Đã lưu thông tin module!');
    loadMetadata();
}

async function deleteModule() {
    if (!activeModule || !confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa toàn bộ Module ${activeModule.ApiCode}? Hành động này không thể hoàn tác.`)) return;
    const res = await fetchAdmin('delete_module', { apiCode: activeModule.ApiCode });
    if (res) {
        alert('🗑️ Đã xóa module thành công!');
        activeModule = null;
        loadMetadata();
    }
}

// Fields CRUD
async function updateField(fieldCode, prop, val) {
    const field = currentDetails.fields.find(f => f.FieldCode === fieldCode);
    if (!field) return; field[prop] = val;
    await fetchAdmin('save_field', { apiCode: activeModule.ApiCode, field });
}
async function addField() {
    const code = prompt('Mã Field (vd: @MaKH):'); if (!code) return;
    const f = { FieldCode: code, FieldName: code.replace('@',''), DataType:'VARCHAR', ControlType:'text', IsRequired:0, OrderIndex: currentDetails.fields.length };
    await fetchAdmin('save_field', { apiCode: activeModule.ApiCode, field: f });
    selectModule(activeModule);
}
async function deleteField(code) {
    if (!confirm(`Xóa field ${code}?`)) return;
    await fetchAdmin('delete_field', { apiCode: activeModule.ApiCode, fieldCode: code });
    selectModule(activeModule);
}

// Filters CRUD
async function updateFilter(code, prop, val) {
    const filter = currentDetails.filters.find(f => f.FieldCode === code);
    if (!filter) return; filter[prop] = val;
    await fetchAdmin('save_filter', { apiCode: activeModule.ApiCode, filter });
}
async function addFilter() {
    const code = prompt('Mã Filter (vd: @FromDate):'); if (!code) return;
    const f = { FieldCode: code, FieldName: code.replace('@',''), DataType:'DATETIME', ControlType:'date', IsRequired:0, OrderIndex: currentDetails.filters.length };
    await fetchAdmin('save_filter', { apiCode: activeModule.ApiCode, filter: f });
    selectModule(activeModule);
}
async function deleteFilter(code) {
    if (!confirm(`Xóa bộ lọc ${code}?`)) return;
    await fetchAdmin('delete_filter', { apiCode: activeModule.ApiCode, fieldCode: code });
    selectModule(activeModule);
}

// Actions CRUD
async function updateAction(code, prop, val) {
    const action = currentDetails.actions.find(a => a.ActionCode === code);
    if (!action) return; action[prop] = val;
    await fetchAdmin('save_action', { apiCode: activeModule.ApiCode, actionData: action });
}
async function addAction() {
    const code = prompt('Mã Action (vd: VIEW, INSERT):'); if (!code) return;
    const a = { ActionCode: code, ActionName: code, ExecutionType:'QUERY', IsConfirm:0, IsDefault:0, OrderIndex:0 };
    await fetchAdmin('save_action', { apiCode: activeModule.ApiCode, actionData: a });
    selectModule(activeModule);
}
async function deleteAction(code) {
    if (!confirm(`Xóa action ${code}?`)) return;
    await fetchAdmin('delete_action', { apiCode: activeModule.ApiCode, actionData: { ActionCode: code } });
    selectModule(activeModule);
}

// --- TẠO MỚI MODULE ---
function prepareNewModule() {
    const newCode = prompt('Nhập Mã API mới (phải bắt đầu bằng @):', '@');
    if (!newCode || !newCode.startsWith('@')) return alert('Mã API không hợp lệ!');
    
    activeModule = { ApiCode: newCode, ApiName: 'Module Mới', Category: 'CORE', IconEmoji: '📦' };
    selectModule(activeModule);
    saveBasic(); // Tạo record trống trên server
}

function initEvents() {
    document.getElementById('btnSave').onclick = saveBasic;
    document.getElementById('btnAddField').onclick = addField;
    document.getElementById('btnAddFilter').onclick = addFilter;
    document.getElementById('btnAddAction').onclick = addAction;
    document.getElementById('btnNewModule').onclick = prepareNewModule;
    document.getElementById('searchModule').oninput = (e) => renderModuleList(e.target.value);
    
    // Nút xóa module (thêm vào UI qua console nếu chưa có trong HTML)
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-ghost text-danger';
    delBtn.innerHTML = '<i data-lucide="trash-2"></i> Xóa Module';
    delBtn.onclick = deleteModule;
    document.querySelector('.top-bar .actions').prepend(delBtn);
    lucide.createIcons();
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
        };
    });
}

function initSettings() {
    document.getElementById('btnSettings').onclick = () => {
        const url = prompt('Nhập URL n8n Webhook Admin Metadata:', N8N_URL);
        if (url) {
            localStorage.setItem('n8n_admin_url', url);
            N8N_URL = url;
            loadMetadata();
        }
    };
}
