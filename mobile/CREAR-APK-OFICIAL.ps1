# Arma el APK oficial firmado con la clave original, sin dejar la contraseña guardada.
# Pide alias y contraseñas (de Bitwarden), crea android\key.properties temporal,
# compila con VALIDAR-Y-CREAR-APK.ps1 -Modo Publicacion y SIEMPRE borra key.properties.
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$keyProps = Join-Path $raiz 'android\key.properties'
$carpetaClave = Join-Path $raiz '.signing'

function Leer-Secreto([string]$texto) {
    $seguro = Read-Host -Prompt $texto -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Escapar([string]$v) { return $v.Replace('\', '\\') }

if (-not (Test-Path $carpetaClave)) {
    throw "No encuentro la carpeta de la clave: $carpetaClave. NO crees una clave nueva: buscá la carpeta .signing original."
}
$claves = @(Get-ChildItem -LiteralPath $carpetaClave -Include *.jks, *.keystore -File -Recurse)
if ($claves.Count -eq 0) { throw "No hay ningún archivo .jks en $carpetaClave. NO crees una clave nueva." }
if ($claves.Count -gt 1) {
    Write-Host 'Hay más de una clave:'
    for ($i = 0; $i -lt $claves.Count; $i++) { Write-Host "  [$($i + 1)] $($claves[$i].Name)" }
    $n = [int](Read-Host 'Número de la clave de Patagonia')
    $clave = $claves[$n - 1]
} else { $clave = $claves[0] }
Write-Host "Clave: $($clave.Name)"
Write-Host 'Copiá los datos desde Bitwarden. Las contraseñas no se ven mientras escribís (es normal).'

$alias = Read-Host 'Alias de la clave'
$passAlmacen = Leer-Secreto 'Contraseña del almacén'
$passClave = Leer-Secreto 'Contraseña de la clave (Enter si es la misma)'
if ([string]::IsNullOrEmpty($passClave)) { $passClave = $passAlmacen }

$rutaRelativa = '../.signing/' + ($clave.FullName.Substring($carpetaClave.Length + 1) -replace '\\', '/')
try {
    $contenido = "storeFile=$rutaRelativa`nstorePassword=$(Escapar $passAlmacen)`nkeyAlias=$(Escapar $alias)`nkeyPassword=$(Escapar $passClave)`n"
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
Write-Host 'Mandale ese archivo a Claude en el chat para subirlo a GitHub.'
