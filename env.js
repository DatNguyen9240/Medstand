/**
 * ============================================================
 *  MEDSTAND — CẤU HÌNH MÔI TRƯỜNG
 *  File này là file DUY NHẤT cần sửa khi deploy sang server mới
 * ============================================================
 *
 *  HƯỚNG DẪN:
 *  1. Chạy Cloudflare Tunnel: cloudflared.exe tunnel --url http://localhost:5678
 *  2. Copy URL tunnel được cấp (vd: https://abc-xyz.trycloudflare.com)
 *  3. Thay vào N8N_BASE bên dưới
 *  4. Lưu file — chatbot tự cập nhật ngay (không cần sửa file nào khác)
 *
 *  VÍ DỤ:
 *  N8N_BASE: 'https://inches-ticket-script-algebra.trycloudflare.com'
 *  N8N_BASE: 'https://n8n.congtykhach.com'   ← domain riêng của khách
 * ============================================================
 */
window.APP_ENV = {

  // ── URL n8n (bắt buộc) ──────────────────────────────────────
  // Cloudflare Tunnel hoặc domain riêng của server n8n
  N8N_BASE: 'https://inches-ticket-script-algebra.trycloudflare.com',

  // ── URL backend chính (tuỳ chọn) ────────────────────────────
  // Nếu bỏ trống sẽ dùng giá trị mặc định trong api.config.js
  // API_BASE: 'https://medtest.bms79.com',

};
