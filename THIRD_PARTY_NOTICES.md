# Avisos de terceros / Third-Party Notices

Patagonia Browser es software libre bajo licencia MIT.
Copyright (c) 2026 Roma.69

Este proyecto incluye o usa componentes de terceros. Cada uno conserva
su propia licencia y sus avisos de copyright, que se detallan abajo.

## Componentes incluidos en la aplicación

| Componente | Licencia | Autor / Titular |
|---|---|---|
| [Electron](https://github.com/electron/electron) | MIT | Electron contributors / GitHub Inc. |
| [Chromium](https://www.chromium.org/) (incluido en Electron) | BSD-3-Clause y otras | The Chromium Authors |
| [@ghostery/adblocker-electron](https://github.com/ghostery/adblocker) | MPL-2.0 | Ghostery GmbH |
| [@mozilla/readability](https://github.com/mozilla/readability) | Apache-2.0 | Arc90 Inc. / Mozilla |
| [jsdom](https://github.com/jsdom/jsdom) | MIT | Elijah Insua y colaboradores |
| [electron-squirrel-startup](https://github.com/mongodb-js/electron-squirrel-startup) | Apache-2.0 | Lucas Hrabovsky |
| [Bergamot translator](https://github.com/browsermt/bergamot-translator) 0.4.9 (copia en `src/main/translator/bergamot`, con cambios marcados para rutas de Windows) | MPL-2.0 | Proyecto Bergamot / Mozilla |
| Modelo de traducción inglés→español de [Firefox Translations](https://github.com/mozilla/translations) (`assets/traductor`) | MPL-2.0 | Mozilla |

## Herramientas de desarrollo (no se distribuyen con la aplicación)

| Componente | Licencia | Autor / Titular |
|---|---|---|
| [@electron-forge/cli](https://github.com/electron/forge) | MIT | Samuel Attard y colaboradores |
| [@electron-forge/maker-squirrel](https://github.com/electron/forge) | MIT | Samuel Attard y colaboradores |

## Listas de filtrado

El bloqueador de anuncios puede usar listas públicas como EasyList y
EasyPrivacy (https://easylist.to/), que tienen doble licencia:
GPL-3.0 o CC BY-SA 3.0. Pertenecen a The EasyList authors.

Desde la 1.4.0 también usa EasyList Cookie (misma licencia y autores) y
la lista "annoyances-cookies" de uBlock Origin (GPL-3.0, Raymond Hill y
colaboradores) para ocultar los avisos de cookies. En el celular, las
reglas generales de EasyList Cookie van en
`mobile/android/app/src/main/assets/patagonia_cuida/` (generadas con
`scripts/generar-cookies-android.cjs`).

## Escudo contra estafas

Desde la 1.4.0, el escudo contra estafas usa las listas públicas
`phishing-filter` y `urlhaus-filter` del proyecto malware-filter
(https://gitlab.com/malware-filter, de curbengh), que reúnen datos de
OpenPhish, PhishTank (Cisco Talos), PhishStats y URLhaus (abuse.ch).
Cada fuente conserva su licencia y sus condiciones de uso. La lista se
guarda y se revisa en el equipo: Patagonia no manda a ningún lado qué
páginas se visitan. Copia incluida: `assets/escudo-lista.txt` (y la misma
en el celular), generada con `scripts/actualizar-listas-escudo.cjs`.

## Notas

- Los avisos completos de Chromium y Electron vienen con el instalador,
  en el archivo `LICENSES.chromium.html`.
- El código de @ghostery/adblocker-electron se usa sin modificaciones.
  Su código fuente está disponible en el enlace de arriba, como pide
  la licencia MPL-2.0.
- Los textos completos de cada licencia están en:
  - MIT: https://opensource.org/licenses/MIT
  - Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0
  - MPL-2.0: https://www.mozilla.org/MPL/2.0/
  - BSD-3-Clause: https://opensource.org/licenses/BSD-3-Clause
