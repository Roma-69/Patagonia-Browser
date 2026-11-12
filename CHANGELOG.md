# Changelog

Todos los cambios importantes de Patagonia Browser serán documentados en este archivo.

El formato está inspirado en "Keep a Changelog" y el proyecto seguirá Versionado Semántico cuando corresponda.

---

## [1.3.0] - Sin publicar (PC y Android)

Desde esta versión **la PC y el celular llevan el mismo número** y hacen lo mismo (ver `PARIDAD.md`).

### Agregado

- **Pasar favoritos entre la PC y el celular, sin cuenta ni nube:**
  - PC: Favoritos → **Exportar…** guarda un archivo; **Importar…** lo trae. No repite los que ya tenés.
  - Celular: Menú → Favoritos → botones de **exportar** e **importar** arriba de la lista.
  - Es el formato estándar de favoritos: también sirve para traer los de Chrome, Firefox o Edge.
- **Celular — Agregar a la pantalla de inicio** (Menú): un ícono con la inicial del sitio que lo abre directo en Patagonia. Es lo mismo que "Crear app de esta página" de la PC.
- **Celular — Imprimir o guardar PDF** (Menú): abre el diálogo de impresión de Android, que también tiene "Guardar como PDF". Es lo mismo que Ctrl+P en la PC.
- **PC — más idiomas en el traductor:** además del inglés, traduce **portugués, francés, alemán e italiano**. Cada idioma se baja de Mozilla **una sola vez** (unos 20 MB, verificado) y después traduce en tu equipo sin mandar la página a nadie, igual que el celular.
- **PC — "Mostrar original" desde el clic derecho** cuando la página está traducida (antes, si cerrabas la barra, había que recargar).

### Corregido

- **Google Meet no podía usar la cámara ni el micrófono:** Patagonia le decía a la página que estaban "bloqueados por el navegador" antes de preguntarte, y Meet ni siquiera los pedía. Ahora aparece el aviso de siempre (**Bloquear / Permitir durante esta sesión**) y, si elegís Bloquear, queda bloqueado.
- **Compartir pantalla ("Presentar ahora") en Meet:** antes fallaba siempre. Ahora Patagonia pregunta qué querés compartir: la pantalla completa o una ventana. Con la pantalla completa también se comparte el sonido de la PC.

## [Android 1.2.0] - 2026-11-10

Lo que se sumó en la PC desde la 1.0.6 llega al celular.

### Agregado

- **Traductor de páginas:** cuando una página está en otro idioma aparece una barra arriba: **"Esta página está en inglés. Traducir"**. Usa el mismo motor de Firefox que la PC y traduce **en el teléfono**: la primera vez baja el idioma desde Mozilla (unos MB) y después no manda la página a nadie. Además del inglés sabe portugués, francés, alemán, italiano y muchos más.
  - **Mostrar original**, **Siempre traducir** y **Nunca en este sitio**.
  - Menú → **Traducir página**, por si la barra no apareció.
- **Modo chicos** (Menú → Configuración → tilde): bloquea sitios para adultos y de malware con el DNS familiar de Cloudflare, fuerza la búsqueda segura en DuckDuckGo, Google, Bing y Yahoo y pone YouTube en modo restringido. La página de inicio muestra "Modo chicos activo".
- **Letra grande** (Configuración → tilde): las páginas se ven con la letra al 125 %.
- **Modo lectura** (Menú → Modo lectura): la nota sola, sin publicidad ni menús, con letra cómoda que se agranda o achica. La dibuja Patagonia: no se ejecuta nada de la página.
- **Mantener apretado** un enlace: abrir en pestaña nueva (sin perder la que estás leyendo), copiar la dirección o compartirla. En una imagen: abrirla, **guardarla** en Descargas o copiar su dirección.
- **Buscar** el texto seleccionado: aparece en el menú de Copiar y abre la búsqueda de DuckDuckGo en una pestaña nueva.
- **Compartir** la página (Menú → Compartir) con WhatsApp, correo o la app que quieras.
- Accesos rápidos nuevos en el inicio: **WhatsApp** (abre la app) y **Windguru**.
- **Música en segundo plano:** lo que está sonando (YouTube, radios, podcasts) sigue al minimizar Patagonia, abrir otra app o apagar la pantalla. Aparece una notificación con **Pausar / Reproducir** y **Cerrar**, y también responde a los botones de los auriculares.
- **Aviso de versión nueva:** una vez por día Patagonia mira en GitHub si salió una versión nueva del celular y la avisa en la página de inicio. Se puede apagar en Configuración.

## [Android 1.1.2] - Sin publicar (incluido en la 1.2.0)

### Corregido

- **TalkBack (lector de pantalla):** cuando está prendido, la página se muestra como vista nativa de Android para que el lector pueda recorrer textos, links y botones de las páginas. Sin lector se sigue usando el modo por textura, más liviano.

## [1.0.11] - 2026-11-10

### Corregido

- **Gmail no abría** después de iniciar sesión en Google, y la pestaña quedaba colgada en "Te damos la bienvenida" después de la clave de paso. El disfraz de Firefox del login cambiaba el user agent en plena navegación y Chromium la cancelaba.
- **Login de Google con clave de paso (passkey):** Google seguía respondiendo "el navegador no es seguro" en algunas cuentas. Ahora en las páginas de login no quedan huellas de Chrome a la vista.

## [1.0.10] - 2026-11-09

### Agregado

- **Modo chicos** (Configuración → tilde): bloquea sitios para adultos y de malware con el DNS familiar de Cloudflare, fuerza la búsqueda segura en DuckDuckGo, Google, Bing y Yahoo y pone YouTube en modo restringido. Se aplica apenas lo tildás.
- **Letra grande** (Configuración → tilde): las páginas se abren al 125 %.
- **Modo lectura** (clic derecho → Modo lectura): la nota sola, sin publicidad ni menús, con letra cómoda y en una ventana que no ejecuta nada de la página.
- **Separar pestañas:** arrastrá una pestaña fuera de la barra (o clic derecho → Mover a ventana nueva) y se abre en su propia ventana, con la sesión iniciada.

### Corregido

- **Iniciar sesión en Google:** ya no aparece "No se ha podido iniciar sesión — es posible que el navegador no sea seguro". Solo en la página de login, Patagonia se presenta como Firefox.
- **Microsoft Store:** el ícono de la barra de tareas y del menú Inicio ya no aparece sobre un cuadrado azul.

### Cambiado

- Incluye todo lo de la 1.0.9: motor **Electron 45 / Chromium 156**.

## [1.0.9] - 2026-11-08 (solo Microsoft Store)

### Cambiado

- **Motor actualizado:** Electron 45 con **Chromium 156** (antes Chromium 150). Trae muchos arreglos de seguridad y cumple el requisito de Microsoft Store de usar un Chromium como mucho 2 versiones atrás del último.

### Agregado

- **Versión para Microsoft Store (MSIX):** paquete con la identidad oficial de Partner Center (`Roma.69.PatagoniaBrowser`, editor `Roma.69`).
  - Se registra como navegador desde el manifiesto (http, https, .htm, .html) y suma el alias `patagonia.exe`.
  - En la Store, las actualizaciones las hace Windows: no corre Squirrel ni la actualización automática desde GitHub.
  - "Crear app de esta página" usa el alias `patagonia.exe`, que no cambia entre versiones.
  - El workflow "Windows - paquete para Microsoft Store (MSIX)" deja el `.msix` en un release borrador para subirlo a Partner Center.

## [1.0.8] - 2026-11-07

### Agregado

- **Traductor de páginas privado:** cuando una página está en inglés aparece una barra arriba: **"Esta página está en inglés. Traducir al español"**. La traducción se hace **en tu equipo**, con el mismo motor de Firefox (Bergamot) y el modelo inglés→español de Mozilla: no se manda nada a internet.
  - **Siempre traducir inglés** (traduce sola al abrir) y **Nunca en este sitio**.
  - **Mostrar original** vuelve la página a como estaba.
  - Traduce primero lo que estás viendo y después el resto; lo que la página carga después (al bajar o tocar botones) también se traduce.
  - No toca código, campos de texto ni lo que la página marca como "no traducir".
  - Clic derecho → **Traducir página al español**, por si la barra no apareció.
  - Para otros idiomas (portugués, francés, alemán…) por ahora ofrece **Usar Google**, avisando que no es privado.
- El navegador pesa unos 30 MB más por el motor y el modelo de traducción.

## [1.0.7] y [Android 1.1.1] - 2026-11-07

### Cambiado

- **Nueva imagen "Árbol bandera":** ícono nuevo (el árbol de la estepa torcido por el viento, sobre un atardecer) en Windows (.exe, barra de tareas, accesos directos), Android e iPhone.
- **Nuevo fondo de la página de inicio:** atardecer en la estepa con el árbol bandera, dibujado en vector (pesa unos KB en vez de los ~2 MB de la foto anterior). En el celular, versión vertical del mismo paisaje.
- La página de inicio pasa de los tonos azules a los cálidos del atardecer (buscador, botón "Ir", accesos rápidos, barra inferior y diálogo).
- Accesos rápidos de inicio en Windows: se reemplazan **GitHub** por **WhatsApp Web** y **Reddit** por **Windguru** (pronóstico de viento).
- El nombre y los íconos de Patagonia Browser quedan fuera de la licencia MIT y reservados al proyecto (ver `MARCA.md`). El código sigue siendo MIT.

### Corregido

- **WhatsApp Web** ya no dice que el navegador es incompatible: Patagonia se presenta ante las páginas como Chrome estándar, sin la marca "Electron" (además expone menos datos del equipo).
- Después de actualizar, Windows refresca solo la caché de íconos, así el acceso directo muestra el ícono nuevo sin tener que reiniciar.


## [1.0.6] - 2026-11-06

### Agregado

- Botón **"Crear app de esta página"** (⧉) en la barra, al lado de la dirección. Crea un acceso directo en el escritorio con el ícono del sitio; al abrirlo, la página aparece en una ventana propia, sin pestañas ni barra (ideal para el panel del router, el correo o cualquier sitio que uses seguido).
- Las ventanas de app usan la misma protección contra anuncios y la misma sesión que Patagonia, con `sandbox: true` y sin acceso a la interfaz privilegiada.
- Los enlaces a otros sitios y las ventanas emergentes de una app se abren como pestaña en Patagonia.
- Atajos dentro de una app: F5 / Ctrl+R recarga, Alt+← / Alt+→ navega, Ctrl+W cierra.
- Los accesos directos apuntan al lanzador estable de la instalación, así siguen funcionando después de cada actualización.
- **Menú de clic derecho** en las páginas y en las apps:
  - Imágenes: abrir en pestaña nueva, **guardar imagen como…**, copiar imagen y copiar su dirección.
  - Enlaces: abrir en pestaña nueva y copiar la dirección.
  - Texto seleccionado: copiar y buscar en DuckDuckGo.
  - Campos de texto: deshacer, rehacer, cortar, copiar, pegar y seleccionar todo.
  - Resto de la página: atrás, adelante, recargar y seleccionar todo.
- **Patagonia como navegador predeterminado de Windows:**
  - Al instalarse, Patagonia aparece en Configuración → Aplicaciones → Aplicaciones predeterminadas (solo para tu usuario, sin pedir permisos de administrador). Al desinstalarlo, se borra de la lista.
  - Nuevo botón en Configuración: **"Usar Patagonia como navegador predeterminado"**, que abre directamente la pantalla de Windows para elegirlo.
  - Los enlaces que abren otros programas (correo, WhatsApp, Claude…) llegan como pestaña nueva, aunque Patagonia ya esté abierto.
- La página de inicio por defecto pasa de Google a **DuckDuckGo**, igual que el buscador de la barra.
- **Zoom:** Ctrl + / Ctrl − / Ctrl 0, Ctrl + rueda del mouse y opciones en el clic derecho. Cuando la página no está al 100 %, aparece el porcentaje en la barra; tocándolo vuelve al tamaño normal. Funciona también en las apps.
- **Imprimir:** Ctrl+P o clic derecho → "Imprimir…", con el diálogo de impresión de Windows.
- **Actualización automática:** Patagonia consulta GitHub cada 6 horas. Si hay una versión nueva, la baja en segundo plano y aparece el botón verde **"⟳ Actualizar a X"**. Si no lo tocás, la versión nueva se usa la próxima vez que abras Patagonia. Se puede desactivar en Configuración.
- Nuevo flujo **"Windows - publicar versión"** en GitHub Actions: compila y crea el release en borrador con el instalador y los paquetes que usa la actualización automática.

### Importante

- La actualización automática empieza a funcionar **desde la 1.0.6**. Quien tenga la 1.0.5 tiene que instalar la 1.0.6 a mano una sola vez.

---

## [Android 1.1.0] - 2026-11-04

### Cambiado

- La app de Android pasa del WebView al motor **GeckoView (Firefox)** con **uBlock Origin** integrado. Con este motor los anuncios de YouTube no aparecen en las pruebas.
- Las búsquedas escritas en la barra de la app móvil usan DuckDuckGo.
- APK solo para arm64 (celulares de 2020 en adelante).
- Se quitó el chequeo automático de iPhone de GitHub Actions: no hay app de iPhone publicada.

### Conocido

- Al cambiar de pestaña, un video de YouTube queda en pausa y hay que darle play.

## [1.0.5] - 2026-11-03

### Seguridad y privacidad

- La ventana principal ahora usa `sandbox: true`, lo que aísla mejor el proceso de la interfaz.
- El buscador por defecto cuando se escribe texto en la barra de direcciones y en la pestaña nueva pasó a ser DuckDuckGo.

### Cambiado

- Ícono de la aplicación rehecho desde el SVG vectorial: centrado, nítido y con fondo transparente (el anterior salía de una foto pequeña estirada).
- La documentación se reorganizó en `docs/producto`, `docs/arquitectura` y `docs/desarrollo`; se eliminaron archivos duplicados u obsoletos.

### Corregido

- El emblema de la pantalla principal queda centrado en computadora y celular, sin el borde duplicado de la edición móvil.
- El texto de privacidad se adapta a pantallas angostas sin desbordarse.
- El instalador de Windows excluye el proyecto móvil y su clave familiar.

- El cierre de pestañas y del navegador ya no intenta consultar el identificador de una página después de destruirla al usar el bloqueador.
- El cierre espera las escrituras pendientes de favoritos, historial, configuración y sesión antes de destruir la ventana. Las pulsaciones repetidas comparten el mismo guardado.
- El guardado de sesión incluye los cambios que llegan durante una escritura lenta y conserva los últimos cambios para reintentar después de un fallo.
- Los avisos de permisos se cancelan al recargar, navegar, cambiar de pestaña o cerrar la página. Los resultados atrasados no se guardan ni se responden dos veces.
- Los permisos se solicitan de uno en uno desde la pestaña activa, con límites para solicitudes repetidas y reintentos después de fallos del diálogo.
- Las comprobaciones de notificaciones sin pestaña asociada solo reutilizan decisiones explícitas del mismo origen. La apertura de aplicaciones externas, los permisos desconocidos y las solicitudes de marcos secundarios se bloquean.
- Las actualizaciones de títulos y carga conservan los controles, el foco y los iconos sin cambios de las pestañas.
- La barra de direcciones respeta la composición de caracteres antes de procesar Enter o Escape.
- Los comandos de navegación no acceden al contenido de pestañas destruidas.
- Recargar la interfaz vuelve a mostrar las pestañas existentes y el estado del panel lateral.
- La barra de direcciones descarta borradores al cambiar de pestaña y conserva la escritura en curso ante actualizaciones de la misma pestaña.
- Las direcciones locales sin protocolo usan HTTP en lugar de enviarse a una búsqueda.
- Se eliminaron los registros del contenido extraído por el asistente.

### Agregado

- Patagonia AI en Android y iPhone, accesible desde la barra superior y el menú, con resumen local de la página y consulta de título o dirección.
- Primera edición móvil compartida para Android y iPhone, con la identidad visual oficial, pestañas, favoritos, historial, modo de escritorio y Centro de Privacidad.
- APK Android 1.0.0 firmado para pruebas familiares y proyecto de iPhone preparado para compilar y firmar en Xcode.
- Protección móvil integrada contra dominios publicitarios, rastreadores, cookies de terceros y espacios publicitarios comunes.

- Bloqueador real de anuncios y rastreadores compatible con listas de EasyList y uBlock Origin, activo antes de abrir las páginas.
- Conteos reales por pestaña en el Centro de privacidad y control para activar o desactivar la protección en un sitio concreto.
- Motor de filtros integrado para proteger desde el primer inicio y actualización automática de sus listas cada siete días.
- Icono oficial elegido por Roma, generado en nueve resoluciones y aplicado al ejecutable, instalador y accesos directos de Windows.
- Instalador Squirrel para Windows x64, ejecutable por usuario sin permisos de administrador.
- Carpeta de entrega familiar con instalador, ZIP portátil, guía breve y hashes SHA-256.
- Integración reproducible con Electron Forge y NuGet 7.9.0 verificado por SHA-256.
- Versión portátil para Windows x64, icono propio, perfil estable y acceso directo en la carpeta principal del proyecto.
- Comando `npm run build:portable`, que crea el ejecutable y verifica los archivos esenciales del paquete.
- Nueva página de pestaña con paisaje patagónico propio, buscador, accesos rápidos y accesos personalizados persistentes.
- Nueva identidad visual azul oscuro con barra de título integrada, pestañas redondeadas, barra de direcciones translúcida y Centro de privacidad lateral.
- Reapertura de las últimas diez pestañas cerradas desde el menú Archivo o con Ctrl/Cmd+Mayús+T, sin registrar cierres iniciados por la página ni direcciones que no puedan volver a cargarse.
- Aviso ante un fallo al guardar las pestañas durante el cierre, con opciones de volver al navegador, reintentar o cerrar sin guardar.
- Control explícito de permisos de sitios con bloqueo predeterminado, validación de origen y confirmación temporal para cámara, micrófono, ubicación, notificaciones y otras capacidades conocidas.
- Botones Atrás/Adelante que reflejan el historial de la pestaña activa y opción de detener la carga desde la barra o el menú.
- Botones de selección y cierre de pestañas con nombres accesibles, recuperación de foco al cerrar y desplazamiento a la pestaña activa.
- Búsqueda dentro de la página con Ctrl+F, contador, botones y atajos para recorrer coincidencias. La barra se cierra con Escape, al cambiar de pestaña o navegar, y descarta resultados atrasados.
- Menú del navegador en español con recarga de la página activa y funciones de edición.
- Aperturas de enlaces y formularios dentro de la barra de pestañas, con soporte de segundo plano y conservación de POST/referencia.
- Eliminación del estado de pestañas cerradas por la propia página.
- Instancia única por perfil, con recuperación de la ventana al abrir otra vez.
- Confirmación de cierre si quedan descargas activas, evitando avisos duplicados.
- Recuperación manual de pestañas cuyo proceso falla, con mensaje específico de falta de memoria.
- Configuración persistente de página de inicio y restauración de pestañas.
- Atajos de teclado de navegación y pestañas, respetando la composición de caracteres.
- Validación de emisores en los canales IPC de navegación y asistente, CSP de la interfaz y bloqueo de navegación externa en la ventana principal.
- Diagnóstico de arranque independiente de Patagonia con perfil temporal y códigos de salida verificables.
- Comando npm test y cinco pruebas de regresión de navegación/barra de direcciones.

### Documentado

- Instalación real, primer inicio y reapertura del programa instalado comprobados en Windows. La firma digital comercial queda pendiente para la publicación general.
- Ejecución real del paquete portátil, navegación a Google y recuperación de la pestaña después de cerrar y volver a abrir.
- Nueva interfaz verificada en Electron sobre Windows: página de inicio, diálogo de accesos rápidos y apertura y cierre del Centro de privacidad.
- Recuperación de una pestaña cerrada comprobada en Windows mediante Ctrl+W y Ctrl+Mayús+T; la opción también se verificó en el menú Archivo.
- Cierre y reapertura de la versión con espera de guardados comprobados en Windows, conservando las cinco pestañas y la selección.
- Reinicio verificado en Windows desde un acceso directo, restauración de cinco pestañas y comprobación real del menú, búsqueda con coincidencias y cambio de pestañas por teclado.
- Estado real de navegación, favoritos, historial, descargas, sesiones y asistente local.
- 101 pruebas aprobadas; validación manual de diálogos de permisos y fallo del guardado, validación en otras plataformas y conexión a un modelo de IA pendientes.
## [0.1.0] - En desarrollo

### Agregado

- Creación del repositorio oficial.
- README inicial del proyecto.
- Roadmap oficial.
- Definición de la visión del proyecto.
- Definición de la arquitectura inicial.
