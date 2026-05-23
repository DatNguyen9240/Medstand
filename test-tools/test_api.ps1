$connectionString = "Server=z5.bms79.com,17456;Database=medtest;User Id=medtest ;Password=medtest@2026;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection
$connection.ConnectionString = $connectionString
$connection.Open()

$command = $connection.CreateCommand()
$command.CommandText = "
EXEC dbo.API_Dashboard_ThongTin 
    @User = 'QLBH013.MED', 
    @BranchID = '', 
    @CeoID = '', 
    @ManagerID = '', 
    @EmployeeID = '', 
    @FromDate = '2026-05-01', 
    @ToDate = '2026-05-23';
"
$adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
$dataset = New-Object System.Data.DataSet
$adapter.Fill($dataset) | Out-Null

$dataset.Tables[0] | Format-Table -AutoSize

$connection.Close()
