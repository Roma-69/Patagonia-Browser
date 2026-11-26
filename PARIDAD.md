# Paridad PC ↔ Android

Patagonia es **un solo navegador** en dos equipos. La regla es simple:

> **Lo que el usuario puede hacer en la PC, lo puede hacer en el celular, y al revés.**
> Lo que tiene que ser igual es la función, no el botón: cada equipo lo resuelve a su manera.

## Reglas

1. **Mismo número de versión** en las dos (desde la 1.3.0): `package.json` y `mobile/pubspec.yaml`.
   Las etiquetas de release siguen separadas: `vX.Y.Z` (Windows) y `movil-vX.Y.Z` (Android).
2. **Cada falla se revisa en las dos.** Si aparece en una, se mira si la otra tiene el mismo
   problema y se arregla en las dos en el mismo PR (o se anota acá por qué no aplica).
3. **Cada función nueva entra en las dos**, o se anota en la tabla con fecha para la otra.
4. **Nada sale sin la lista de prueba** de abajo, hecha en la PC y en el celular.
5. **Microsoft Store:** cada versión pasa de nuevo por certificación. Se agrupan los cambios;
   solo se manda una versión suelta si es una falla grave (ej. no se puede entrar a Gmail).

## Tabla de funciones

| Función | PC (Windows) | Android | Nota |
|---|---|---|---|
| Bloqueo de anuncios y rastreadores (incluye YouTube) | ✅ Ghostery; 1.4.0: si se cuela un anuncio de YouTube, se saltea solo | ✅ uBlock Origin | Motor distinto, mismo resultado. La red de seguridad de YouTube es solo de la PC: en el celu uBlock Origin no la necesitó. 1.4.1: en la PC los filtros de YouTube entran antes que la página (primer video sin anuncios); en el celu uBlock Origin ya lo hacía |
| Traductor privado (en el equipo) | ✅ 1.4.0: inglés incluido; 30 idiomas más se bajan la primera vez | ✅ todos los de Firefox | Mismo motor de Firefox |
| "Mostrar original" desde el menú | ✅ 1.3.0 (clic derecho) | ✅ | |
| Buscador: Brave Search por defecto, DuckDuckGo de respaldo | ✅ 1.3.0 Configuración → Buscador | ✅ 1.3.0 Configuración → Buscador | Sin depender de Google ni Microsoft para buscar |
| Modo chicos (tilde) | ✅ 1.3.0: Brave pasa a safe.search.brave.com | ✅ 1.3.0: Brave pasa a safe.search.brave.com | |
| Letra grande y modo lectura | ✅ | ✅ | |
| Abrir un sitio como app | ✅ "Crear app de esta página" | ✅ 1.3.0 "Agregar a la pantalla de inicio" | |
| Imprimir / guardar como PDF | ✅ Ctrl+P | ✅ 1.3.0 Menú → Imprimir | |
| Pasar favoritos PC ↔ celu sin cuenta | ✅ 1.3.0 exportar / importar archivo | ✅ 1.3.0 exportar / importar archivo | Formato estándar de favoritos (HTML) |
| Cámara y micrófono (Meet, videollamadas) | ✅ 1.3.0 | ✅ | Android: probar en la 1.3.0 |
| Compartir pantalla | ✅ 1.3.0 | — | Pendiente de evaluar en Android |
| Login de Google / Gmail | ⚠️ Nov 2026: Google bloquea el login en Electron. 1.4.1: se presenta como Chrome (`--login-google=chrome`, por defecto; `chromium` o `firefox` para probar) y, si Google igual no deja, avisa y ofrece abrirlo en otro navegador | ✅ (motor de Firefox, Google no lo bloquea) | En la PC depende de Google; la solución de fondo es un Chromium propio |
| Enlaces que abren otra app (Claude, Zoom, WhatsApp, correo) | ✅ 1.3.2 | ✅ 1.3.2 | Patagonia pregunta antes de abrirla |
| Aviso de versión nueva | ✅ se actualiza sola | ✅ 1.3.1: tocás el aviso, baja el APK y abre "Instalar" (sin pasar por GitHub) | Android pide confirmar con "Instalar"; la primera vez, permitir instalar desde Patagonia |
| Navegador predeterminado | ✅ Configuración → "Usar Patagonia como navegador predeterminado" | ✅ 1.3.1: Configuración → Navegador predeterminado | |
| Ver la versión instalada | ✅ Configuración | ✅ 1.3.1: Menú → Configuración → Versión | |
| Música con la pantalla apagada, la app minimizada o en otra pestaña | ✅ (Windows lo hace solo) | ✅ 1.3.0: también al cambiar de pestaña | |
| Separar pestañas en otra ventana | ✅ | — | No aplica en el celular |
| Compartir la página | — | ✅ | En la PC se copia la dirección |
| Fotos limpias (sin GPS ni marca FBMD de Meta) al subir y bajar | ✅ 1.4.0 al elegir, arrastrar o pegar fotos y al bajarlas | ✅ 1.4.0 en el selector de archivos y al bajarlas | Mismo resultado byte a byte (JS y Kotlin) |
| Sin carteles de cookies | ✅ 1.4.0 EasyList Cookie + annoyances-cookies (Ghostery) | ✅ 1.4.0 reglas generales de EasyList Cookie (extensión Patagonia Cuida) | En la PC hay además reglas por sitio: tapa algunos carteles más |
| Escudo contra estafas (pantalla roja) | ✅ 1.4.0 | ✅ 1.4.0 (extensión Patagonia Escudo) | Mismas reglas y lista (copia exacta de `src/shared/escudo.js`) |
| Descargas: ver progreso, abrir el archivo o la carpeta, cancelar | ✅ panel de descargas | ✅ próxima versión: Menú → Descargas + notificación con porcentaje + "Abrir" al terminar | Antes el celu solo mostraba un cartelito al empezar y al terminar |
| Aviso en descargas peligrosas | ✅ 1.4.0 cuadro antes de bajar | ✅ 1.4.0 cuadro antes de guardar | Mismas listas (`descargasPeligrosas.js` / `DescargasPeligrosas.kt`) |
| Modo incógnito | ✅ 1.4.0 pestañas de incógnito (Ctrl+Shift+N, botón 🕶️) | ✅ 1.4.0 Menú → Nueva pestaña de incógnito | En la PC no se puede mover a otra ventana (la ventana aparte usa la sesión normal) |
| Seguir donde lo dejaste (recuperar pestañas al volver a abrir) | ✅ 1.4.1: cerrar la última pestaña cierra Patagonia como la X y guarda la sesión | ✅ 1.4.1: se guardan al salir de la app (hasta 15); Configuración → "Recuperar pestañas al abrir Patagonia" | En Android cerrar la última pestaña deja el inicio y no cierra la app (así funcionan las apps en Android). Incógnito nunca se guarda en ninguno de los dos |
| Sonido de viento al buscar (con tilde para apagarlo) | ✅ 1.4.1 barra y cuadro del inicio | ✅ 1.4.1 barra y cuadro del inicio | Mismo archivo (`assets/sonidos/viento.ogg` = `res/raw/viento.ogg`); no suena al abrir una dirección |
| Traductor como ícono en la barra de direcciones | ✅ 1.4.0 menú del ícono 文A | ✅ 1.4.0 hoja del ícono | |
| Tu IA (abre la IA de cada persona; reemplaza a "Patagonia AI") | ✅ 1.4.1 tarjeta en el Centro de privacidad | ✅ 1.4.1 botón ✨ arriba, Menú y Configuración | Misma lista (`src/shared/tuIA.js` = `mobile/lib/src/tu_ia.dart`). No lee la página ni le manda nada a la IA |

## Lista de prueba antes de publicar

Hacerla **en la PC y en el celular** con la versión que se va a publicar:

- [ ] Abre rápido y muestra el inicio con el árbol bandera.
- [ ] Entrar a la cuenta de Google y abrir **Gmail**.
- [ ] **YouTube**: un video sin anuncios (en la PC, el **primer** video después de abrir Patagonia, entrando desde el inicio); en el celu, sigue sonando con la pantalla apagada y al pasar a otra pestaña.
- [ ] **WhatsApp Web** (PC) / acceso a WhatsApp (celu).
- [ ] **Google Meet**: se ve y se escucha (en la PC, también "Presentar ahora").
- [ ] **Traductor**: una página en inglés y una en portugués; "Mostrar original".
- [ ] **Buscador**: escribir algo en la barra → abre Brave Search. Cambiar a DuckDuckGo en Configuración → la próxima búsqueda va a DuckDuckGo. Volver a Brave.
- [ ] **Modo chicos**: tildar, buscar algo para adultos en Brave (tiene que abrir safe.search.brave.com y no mostrar nada para adultos), destildar.
- [ ] Favoritos: agregar uno, exportarlo e importarlo en el otro equipo.
- [ ] **Fotos limpias**: subir una foto sacada con el celu (con ubicación) a un sitio de prueba y bajar una foto de Facebook; ninguna conserva la ubicación.
- [ ] **Cookies**: entrar a un diario (ej. lanacion.com.ar o elpais.com) y que no aparezca el cartel de cookies.
- [ ] **Escudo**: abrir `https://mercadopago-seguridad.com` → pantalla roja; *Volver* vuelve; *Entrar igual* deja pasar.
- [ ] **Descargas**: bajar un `.exe` o `.apk` de un sitio desconocido → pregunta antes; uno de GitHub o Microsoft → no pregunta.
- [ ] **Descargas (lista)**: bajar un PDF → se ve el progreso (en el celu, Menú → Descargas y la notificación) → "Abrir" lo abre. Cancelar una descarga grande a la mitad → no queda archivo a medias.
- [ ] **Incógnito**: abrir una pestaña de incógnito, entrar a Gmail, cerrarla y abrir otra: no queda la sesión abierta ni en el historial.
- [ ] **Traductor**: no aparece ningún cartel; el ícono 文A traduce y muestra el original.
- [ ] **Seguir donde lo dejaste**: PC → abrir una página, cerrar todas las pestañas con la ✕ (la última cierra Patagonia) y volver a abrir → aparece esa página. Celu → abrir dos páginas, sacar Patagonia de las apps recientes y volver a abrir → están las dos. Con una de incógnito: no vuelve.
- [ ] **Viento**: buscar algo → suena la ráfaga; escribir windguru.cz → no suena; apagarlo en Configuración → no suena más.
- [ ] **Tu IA**: PC → Centro de privacidad → elegir una IA → "Abrir mi IA" abre una pestaña nueva. Celu → ✨ → elegir → abre otra pestaña; la segunda vez abre directo. "Otra" con una dirección propia también abre.
- [ ] Se instala **encima** de la versión anterior sin perder favoritos ni sesión.
