# Programas de terceros incluidos en Patagonia móvil (Android)

## uBlock Origin 1.75.0

- Archivo: `android/app/src/main/assets/ublock_origin-1.75.0.xpi`
- Autor: Raymond Hill y colaboradores.
- Licencia: **GNU General Public License v3.0**. El texto completo viene dentro del `.xpi`
  (`LICENSE.txt`).
- Se incluye **sin modificar**, tal como lo publica su autor en addons.mozilla.org (firmado por Mozilla).
  SHA-256: `5b74415860456370644bd80f16125e865b0e6c356bb5dfcfb84069967eaa5287`
- Código fuente de esta versión: https://github.com/gorhill/uBlock/tree/1.75.0
- Las listas de filtros que usa (EasyList, EasyPrivacy, listas de uBlock y otras) tienen sus propios
  autores y licencias, detallados dentro de la extensión.

## GeckoView 159 (motor de Mozilla)

- Dependencia: `org.mozilla.geckoview:geckoview:159.0.20261022150525` (maven.mozilla.org).
- Autor: Mozilla y colaboradores.
- Licencia: **Mozilla Public License 2.0**.
- Código fuente: https://github.com/mozilla-firefox/firefox

## Patagonia Lector (propio)

- Archivo: `android/app/src/main/assets/patagonia_lector/`. Extensión chiquita de Patagonia (licencia MIT)
  que le pasa a Patagonia AI y al modo lectura el texto de la página abierta. No envía nada fuera del
  teléfono.

## Readability 0.6.0 (Mozilla)

- Archivo: `android/app/src/main/assets/patagonia_lector/Readability.js`, copiado **sin modificar** del
  paquete `@mozilla/readability` 0.6.0 (npm).
- Autor: Arc90 Inc. y Mozilla.
- Licencia: **Apache License 2.0** (el aviso de copyright y licencia está al principio del archivo).
- Código fuente: https://github.com/mozilla/readability/tree/0.6.0
- Se usa en el modo lectura para separar la nota del resto de la página.

## Patagonia Modo chicos (propio)

- Archivo: `android/app/src/main/assets/patagonia_chicos/`. Extensión de Patagonia (licencia MIT) que,
  solo con el modo chicos prendido, fuerza la búsqueda segura (DuckDuckGo, Google, Bing, Yahoo) y pone
  YouTube en modo restringido. Los sitios para adultos los bloquea el DNS familiar de Cloudflare
  (`family.cloudflare-dns.com`), que se usa únicamente mientras el modo chicos está prendido.

En la app, el menú **Acerca de y licencias** muestra estos créditos, el texto completo de la licencia
de uBlock Origin (copiado sin cambios del `LICENSE.txt` del `.xpi` a `assets/licenses/`) y los enlaces
al código fuente.

Patagonia no es un producto de Mozilla ni de Raymond Hill, y ellos no lo respaldan. "Firefox" es una
marca de Mozilla y Patagonia no la usa.
