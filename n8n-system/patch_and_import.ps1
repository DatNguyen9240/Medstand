$env:N8N_USER_FOLDER = "c:\Git cua tui\Medstand\n8n-system\n8n_data"
$env:PATH = "c:\Git cua tui\Medstand\n8n-system\n8n_data\npm_global;" + $env:PATH

# 1. Path files
$localExecutePath = "c:\Git cua tui\Medstand\n8n\API_Services\API_Execute.json"
$localParserPath = "c:\Git cua tui\Medstand\n8n\AI_Core\AI_Intent_Parser.json"

$tempExecutePath = "c:\Git cua tui\Medstand\n8n-system\patched_execute.json"
$tempParserPath = "c:\Git cua tui\Medstand\n8n-system\patched_parser.json"

# 2. Patch API_Execute
Write-Host "Patching API_Execute..."
$execJson = Get-Content -Raw -Path $localExecutePath -Encoding UTF8 | ConvertFrom-Json
$execJson | Add-Member -MemberType NoteProperty -Name "id" -Value "fCJwiyAT9r6eh1ys" -Force
$execJson | Add-Member -MemberType NoteProperty -Name "active" -Value $true -Force
$wrappedExec = @($execJson)
$execJsonStr = $wrappedExec | ConvertTo-Json -Depth 100
$utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tempExecutePath, $execJsonStr, $utf8NoBOM)

# 3. Patch AI_Intent_Parser
Write-Host "Patching AI_Intent_Parser..."
$parserJson = Get-Content -Raw -Path $localParserPath -Encoding UTF8 | ConvertFrom-Json
$parserJson | Add-Member -MemberType NoteProperty -Name "id" -Value "Gn7nDjDgGUFOWni5" -Force
$parserJson | Add-Member -MemberType NoteProperty -Name "active" -Value $true -Force
$wrappedParser = @($parserJson)
$parserJsonStr = $wrappedParser | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($tempParserPath, $parserJsonStr, $utf8NoBOM)

# 4. Import patched workflows
Write-Host "Importing patched workflows into n8n..."
n8n import:workflow --input=$tempExecutePath
n8n import:workflow --input=$tempParserPath

# 5. Activate workflows
Write-Host "Activating original workflows..."
n8n publish:workflow --id=fCJwiyAT9r6eh1ys
n8n publish:workflow --id=Gn7nDjDgGUFOWni5
n8n publish:workflow --id=LYMNWZxdfLbGFMWi

# 6. Verify list
Write-Host "Listing workflows after update..."
n8n list:workflow

# 7. Clean temp files
Remove-Item -Path $tempExecutePath -ErrorAction SilentlyContinue
Remove-Item -Path $tempParserPath -ErrorAction SilentlyContinue
