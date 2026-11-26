// El primer video de YouTube después de abrir Patagonia tiene que salir sin
// anuncios: los scriptlets se entregan antes que los scripts de la página.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const cargar = Module._load;
const electronFalso = { ipcMain: { handle() {}, removeHandler() {} } };
Module._load = function(id, ...args) {
    if (id === 'electron') return electronFalso;
    return cargar.call(this, id, ...args);
};
let crearProteccion, esPaginaYouTube;
try {
    ({ crearProteccion } = require('../src/main/adblocker'));
    ({ esPaginaYouTube } = require('../src/main/youtubePreload'));
} finally { Module._load = cargar; }

async function entorno(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patagonia-yt-'));
    // El motor real que viaja en el instalador (listas + scriptlets).
    const archivo = path.join(__dirname, '..', 'assets', 'patagonia-adblock.bin');
    const sesion = {
        webRequest: { onBeforeRequest() {}, onHeadersReceived() {} },
        registerPreloadScript() { return 'prueba'; }, unregisterPreloadScript() {}
    };
    const gestor = crearProteccion({ sesion, directorioDatos: dir, rutaMotorIncluido: archivo, fetchImpl: null });
    t.after(async () => { gestor.cerrar(); await fs.rm(dir, { recursive: true, force: true }); });
    await gestor.iniciar();
    return { dir, gestor };
}

test('YouTube recibe los scriptlets antes de cargar', async t => {
    const { gestor } = await entorno(t);
    const codigo = gestor.scriptletsYouTube(7, 'https://www.youtube.com/watch?v=abc');
    assert.ok(codigo.length > 0, 'tiene que haber código para YouTube');
    assert.match(codigo, /fallos\.push/, 'cada scriptlet va en su propio bloque');
});

test('la misma página nunca recibe los filtros dos veces', async t => {
    const { gestor } = await entorno(t);
    const codigo = gestor.scriptletsYouTube(7, 'https://www.youtube.com/watch?v=abc');
    assert.match(codigo, /Symbol\.for\("patagonia\.filtros"\)/);
    // Simula la página: el lote corre dos veces sobre el mismo "window".
    const vm = require('node:vm');
    const pagina = vm.createContext({});
    const lote = `(() => { const marca = Symbol.for("patagonia.filtros"); if (globalThis[marca]) return "repetido"; Object.defineProperty(globalThis, marca, { value: true }); return "aplicado"; })()`;
    assert.equal(vm.runInContext(lote, pagina), 'aplicado');
    assert.equal(vm.runInContext(lote, pagina), 'repetido');
});

test('fuera de YouTube no se entrega nada', async t => {
    const { gestor } = await entorno(t);
    assert.equal(gestor.scriptletsYouTube(7, 'https://www.example.com/'), '');
    assert.equal(gestor.scriptletsYouTube(7, 'http://www.youtube.com/'), '');
});

test('si la persona apagó la protección en YouTube, no se entrega nada', async t => {
    const { gestor } = await entorno(t);
    await gestor.alternarSitio(7, 'https://www.youtube.com/watch?v=abc');
    assert.equal(gestor.scriptletsYouTube(7, 'https://www.youtube.com/watch?v=abc'), '');
});

test('el preload reconoce solo las páginas de YouTube por https', () => {
    assert.equal(esPaginaYouTube(new URL('https://www.youtube.com/watch?v=1')), true);
    assert.equal(esPaginaYouTube(new URL('https://music.youtube.com/')), true);
    assert.equal(esPaginaYouTube(new URL('http://www.youtube.com/')), false);
    assert.equal(esPaginaYouTube(new URL('https://youtube.com.trucho.ar/')), false);
});
