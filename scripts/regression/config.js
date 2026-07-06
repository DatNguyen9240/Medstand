/**
 * Cấu hình kiểm thử hồi quy Medstand Regression Test
 */
const path = require('path');

module.exports = {
    // Địa chỉ server proxy chạy local
    API_BASE: process.env.TEST_API_BASE || 'http://localhost:3000',
    
    // Địa chỉ n8n chạy local
    N8N_BASE: process.env.N8N_BASE || 'http://localhost:5678',
    
    // Chat API Key mặc định của hệ thống
    CHAT_API_KEY: process.env.CHAT_API_KEY || 'test123456',
    
    // Giả lập token được server proxy chấp nhận
    SIMULATED_TOKEN: 'Bearer SIMULATED_SALES_TOKEN_LOCAL',

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
        NORTH: { UserName: 'NAMDINHB.MED', Role: 'Trình dược viên', Branch: 'MB' },
        CENTRAL: { UserName: 'HUEB.MED', Role: 'Trình dược viên', Branch: 'MT' },
        SOUTH: { UserName: 'CanThoA', Role: 'Trình dược viên', Branch: 'MN' },
        ADMIN: { UserName: 'admin', Role: 'Quản trị hệ thống' }
    }
};
