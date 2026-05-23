$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest ;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()

$command = $connection.CreateCommand()
$command.CommandText = "
SELECT ApiCode, COUNT(*) as Cnt FROM API_Definition GROUP BY ApiCode HAVING COUNT(*) > 1;
"
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null
Write-Output "--- Duplicate ApiCodes ---"
$dataset.Tables[0] | Format-Table -AutoSize

$command.CommandText = "
SELECT StoredProcedure, COUNT(*) as Cnt FROM API_Definition GROUP BY StoredProcedure HAVING COUNT(*) > 1;
"
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null
Write-Output "--- Duplicate StoredProcedures ---"
$dataset.Tables[0] | Format-Table -AutoSize

$command.CommandText = "
SELECT ApiID, FieldCode, COUNT(*) as Cnt FROM API_Field GROUP BY ApiID, FieldCode HAVING COUNT(*) > 1;
"
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null
Write-Output "--- Duplicate Fields ---"
$dataset.Tables[0] | Format-Table -AutoSize

$connection.Close()
