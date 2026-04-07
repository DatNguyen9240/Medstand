/**
 * Meta Admin Dashboard - Live Sync Version
 * Kết nối thực tế với n8n & SQL Server
 */

let activeModule = null;
let allModules = []; // Dữ liệu thật từ SQL
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

async function loadMetadata() {
    const elList = document.getElementById('moduleList');
    elList.innerHTML = '<div class="loading-spinner">Đang đồng bộ SQL...</div>';
    
    try {
        const res = await fetch(N8N_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'load_all' })
        });
        const data = await res.json();
        
        // n8n returns array of modules
        allModules = Array.isArray(data) ? data : (data.data || []);
        renderModuleList();
        
        if (allModules.length > 0) {
            selectModule(allModules[0]);
        }
    } catch (err) {
        console.error('Lỗi load metadata:', err);
        elList.innerHTML = '<div class="text-danger p-3">Không thể kết nối n8n. Vui lòng kiểm tra lại URL.</div>';
    }
}

async function saveToServer() {
    if (!activeModule || !N8N_URL) return;

    const dataToSave = {
        action: 'save',
        apiCode: document.getElementById('apiCode').value,
        apiName: document.getElementById('apiName').value,
        storedProcedure: document.getElementById('storedProcedure').value,
        category: document.getElementById('apiCategory').value,
        iconEmoji: document.getElementById('apiIcon').value
    };

    try {
        const res = await fetch(N8N_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSave)
        });
        if (res.ok) {
            alert('✅ Đã lưu cấu hình trực tiếp vào SQL Server!');
            loadMetadata(); // Reload to sync
        }
    } catch (err) {
        alert('❌ Lỗi khi lưu: ' + err.message);
    }
}

function initSettings() {
    document.getElementById('btnSettings').onclick = () => {
        const url = prompt('Nhập URL n8n Webhook của bạn:', N8N_URL);
        if (url) {
            localStorage.setItem('n8n_admin_url', url);
            N8N_URL = url;
            loadMetadata();
        }
    };
}

// --- RENDER LOGIC (GIỮ NGUYÊN TỪ BẢN TRƯỚC) ---
function renderModuleList(filter = '') {
    const elList = document.getElementById('moduleList');
    elList.innerHTML = '';
    allModules.filter(m => m.ApiName.toLowerCase().includes(filter.toLowerCase())).forEach(mod => {
        const div = document.createElement('div');
        div.className = `module-item ${activeModule?.ApiID === mod.ApiID ? 'active' : ''}`;
        div.innerHTML = `<span>${mod.IconEmoji || '📦'}</span> <span>${mod.ApiName}</span>`;
        div.onclick = () => selectModule(mod);
        elList.appendChild(div);
    });
}

function selectModule(mod) {
    activeModule = mod;
    renderModuleList();
    
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('editorContainer').style.display = 'block';
    document.getElementById('activeModuleName').innerText = `${mod.IconEmoji || '📦'} ${mod.ApiName}`;

    document.getElementById('apiCode').value = mod.ApiCode || '';
    document.getElementById('apiName').value = mod.ApiName || '';
    document.getElementById('storedProcedure').value = mod.StoredProcedure || '';
    document.getElementById('apiCategory').value = mod.Category || '';
    document.getElementById('apiIcon').value = mod.IconEmoji || '';
}

function initEvents() {
    document.getElementById('btnSave').onclick = saveToServer;
    document.getElementById('btnGenerateSQL').onclick = () => {
        // Vẫn giữ logic sinh mã SQL để người dùng xem trước nếu muốn
        alert('Tính năng đang nạp dữ liệu từ module thực tế...');
    };
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
