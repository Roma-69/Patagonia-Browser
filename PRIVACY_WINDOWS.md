# Privacidad de Patagonia Browser para Windows

Documento preparado el 8 de septiembre de 2026 para la edición de escritorio de Windows. La [política existente para móviles](PRIVACY.md) es independiente.

## Datos en el equipo

Patagonia guarda configuración, pestañas de la sesión, historial, favoritos y excepciones del bloqueo de anuncios en el perfil local de Windows. En el código actual, la carpeta del perfil es `%APPDATA%\patagonia-browser-main`.

Electron/Chromium también puede guardar cookies, caché y almacenamiento de los sitios dentro del perfil. Los archivos descargados se guardan en el destino que corresponda a la descarga. Los datos locales no se deben considerar cifrados por Patagonia.

El código de Patagonia no implementa una cuenta de usuario ni un servidor propio que reciba o sincronice el historial y los favoritos.

## Navegación y servicios externos

Al abrir una página o realizar una búsqueda, el navegador se comunica con los sitios y el proveedor de búsqueda correspondiente. Esos servicios pueden recibir la dirección IP, la URL o consulta solicitada, cabeceras, cookies y los datos que la persona envíe. Sus propias políticas de privacidad se aplican.

La restauración de pestañas o de la página de inicio también puede abrir conexiones al iniciar el navegador.

La actualización automática (activada por defecto, se puede desactivar en Configuración) consulta cada 6 horas la lista pública de publicaciones del repositorio en la API de GitHub y, si hay una versión nueva, la descarga desde las publicaciones de GitHub. Esas consultas no incluyen el historial, los favoritos ni el contenido de las páginas; GitHub recibe los datos técnicos de la conexión, incluida la IP.

El motor de bloqueo integrado utiliza la biblioteca de Ghostery para descargar y actualizar las listas de anuncios y rastreadores. Estas consultas pueden ocurrir automáticamente al iniciar la aplicación. Los servidores que entregan las listas reciben los datos técnicos necesarios para la conexión, incluida la IP; el código de actualización de Patagonia no adjunta el historial, los favoritos ni el contenido de las páginas a esas consultas.

La excepción de protección para un sitio cambia el bloqueo de ese sitio; no debe interpretarse como un control que impida las descargas de listas. Las actualizaciones de listas no equivalen a actualizar el programa completo.

Brave Search es el buscador y la página de inicio predeterminados: usa su propio índice de la web, sin depender de Google ni de Microsoft. En Configuración se puede elegir DuckDuckGo como respaldo. Lo que se escribe en la barra de direcciones o en el buscador de la nueva pestaña y no es una dirección web se envía al buscador elegido para realizar la búsqueda; se pueden consultar sus políticas de privacidad: [Brave Search](https://search.brave.com/help/privacy-policy) y [DuckDuckGo](https://duckduckgo.com/privacy). Cada sitio visitado aplica sus propias condiciones.

La biblioteca de bloqueo define listas alojadas en GitHub. Las descargas desde ese servicio y el uso del repositorio o de sus páginas de publicaciones se rigen por la [declaración de privacidad de GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). La definición de los proveedores de listas se encuentra en el [código de Ghostery Adblocker](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/src/fetch.ts).

La integración del motor se puede consultar en [src/main/adblocker.js](src/main/adblocker.js), y las versiones de las bibliotecas en [package-lock.json](package-lock.json).

## Permisos y contenido de páginas

Los permisos admitidos para los sitios, como cámara, micrófono y ubicación, requieren la confirmación prevista por la aplicación y por el sistema. El permiso concedido a un sitio no impide que ese sitio trate la información según su propia política.

La función local de extracción y resumen utiliza el contenido de la página que la persona selecciona. La edición documentada usa reglas locales y no tiene conectado un servicio externo de IA para esa función.

## Conservación y borrado

El historial puede borrarse desde el navegador. Borrar el historial no implica borrar cookies, favoritos, archivos descargados o todos los demás datos del perfil.

Desinstalar el programa puede conservar el perfil del usuario. Para eliminarlo completamente, primero se debe cerrar Patagonia y guardar cualquier información que se quiera conservar; después se puede eliminar su carpeta de perfil. Esta acción borra las preferencias y datos locales de Patagonia. Los archivos descargados que estén fuera de esa carpeta se administran por separado.

## Consultas

Los reportes pueden enviarse por [GitHub Issues](https://github.com/Roma-69/Patagonia-Browser/issues). Ese espacio es público; no se deben publicar contraseñas, cookies ni historiales personales.

Esta documentación describe el comportamiento del código disponible, no una auditoría independiente ni una garantía de anonimato.

## Traductor de páginas

La traducción de inglés a español se hace dentro de tu equipo, con el motor y el modelo de Firefox Translations que vienen con Patagonia: el texto de la página no sale de la computadora y no se necesita internet para traducir. Las opciones "Siempre traducir" y "Nunca en este sitio" se guardan solo en tu equipo.

Si elegís **Usar Google (no privado)**, Patagonia abre la página a través de Google Translate: Google recibe la dirección de la página y su contenido. Esa opción se usa solo cuando la tocás.
