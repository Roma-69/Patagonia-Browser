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
| Bloqueo de anuncios y rastreadores (incluye YouTube) | ✅ Ghostery | ✅ uBlock Origin | Motor distinto, mismo resultado |
| Traductor privado (en el equipo) | ✅ 1.3.0: inglés incluido; portugués, francés, alemán e italiano se bajan la primera vez | ✅ | Mismo motor de Firefox |
| "Mostrar original" desde el menú | ✅ 1.3.0 (clic derecho) | ✅ | |
| Buscador: Brave Search por defecto, DuckDuckGo de respaldo | ✅ 1.3.0 Configuración → Buscador | ✅ 1.3.0 Configuración → Buscador | Sin depender de Google ni Microsoft para buscar |
| Modo chicos (tilde) | ✅ 1.3.0: Brave pasa a safe.search.brave.com | ✅ 1.3.0: Brave pasa a safe.search.brave.com | |
| Letra grande y modo lectura | ✅ | ✅ | |
| Abrir un sitio como app | ✅ "Crear app de esta página" | ✅ 1.3.0 "Agregar a la pantalla de inicio" | |
| Imprimir / guardar como PDF | ✅ Ctrl+P | ✅ 1.3.0 Menú → Imprimir | |
| Pasar favoritos PC ↔ celu sin cuenta | ✅ 1.3.0 exportar / importar archivo | ✅ 1.3.0 exportar / importar archivo | Formato estándar de favoritos (HTML) |
| Cámara y micrófono (Meet, videollamadas) | ✅ 1.3.0 | ✅ | Android: probar en la 1.3.0 |
| Compartir pantalla | ✅ 1.3.0 | — | Pendiente de evaluar en Android |
| Login de Google / Gmail | ✅ 1.0.11 | ✅ | |
| Aviso de versión nueva | ✅ se actualiza sola | ✅ 1.3.1: tocás el aviso, baja el APK y abre "Instalar" (sin pasar por GitHub) | Android pide confirmar con "Instalar"; la primera vez, permitir instalar desde Patagonia |
| Navegador predeterminado | ✅ Configuración → "Usar Patagonia como navegador predeterminado" | ✅ 1.3.1: Configuración → Navegador predeterminado | |
| Ver la versión instalada | ✅ Configuración | ✅ 1.3.1: Menú → Configuración → Versión | |
| Música con la pantalla apagada, la app minimizada o en otra pestaña | ✅ (Windows lo hace solo) | ✅ 1.3.0: también al cambiar de pestaña | |
| Separar pestañas en otra ventana | ✅ | — | No aplica en el celular |
| Compartir la página | — | ✅ | En la PC se copia la dirección |

## Lista de prueba antes de publicar

Hacerla **en la PC y en el celular** con la versión que se va a publicar:

- [ ] Abre rápido y muestra el inicio con el árbol bandera.
- [ ] Entrar a la cuenta de Google y abrir **Gmail**.
- [ ] **YouTube**: un video sin anuncios; en el celu, sigue sonando con la pantalla apagada y al pasar a otra pestaña.
- [ ] **WhatsApp Web** (PC) / acceso a WhatsApp (celu).
- [ ] **Google Meet**: se ve y se escucha (en la PC, también "Presentar ahora").
- [ ] **Traductor**: una página en inglés y una en portugués; "Mostrar original".
- [ ] **Buscador**: escribir algo en la barra → abre Brave Search. Cambiar a DuckDuckGo en Configuración → la próxima búsqueda va a DuckDuckGo. Volver a Brave.
- [ ] **Modo chicos**: tildar, buscar algo para adultos en Brave (tiene que abrir safe.search.brave.com y no mostrar nada para adultos), destildar.
- [ ] Favoritos: agregar uno, exportarlo e importarlo en el otro equipo.
- [ ] Se instala **encima** de la versión anterior sin perder favoritos ni sesión.
