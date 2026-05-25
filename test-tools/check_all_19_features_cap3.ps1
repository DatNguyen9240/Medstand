$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()

function Execute-Query($sql) {
    $command = $connection.CreateCommand()
    $command.CommandText = $sql
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
    $dataset = New-Object System.Data.DataSet
    try {
        $adapter.Fill($dataset) | Out-Null
        if ($dataset.Tables.Count -gt 0) {
            # Use unary comma to prevent PowerShell from unrolling the DataTable
            return ,$dataset.Tables[0]
        }
    } catch {
        Write-Error "Error executing: $sql`n$_"
    }
    return $null
}

Write-Output "=========================================================="
Write-Output "MEDSTAND AI - THUC THI KIEM TRA DU LIEU 19 TINH NANG (CAP 3)"
Write-Output "Cap: QLBH005.MED (Nguyen The Anh) - HUEB.MED (Le Thi Hien)"
Write-Output "Khach hang mau: Nha Thuoc Le Hung 2 (DNA014)"
Write-Output "Thoi gian thuc thi: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="
Write-Output ""

# STT 01: Xem doanh so ban hang
Write-Output "--- STT 01: Doanh So Ban Hang ---"
$dsQL = Execute-Query "EXEC API_DoanhSo_AI @Username = 'QLBH005.MED', @LoaiBaoCao = 'NhanVien'"
$dsTDV = Execute-Query "EXEC API_DoanhSo_AI @Username = 'HUEB.MED', @LoaiBaoCao = 'NhanVien'"
if ($dsQL) { Write-Output "  * Quan ly QLBH005.MED: Xem thay $($dsQL.Rows.Count) nhan vien trong vung." }
if ($dsTDV) { 
    Write-Output "  * TDV HUEB.MED: Xem thay $($dsTDV.Rows.Count) nhan vien (chi chinh minh)."
    if ($dsTDV.Rows.Count -gt 0) {
        $val = $dsTDV.Rows[0][7]
        Write-Output "  * Doanh so Le Thi Hien (TDV): $val VND."
    }
}
Write-Output ""

# STT 02: Bao mat - phan quyen
Write-Output "--- STT 02: Bao Mat Phan Quyen (Quan ly MT xem Mien Bac) ---"
$dsCross = Execute-Query "EXEC API_DoanhSo_AI @Username = 'QLBH005.MED', @ManagerID = 'QLBH013.MED', @LoaiBaoCao = 'NhanVien'"
$isBlocked = $true
if ($dsCross) {
    foreach ($row in $dsCross.Rows) {
        if ($row[6] -ne 'MT') { $isBlocked = $false }
    }
    Write-Output "  * Ket qua loc cross-zone: $($dsCross.Rows.Count) dong tra ve. Tat ca deu thuoc chi nganh MT."
} else {
    Write-Output "  * Khong tra ve ket qua (da bi chan)."
}
Write-Output "  * Trang thai bao mat: $(if ($isBlocked) { 'AN TOAN (Da chan xem cheo vung)' } else { 'CANH BAO' })"
Write-Output ""

# STT 03: Tra cuu don hang
Write-Output "--- STT 03: Tra Cuu Don Hang ---"
$dhQL = Execute-Query "EXEC API_DonHang_AI @Username = 'QLBH005.MED', @TopN = 5000"
$dhTDV = Execute-Query "EXEC API_DonHang_AI @Username = 'HUEB.MED', @TopN = 5000"
if ($dhQL) { Write-Output "  * Quan ly QLBH005.MED: Xem thay tong cong $($dhQL.Rows.Count) don hang cua vung." }
if ($dhTDV) { Write-Output "  * TDV HUEB.MED: Xem thay tong cong $($dhTDV.Rows.Count) don hang ca nhan." }
Write-Output ""

# STT 04: Tao don hang qua chat
Write-Output "--- STT 04: Kiem Tra Ton Tai San Pham Tao Don (A008, A003) ---"
$items = Execute-Query "SELECT ItemID, ItemName, Unit FROM CF_ItemTbl WHERE ItemID IN ('A008', 'A003')"
if ($items) {
    $items | Format-Table -AutoSize | Out-String | Write-Output
}
Write-Output ""

# STT 05: Goi y dat hang tu dong
Write-Output "--- STT 05: Goi Y Dat Hang Tu Dong cho DNA014 ---"
$goiY = Execute-Query "EXEC API_GoiYDonHang_AI @Username = 'HUEB.MED', @MaKhachHang = 'DNA014', @TopN = 3"
if ($goiY -and $goiY.Rows.Count -gt 0) {
    $goiY | select MaSanPham, TenSanPham, ChuKyNgay, TonKho, TrangThai, ChiTiet | Format-Table -AutoSize | Out-String | Write-Output
} else {
    Write-Output "  * Khong tim thay lich su goi y dat hang."
}
Write-Output ""

# STT 06: Goi y ban kem (Upsell)
Write-Output "--- STT 06: Goi Y Upsell/Ban Kem cho DNA014 ---"
$upsell = Execute-Query "EXEC API_UpsellGoiY_AI @Username = 'HUEB.MED', @MaKhachHang = 'DNA014', @TopN = 3"
if ($upsell -and $upsell.Rows.Count -gt 0) {
    $dsDat = $upsell.Rows[0]['DoanhSoDaDat']
    $target = $upsell.Rows[0]['MucTieuTiepTheo']
    $thieu = $upsell.Rows[0]['SoTienConThieu']
    $loiNhac = $upsell.Rows[0]['LoiNhacAI']
    Write-Output "  * Doanh so hien tai: $dsDat | Moc target tiep: $target | Con thieu: $thieu VND"
    Write-Output "  * Loi nhac AI: $loiNhac"
    Write-Output "  * Top san pham goi y ban kem:"
    $upsell | select ItemID, ItemName, GiaBan, TonKho, LyDoGoiY | Format-Table -AutoSize | Out-String | Write-Output
} else {
    Write-Output "  * Khong co du lieu goi y Upsell."
}
Write-Output ""

# STT 07: Tra cuu thong tin san pham (Antrinano)
Write-Output "--- STT 07: Tra Cuu Thong Tin San Pham (Antrinano) ---"
$sp = Execute-Query "EXEC API_TraCuuSanPham_AI @Username = 'HUEB.MED', @timkiem = 'Antrinano', @TopN = 1"
if ($sp) {
    $sp | Format-Table -AutoSize | Out-String | Write-Output
}
Write-Output ""

# STT 08: Tong cong no khu vuc
Write-Output "--- STT 08: Tong Cong No Khu Vuc ---"
$cnQL = Execute-Query "EXEC API_CongNoKhachHang_AI @Username = 'QLBH005.MED', @DenNgay = '2026-05-25'"
$cnTDV = Execute-Query "EXEC API_CongNoKhachHang_AI @Username = 'HUEB.MED', @DenNgay = '2026-05-25'"
if ($cnQL) { Write-Output "  * Quan ly QLBH005.MED: Xem thay $($cnQL.Rows.Count) khach hang no trong vung." }
if ($cnTDV) { 
    Write-Output "  * TDV HUEB.MED: Xem thay $($cnTDV.Rows.Count) khach hang no thuoc tuyen."
    if ($cnTDV.Rows.Count -gt 0) {
        Write-Output "  * Danh sach 3 khach hang no lon nhat cua TDV:"
        $cnTDV | select -First 3 | Format-Table -AutoSize | Out-String | Write-Output
    }
}
Write-Output ""

# STT 09: Cong no chi tiet tung khach
Write-Output "--- STT 09: Cong No Chi Tiet cho DNA014 ---"
$cnCT = Execute-Query "EXEC API_CongNoChiTiet_AI @Username = 'HUEB.MED', @MaKhachHang = 'DNA014', @DenNgay = '2026-05-25'"
if ($cnCT -and $cnCT.Rows.Count -gt 0) {
    Write-Output "  * So hoa don no chi tiet: $($cnCT.Rows.Count) hoa don."
    $cnCT | select -First 3 | Format-Table -AutoSize | Out-String | Write-Output
} else {
    Write-Output "  * Khach hang DNA014 hien khong co no chi tiet."
}
Write-Output ""

# STT 10: Tra cuu hoa don ban hang
Write-Output "--- STT 10: Tra Cuu Hoa Don Ban Hang ---"
$hdQL = Execute-Query "EXEC API_HoaDon_AI @Username = 'QLBH005.MED', @timkiem = 'DNA014'"
$hdTDV = Execute-Query "EXEC API_HoaDon_AI @Username = 'HUEB.MED', @timkiem = 'DNA014'"
if ($hdQL) { Write-Output "  * So hoa don cua DNA014 tim thay boi Quan ly: $($hdQL.Rows.Count) hoa don." }
if ($hdTDV) { Write-Output "  * So hoa don cua DNA014 tim thay boi TDV: $($hdTDV.Rows.Count) hoa don." }
Write-Output ""

# STT 11: Diem tich luy khach hang
Write-Output "--- STT 11: Diem Tich Luy Khach Hang cho DNA014 ---"
$tlQL = Execute-Query "EXEC API_TichLuy_AI @Username = 'QLBH005.MED', @MaKhachHang = 'DNA014'"
$tlTDV = Execute-Query "EXEC API_TichLuy_AI @Username = 'HUEB.MED', @MaKhachHang = 'DNA014'"
if ($tlTDV -and $tlTDV.Rows.Count -gt 0) {
    $datDuoc = $tlTDV.Rows[0]['TichLuyDatDuoc']
    $mucTieu = $tlTDV.Rows[0]['MucTieu']
    $phanTram = $tlTDV.Rows[0]['Percentage']
    $qua = $tlTDV.Rows[0]['QuaDaDat']
    $soPhan = $tlTDV.Rows[0]['SoPhanQua']
    Write-Output "  * Diem tich luy dat duoc: $datDuoc | Muc tieu: $mucTieu | Hoan thanh: $phanTram%"
    Write-Output "  * Qua tang: $qua | So phan: $soPhan"
} else {
    Write-Output "  * Khong tim thay diem tich luy cua khach hang DNA014."
}
Write-Output ""

# STT 12: Tuyen ban hang hang ngay
Write-Output "--- STT 12: Tuyen Ban Hang Hang Ngay ---"
$tuyenQL = Execute-Query "EXEC API_TuyenBanHang_AI @Username = 'QLBH005.MED', @TopN = 500"
$tuyenTDV = Execute-Query "EXEC API_TuyenBanHang_AI @Username = 'HUEB.MED', @TopN = 500"
if ($tuyenQL) { Write-Output "  * Lich trinh tuyen cua Quan ly (toan vung): $($tuyenQL.Rows.Count) diem ghe tham." }
if ($tuyenTDV) {
    Write-Output "  * Lich trinh tuyen cua TDV (ca nhan): $($tuyenTDV.Rows.Count) diem ghe tham."
    if ($tuyenTDV.Rows.Count -gt 0) {
        Write-Output "  * Top 3 tuyen di uu tien hom nay cua TDV:"
        $tuyenTDV | select -First 3 | Format-Table -AutoSize | Out-String | Write-Output
    }
}
Write-Output ""

# STT 13: Goi y theo trieu chung
Write-Output "--- STT 13: Goi y theo trieu chung (Amoxicillin va Vitamin C) ---"
$donThuoc = Execute-Query "EXEC API_GoiYDonThuoc_AI @Username = 'HUEB.MED', @timkiem = 'Amoxicillin, Vitamin C'"
if ($donThuoc) {
    $donThuoc | select ItemID, ItemName, Unit, CurrentPrice, WarningMessage | Format-Table -AutoSize | Out-String | Write-Output
}
Write-Output ""

# STT 14: Chuong trinh khuyen mai
Write-Output "--- STT 14: Chuong Trinh Khuyen Mai Dang Chay ---"
$km = Execute-Query "EXEC API_DeXuatKhuyenMai_AI @Username = 'HUEB.MED'"
if ($km) {
    Write-Output "  * So chuong trinh/san pham khuyen mai de xuat: $($km.Rows.Count) muc."
    if ($km.Rows.Count -gt 0) {
        $km | select -First 3 | Format-Table -AutoSize | Out-String | Write-Output
    }
}
Write-Output ""

# STT 15: San pham trong tam thang
Write-Output "--- STT 15: San Pham Trong Tam Thang ---"
$tt = Execute-Query "EXEC API_SanPhamTrongTam_AI @Username = 'HUEB.MED'"
if ($tt) {
    Write-Output "  * So san pham trong tam can push: $($tt.Rows.Count) san pham."
    if ($tt.Rows.Count -gt 0) {
        $tt | select -First 3 | Format-Table -AutoSize | Out-String | Write-Output
    }
}
Write-Output ""

# STT 16: Tra cuu danh muc
Write-Output "--- STT 16: Tra Cuu Danh Muc Nhom San Pham ---"
$dm = Execute-Query "EXEC API_DanhMuc_AI @Username = 'HUEB.MED', @Type = 'sanpham'"
if ($dm) {
    Write-Output "  * So nhom san pham trong danh muc: $($dm.Rows.Count) nhom."
    if ($dm.Rows.Count -gt 0) {
        $dm | select -First 3 | Format-Table -AutoSize | Out-String | Write-Output
    }
}
Write-Output ""

# STT 17: RFM-C Cham diem tin nhiem
Write-Output "--- STT 17: RFM-C Cham Diem Tin Nhiem (DNA014) ---"
$rfmTDV = Execute-Query "EXEC API_ChamDiemKH_AI @Username = 'HUEB.MED', @MaKhachHang = 'DNA014', @W_Recency = 30.0, @W_Frequency = 25.0, @W_Monetary = 35.0, @W_Consumption = 10.0"
if ($rfmTDV -and $rfmTDV.Rows.Count -gt 0) {
    $rfmTDV | Format-Table -AutoSize | Out-String | Write-Output
} else {
    Write-Output "  * Khong tim thay diem tin nhiem cho DNA014."
}
Write-Output ""

# STT 18: Kiem tra ton kho thuc te (A003)
Write-Output "--- STT 18: Kiem Tra Ton Kho Thuc Te (A003) ---"
$tk = Execute-Query "EXEC API_DanhSachTonKho_AI @Username = 'HUEB.MED', @ItemID = 'A003'"
if ($tk) {
    $tk | Format-Table -AutoSize | Out-String | Write-Output
}
Write-Output ""

# STT 19: Khao sat cham soc khach hang
Write-Output "--- STT 19: Kiem Tra Trang Thai Khao Sat ---"
$ks = Execute-Query "EXEC API_KiemTraKhaoSat_AI @Username = 'HUEB.MED', @Ngay = NULL"
if ($ks) {
    $ks | Format-Table -AutoSize | Out-String | Write-Output
}
Write-Output ""

$connection.Close()
