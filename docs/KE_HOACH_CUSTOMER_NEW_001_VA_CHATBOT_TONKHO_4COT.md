# Kế hoạch: (1) Lọc khách mới mua trong tháng — (8) Chatbot tồn kho 4 cột

**Ngày:** 07/09/2026 · **Nhánh:** `hoangdang` · **Trạng thái:** chờ chốt nghiệp vụ trước khi code

## Quyết định đã chốt với dev (07/09)
- **#8 cách sửa:** phương án **A** — thêm `@Compact` vào `API_DanhsachTonKho_AI`; **mỗi kho một dòng** (không cộng gộp).
- **#8 phạm vi:** chỉ áp cho chatbot (widget), không có trang web tồn kho.
- **#1 đầu ra:** **intent chatbot** + **trang web/report**.
- **#1 cấu hình:** giai đoạn 1 — seed bằng migration có version/hiệu lực/audit; màn hình admin để phase sau.
- Vẫn chờ C.Giang trả lời mục 1.4 (10 câu) trước khi code #1. Các câu micro của #8 (mục 8.3) dev tự chốt theo mặc định đề xuất bên dưới.

---

## PHẦN 1 — CUSTOMER-NEW-001: Lọc khách mới mua hàng trong tháng

### 1.1 Yêu cầu gốc (từ bảng của khách)
- Khách **không mua hàng** trong `01/01/2026 – 31/07/2026`, sau đó **phát sinh mua trong tháng xét** và đạt doanh số tối thiểu **600.000đ (MB)** / **500.000đ (MN)**.
- **Loại trừ:** khách mở mã mới do đổi giấy tờ / mã chung chủ với mã cũ đang chạy, hoặc trường hợp Công ty không công nhận là khách mới → gom theo cột **Code chính** trên DMKH.
- **Cấu hình:** admin đổi được kỳ "không mua" và ngưỡng doanh số theo vùng/tháng → có version, ngày hiệu lực, audit; **không hard-code** mốc tháng 08/2026.

### 1.2 Hiện trạng code (đã khảo sát)
| Thành phần | Có sẵn dùng lại được | Ghi chú |
|---|---|---|
| Gom mã chung chủ | `CF_ObjectTbl.CodeChinh` (`varchar(50)`, nullable) | pattern `COALESCE(NULLIF(TRIM(CodeChinh),''), ObjectID)` đã dùng ở `AI_ContractCustomerAssignmentFnc`. Trên medtest: 49.179 KH, **313** có CodeChinh, **196** khác ObjectID |
| Nguồn doanh số ròng | `AR_OrderAndReturnView` | có `BranchID, DocumentDate, ObjectID, Amount (ròng, gồm trả hàng), StatusID, EmployeeID/ManagerID/CeoID, ObjectGroupID`. Dữ liệu `2025-01-01 → 2026-08-23`, 374.440 dòng |
| Cấu hình có version | `AI_BusinessRuleConfigTbl` | `RuleCode/RuleVersion/ConfigKey/ConfigValue/ValueType/Status/EffectiveFrom/EffectiveTo/ApprovedBy/ApprovalReason`. Đã dùng cho `BR-STOCK-001`, `BR-TIER-005`. **Chưa có UI admin sửa** — mọi ruleset đều seed bằng migration SQL |
| Phân quyền theo Sale/QLBH | `AI_ContractCustomerAssignmentFnc`, `AI_ScopeGuardFnc` (commit b37afe3), pattern `IsGlobal/IsManager/EmployeeID` | dùng lại nguyên |
| Chức năng "khách mới" | **KHÔNG có gì** | greenfield hoàn toàn |
| Vùng khách | `CF_ObjectTbl.BranchID`: MN 23.721 · MB 16.066 · **MT 9.383** · MBONL 8 · CN 1 | yêu cầu chỉ nói MB/MN — **MT chưa có ngưỡng** |

### 1.3 Thiết kế đề xuất (sau khi chốt các câu hỏi 1.4)
1. **Ruleset mới** `BR-CUSTOMER-NEW-001` trong `AI_BusinessRuleConfigTbl`, các key:
   - `QuietWindowStart` / `QuietWindowEnd` (hoặc `QuietWindowMode = ROLLING_FROM_YEAR_START`)
   - `MinRevenue.MB` = `600000`, `MinRevenue.MN` = `500000`, `MinRevenue.MT` = `?`, `MinRevenue.DEFAULT` = `?`
   - `RevenueStatusIDs` = danh sách StatusID tính doanh số
   - `RevenueField` = `Amount` | `TotalAmount`
   - `RegionSource` = `CUSTOMER_BRANCH` | `TRANSACTION_BRANCH`
   - `ExcludeSameOwnerActive` = `1`
   - mỗi bản ghi có `EffectiveFrom` theo tháng, `Status=APPROVED`, `ApprovedBy`.
2. **Function** `dbo.AI_NewCustomerByMonthFnc(@EvalMonth DATE, @AsOfDate DATE)` — trả canonical customer đạt điều kiện, kèm `RevenueEvalMonth`, `Region`, `MinRevenueApplied`, `FirstPurchaseDate`, `EmployeeID/ManagerID`.
   - gom mọi mã theo `CodeChinh`;
   - loại canonical nào **có** giao dịch (theo định nghĩa doanh số đã chốt) trong quiet window;
   - loại canonical có mã "đang chạy" chung chủ (theo `ExcludeSameOwnerActive`);
   - giữ canonical có `SUM(Amount)` tháng xét `>= MinRevenue[Region]`.
3. **Stored proc** `dbo.API_NewCustomerMonth_AI @Username, @EvalMonth, @AsOfDate` — bọc function + lọc phạm vi Sale/QLBH/Admin, trả bảng tổng + chi tiết (giống `API_ContractCustomerStats_AI`).
4. **Cấu hình admin — giai đoạn 1 (đã chốt):** seed bằng migration `Migrate_CUSTOMER_NEW_001_AI.sql`, mỗi key có `RuleVersion`, `EffectiveFrom` theo tháng, `Status=APPROVED`, `ApprovedBy`. Đổi ngưỡng/kỳ = ra migration mới bump version. Màn hình admin CRUD để phase sau (~2–3 ngày công riêng).
5. **Đầu ra (đã chốt): cả hai**
   - intent chatbot `NEW_CUSTOMER_MONTH` / `@khach_moi_thang` → `API_NewCustomerMonth_AI`, trả tổng theo vùng + danh sách, phân quyền Sale/QLBH/Admin; thêm renderer widget.
   - trang web `#/new-customer` (mẫu theo `contract-customer.js`): bảng tổng theo vùng/Sale + danh sách chi tiết + nút xuất Excel.
6. **Verify script** `scripts/verify_new_customer_month.js` chạy medtest rollback: đối chiếu 1 tháng mẫu, in danh sách + tổng theo vùng, kiểm ca đổi mã/chung chủ, kiểm phạm vi Sale không lộ khách ngoài quyền.

### 1.4 Câu hỏi cần chốt trước khi code (gửi C.Giang)
1. **Tháng xét** = tháng dương lịch liền trước ngày chạy (rolling), hay tham số người dùng nhập?
2. **Định nghĩa doanh số:** dùng `Amount` (ròng, trước VAT?) hay `TotalAmount`? Trạng thái chứng từ nào được tính (chỉ đã giao/đã xuất hóa đơn, hay mọi đơn xác nhận)? Trừ trả hàng/chiết khấu thế nào?
3. **Test "không mua trong quiet window"** dựa trên cùng định nghĩa doanh số ở câu 2, hay chỉ cần **tồn tại bất kỳ chứng từ nào** (kể cả 0đ / hàng mẫu) là loại?
4. **Quiet window:** cố định `01/01–31/07/2026`, hay luôn là "01/01 của năm → hết tháng trước tháng xét" (rolling)? Khách phát sinh mua **năm 2025** (trước 01/01/2026) có bị loại không, hay chỉ xét trong window?
5. **Vùng MB/MN** xác định theo `BranchID` của **khách** hay theo **chi nhánh trên giao dịch**? **Khách MT (9.383)** áp ngưỡng nào? MBONL/CN?
6. **Code chính / chung chủ:**
   - gom giao dịch của mã phụ vào mã chính cho **cả** hai phép kiểm (window + tháng xét)?
   - "mã cũ đang chạy" định nghĩa sao — mã chính không `isDisable`, hay mã chính có phát sinh mua gần đây?
   - nếu `CodeChinh` trỏ tới mã không tồn tại / đã khóa thì xử lý thế nào?
7. Ngoài `CodeChinh`, có **cờ / nhóm khách** nào đánh dấu "không công nhận là khách mới" không (`isPending`, `PhanLoaiKhach`, ObjectGroup cụ thể)? Hay phần còn lại là review thủ công?
8. **Ngưỡng doanh số** xét trên **tổng tháng xét** của khách, hay từng hóa đơn, hay lũy kế từ lần mua đầu?
9. **Cấu hình admin:** Giai đoạn 1 (seed migration có version/audit, kỹ thuật áp) có chấp nhận để đóng mục này tạm thời không, hay bắt buộc có màn hình admin ngay? Ai được duyệt thay đổi cấu hình (chỉ nhóm ADMIN hay có luồng duyệt)?
10. **Đầu ra & quyền xem:** chatbot / trang web / export — cái nào? Sale chỉ thấy khách của mình, QLBH thấy nhóm, Admin thấy tất cả — đúng không? Cần cột gì khi hiển thị?

---

## PHẦN 8 — Chatbot: tồn kho chỉ hiện 4 cột (mã SP, tên SP, tên kho, tồn khả dụng)

### 8.1 Hiện trạng code (đã khảo sát)
- Intent **có sẵn**: `INVENTORY_LIST` / `ASK_PRODUCT_FOR_INVENTORY` → apiCode `@danh_sach_tonkho` → SP `dbo.API_DanhsachTonKho_AI` (quyền đọc `api.read`). Mapping ở `sql/Bootstrap_API_Metadata_Auto_AI.sql:1133`.
- SP `API_DanhsachTonKho_AI` trả **~24 cột**, **1 dòng / mỗi lô** (ItemID × Kho × Lot × ExpireDate): `ItemID, ItemName, DonViTinh, StoreHouseID, StoreHouseName, BranchID, Lot, ExpireDate, Nhap, Xuat, TonCuoi, LotPhysicalStock, PhysicalStock, NonExpiredPhysicalStock, ReservedStock, AvailableStock, WarehouseScope, StockDataStatus, StockUpdatedAt, StockAsOfAt, LatestStockMovementDate, RuleSource, RuleVersion, TrangThai`.
- Node `Format Response` (`MAIN_ChatBot_V5.json`) và `Format Execute Response` (`API_Execute.json`) **không cắt cột** — đẩy nguyên recordset vào `data[]`.
- **Layer hiển thị thật cho người dùng** là widget: `chatbot-widget/js/chatbot-renderers-medstand.js` (~dòng 1172) render bảng tồn kho **6 cột**: `Mã SP · Sản phẩm · Đơn vị tính · Tồn trong kho · Khả dụng tham khảo · Trạng thái`, kho/lô để ở dòng chi tiết ẩn. File này có bản build `chatbot.bundle.min.js` (chạy `npm run build`).
- Đã lọc sẵn nhóm HH1 (`SellableItemGroupIDs`).
- **Lưu ý:** `AvailableStock` đã theo kho (không theo lô) → các dòng lô lặp cùng một số; compact phải `DISTINCT` theo SP × kho.

### 8.1b Chốt micro (mặc định dev, đổi được)
1. "Tồn khả dụng" = `AvailableStock` của STOCK-001 (không hết hạn − đặt giữ). **Không** dùng `TonCuoi`.
2. Mỗi kho một dòng (đã chốt). Cột: `MaSP · TenSP · TenKho · TonKhaDung`.
3. `TonKhaDung <= 0` → **ẩn** ở chế độ compact.
4. Sắp xếp `TenSP, TenKho`; không giới hạn cứng (đã bị chặn bởi kho + HH1 + từ khoá).
5. Giữ lọc **chỉ HH1**.
6. `@Compact BIT = 1` mặc định (chatbot là consumer sống duy nhất). Caller nào cần đủ cột → `@Compact = 0`.

### 8.2b Các bước sửa #8 (cụ thể)
1. **`sql/Module_Common_API_DanhsachTonKho_AI.sql`**: thêm `@Compact BIT = 1`. Khi `@Compact=1` trả đúng 4 cột `MaSP, TenSP, TenKho, TonKhaDung`, `SELECT DISTINCT` theo `ItemID, StoreHouseID`, `WHERE AvailableStock > 0`, `ORDER BY TenSP, TenKho`. Khi `@Compact=0` giữ nguyên output cũ.
2. **`chatbot-widget/js/chatbot-renderers-medstand.js`**: nhánh render tồn kho khi payload là compact (nhận diện bằng có `TenKho`/`MaSP` và thiếu `TrangThai`) → bảng 4 cột `Mã SP · Tên SP · Tên kho · Tồn khả dụng`. Giữ nhánh cũ cho `@Compact=0`.
3. `npm run build` để cập nhật `chatbot.bundle.min.js`.
4. **`scripts/verify_stock_compact_ai.js`** (mới): medtest rollback — gọi `API_DanhsachTonKho_AI @Compact=1` cho 13 tài khoản, assert đúng 4 cột, mọi dòng `TonKhaDung>0`, thuộc kho trong quyền, SP HH1, không trùng (ItemID,Kho).
5. Không cần đụng `AI_Intent_Parser`/`API_Execute` nếu SP default `@Compact=1`.

### 8.2 Ba cách sửa (chọn 1)
| | Cách | Ưu | Nhược |
|---|---|---|---|
| **A** | Sửa `API_DanhsachTonKho_AI` thêm tham số `@Compact BIT = 1`: khi bật chỉ trả `MaSP, TenSP, TenKho, TonKhaDung` (DISTINCT theo SP×kho, bỏ lô) | gọn nhất, sửa 1 nơi, fix luôn lỗi lặp lô; web muốn full thì `@Compact=0` | đụng SP dùng chung (đã deploy medtest 22/08) |
| **B** | Thêm node formatter riêng cho `@danh_sach_tonkho` trong n8n (giống `Generate Symptom Response`): map 4 field + dựng text | không đụng DB | logic tồn kho rải thêm ở n8n; vẫn kéo 24 cột qua mạng |
| **C** | Tạo SP/view mỏng `API_DanhsachTonKho_AI_Compact` riêng cho chatbot | tách bạch, không đụng SP cũ | thêm một object phải bảo trì |

**Khuyến nghị: A** (một chỗ, đồng thời sửa lỗi lặp lô). Verify bằng script rollback + gọi thử 13 tài khoản như `verify_stock_branch_scope.js`.

### 8.3 Câu hỏi cần chốt (#8)
1. "Tồn khả dụng" = `AvailableStock` của STOCK-001 (tồn không hết hạn − đặt giữ) — đúng chứ? (không phải `TonCuoi`/physical)
2. Sản phẩm ở **nhiều kho** trong quyền: hiện **mỗi kho một dòng**, hay **cộng gộp 1 số** cho toàn phạm vi tài khoản?
3. Sản phẩm **tồn khả dụng = 0**: ẩn hẳn hay vẫn hiện với "hết hàng"?
4. Sắp xếp / giới hạn: top N theo tồn giảm dần? theo tên?
5. Giữ nguyên lọc **chỉ HH1**?
6. Có muốn giữ luôn bản đầy đủ cho một trang web tồn kho sau này không (quyết định làm cách A có `@Compact` hay cắt hẳn)?

---

## Đề xuất thứ tự làm
1. **#8** trước — nhỏ, chỉ chờ 6 câu hỏi mục 8.3, làm trong ~0.5 ngày.
2. **#1** — chờ C.Giang trả lời mục 1.4; sau đó: ruleset + function + SP (~2 ngày) → verify script → (tùy chọn) trang admin cấu hình giai đoạn 2.
