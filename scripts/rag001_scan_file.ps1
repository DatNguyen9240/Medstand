param(
  [Parameter(Mandatory = $true)]
  [string]$LiteralPath
)

$ErrorActionPreference = 'Stop'
$scanner = Get-ChildItem 'C:\ProgramData\Microsoft\Windows Defender\Platform' -Filter 'MpCmdRun.exe' -Recurse -File |
  Where-Object { $_.FullName -notmatch '\\X86\\' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $scanner) {
  [pscustomobject]@{ status = 'SCAN_ERROR'; scanner = 'WINDOWS_DEFENDER'; sha256Hex = $null; exitCode = $null } | ConvertTo-Json -Compress
  exit 0
}

& $scanner.FullName -Scan -ScanType 3 -File $LiteralPath -DisableRemediation -ReturnHR *> $null
$exitCode = $LASTEXITCODE
$hash = (Get-FileHash -LiteralPath $LiteralPath -Algorithm SHA256).Hash.ToLowerInvariant()
$status = if ($exitCode -eq 0) { 'CLEAN' } elseif ($exitCode -eq 2) { 'INFECTED' } else { 'SCAN_ERROR' }
[pscustomobject]@{ status = $status; scanner = 'WINDOWS_DEFENDER'; sha256Hex = $hash; exitCode = $exitCode } | ConvertTo-Json -Compress
exit 0
