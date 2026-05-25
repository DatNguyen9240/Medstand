$token = "BD964CF7-ECD8-464A-95F9-49B5C9211D44" # pre-verified mock token in uuidCache for QLBH013.MED
$url = "http://127.0.0.1:5678/webhook/hook-ai-dainao"

function Send-ChatQuery($message) {
    Write-Host "Sending: '$message'..." -ForegroundColor Cyan
    $body = @{
        message = $message
        sessionId = "uat_test_session_12345"
    } | ConvertTo-Json

    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }

    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -Headers $headers -TimeoutSec 15
        Write-Host "Status: $($response.status)" -ForegroundColor Green
        Write-Host "Intent: $($response.username)" -ForegroundColor Magenta
        Write-Host "Message: $($response.message)" -ForegroundColor Yellow
        if ($response.data) {
            Write-Host "Data count: $($response.data.Count)" -ForegroundColor Green
        }
        if ($response.intentParams) {
            Write-Host "Params: $($response.intentParams | ConvertTo-Json -Compress)" -ForegroundColor DarkGreen
        }
        Write-Host "-------------------------------------------"
    } catch {
        Write-Error $_
        Write-Host "-------------------------------------------"
    }
}

Write-Host "=== RUNNING UAT COPY-PASTE PROMPT TESTS ==="
Send-ChatQuery "Doanh số cá nhân của tôi trong tháng này?"
Send-ChatQuery "Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"
Send-ChatQuery "Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"
Send-ChatQuery "Lên đơn 5 hộp Antrinano cho Thu Thủy"
