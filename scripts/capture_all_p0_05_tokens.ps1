$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace

Write-Host "=== MEDSTAND P0-05 - CAPTURE 4 UAT IDENTITIES ===" -ForegroundColor Cyan
Write-Host "Password duoc nhap an; token khong hien tren man hinh va chi luu trong .env.uat.local." -ForegroundColor Yellow

try {
    foreach ($identity in @("manager", "tdv", "unmapped", "no-scope")) {
        Write-Host "`n--- $identity ---" -ForegroundColor Cyan
        & (Join-Path $PSScriptRoot "capture_uat_identity_token.ps1") -Identity $identity
    }
    Write-Host "`nDa luu du 4 token. Co the chay scripts/run_p0_05_uat.ps1." -ForegroundColor Green
} catch {
    Write-Host "Khong the hoan tat: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
