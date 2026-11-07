# Arma el APK oficial firmado con la clave original, sin dejar la contraseña guardada.
# Uso: CREAR-APK-OFICIAL.cmd  [carpeta-de-la-clave]
# - Si no se indica carpeta, usa mobile\.signing.
# - Si en la carpeta hay password.txt / key-password.txt, los usa (todo queda en este equipo);
#   si no, pide las contraseñas. El alias se detecta solo con keytool.
# - Crea android\key.properties temporal y SIEMPRE lo borra al terminar.
param([string]$CarpetaClave = '')
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$keyProps = Join-Path $raiz 'android\key.properties'
if (-not $CarpetaClave) { $CarpetaClave = Join-Path $raiz '.signing' }

function Leer-Secreto([string]$texto) {
    $seguro = Read-Host -Prompt $texto -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Escapar([string]$v) { return $v.Replace('\', '\\') }
function Buscar-Keytool {
    $candidatos = @()
    if ($env:JAVA_HOME) { $candidatos += Join-Path $env:JAVA_HOME 'bin\keytool.exe' }
    $comando = Get-Command keytool -ErrorAction SilentlyContinue
    if ($comando) { $candidatos += $comando.Source }
    $candidatos += Get-ChildItem (Join-Path $env:USERPROFILE '.jdks') -Filter keytool.exe -Recurse -ErrorAction SilentlyContinue | ForEach-Object FullName
    $candidatos += Get-ChildItem (Join-Path $env:USERPROFILE 'Documents\Codex\2026-09-02\re\.mobile-tools\jdk') -Filter keytool.exe -Recurse -ErrorAction SilentlyContinue | ForEach-Object FullName
    return $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

if (-not (Test-Path -LiteralPath $CarpetaClave)) {
    throw "No encuentro la carpeta de la clave: $CarpetaClave. NO crees una clave nueva: buscá la carpeta original."
}
$claves = @(Get-ChildItem -LiteralPath $CarpetaClave -Recurse -File | Where-Object { $_.Extension -in '.jks', '.keystore' })
if ($claves.Count -eq 0) { throw "No hay ningún archivo .jks en $CarpetaClave. NO crees una clave nueva." }
# Si hay copias, preferimos la que está junto a los archivos de contraseña.
$clave = $claves | Sort-Object { if (Test-Path (Join-Path $_.DirectoryName 'password.txt')) { 0 } else { 1 } } | Select-Object -First 1
Write-Host "Clave: $($clave.FullName)"

$archivoAlmacen = Join-Path $clave.DirectoryName 'password.txt'
$archivoClave = Join-Path $clave.DirectoryName 'key-password.txt'
if (Test-Path -LiteralPath $archivoAlmacen) {
    $passAlmacen = (Get-Content -LiteralPath $archivoAlmacen -Raw).Trim()
    Write-Host 'Contraseña del almacén: leída de password.txt (no se muestra).'
} else {
    Write-Host 'Copiá los datos desde Bitwarden. Las contraseñas no se ven mientras escribís (es normal).'
    $passAlmacen = Leer-Secreto 'Contraseña del almacén'
}
if (Test-Path -LiteralPath $archivoClave) {
    $passClave = (Get-Content -LiteralPath $archivoClave -Raw).Trim()
} else {
    $passClave = Leer-Secreto 'Contraseña de la clave (Enter si es la misma)'
    if ([string]::IsNullOrEmpty($passClave)) { $passClave = $passAlmacen }
}

$alias = ''
$keytool = Buscar-Keytool
if ($keytool) {
    $env:PATAGONIA_STOREPASS = $passAlmacen
    try {
        $lista = & $keytool -list -keystore $clave.FullName -storepass:env PATAGONIA_STOREPASS 2>&1 | Out-String
    } finally { Remove-Item Env:PATAGONIA_STOREPASS -ErrorAction SilentlyContinue }
    $linea = ($lista -split "`r?`n") | Where-Object { $_ -match 'PrivateKeyEntry' } | Select-Object -First 1
    if ($linea) { $alias = ($linea -split ',')[0].Trim() }
}
if (-not $alias) { $alias = Read-Host 'Alias de la clave' }
Write-Host "Alias: $alias"

$rutaClave = $clave.FullName -replace '\\', '/'
try {
    $contenido = "storeFile=$rutaClave`nstorePassword=$(Escapar $passAlmacen)`nkeyAlias=$(Escapar $alias)`nkeyPassword=$(Escapar $passClave)`n"
    [IO.File]::WriteAllText($keyProps, $contenido, (New-Object Text.UTF8Encoding $false))
    $passAlmacen = $null; $passClave = $null; $contenido = $null
    & (Join-Path $raiz 'VALIDAR-Y-CREAR-APK.ps1') -Modo Publicacion
} finally {
    if (Test-Path $keyProps) { Remove-Item -LiteralPath $keyProps -Force }
    if (Test-Path $keyProps) { Write-Warning "No se pudo borrar $keyProps. Borralo a mano." }
    else { Write-Host 'Archivo temporal key.properties borrado.' }
}

# Comprobar que NO se firmó con la clave de depuración.
$apk = Get-ChildItem (Join-Path $raiz 'entrega-android') -Filter '*-Publicacion.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\sdk' }
$apksigner = Get-ChildItem (Join-Path $sdk 'build-tools') -Filter 'apksigner.bat' -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if ($apk -and $apksigner) {
    $certs = & $apksigner.FullName verify --print-certs $apk.FullName 2>&1 | Out-String
    if ($certs -match 'Android Debug') { throw 'El APK quedó firmado con la clave de DEPURACIÓN. No lo compartas.' }
    Write-Host 'Firma comprobada: clave original (no de depuración).'
}
Write-Host ''
Write-Host "LISTO: $($apk.FullName)"
