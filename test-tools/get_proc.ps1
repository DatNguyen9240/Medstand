$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest ;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()

$query = "
SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('API_Dashboard_ThongTin');
"

$command = $connection.CreateCommand()
$command.CommandText = $query
$res = $command.ExecuteScalar()

Write-Output $res

$connection.Close()
