// ╔══════════════════════════════════════════════════════════════════════╗
// ║  STATEFUL MEMORY — Bộ nhớ hội thoại cho N8N Chatbot                ║
// ║  Chức năng: Lưu & đọc ngữ cảnh phiên chat vào/từ Redis.            ║
// ║  Tích hợp: Dán vào "Code Node" trong N8N workflow.                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════
// BLOCK A: ĐỌC CONTEXT (Đặt ở đầu workflow, trước khi gọi LLM)
// ═══════════════════════════════════════════════════════════
// Cách dùng: Thêm "Code Node" → paste đoạn này, kết nối với Redis Node
// để GET key = context_<sessionId>

const sessionId   = $input.item.json.sessionId || $input.item.json.from || 'default';
const contextKey  = `medstand_ctx_${sessionId}`;
const ttlSeconds  = 1800; // Context tồn tại 30 phút kể từ tin nhắn cuối

// Đọc context từ Redis (Redis Node GET trả về chuỗi JSON)
let ctx = {};
try {
    const raw = $input.item.json.redisValue; // Kết quả từ Redis GET Node
    if (raw) ctx = JSON.parse(raw);
} catch(e) {
    ctx = {};
}

// Lấy câu hỏi hiện tại của người dùng
const userMessage = $input.item.json.message || $input.item.json.text || '';

// ─── Giải nghĩa Reference (Xử lý "còn lại", "của nó", "khách đó"...) ───
// Nếu tin nhắn KHÔNG có MaKhachHang mới nhưng context có lưu → dùng lại
const resolvedContext = {
    MaKhachHang : extractEntity(userMessage, 'MaKhachHang') || ctx.lastMaKhachHang || '',
    MaSanPham   : extractEntity(userMessage, 'MaSanPham')   || ctx.lastMaSanPham   || '',
    lastIntent  : ctx.lastIntent  || '',
    lastQuery   : ctx.lastQuery   || '',
    sessionId   : sessionId,
    contextKey  : contextKey,
    ttlSeconds  : ttlSeconds,
};

// Helper: Trích xuất entity từ tin nhắn (đơn giản - N8N LLM sẽ làm phần nâng cao)
function extractEntity(msg, type) {
    if (type === 'MaKhachHang') {
        const match = msg.match(/KH\d{3,}/i);
        return match ? match[0].toUpperCase() : null;
    }
    if (type === 'MaSanPham') {
        const match = msg.match(/SP\d{3,}|[A-Z]{2,}\d{3,}/i);
        return match ? match[0].toUpperCase() : null;
    }
    return null;
}

return [{ json: { ...resolvedContext, originalMessage: userMessage } }];

// ═══════════════════════════════════════════════════════════
// BLOCK B: GHI CONTEXT (Đặt ở cuối workflow, sau khi Bot trả lời)
// ═══════════════════════════════════════════════════════════
// Cách dùng: Thêm "Code Node" → paste đoạn này, kết nối với Redis SET Node

/*
const sessionId   = $input.item.json.sessionId;
const contextKey  = `medstand_ctx_${sessionId}`;
const ttlSeconds  = 1800;

// Dữ liệu cần lưu lại cho lần hội thoại tiếp theo
const newContext = JSON.stringify({
    lastMaKhachHang : $input.item.json.MaKhachHang || '',
    lastMaSanPham   : $input.item.json.MaSanPham   || '',
    lastIntent      : $input.item.json.detectedIntent || '',
    lastQuery       : $input.item.json.originalMessage || '',
    updatedAt       : new Date().toISOString(),
});

// Trả về key, value, ttl để Redis SET Node sử dụng
return [{ json: {
    redisKey   : contextKey,
    redisValue : newContext,
    redisTTL   : ttlSeconds,
}}];
*/
