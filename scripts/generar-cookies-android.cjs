// Arma la lista de avisos de cookies para el celular (extensión "Patagonia Cuida").
// En la PC lo hace Ghostery con EasyList Cookie completa. En Android, uBlock Origin
// no permite sumarle listas desde la app, así que se usan las reglas generales de
// EasyList Cookie (las que valen para cualquier sitio) como hoja de estilos, y sus
// excepciones por sitio para no romper páginas que la lista ya sabe que se rompen.
//
// Uso: node scripts/generar-cookies-android.cjs
const fs = require("node:fs/promises");
const path = require("node:path");
const { LISTAS_COOKIES } = require("../src/main/listasProteccion");

const CARPETA = path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "assets", "patagonia_cuida");
const EASYLIST_COOKIE = LISTAS_COOKIES.find(url => url.endsWith("/easylist-cookie.txt"));

// Reglas que se pueden escribir como CSS común (sin los selectores especiales de uBO).
function selectorValido(selector) {
    return Boolean(selector) && selector.length <= 300 &&
        !/:(?:-abp-|has-text|matches-css|xpath|upward|remove|style|watch-attr|min-text-length|others)\b/.test(selector) &&
        !selector.includes("{") && !selector.includes("}") && !selector.startsWith("+js");
}

// Un selector que el motor no entiende anula todo su bloque: se descartan los que
// no pasan por un analizador de CSS.
let documentoPrueba = null;
function selectorEntendible(selector) {
    if (!documentoPrueba) documentoPrueba = new (require("jsdom").JSDOM)("<!doctype html><p>").window.document;
    try { documentoPrueba.querySelector(selector); return true; } catch { return false; }
}

function procesar(texto) {
    const generales = new Set();
    const excepciones = new Map();
    for (const linea of texto.split(/\r?\n/)) {
        if (!linea || linea.startsWith("!") || linea.startsWith("[")) continue;
        let m = /^##(.+)$/.exec(linea);
        if (m && selectorValido(m[1]) && selectorEntendible(m[1])) { generales.add(m[1]); continue; }
        m = /^([^#]+)#@#(.+)$/.exec(linea);
        if (m && selectorValido(m[2]) && selectorEntendible(m[2])) {
            for (const dominio of m[1].split(",")) {
                const limpio = dominio.trim().toLowerCase();
                if (!limpio || limpio.startsWith("~") || limpio.includes("*") || limpio.includes("/")) continue;
                if (!excepciones.has(limpio)) excepciones.set(limpio, new Set());
                excepciones.get(limpio).add(m[2]);
            }
        }
    }
    return { generales: [...generales].sort(), excepciones };
}

function hojaDeEstilos(generales) {
    // Bloques chicos: si un selector raro no lo entiende el motor, se pierde solo su bloque.
    const bloques = [];
    for (let i = 0; i < generales.length; i += 200) {
        bloques.push(`${generales.slice(i, i + 200).join(",\n")} { display: none !important; }`);
    }
    return `/* Generado por scripts/generar-cookies-android.cjs desde EasyList Cookie (GPLv3 / CC BY-SA 3.0). No editar a mano. */\n${bloques.join("\n")}\n`;
}

function scriptExcepciones(excepciones) {
    const mapa = Object.fromEntries([...excepciones].sort(([a], [b]) => a.localeCompare(b)).map(([d, s]) => [d, [...s].sort()]));
    return `'use strict';
// Generado por scripts/generar-cookies-android.cjs. No editar a mano.
// Sitios donde EasyList Cookie pide NO ocultar algo (porque se rompe la página).
(() => {
  const EXCEPCIONES = ${JSON.stringify(mapa)};
  const host = location.hostname.toLowerCase();
  const partes = host.split('.');
  const selectores = [];
  for (let i = 0; i < partes.length - 1; i++) {
    const lista = EXCEPCIONES[partes.slice(i).join('.')];
    if (lista) selectores.push(...lista);
  }
  if (!selectores.length) return;
  // :not(#…) le suma peso a la regla para ganarle a la hoja general.
  const css = selectores.map(s => ':is(' + s + '):not(#patagonia-cuida-excepcion) { display: revert !important; }').join('\\n');
  const estilo = document.createElement('style');
  estilo.textContent = css;
  (document.head || document.documentElement).appendChild(estilo);
})();
`;
}

async function generar({ texto, carpeta = CARPETA } = {}) {
    if (texto === undefined) {
        const respuesta = await fetch(EASYLIST_COOKIE, { signal: AbortSignal.timeout(30000) });
        if (!respuesta.ok) throw new Error(`No se pudo bajar EasyList Cookie: HTTP ${respuesta.status}`);
        texto = await respuesta.text();
    }
    const { generales, excepciones } = procesar(texto);
    if (generales.length < 1000) throw new Error(`La lista vino incompleta (${generales.length} reglas).`);
    await fs.mkdir(carpeta, { recursive: true });
    await fs.writeFile(path.join(carpeta, "cookies.css"), hojaDeEstilos(generales));
    await fs.writeFile(path.join(carpeta, "cookies-excepciones.js"), scriptExcepciones(excepciones));
    console.log(`Avisos de cookies para el celu: ${generales.length} reglas, excepciones en ${excepciones.size} sitios.`);
    return { generales, excepciones };
}

if (require.main === module) generar().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { generar, procesar, selectorValido };
