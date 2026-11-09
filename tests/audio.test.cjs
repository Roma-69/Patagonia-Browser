const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { normalizarAjustes, crearAjustesAudio, listaPresets, FRECUENCIAS } = require("../src/main/audio/ajustes");
const { scriptAudio, MUNDO_AUDIO } = require("../src/main/audio/scriptPagina");
const { crearGestorAudio } = require("../src/main/audio/gestor");

test("los ajustes de audio se limpian y quedan dentro de los límites", () => {
    const limpio = normalizarAjustes({
        activo: true, preset: "inventado", bandas: [99, -99, "3", 2.26, null], volumen: 500, normalizar: "si"
    });
    assert.equal(limpio.activo, true);
    assert.equal(limpio.preset, "plano");
    assert.deepEqual(limpio.bandas, [12, -12, 3, 2.5, 0, 0, 0, 0, 0, 0]);
    assert.equal(limpio.volumen, 200);
    assert.equal(limpio.normalizar, false, "solo true prende la normalización");
    assert.deepEqual(normalizarAjustes(null), { activo: false, preset: "plano", bandas: Array(10).fill(0), volumen: 100, normalizar: false });
    assert.equal(normalizarAjustes({ preset: "personalizado" }).preset, "personalizado");
    assert.equal(listaPresets().length, 5);
    assert.ok(listaPresets().every(p => p.bandas.length === FRECUENCIAS.length));
});

test("los ajustes de audio se guardan en el equipo y se recuperan", async () => {
    const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "patagonia-audio-"));
    const archivo = path.join(carpeta, "audio.json");
    const ajustes = crearAjustesAudio(archivo, { demora: 5 });
    await ajustes.iniciar();
    const estado = ajustes.cambiar({ activo: true, preset: "electronica", bandas: listaPresets()[1].bandas, volumen: 130 });
    assert.equal(estado.volumen, 130);
    await ajustes.esperar();
    const otra = crearAjustesAudio(archivo);
    const leido = await otra.iniciar();
    assert.equal(leido.activo, true);
    assert.equal(leido.preset, "electronica");
    assert.deepEqual(leido.bandas, [6, 5, 3, 0, -1, 0, 1, 2, 3, 3]);
    await fs.rm(carpeta, { recursive: true, force: true });
});

// Web Audio de mentira: alcanza para ver qué se conecta y con qué valores.
function audioFalso() {
    const creados = [];
    const parametro = valor => ({ value: valor, setTargetAtTime(v) { this.value = v; } });
    class Nodo {
        constructor(tipo) { this.tipo = tipo; this.salidas = []; creados.push(this); }
        connect(destino) { this.salidas.push(destino); return destino; }
    }
    class AudioContext {
        constructor() { this.state = "running"; this.currentTime = 0; this.destination = new Nodo("destino"); AudioContext.instancias++; }
        async resume() { this.state = "running"; }
        createMediaElementSource(elemento) { const n = new Nodo("fuente"); n.elemento = elemento; return n; }
        createBiquadFilter() { return Object.assign(new Nodo("filtro"), { type: "", frequency: parametro(0), Q: parametro(1), gain: parametro(0) }); }
        createGain() { return Object.assign(new Nodo("ganancia"), { gain: parametro(1) }); }
        createDynamicsCompressor() {
            return Object.assign(new Nodo("compresor"), {
                threshold: parametro(-24), knee: parametro(30), ratio: parametro(12), attack: parametro(0), release: parametro(0)
            });
        }
    }
    AudioContext.instancias = 0;
    return { AudioContext, creados };
}

function pagina(html) {
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: "https://www.youtube.com/watch?v=x", runScripts: "outside-only" });
    const falso = audioFalso();
    dom.window.AudioContext = falso.AudioContext;
    return { dom, falso, correr: codigo => dom.window.eval(codigo) };
}

const espera = () => new Promise(resolver => setTimeout(resolver, 10));
const CONFIG = { activo: true, bandas: [6, 5, 3, 0, -1, 0, 1, 2, 3, 3], volumen: 100, normalizar: false };

test("si el ecualizador nunca se prendió, la página no se toca", () => {
    const { dom, falso, correr } = pagina(`<video src="blob:https://www.youtube.com/abc"></video>`);
    const resultado = correr(scriptAudio({ ...CONFIG, activo: false }));
    assert.deepEqual(JSON.parse(JSON.stringify(resultado)), { instalado: false, conectados: 0 });
    assert.equal(dom.window.__patagoniaAudio, undefined);
    assert.equal(falso.AudioContext.instancias, 0);
});

test("ecualiza el video de YouTube al reproducirse y aplica los cambios en vivo", async () => {
    const { dom, falso, correr } = pagina(`<video src="blob:https://www.youtube.com/abc"></video>`);
    correr(scriptAudio(CONFIG));
    const video = dom.window.document.querySelector("video");
    video.dispatchEvent(new dom.window.Event("play"));
    await espera();
    const filtros = falso.creados.filter(n => n.tipo === "filtro");
    assert.equal(filtros.length, 10);
    assert.deepEqual(filtros.map(f => f.gain.value), CONFIG.bandas);
    assert.equal(filtros[0].type, "lowshelf");
    assert.equal(filtros[9].type, "highshelf");
    const fuente = falso.creados.find(n => n.tipo === "fuente");
    assert.equal(fuente.elemento, video);
    // La cadena termina en los parlantes.
    let nodo = fuente;
    let pasos = 0;
    while (nodo.salidas.length && pasos++ < 30) nodo = nodo.salidas[0];
    assert.equal(nodo.tipo, "destino");

    // Apagar deja todo neutro sin cortar el sonido.
    const resultado = correr(scriptAudio({ ...CONFIG, activo: false }));
    assert.equal(resultado.conectados, 1);
    assert.ok(filtros.every(f => f.gain.value === 0));
    const limitador = falso.creados.filter(n => n.tipo === "compresor").at(-1);
    assert.equal(limitador.ratio.value, 1);

    // El refuerzo de volumen sube la entrada.
    correr(scriptAudio({ ...CONFIG, bandas: Array(10).fill(0), volumen: 150 }));
    const entrada = falso.creados.find(n => n.tipo === "ganancia");
    assert.equal(entrada.gain.value, 1.5);
    assert.equal(limitador.ratio.value, 20, "con el ecualizador prendido siempre hay limitador");
    assert.equal(falso.AudioContext.instancias, 1, "un solo contexto por página");
});

test("no toca audios de otros sitios sin permiso, que quedarían mudos", async () => {
    const { dom, falso, correr } = pagina(`<audio src="https://cdn.otro-sitio.com/tema.mp3"></audio>
        <audio id="mismo" src="/local.mp3"></audio>`);
    correr(scriptAudio(CONFIG));
    for (const audio of dom.window.document.querySelectorAll("audio")) audio.dispatchEvent(new dom.window.Event("play"));
    await espera();
    const fuentes = falso.creados.filter(n => n.tipo === "fuente");
    assert.equal(fuentes.length, 1);
    assert.equal(fuentes[0].elemento.id, "mismo");
});

test("si el audio no puede arrancar todavía, espera un clic y no deja la página muda", async () => {
    const { dom, falso, correr } = pagina(`<video src="blob:https://www.youtube.com/abc"></video>`);
    let permitir = false;
    falso.AudioContext.prototype.resume = async function () { if (permitir) this.state = "running"; };
    const original = falso.AudioContext;
    dom.window.AudioContext = class extends original { constructor() { super(); this.state = "suspended"; } };
    const video = dom.window.document.querySelector("video");
    Object.defineProperty(video, "paused", { value: false });
    correr(scriptAudio(CONFIG));
    await espera();
    assert.equal(falso.creados.filter(n => n.tipo === "fuente").length, 0, "sin contexto andando no se conecta nada");
    permitir = true;
    dom.window.document.dispatchEvent(new dom.window.Event("pointerdown"));
    await espera();
    assert.equal(falso.creados.filter(n => n.tipo === "fuente").length, 1);
});

test("el gestor manda los ajustes a las pestañas web en un mundo aislado", async () => {
    const llamadas = [];
    const contenido = url => ({
        getURL: () => url,
        isDestroyed: () => false,
        executeJavaScriptInIsolatedWorld: async (mundo, scripts) => { llamadas.push({ url, mundo, codigo: scripts[0].code }); }
    });
    let estado = normalizarAjustes({});
    const ajustes = { estado: () => estado, cambiar: datos => (estado = normalizarAjustes({ ...estado, ...datos })) };
    const pestanas = [contenido("https://www.youtube.com/"), contenido("file:///C:/inicio.html")];
    const gestor = crearGestorAudio({ ajustes, contenidos: () => pestanas });

    assert.equal(await gestor.paginaLista(pestanas[0]), false, "apagado: no inyecta nada al cargar");
    gestor.cambiar({ activo: true, volumen: 120 });
    await espera();
    assert.equal(llamadas.length, 1, "solo páginas web, no las internas");
    assert.equal(llamadas[0].mundo, MUNDO_AUDIO);
    assert.match(llamadas[0].codigo, /"volumen":120/);
    assert.equal(await gestor.paginaLista(pestanas[0]), true);
});
