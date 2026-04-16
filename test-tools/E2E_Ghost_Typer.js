/**
 * MEDSTAND E2E GHOST TYPER
 * Kịch bản Auto-Test cực mạnh ngay trên giao diện Chatbot UI
 * 
 * CÁCH DÙNG: Cứ copy toàn bộ và dán thẳng vào DevTools Console (F12) trên trình duyệt đang mở Web Medstand.
 */
(async function() {
    // 3. DANH SÁCH SIÊU KHỔ NHỤC KẾ: MÔ PHỎNG SẾP KHÓ TÍNH (Viết sai chính tả, lóng, gắt gỏng, tắt)
    const testCases = [
        "dt th3 nhieu", // Doanh số
        "hqa vs nay đẩy con nào v", // Hàng trọng tâm
        "tụi kh rớt âu hết r tra t xem", // Tuyến rớt
        "ds khach vip âu lôi cmn ra", // Chấm điểm KH
        "thang hb106 dc bn d r", // Tích lũy
        "nguoi ta ho tuc nguc thi ban j ms hdieu qua", // Upsell triệu chứng (Sai chính tả hdie qua)
        "đơn panadon kèm them m j de loi", // Bán kèm đơn (kèm thêm món gì để lời)
        "hàng sap out date con gi hong xa le ne", // Hàng xả cận date
        "tk a008 cn nhieu k v", // Tồn kho A008
        "coi thuoc strepsil co tphan j la s", // Thông tin sản phẩm
        "nay tu vdv j cho cha hb106 v em", // Gợi ý đơn hàng
        "coi thg duy minh no ban ra sao roi the", // Doanh số nhân viên
        "nguyen dam kh no mih bn may", // Tổng nợ khách
        "thg hb106 no dag no bn zoom dcm", // Nợ chi tiết HB106 (Kèm chửi thề dcm)
        "hb106 snag nay no co len d k v", // Đơn hàng HB106 sáng nay
        "thuoc ho dthang 3 ban ok k cha", // Doanh số món (thuốc ho)
        "xem lai di", // Câu mơ hồ (Cần AI hỏi lại)
        "tiemn tonf khaoo sanr phaamr A012 dsi", // Sai hẳn bộ gõ Telex
        "dso nv mjnh trong t3 co vỉot ko", // Typo "vỉot" -> vượt? Doanh số Minh
        "rốt cuộc là có bán dc j hnay cho nó k v?", // Khuyết chủ ngữ (Yêu cầu AI dựa history)
        "thoy t ko ranh xoa luon di", // Hành động vớ vẩn
        "coi thg nào lâu k mua lôi ra", // Tuyến rớt
        "mua nhugn thuoc t tieu duong dc tang j ko may", // Upsell + tích lũy -> Test lú AI
        "ai đang thiếu tieenf t nhieu nhat coi thu" // Công nợ
    ];

    let $input = document.getElementById('chat-input');
    let $btnSend = document.getElementById('btn-send');
    
    if (!$input || !$btnSend) {
        alert("❌ Oái! Không tìm thấy khung Chat. Sếp nhớ mở Bong bóng Chatbot ra trước nha!");
        return;
    }
    
    console.log(`%c[Ghost Typer] 🚀 KHỞI ĐỘNG CỖ MÁY E2E AUTOMATION: ${testCases.length} SCRIPTS`, "color: #10b981; font-weight: bold; font-size: 14px;");
    
    for (let i = 0; i < testCases.length; i++) {
        let q = testCases[i];
        
        console.log(`%c[Test ${i+1}/${testCases.length}] Đang châm lửa: "${q}"`, "color: #3b82f6");
        
        // Mô phỏng Gõ Phím như người thật (Bypass React/Vanilla Guards)
        $input.focus();
        $input.value = q;
        $input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Bấm gửi thay vì gõ phím ảo để tránh Xung đột (Double-triggering Stop Mode)
        if ($btnSend.disabled) $btnSend.disabled = false;
        $btnSend.click();
        
        // Nghỉ giải lao 12 giây (N8N RAG có khi mất 10s để crawl Database)
        console.log(`%c⏳ Đi dạo 12 giây chờ N8N Data luân chuyển...`, "color: #8b5cf6");
        await new Promise(r => setTimeout(r, 12000));
        
        // Kéo scrollbar xuống cuối chat để thấy kết quả rõ nhất
        let $chatMessages = document.getElementById('chat-messages');
        if($chatMessages) $chatMessages.scrollTop = $chatMessages.scrollHeight;
    }
    
    console.log(`%c[Ghost Typer] 🎉 HOÀN TẤT TOÀN BỘ KHÓA HUẤN LUYỆN!`, "color: #10b981; font-size: 16px; font-weight: bold;");
    alert("Test Giao Diện Chatbot XONG TOÀN TẬP!");
})();
