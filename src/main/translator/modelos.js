// Modelos de traducción: el inglés→español viene incluido; los demás idiomas se bajan
// la primera vez que hacen falta, igual que en Android y en Firefox.
// Origen: servicio oficial de modelos de Firefox (colección translations-models-v2,
// licencia MPL-2.0). Cada archivo se verifica por SHA-256 antes de guardarlo.
// Solo se baja el modelo: el texto de las páginas nunca sale del equipo.

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { leerModelo } = require("./motor");

const REGISTROS = "https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models-v2/records";
const ADJUNTOS = "https://firefox-settings-attachments.cdn.mozilla.net/";
// Idiomas que Patagonia sabe detectar (ver idioma.js) y puede traducir al español.
const IDIOMAS = Object.freeze(["en", "pt", "fr", "de", "it"]);
const TIPOS = Object.freeze(["model", "lex", "vocab", "srcvocab", "trgvocab"]);
const ARQUITECTURAS = Object.freeze(["base-memory", "base", "tiny"]);
const TOPE_ARCHIVO = 120 * 1024 * 1024;

const sha256 = datos => crypto.createHash("sha256").update(datos).digest("hex");
const esPar = par => /^[a-z]{4}$/.test(par);

function compararVersion(a, b) {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d) return d;
    }
    return 0;
}

// De todos los registros de un par, elige un juego completo y coherente
// (misma versión y arquitectura): la versión estable más nueva, prefiriendo "base-memory".
function elegirArchivos(registros = []) {
    const grupos = new Map();
    for (const r of registros) {
        if (!r || r.filter_expression || !TIPOS.includes(r.fileType)) continue;
        if (typeof r.version !== "string" || !/^\d+(\.\d+)*$/.test(r.version)) continue;
        const adj = r.attachment;
        if (!adj || typeof adj.location !== "string" || !/^[0-9a-f]{64}$/.test(adj.hash || "")) continue;
        if (!/^[\w.-]+$/.test(r.name || "") || adj.location.includes("..")) continue;
        const clave = `${r.version}|${r.architecture || ""}`;
        if (!grupos.has(clave)) grupos.set(clave, { version: r.version, arquitectura: r.architecture || "", archivos: new Map() });
        grupos.get(clave).archivos.set(r.fileType, r);
    }
    const completos = [...grupos.values()].filter(g => {
        const a = g.archivos;
        return a.has("model") && a.has("lex") && (a.has("vocab") || (a.has("srcvocab") && a.has("trgvocab")));
    });
    const rango = g => {
        const i = ARQUITECTURAS.indexOf(g.arquitectura);
        return i === -1 ? ARQUITECTURAS.length : i;
    };
    completos.sort((a, b) => compararVersion(b.version, a.version) || rango(a) - rango(b));
    const elegido = completos[0];
    if (!elegido) return null;
    const archivos = [...elegido.archivos.values()].filter(r => r.fileType !== "vocab" || !elegido.archivos.has("srcvocab"));
    return archivos;
}

function descomprimir(datos, nombre) {
    if (nombre.endsWith(".zst")) {
        if (typeof zlib.zstdDecompressSync !== "function") throw new Error("Este equipo no puede abrir el modelo (zstd).");
        return zlib.zstdDecompressSync(datos, { maxOutputLength: TOPE_ARCHIVO });
    }
    if (nombre.endsWith(".gz")) return zlib.gunzipSync(datos, { maxOutputLength: TOPE_ARCHIVO });
    return datos;
}

function crearModelos({ carpetaIncluida, carpetaDescargas, pedir = globalThis.fetch, sistema = fs } = {}) {
    const enCurso = new Map();

    function tieneArchivos(carpeta, par) {
        try { return sistema.readdirSync(path.join(carpeta, par)).some(n => n.startsWith("model.")); }
        catch { return false; }
    }
    const local = par => esPar(par) && (tieneArchivos(carpetaIncluida, par) || tieneArchivos(carpetaDescargas, par));
    const soportado = idioma => IDIOMAS.includes(idioma);

    async function pedirJSON(url) {
        const respuesta = await pedir(url, { cache: "no-store" });
        if (!respuesta.ok) throw new Error(`El servicio de modelos respondió ${respuesta.status}.`);
        return respuesta.json();
    }

    async function registrosDe(origen, destino) {
        const url = `${REGISTROS}?sourceLanguage=${encodeURIComponent(origen)}&targetLanguage=${encodeURIComponent(destino)}`;
        const datos = await pedirJSON(url);
        return Array.isArray(datos?.data) ? datos.data : [];
    }

    async function bajar(par, archivos, alProgreso) {
        const total = archivos.reduce((s, r) => s + (Number(r.attachment.size) || 0), 0);
        let hechos = 0;
        const final = path.join(carpetaDescargas, par);
        const temporal = path.join(carpetaDescargas, `.${par}-${process.pid}-${Date.now()}`);
        sistema.mkdirSync(temporal, { recursive: true });
        try {
            for (const r of archivos) {
                const respuesta = await pedir(new URL(r.attachment.location, ADJUNTOS).href);
                if (!respuesta.ok) throw new Error(`No se pudo bajar ${r.name} (${respuesta.status}).`);
                const datos = Buffer.from(await respuesta.arrayBuffer());
                if (datos.length > TOPE_ARCHIVO) throw new Error("Archivo de modelo demasiado grande.");
                if (sha256(datos) !== r.attachment.hash) throw new Error(`${r.name} no pasó la verificación.`);
                const plano = descomprimir(datos, r.attachment.filename || "");
                if (/^[0-9a-f]{64}$/.test(r.decompressedHash || "") && sha256(plano) !== r.decompressedHash) {
                    throw new Error(`${r.name} no pasó la verificación.`);
                }
                sistema.writeFileSync(path.join(temporal, r.name), plano);
                hechos += Number(r.attachment.size) || 0;
                alProgreso?.({ hechos, total });
            }
            sistema.rmSync(final, { recursive: true, force: true });
            sistema.renameSync(temporal, final);
        } catch (error) {
            sistema.rmSync(temporal, { recursive: true, force: true });
            throw error;
        }
    }

    // Asegura que el par esté en el equipo. Devuelve false si Mozilla no tiene ese par.
    async function asegurarPar(origen, destino, alProgreso) {
        const par = `${origen}${destino}`;
        if (local(par)) return true;
        if (!enCurso.has(par)) {
            enCurso.set(par, (async () => {
                const archivos = elegirArchivos(await registrosDe(origen, destino));
                if (!archivos) return false;
                await bajar(par, archivos, alProgreso);
                return true;
            })().finally(() => enCurso.delete(par)));
        }
        return enCurso.get(par);
    }

    // Camino para traducir: directo si existe; si no, pasando por el inglés (como Firefox).
    async function preparar(origen, destino, alProgreso) {
        if (!soportado(origen) || origen === destino) throw new Error("Idioma no disponible.");
        if (await asegurarPar(origen, destino, alProgreso)) return [`${origen}${destino}`];
        if (origen === "en" || destino === "en") throw new Error("Idioma no disponible.");
        const ida = await asegurarPar(origen, "en", alProgreso);
        const vuelta = ida && await asegurarPar("en", destino, alProgreso);
        if (!ida || !vuelta) throw new Error("Idioma no disponible.");
        return [`${origen}en`, `en${destino}`];
    }

    function leer(par) {
        if (!esPar(par)) throw new Error("Par de idiomas inválido.");
        const carpeta = tieneArchivos(carpetaIncluida, par) ? carpetaIncluida : carpetaDescargas;
        return leerModelo(par, carpeta);
    }

    return { soportado, local, preparar, leer };
}

module.exports = { crearModelos, elegirArchivos, compararVersion, IDIOMAS, REGISTROS, ADJUNTOS };
