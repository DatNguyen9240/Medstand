$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()
$command = $connection.CreateCommand()
$command.CommandText = "
SELECT 
    d.ApiCode,
    d.StoredProcedure,
    p.name AS ParameterName,
    t.name AS ParameterType
FROM API_Definition d
JOIN sys.procedures sp ON sp.name = d.StoredProcedure
JOIN sys.parameters p ON p.object_id = sp.object_id
JOIN sys.types t ON t.user_type_id = p.user_type_id
WHERE d.ApiCode LIKE '@%'
ORDER BY d.ApiCode, p.parameter_id;
"
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null
$dataset.Tables[0] | Format-Table -AutoSize
$connection.Close()
