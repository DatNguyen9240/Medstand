# 🏥 BÁO CÁO KẾT QUẢ KIỂM THỬ HỒI QUY MEDSTAND AI

**Thời gian chạy:** 17:53:13 6/7/2026 (Giờ Việt Nam)

## 📊 Tóm tắt kết quả kiểm thử (Summary)

| Chỉ số | Giá trị | Tỷ lệ |
|---|---|---|
| **Tổng số kịch bản (Total)** | 9 | 100% |
| **Đạt yêu cầu (PASSED)** | **8** | 88.9% |
| **Thất bại (FAILED)** | **1** | 11.1% |
| **Cảnh báo (WARNING)** | **0** | 0.0% |
| **Bỏ qua (SKIPPED)** | **0** | 0.0% |
| **Tỷ lệ vượt qua (Pass Rate)** | **88.9%** | - |

## 📋 Chi tiết kết quả từng Test Case

| STT | Phân hệ (Suite) | Tên kịch bản (Test Case) | Trạng thái | Thời gian chạy | Kết quả chi tiết / Lý do lỗi |
|---|---|---|---|---|---|
| 1 | `chatbot` | Chatbot định danh vai trò người dùng | 🟢 **PASSED** | 350ms | Phản hồi: _"{"status":"info","message":"Dạ, Sếp là **Đoàn Văn Thế**, đang đăng nhập với vai trò **Trình dược viên** thuộc chi nhánh **MB** ạ!","data":[],"count":0,"apiCode":"ASK_CLARIFICATION"}"_ |
| 2 | `chatbot` | Lệnh nhanh @tuyen_ban_hang tự động nhận diện bối cảnh | 🟢 **PASSED** | 1426ms | Phản hồi: _"{"status":"success","message":"Tim thay 8 ket qua.","data":[{"ObjectID":"HPA200","TenCuaHang":"Hộ Kinh Doanh Nhà Thuốc 28 Cơ sở 3","ObjectName":"Hộ Kinh Doanh Nhà Thuốc 28 Cơ sở 3","Phone":"0977135881"_ |
| 4 | `chatbot` | Lệnh @tra_cuu_san_pham trả về chi tiết sản phẩm Argelomag | 🟢 **PASSED** | 1164ms | Phản hồi: _"{"status":"success","message":"Tim thay 1 ket qua.","data":[{"STT":"1","Mã sp":"A004","Sản Phẩm":"Argelomag (15 ml)","Đơn Giá":"0","Tồn Kho":0,"Thành Phần":null,"Công Dụng":null,"Đối Tượng":null,"Cách"_ |
| 6 | `chatbot` | Lệnh nhanh @bao_cao_cuoi_ngay tự động tổng hợp số liệu | 🟢 **PASSED** | 1097ms | Phản hồi: _"{"status":"success","message":"Tim thay 1 ket qua.","data":[{"STT":"1","Từ Ngày":"06/07/2026","Đến Ngày":"06/07/2026","Mã KH":"HPA191","Tên Khách Hàng":"Hiệu thuốc Thuỷ Nguyên","Doanh Số":"10,000,000""_ |
| 7 | `chatbot` | Lệnh nhanh @tich_luy tự động nhận diện bối cảnh | 🟢 **PASSED** | 2517ms | Phản hồi: _"{"status":"success","message":"Tim thay 1190 ket qua.","data":[{"ProgramID":"MOCK_CTKM_THANG5","ObjectID":"HDA107","TenCuaHang":"Nhà Thuốc Minh Nguyên","TichLuyDatDuoc":"343425000","QuaDaDat":"200 hộp"_ |
| 8 | `chatbot` | Lỗi lệnh @upsell_goi_y gợi ý bán thêm | 🟢 **PASSED** | 368ms | Phản hồi: _"{"status":"info","message":"Dạ, Sếp muốn xem gợi ý bán thêm cho nhà thuốc nào ạ?","data":[],"count":0,"apiCode":"VALIDATION_ERROR"}"_ |
| 9 | `chatbot` | Tính năng lệnh @danh_sach_cau_hoi_khao_sat chưa được cấu hình | 🟢 **PASSED** | 1030ms | Phản hồi: _"{"status":"success","message":"Tim thay 4 ket qua.","data":[{"DocumentID":"C4FB530F-DCCC-42F2-9439-8ED3C6F216A9","Title":"Khảo sát khách hàng HPA515","SoCauHoi":3,"ThoiGianLamBai":"","HanThi":"13/07/2"_ |
| 10 | `chatbot` | Tính năng Sản phẩm trọng tâm tháng (@san_pham_trong_tam) | 🔴 **FAILED** | 3388ms | Lỗi: `AI không hiển thị danh sách hàng hóa mục tiêu thúc đẩy bán hàng. Phản hồi thực tế: "{"status":"success","message":"Tim thay 108 ket qua.","data":[{"Chương Trình":"CHƯƠNG TRÌNH TRỌNG TÂM THÁNG 5 NĂM 2026","Từ Ngày":"2026-05-01T00:00:00"` |
| 11 | `chatbot` | Lệnh nhanh @cham_diem_k_h tự động nhận diện bối cảnh | 🟢 **PASSED** | 3513ms | Phản hồi: _"{"status":"success","message":"Tim thay 2466 ket qua.","data":[{"ObjectID":"BNB161","TenCuaHang":"Quầy Thuốc Thu Thủy","Phone":"0374259425","Nhom":"A","PhanLoai":"Khách VIP (Top 20%)","DiemTongHop":77"_ |

---
_Báo cáo này được tạo tự động bởi Medstand Mini Test Framework._
