const { adsAndTrackingLists } = require("@ghostery/adblocker");

// Mismas listas que usa Ghostery para anuncios y rastreadores, más las de
// avisos de cookies (EasyList Cookie y uBlock Origin "annoyances-cookies").
// No se suma "annoyances-others": oculta cosas variadas (carteles de
// newsletter, botones de redes) y puede romper páginas sin que se note.
const PREFIJO = "https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets";
const LISTAS_COOKIES = [
    `${PREFIJO}/easylist/easylist-cookie.txt`,
    `${PREFIJO}/ublock-origin/annoyances-cookies.txt`
];
const LISTAS = Object.freeze([...adsAndTrackingLists, ...LISTAS_COOKIES]);

// Cambia cuando cambian las listas: el motor guardado con listas viejas se
// descarta y se usa el que viene en el instalador hasta la próxima descarga.
const ARCHIVO_MOTOR = "patagonia-adblock-v2.bin";
const ARCHIVOS_VIEJOS = Object.freeze(["patagonia-adblock.bin"]);

module.exports = { LISTAS, LISTAS_COOKIES, ARCHIVO_MOTOR, ARCHIVOS_VIEJOS };
