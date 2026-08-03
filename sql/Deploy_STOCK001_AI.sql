:ON ERROR EXIT

:r ".\Migrate_STOCK001_Stock_Availability_AI.sql"
:r ".\Module common - API_DanhMuc_AI.sql"
:r ".\Module common - API_DanhsachTonKho_AI.sql"
:r ".\Module common - API_HangHoaList_AI.sql"
:r ".\Module 10 - API_TraCuuSanPham_AI.sql"
:r ".\Module 10 - API_TimSanPhamTheoTrieuChung_AI.sql"
:r ".\Module 8 - API_GoiYDonThuoc_AI.sql"
:r ".\Module 5 - API_UpsellGoiY_AI.sql"
:r ".\Module 1 - API_GoiYDonHang_AI.sql"
:r ".\Module 10 - API_SanPhamTrongTam_AI.sql"
:r ".\Module 6 - API_DeXuatKhuyenMai_AI.sql"
:r ".\Module common - API_DonHangChiTiet_Insert_AI.sql"

PRINT N'STOCK-001 SQL deployment completed.';
GO
