$pgRestore = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe'
$dumpPath = Join-Path $PSScriptRoot 'SEPP-sessions-data.dump'
if (-not (Test-Path -LiteralPath $pgRestore)) { throw 'pg_restore.exe was not found in PostgreSQL 18.' }
if (-not (Test-Path -LiteralPath $dumpPath)) { throw 'Run export_sepp_database.ps1 first.' }
$secureUrl = Read-Host 'Render external PostgreSQL URL' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)
try {
    $plainUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $uri = [Uri]$plainUrl
    if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw 'Use the PostgreSQL URL from Render.' }
    $userInfo = $uri.UserInfo.Split(':', 2)
    if ($userInfo.Count -ne 2) { throw 'The database URL must include a username and password.' }
    $env:PGHOST = $uri.Host
    $env:PGPORT = if ($uri.IsDefaultPort) { '5432' } else { [string]$uri.Port }
    $env:PGUSER = [Uri]::UnescapeDataString($userInfo[0])
    $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1])
    $env:PGDATABASE = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    $env:PGSSLMODE = 'require'
    & $pgRestore --no-owner --no-privileges --clean --if-exists -d $env:PGDATABASE $dumpPath
    if ($LASTEXITCODE -ne 0) { throw 'Database restore failed. Check the PostgreSQL output above.' }
    Write-Host 'Render database restore completed.'
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGUSER, Env:PGPASSWORD, Env:PGDATABASE, Env:PGSSLMODE -ErrorAction SilentlyContinue
    $plainUrl = $null
}
