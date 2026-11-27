# Descargas de Patagonia Browser

Patagonia es un navegador de escritorio en desarrollo con navegación por pestañas, favoritos, historial local y bloqueo de anuncios y rastreadores.

## Windows x64

### Microsoft Store (recomendado)

- [Instalar Patagonia Browser desde Microsoft Store](https://apps.microsoft.com/detail/9NWL1WDZFJMD).

Es la forma más simple: el paquete lo verifica Microsoft, Windows no muestra la advertencia de "aplicación sin firma" y las actualizaciones llegan solas desde la Store.

### Instalador desde GitHub

- [Descargar el instalador de Patagonia Browser 1.4.1](https://github.com/Roma-69/Patagonia-Browser/releases/download/v1.4.1/Patagonia-Browser-Setup.exe).
- [Ver la publicación 1.4.1](https://github.com/Roma-69/Patagonia-Browser/releases/tag/v1.4.1).
- [Consultar todas las versiones publicadas](https://github.com/Roma-69/Patagonia-Browser/releases).

La versión 1.4.1 fue publicada el 26 de noviembre de 2026. El instalador está **sin firma de un proveedor reconocido** y Windows puede mostrar una advertencia: tocá "Más información" y "Ejecutar de todas formas".

**Desde la 1.0.6, Patagonia se actualiza solo.** Si tenés la 1.0.5 o anterior, instalá la última versión a mano una única vez; las siguientes llegan automáticamente.

La publicación 1.4.1 incluye `Patagonia-Browser-Setup.exe` y, para la actualización automática, `RELEASES` y `PatagoniaBrowser-1.4.1-full.nupkg`. Para verificar el instalador, su huella SHA-256 es:

`f69514b621956ee9f0b56fb391299841754c9e68fe42ddb7e27dedb2dfd8fbb9`

En PowerShell: `Get-FileHash .\Patagonia-Browser-Setup.exe -Algorithm SHA256`.

## Android

- [Descargar Patagonia Browser para Android 1.4.1 (APK)](https://github.com/Roma-69/Patagonia-Browser/releases/download/movil-v1.4.1/Patagonia-Android-1.4.1-Publicacion.apk).
- [Ver la publicación](https://github.com/Roma-69/Patagonia-Browser/releases/tag/movil-v1.4.1).

La versión 1.4.1 para Android fue publicada el 27 de noviembre de 2026. Requiere Android 8 o posterior en un teléfono de 64 bits (arm64). Si ya tenés Patagonia Browser instalado, este APK lo actualiza y conserva tus favoritos y pestañas. Para instalarlo, Android puede pedirte permiso para "instalar apps de esta fuente".

**Patagonia para Android avisa sola cuando sale una versión nueva**: tocás el aviso y después "Instalar". Se puede apagar en Configuración → "Avisar si hay versión nueva".

SHA-256: `7f8415699c0f23431e4ce6f8bbcc7ce2fcbf2ef72c87c5602fc38c653312f717`

En PowerShell: `Get-FileHash .\Patagonia-Android-1.4.1-Publicacion.apk -Algorithm SHA256`

## Code signing policy

La solicitud inicial a SignPath Foundation, enviada el 8 de septiembre de 2026, no fue aprobada por falta de suficientes señales públicas de adopción y colaboración, según el [issue #10](https://github.com/Roma-69/Patagonia-Browser/issues/10). Actualmente no existe un certificado activo ni un servicio de firma de SignPath para Patagonia Browser. No hay fechas ni aprobación futura garantizadas.

El instalador de Windows 1.4.1 no está firmado por SignPath.

La [Code signing policy](CODE_SIGNING.md) identifica al mantenedor, las responsabilidades de firma, el origen verificable de las compilaciones y las condiciones pendientes. La atribución del proveedor sólo correspondería si se obtuviera aprobación y el servicio estuviera activo.

## Privacidad y desinstalación

Consultá la [política de privacidad de Windows](PRIVACY_WINDOWS.md) antes de instalar. Para desinstalar, abrí Configuración de Windows, buscá Patagonia Browser en las aplicaciones instaladas y seleccioná Desinstalar. El perfil local puede conservarse; la política explica cómo eliminar sus datos.
