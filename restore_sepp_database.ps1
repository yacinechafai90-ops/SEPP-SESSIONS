$pgRestore = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe'
$dumpPath = Join-Path $PSScriptRoot 'SEPP-sessions-data.dump'
if (-not (Test-Path -LiteralPath $pgRestore)) { throw 'pg_restore.exe was not found in PostgreSQL 18.' }
if (-not (Test-Path -LiteralPath $dumpPath)) { throw 'Run export_sepp_database.ps1 first.' }

# Railway : on demande chaque information separement, a copier depuis l'onglet Variables du service Postgres.
$hote = (Read-Host 'Hote public (valeur de RAILWAY_TCP_PROXY_DOMAIN)').Trim()
$port = (Read-Host 'Port public (valeur de RAILWAY_TCP_PROXY_PORT)').Trim()
$utilisateur = (Read-Host 'Utilisateur (valeur de PGUSER, souvent postgres)').Trim()
$secureMotDePasse = Read-Host 'Mot de passe (valeur de PGPASSWORD, saisie masquee)' -AsSecureString
$base = (Read-Host 'Nom de la base (valeur de PGDATABASE, souvent railway)').Trim()

if (-not $hote -or -not $port -or -not $utilisateur -or -not $base) { throw 'Une information est vide. Recommencez.' }

$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureMotDePasse)
try {
    $motDePasse = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $env:PGHOST = $hote
    $env:PGPORT = $port
    $env:PGUSER = $utilisateur
    $env:PGPASSWORD = $motDePasse
    $env:PGDATABASE = $base
    $env:PGSSLMODE = 'require'
    & $pgRestore --no-owner --no-privileges --clean --if-exists -d $env:PGDATABASE $dumpPath
    if ($LASTEXITCODE -ne 0) { throw 'Database restore failed. Check the PostgreSQL output above.' }
    Write-Host 'Restauration sur Railway terminee.'
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGUSER, Env:PGPASSWORD, Env:PGDATABASE, Env:PGSSLMODE -ErrorAction SilentlyContinue
    $motDePasse = $null
}
