$pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
if (-not (Test-Path -LiteralPath $pgDump)) { throw 'pg_dump.exe was not found in PostgreSQL 18.' }
$dbName = Read-Host 'Local database name [Trial Database]'
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = 'Trial Database' }
$dumpPath = Join-Path $PSScriptRoot 'SEPP-sessions-data.dump'
& $pgDump -h localhost -p 5432 -U postgres -W -Fc --no-owner --no-privileges -f $dumpPath -d $dbName
if ($LASTEXITCODE -ne 0) { throw 'Database export failed.' }
Write-Host "Backup created: $dumpPath"
