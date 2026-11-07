const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// En la app empaquetada estas carpetas quedan fuera del .asar (ver forge.config.cjs)
// para que el hilo del traductor pueda abrirlas directamente.
const fueraDeAsar = ruta => ruta.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
const CARPETA_MODELOS = fueraDeAsar(path.join(__dirname, "..", "..", "..", "assets", "traductor"));
const RUTA_HILO = fueraDeAsar(path.join(__dirname, "bergamot", "translator-worker.js"));

// Pares con modelo local incluido (por ahora inglés→español).
function paresDisponibles(carpeta = CARPETA_MODELOS, sistema = fs) {
    try {
        return sistema.readdirSync(carpeta, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory() && /^[a-z]{4}$/.test(entrada.name))
            .filter(entrada => sistema.readdirSync(path.join(carpeta, entrada.name)).some(n => n.startsWith("model.")))
            .map(entrada => entrada.name);
    } catch { return []; }
}

function leerModelo(par, carpeta = CARPETA_MODELOS) {
    const dir = path.join(carpeta, par);
    const nombres = fs.readdirSync(dir);
    const leer = prefijo => {
        const nombre = nombres.find(n => n.startsWith(prefijo));
        if (!nombre) return null;
        const datos = fs.readFileSync(path.join(dir, nombre));
        const bytes = nombre.endsWith(".gz") ? zlib.gunzipSync(datos) : datos;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    };
    const model = leer("model.");
    const vocab = leer("vocab.");
    const shortlist = leer("lex.");
    if (!model || !vocab || !shortlist) throw new Error(`Falta el modelo de traducción ${par}.`);
    return { model, shortlist, vocabs: [vocab] };
}

function crearHilo() {
    const { Worker } = require("node:worker_threads");
    return new Worker(RUTA_HILO);
}

// Cliente del hilo traductor: lo arranca al primer uso y lo cierra si queda ocioso
// (el modelo ocupa memoria). Todo pasa en este equipo: no se usa internet.
function crearMotor({ crearProceso = crearHilo, cargarModelo = leerModelo, ocioso = 5 * 60 * 1000, temporizador = { setTimeout, clearTimeout } } = {}) {
    let hilo = null;
    let listo = null;
    let siguiente = 1;
    let reloj = null;
    const cargados = new Map();
    const pendientes = new Map();
    const cache = new Map();

    function fallarTodo(motivo) {
        for (const { rechazar } of pendientes.values()) rechazar(new Error(motivo));
        pendientes.clear();
    }
    function llamar(name, ...args) {
        return new Promise((resolver, rechazar) => {
            const id = siguiente++;
            pendientes.set(id, { resolver, rechazar });
            hilo.postMessage({ id, name, args });
        });
    }
    function asegurar() {
        if (listo) return listo;
        hilo = crearProceso();
        hilo.on("message", ({ id, result, error } = {}) => {
            const pendiente = pendientes.get(id);
            if (!pendiente) return;
            pendientes.delete(id);
            if (error) pendiente.rechazar(new Error(error.message || "Error del traductor."));
            else pendiente.resolver(result);
        });
        const caido = () => { hilo = null; listo = null; cargados.clear(); fallarTodo("El traductor se cerró."); };
        hilo.on("error", caido);
        hilo.on("exit", caido);
        listo = llamar("initialize", { cacheSize: 0 });
        return listo;
    }
    async function modelo(par) {
        await asegurar();
        if (!cargados.has(par)) {
            cargados.set(par, llamar("loadTranslationModel", { from: par.slice(0, 2), to: par.slice(2) }, cargarModelo(par)));
        }
        try { await cargados.get(par); } catch (error) { cargados.delete(par); throw error; }
    }
    function programarCierre() {
        temporizador.clearTimeout(reloj);
        reloj = temporizador.setTimeout(() => { if (!pendientes.size) cerrar(); }, ocioso);
    }
    async function traducir(par, textos) {
        const clave = t => `${par}\u0000${t}`;
        const faltan = [...new Set(textos.filter(t => !cache.has(clave(t))))];
        if (faltan.length) {
            await modelo(par);
            const respuesta = await llamar("translate", {
                models: [{ from: par.slice(0, 2), to: par.slice(2) }],
                texts: faltan.map(text => ({ text, html: false }))
            });
            faltan.forEach((texto, i) => cache.set(clave(texto), respuesta?.[i]?.target?.text ?? texto));
            if (cache.size > 20000) cache.clear();
        }
        programarCierre();
        return textos.map(t => cache.get(clave(t)) ?? t);
    }
    function cerrar() {
        temporizador.clearTimeout(reloj);
        const actual = hilo;
        hilo = null; listo = null; cargados.clear();
        fallarTodo("El traductor se cerró.");
        if (actual) actual.terminate?.();
    }
    return { traducir, cerrar };
}

module.exports = { crearMotor, paresDisponibles, leerModelo, CARPETA_MODELOS, RUTA_HILO, fueraDeAsar };
