$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest ;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()

$command = $connection.CreateCommand()
$command.CommandText = "
UPDATE SY_User SET EmployeeID = 'MED_DEMO' WHERE UserName = 'demo';
UPDATE SY_User SET EmployeeID = 'NVVP077_MN' WHERE UserName = 'ONLINE.MN';
UPDATE SY_User SET EmployeeID = 'NVVP071_MN' WHERE UserName = 'ONLINE3.MN';
"
$rows = $command.ExecuteNonQuery()
Write-Output "Successfully updated $rows rows in SY_User."

$connection.Close()
