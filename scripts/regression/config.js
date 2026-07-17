/**
 * Cấu hình kiểm thử hồi quy Medstand Regression Test
 */
const path = require('path');

function normalizeBearerToken(value) {
    const token = String(value || '').trim();
    if (!token) return null;
    return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

const adminToken = normalizeBearerToken(process.env.UAT_ADMIN_TOKEN || process.env.UAT_MANAGER_TOKEN);
const northToken = normalizeBearerToken(process.env.UAT_NORTH_TOKEN || process.env.UAT_TDV_TOKEN || process.env.TEST_AUTH_TOKEN);

module.exports = {
    // Địa chỉ server proxy chạy local
    API_BASE: process.env.TEST_API_BASE || 'http://localhost:3000',
    
    // Địa chỉ n8n chạy local
    N8N_BASE: process.env.N8N_BASE || 'http://localhost:5678',
    
    // Không lưu API key mặc định trong source.
    CHAT_API_KEY: process.env.CHAT_API_KEY || null,
    
    // Token UAT phải được cấp tường minh qua biến môi trường; không dùng token giả mặc định.
    SIMULATED_TOKEN: northToken,

    // Cấu hình thời gian và thử lại cho các cuộc gọi AI
    TIMEOUT_MS: 30000, // 30 giây
    MAX_RETRIES: 2,

    // File paths dùng cho Static code audit
    PATHS: {
        CUSTOMER_CSS: path.join(__dirname, '../../src/css/pages/customer-management.css'),
        RAG_ADMIN_JS: path.join(__dirname, '../../src/js/pages/rag-admin.js'),
        REPORTS_DIR: path.join(__dirname, '../../reports')
    },

    // Tài khoản UAT giả định theo phân vùng địa lý để kiểm thử RLS
    ACCOUNTS: {
        NORTH: { UserName: 'NAMDINHB.MED', Role: 'Trình dược viên', Branch: 'MB', Token: northToken },
        CENTRAL: { UserName: 'HUEB.MED', Role: 'Trình dược viên', Branch: 'MT', Token: normalizeBearerToken(process.env.UAT_CENTRAL_TOKEN) },
        SOUTH: { UserName: 'CanThoA', Role: 'Trình dược viên', Branch: 'MN', Token: normalizeBearerToken(process.env.UAT_SOUTH_TOKEN) },
        ADMIN: { UserName: 'admin', Role: 'Quản trị hệ thống', Token: adminToken }
    }
};
