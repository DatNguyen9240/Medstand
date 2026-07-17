$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace

Write-Host "=== MEDSTAND P0-05 UAT TOKEN CAPTURE ===" -ForegroundColor Cyan
Write-Host "Password se duoc nhap an va token khong hien tren man hinh." -ForegroundColor Yellow

try {
    & (Join-Path $PSScriptRoot "capture_uat_identity_token.ps1") -Identity manager
    & (Join-Path $PSScriptRoot "capture_uat_identity_token.ps1") -Identity tdv
    Write-Host "Da luu token Manager va TDV. Quay lai Codex va nhan tiep tuc." -ForegroundColor Green
} catch {
    Write-Host "Khong the hoan tat: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host "Nhan Enter de dong cua so"
