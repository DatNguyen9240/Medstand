# 🤖 MEDSTAND AI — HƯỚNG DẪN KỊCH BẢN & API MAPPING

> Tài liệu này mô tả toàn bộ kịch bản người dùng có thể hỏi AI,
> và API SQL tương ứng cần gọi kèm tham số đầy đủ.
> AI đọc file này để biết cần EXEC procedure nào cho từng câu hỏi.

---

## THÔNG TIN CHUNG

| Tham số chung | Mô tả |
|---|---|
| `@Username` | Tên đăng nhập của người dùng (Sale/Manager/CEO) — **BẮT BUỘC** |
| `@ObjectID` | Mã khách hàng (lấy từ CF_ObjectTbl.ObjectID) — Tùy chọn |
| `@TopN` | Số kết quả trả về tối đa |

---

## MODULE 1 — AI GỢI Ý ĐƠN HÀNG
**Stored Procedure:** `API_GoiYDonHang_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@ObjectID` | VARCHAR(50) | '' | Mã khách hàng. Để trống = xem hàng bán chạy toàn chi nhánh |
| `@TopN` | INT | 10 | Số sản phẩm gợi ý tối đa |

### Kịch bản 1.1 — Hôm nay nên bán gì cho khách X?
```
Người dùng hỏi:
- "Hôm nay nên bán gì cho khách HB106?"
- "Gợi ý đơn hàng cho NT Phúc Khang"
- "Khách [TÊN/MÃ] nên mua gì?"

→ AI gọi:
EXEC API_GoiYDonHang_AI
    @Username = '{username}',
    @ObjectID = '{objectID}',
    @TopN     = 10
```

### Kịch bản 1.2 — Hàng bán chạy nhất hôm nay (không có khách cụ thể)
```
Người dùng hỏi:
- "Hôm nay nên tập trung bán gì?"
- "Sản phẩm bán chạy nhất chi nhánh?"
- "Top hàng nên đẩy hôm nay"

→ AI gọi:
EXEC API_GoiYDonHang_AI
    @Username = '{username}',
    @ObjectID = '',
    @TopN     = 10
```

### Kết quả trả về
- `ItemID`, `TenSanPham`, `DoanhSoDaMua`, `LanMuaCuoi`
- `ChuKyTrungBinh` — Chu kỳ mua trung bình (ngày)
- `SoNgayDuKienConLai` — Dự kiến bao nhiêu ngày nữa khách hết hàng
- `LyDoGoiY` — Lý do AI đề xuất (☢️ Quá hạn / ⏳ Sắp hết / 📦 Ổn định / 📅 Mùa vụ / 🎁 KM)

---

## MODULE 2 — AI QUẢN LÝ TUYẾN BÁN HÀNG
**Stored Procedure:** `API_TuyenBanHang_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@ObjectID` | VARCHAR(50) | '' | Để trống = xem tuyến tổng. Có = xem 1 khách cụ thể |
| `@SoNgayVangMat` | INT | 45 | Ngưỡng "khách mất tích" (mặc định 45 ngày) |
| `@TopN` | INT | 8 | Top khách nên ghé hôm nay |

### Kịch bản 2.1 — Hôm nay nên ghé khách nào?
```
Người dùng hỏi:
- "Hôm nay tôi nên ghé khách nào?"
- "Tuyến hôm nay của tôi"
- "Lịch ghé khách hôm nay"
- "Top 8 khách ưu tiên"

→ AI gọi:
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @ObjectID      = '',
    @SoNgayVangMat = 45,
    @TopN          = 8
```

### Kịch bản 2.2 — Kiểm tra tình trạng 1 khách cụ thể
```
Người dùng hỏi:
- "Khách HB106 có cần ghé không?"
- "Tình trạng nhà thuốc Minh Châu"
- "Khách [MÃ] còn hàng không?"

→ AI gọi:
EXEC API_TuyenBanHang_AI
    @Username = '{username}',
    @ObjectID = '{objectID}'
```

### Kịch bản 2.3 — Cảnh báo khách lâu chưa mua
```
Người dùng hỏi:
- "Khách nào lâu chưa mua hàng?"
- "Danh sách khách có nguy cơ rời bỏ"
- "Khách nào 45 ngày chưa phát sinh đơn?"

→ AI gọi: (kết quả bảng 2 của SP)
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @ObjectID      = '',
    @SoNgayVangMat = 45
```

### Kết quả trả về
- **Bảng 1:** Tuyến ghé (`DiemUuTien`, `NgayConLaiHetHang`, `LyDoGhe`)
- **Bảng 2:** Cảnh báo rời bỏ (`NhomCanhBao` 🔴/🟡, `CanhBao`)

---

## MODULE 3 — AI CHẤM ĐIỂM KHÁCH HÀNG
**Stored Procedure:** `API_ChamDiemKH_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@ObjectID` | VARCHAR(50) | '' | Để trống = danh sách. Có = chi tiết 1 khách |
| `@NhomFilter` | VARCHAR(5) | '' | Lọc theo nhóm: 'A', 'B', 'C' hoặc '' = tất cả |

### Kịch bản 3.1 — Xem toàn bộ phân loại khách hàng
```
Người dùng hỏi:
- "Phân loại khách hàng của tôi"
- "Danh sách khách VIP, ổn định, nguy cơ"
- "Chấm điểm khách hàng"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username    = '{username}',
    @ObjectID    = '',
    @NhomFilter  = ''
```

### Kịch bản 3.2 — Chỉ xem khách VIP (nhóm A)
```
Người dùng hỏi:
- "Danh sách khách VIP"
- "Khách nhóm A của tôi là ai?"
- "Top khách doanh số cao nhất"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'A'
```

### Kịch bản 3.3 — Xem khách nguy cơ rời bỏ (nhóm C)
```
Người dùng hỏi:
- "Khách nào có nguy cơ nghỉ mua?"
- "Danh sách khách nhóm C"
- "Khách 90 ngày chưa mua"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'C'
```

### Kịch bản 3.4 — Kiểm tra tình trạng 1 khách
```
Người dùng hỏi:
- "Khách HB106 thuộc nhóm nào?"
- "Cho tôi xem điểm của NT Minh Châu"
- "Xu hướng mua của khách [MÃ] thế nào?"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username = '{username}',
    @ObjectID = '{objectID}'
```

### Kết quả trả về
- `Nhom` — A / B / C
- `PhanLoai` — ⭐ VIP / 🟢 Ổn định / 🔴 Nguy cơ
- `XuHuong` — 📈 Tăng trưởng / 📉 Sụt giảm / ➡️ Ổn định / 📈 Khách mới
- `PhanTramThayDoi` — % thay đổi so với kỳ trước
- **Bảng 2:** Cảnh báo AI (`CanhBaoAI`)

---

## MODULE 4 — AI THEO DÕI CHƯƠNG TRÌNH TÍCH LŨY
**Stored Procedure:** `API_TichLuy_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@ObjectID` | VARCHAR(50) | '' | Để trống = danh sách khách sắp đạt thưởng |
| `@MucTieu` | FLOAT | 10000000 | Mức tích lũy để nhận thưởng (10 triệu) |
| `@ProgramID` | VARCHAR(50) | '' | Để trống = lấy chương trình mới nhất tự động |
| `@FromDate` | DATETIME | NULL | Để NULL = lấy từ chương trình |
| `@ToDate` | DATETIME | NULL | Để NULL = lấy từ chương trình |
| `@ItemIDs` | VARCHAR(500) | '' | Để trống = lấy SP trọng tâm từ chương trình |

### Kịch bản 4.1 — Xem tích lũy của 1 khách cụ thể
```
Người dùng hỏi:
- "Khách HB106 tích lũy được bao nhiêu rồi?"
- "NT Phúc Khang còn thiếu bao nhiêu để nhận thưởng?"
- "Tình trạng tích lũy của khách [MÃ]"

→ AI gọi:
EXEC API_TichLuy_AI
    @Username = '{username}',
    @ObjectID = '{objectID}',
    @MucTieu  = 10000000
```

### Kịch bản 4.2 — Danh sách khách sắp đạt thưởng (cho Quản lý)
```
Người dùng hỏi:
- "Khách nào sắp đạt thưởng tháng này?"
- "Danh sách khách có khả năng đạt tích lũy"
- "Tôi cần thúc đẩy khách nào để đạt chương trình?"

→ AI gọi:
EXEC API_TichLuy_AI
    @Username = '{username}',
    @ObjectID = '',
    @MucTieu  = 10000000
```

### Kết quả trả về
- **Bảng 0:** Thông tin chương trình (`TenChuongTrinh`, `FromDate`, `ToDate`)
- **Bảng 1:** Tình trạng tích lũy (`TichLuyDatDuoc`, `SoQuaDaDat`, `ConThieuChoQuaTiep`, `TrangThaiAI`)
- **Bảng 2:** Gợi ý bán thêm SP trọng tâm còn kho (chỉ khi có `@ObjectID`)

---

## MODULE 5 — AI GOOGLE CHO SALE (UPSELL + TÌM THEO TRIỆU CHỨNG)
**Stored Procedure:** `API_UpsellGoiY_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@ObjectID` | VARCHAR(50) | '' | Mã khách (để tính doanh số thiếu bao nhiêu) |
| `@MucTarget` | FLOAT | 10000000 | Mức doanh số để đạt chiết khấu/thưởng |
| `@SearchKey` | NVARCHAR(50) | '' | Từ khóa tìm kiếm theo triệu chứng: 'ho', 'sốt', 'đau đầu'... |
| `@TopN` | INT | 10 | Số SP gợi ý tối đa |

### Kịch bản 5.1 — Tìm sản phẩm theo triệu chứng (AI Google)
```
Người dùng hỏi:
- "Khách ho lâu ngày bán gì?"
- "Thuốc cho người bị sốt?"
- "Sản phẩm trị đau đầu của mình?"
- "Bổ thần kinh có gì?"

→ Trích xuất từ khóa triệu chứng → AI gọi:
EXEC API_UpsellGoiY_AI
    @Username  = '{username}',
    @SearchKey = N'{tu_khoa}',   -- Ví dụ: N'ho', N'sốt', N'đau đầu'
    @TopN      = 10
```

### Kịch bản 5.2 — Gợi ý bán thêm để khách đạt mức thưởng/chiết khấu
```
Người dùng hỏi:
- "Khách HB106 thiếu bao nhiêu để được chiết khấu?"
- "Nên bán thêm gì cho NT Minh Châu để đạt 10 triệu?"
- "Combo gợi ý cho khách [MÃ] để chốt đơn"

→ AI gọi:
EXEC API_UpsellGoiY_AI
    @Username  = '{username}',
    @ObjectID  = '{objectID}',
    @MucTarget = 10000000,
    @TopN      = 10
```

### Kịch bản 5.3 — Kết hợp cả 2 (Triệu chứng + Upsell)
```
Người dùng hỏi:
- "Khách HB106 đang hỏi thuốc ho, nên bán gì và còn thiếu bao nhiêu?"

→ AI gọi:
EXEC API_UpsellGoiY_AI
    @Username  = '{username}',
    @ObjectID  = '{objectID}',
    @MucTarget = 10000000,
    @SearchKey = N'ho',
    @TopN      = 10
```

### Kết quả trả về
- **Bảng 1:** Doanh số (`DoanhSoDaDat`, `SoTienConThieu`, `LoiNhacAI`)
- **Bảng 2:** Gợi ý SP (`GiaBan`, `TonKho`, `PriorityScore`, `LyDoGoiY`)
  - `🔍 Triệu chứng: {từ khóa} | ✅ Còn hàng`
  - `🔍 Triệu chứng: {từ khóa} | ⚠️ Hết hàng - Cần đặt thêm`
  - `🎁 Combo: Hàng khách quen`
  - `🎁 Combo: Hàng bán chạy`

---

## MODULE 6 — AI ĐỀ XUẤT CHƯƠNG TRÌNH KHUYẾN MẠI (CHO CEO)
**Stored Procedure:** `API_DeXuatKhuyenMai_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** (CEO/Quản lý) |

### Kịch bản 6.1 — Phân tích tồn kho và đề xuất khuyến mãi
```
Người dùng hỏi:
- "Sản phẩm nào nên chạy combo?"
- "Hàng nào cần xả vì cận date?"
- "Tồn kho nào đang bán chậm?"
- "CEO cần biết hàng nào cần khuyến mãi?"
- "Phân tích hàng tồn để ra chiến lược"

→ AI gọi:
EXEC API_DeXuatKhuyenMai_AI
    @Username = '{username}'
```

### Kết quả trả về
- `LoaiDeXuat`:
  - `🔴 XẢ HÀNG SÂU` — Hạn dùng < 6 tháng
  - `🟠 CHẠY COMBO` — Tồn kho cao, bán chậm > 180 ngày
  - `🟢 THEO DÕI` — Ổn định
- `ChiTietAI` — Lý do cụ thể + số ngày dự kiến còn tồn

---

## MODULE 7 — AI NHẬN DIỆN ĐƠN THUỐC TỪ ẢNH
**Stored Procedure:** `API_GoiYDonThuoc_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Keyword` | NVARCHAR(500) | '' | Danh sách tên thuốc từ đơn (cách nhau bằng dấu phẩy hoặc chấm phẩy) |

### Kịch bản 7.1 — Tìm sản phẩm thay thế từ đơn thuốc
```
Người dùng hỏi / chụp ảnh đơn thuốc có:
- "Amoxicillin, Paracetamol, Vitamin C"
- "Đơn có Cefu 500, Bromhexin"
- "Khách đang dùng Augmentin, có thay thế gì không?"

→ OCR bóc tách tên thuốc → AI gọi:
EXEC API_GoiYDonThuoc_AI
    @Keyword = N'Amoxicillin, Paracetamol, Vitamin C'
```

### Kịch bản 7.2 — Cảnh báo bán chéo tự động
```
Logic tự động trong SP:
- Phát hiện từ khóa kháng sinh (Amox, Cefu, Kháng sinh...)
  → Tự động gợi ý Men vi sinh
  → Hiển thị: ⚠️ AI CẢNH BÁO: Đơn có Kháng sinh → Tư vấn thêm Men vi sinh!

- Không có kháng sinh:
  → Gợi ý sản phẩm tăng đề kháng (Vitamin, Canxi, Sâm...)
  → Hiển thị: 💡 GỢI Ý BÁN THÊM: Sản phẩm tăng đề kháng hỗ trợ phục hồi nhanh
```

### Kết quả trả về
- **Bảng 1:** SP Medstand thay thế (`ItemID`, `ItemName`, `Unit`, `LyDoGoiY`)
- **Bảng 2:** Cảnh báo bán chéo (`ItemID`, `ItemName`, `CanhBaoAI`)

---

## BẢNG TRA CỨU NHANH — AI ROUTING

| Câu hỏi người dùng | Module | API cần gọi |
|---|---|---|
| "Hôm nay bán gì cho khách X?" | Module 1 | `API_GoiYDonHang_AI` + @ObjectID |
| "Hàng bán chạy nhất hôm nay?" | Module 1 | `API_GoiYDonHang_AI` không @ObjectID |
| "Hôm nay ghé khách nào?" | Module 2 | `API_TuyenBanHang_AI` không @ObjectID |
| "Khách nào lâu chưa mua?" | Module 2 | `API_TuyenBanHang_AI` không @ObjectID |
| "Khách X có nên ghé không?" | Module 2 | `API_TuyenBanHang_AI` + @ObjectID |
| "Khách VIP của tôi là ai?" | Module 3 | `API_ChamDiemKH_AI` @NhomFilter='A' |
| "Khách nào sắp nghỉ mua?" | Module 3 | `API_ChamDiemKH_AI` @NhomFilter='C' |
| "Phân loại khách hàng" | Module 3 | `API_ChamDiemKH_AI` không filter |
| "Khách X tích lũy bao nhiêu?" | Module 4 | `API_TichLuy_AI` + @ObjectID |
| "Ai sắp đạt thưởng tháng này?" | Module 4 | `API_TichLuy_AI` không @ObjectID |
| "Thuốc ho / sốt / đau bán gì?" | Module 5 | `API_UpsellGoiY_AI` + @SearchKey |
| "Bán thêm gì cho khách X?" | Module 5 | `API_UpsellGoiY_AI` + @ObjectID |
| "Hàng nào cần xả? Chạy combo?" | Module 6 | `API_DeXuatKhuyenMai_AI` |
| "Đơn thuốc này thay thế gì?" | Module 7 | `API_GoiYDonThuoc_AI` + @Keyword |
| "Kháng sinh → bán thêm gì?" | Module 7 | `API_GoiYDonThuoc_AI` + @Keyword |

---

## LƯU Ý QUAN TRỌNG CHO AI

1. **`@Username` luôn BẮT BUỘC** — không có Username thì không gọi được API nào.
2. **Quyền hệ thống tự động:** SP đọc `BranchID`, `CeoID`, `ManagerID` từ `SY_User` để tự lọc dữ liệu đúng phạm vi của người dùng đó — AI không cần truyền thêm.
3. **Trích xuất từ khóa triệu chứng:** Với Module 5 kịch bản tìm kiếm, AI cần bóc tách từ khóa từ câu hỏi trước khi truyền vào `@SearchKey` (ví dụ: "khách ho lâu ngày" → `@SearchKey = N'ho'`).
4. **Trích xuất tên thuốc từ ảnh:** Với Module 7, hệ thống OCR cần bóc tách tên thuốc trước, sau đó ghép thành chuỗi phân cách bằng dấu phẩy truyền vào `@Keyword`.
5. **Hiệu năng:** Tất cả SP đều dùng bảng tạm (`#`) nên tự động dọn dẹp sau khi chạy xong.
