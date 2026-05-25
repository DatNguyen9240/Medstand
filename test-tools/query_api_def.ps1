$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()
$command = $connection.CreateCommand()
$command.CommandText = "
SELECT f.FieldCode, f.FieldName, f.IsSystemParam, af.IsVisible, af.IsEditable
FROM API_Field f
JOIN API_Action_Field af ON af.FieldID = f.FieldID
JOIN API_Definition d ON d.ApiID = f.ApiID
WHERE d.StoredProcedure = 'API_DoanhSo_AI';
"
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null
$dataset.Tables[0] | Format-Table -AutoSize
$connection.Close()
