$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest ;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()

$command = $connection.CreateCommand()
$command.CommandText = "
SELECT EmployeeID, COUNT(*) as Cnt FROM SY_User WHERE EmployeeID IS NOT NULL AND EmployeeID <> '' GROUP BY EmployeeID HAVING COUNT(*) > 1;
"
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null
Write-Output "--- Duplicate EmployeeIDs ---"
$dataset.Tables[0] | Format-Table -AutoSize

$connection.Close()
