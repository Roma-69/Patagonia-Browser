const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const cargar = Module._load;
const handlers = new Map();
Module._load = function(id, ...args) {
    if (id === 'electron') return { ipcMain: {
        handle(canal, handler) { assert.ok(!handlers.has(canal), 'no registrar dos veces el IPC'); handlers.set(canal, handler); },
        removeHandler(canal) { handlers.delete(canal); }
    } };
    return cargar.call(this, id, ...args);
};
let ElectronBlocker, crearProteccion;
try {
    ({ ElectronBlocker } = require('@ghostery/adblocker-electron'));
    ({ crearProteccion } = require('../src/main/adblocker'));
} finally { Module._load = cargar; }

async function entorno(t, opciones = {}) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patagonia-revision-'));
    const archivo = path.join(dir, 'incluido.bin');
    const engine = ElectronBlocker.parse('||tracker.invalid^');
    await fs.writeFile(archivo, engine.serialize());
    const sesion = {
        webRequest: { onBeforeRequest() {}, onHeadersReceived() {} },
        registerPreloadScript() { return 'prueba'; }, unregisterPreloadScript() {}
    };
    const gestor = crearProteccion({ sesion, directorioDatos: dir, rutaMotorIncluido: archivo,
        fetchImpl: null, ...opciones });
    t.after(async () => { gestor.cerrar(); await fs.rm(dir, { recursive:true, force:true }); });
    return {dir,archivo,engine,gestor};
}

test('un error al guardar una excepción no cambia la protección activa', async t => {
    const {dir,gestor} = await entorno(t);
    await gestor.iniciar();
    await fs.mkdir(path.join(dir, 'proteccion-sitios.json'));
    await assert.rejects(gestor.alternarSitio(17, 'https://chatgpt.com/'));
    assert.equal(gestor.estado(17, 'https://chatgpt.com/').activa, true);
});

test('cambios concurrentes conservan el estado y se pueden esperar al cerrar', async t => {
    const {dir,gestor} = await entorno(t);
    await gestor.iniciar();
    await Promise.all([
        gestor.alternarSitio(1,'https://a.example/'),
        gestor.alternarSitio(2,'https://b.example/'),
        gestor.alternarSitio(1,'https://a.example/')
    ]);
    await gestor.esperar();
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'proteccion-sitios.json'),'utf8')), ['b.example']);
    assert.equal(gestor.estado(1,'https://a.example/').activa, true);
    assert.equal(gestor.estado(2,'https://b.example/').activa, false);
});

test('iniciar dos veces no duplica los manejadores de protección', async t => {
    const {gestor}=await entorno(t);
    await Promise.all([gestor.iniciar(),gestor.iniciar()]);
    assert.equal(handlers.size,2);
});

test('una actualización que termina después del cierre no reconecta el bloqueador', async t => {
    let resolver;
    const antes=ElectronBlocker.fromLists;
    ElectronBlocker.fromLists=()=>new Promise(r=>{resolver=r;});
    t.after(()=>{ElectronBlocker.fromLists=antes;});
    const {gestor,engine}=await entorno(t,{fetchImpl:()=>{}});
    await gestor.iniciar();
    const actualizando=gestor.actualizarSiHaceFalta();
    while(!resolver) await new Promise(r=>setImmediate(r));
    gestor.cerrar();
    resolver(engine);
    await actualizando;
    assert.equal(handlers.size,0);
    assert.equal(gestor.estado(1,'https://a.example/').disponible,false);
});

test('la descarga inicial no bloquea indefinidamente el arranque', async t => {
    const antes = ElectronBlocker.fromLists;
    let signal;
    ElectronBlocker.fromLists = fetch => fetch('https://listas.example/');
    t.after(() => { ElectronBlocker.fromLists = antes; });
    const {archivo,gestor} = await entorno(t, {
        limiteDescargaMs: 15,
        fetchImpl: (_url, opciones) => { signal = opciones.signal; return new Promise(() => {}); }
    });
    await fs.rm(archivo);
    await assert.rejects(gestor.iniciar(), /tiempo/);
    assert.equal(signal.aborted, true);
    assert.equal(handlers.size, 0);
});

test('rechazar una respuesta HTTP o HTML conserva el motor válido anterior', async t => {
    const antes = ElectronBlocker.fromLists;
    ElectronBlocker.fromLists = fetch => fetch('https://listas.example/');
    t.after(() => { ElectronBlocker.fromLists = antes; });
    let respuesta = { ok: false, status: 503, text: async () => 'error' };
    const {dir,engine,gestor} = await entorno(t, {
        ahora: () => Date.now() + 8 * 24 * 60 * 60 * 1000,
        fetchImpl: async () => respuesta
    });
    const archivo = path.join(dir, 'patagonia-adblock-v2.bin');
    const original = engine.serialize(); await fs.writeFile(archivo, original);
    await gestor.iniciar();
    assert.equal(await gestor.actualizarSiHaceFalta(), false);
    respuesta = { ok: true, text: async () => '<!doctype html><html>portal cautivo</html>' };
    assert.equal(await gestor.actualizarSiHaceFalta(), false);
    assert.deepEqual(await fs.readFile(archivo), Buffer.from(original));
    assert.equal(gestor.estado(1, 'https://a.example/').activa, true);
});

test('guardar las listas descargadas permite el próximo arranque sin conexión', async t => {
    const antes = ElectronBlocker.fromLists;
    t.after(() => { ElectronBlocker.fromLists = antes; });
    const {archivo,dir,engine,gestor} = await entorno(t, { fetchImpl: () => {} });
    await fs.rm(archivo);
    ElectronBlocker.fromLists = async () => engine;
    await gestor.iniciar();
    assert.ok((await fs.stat(path.join(dir, 'patagonia-adblock-v2.bin'))).size > 0);
    assert.equal((await fs.readdir(dir)).some(nombre => nombre.endsWith('.tmp')), false);
    gestor.cerrar();
    ElectronBlocker.fromLists = async () => assert.fail('no necesita volver a descargar');
    const segunda = crearProteccion({
        sesion: { webRequest: { onBeforeRequest() {}, onHeadersReceived() {} },
            registerPreloadScript() { return 'prueba'; }, unregisterPreloadScript() {} },
        directorioDatos: dir, rutaMotorIncluido: archivo, fetchImpl: null
    });
    t.after(() => segunda.cerrar());
    await segunda.iniciar();
    assert.equal(segunda.estado(1, 'https://a.example/').activa, true);
});

test('las listas suman los avisos de cookies sin la lista de molestias variadas', () => {
    const { LISTAS, LISTAS_COOKIES } = require('../src/main/listasProteccion');
    for (const lista of LISTAS_COOKIES) assert.ok(LISTAS.includes(lista), lista);
    assert.ok(LISTAS.some(lista => lista.endsWith('/easylist/easyprivacy.txt')));
    assert.equal(LISTAS.some(lista => lista.includes('annoyances-others')), false);
});

test('al arrancar se borra el motor guardado con las listas viejas', async t => {
    const {dir,gestor} = await entorno(t);
    const viejo = path.join(dir, 'patagonia-adblock.bin');
    await fs.writeFile(viejo, 'viejo');
    await gestor.iniciar();
    await assert.rejects(fs.stat(viejo), { code: 'ENOENT' });
});

test('las reglas de cookies del celu salen de EasyList Cookie y respetan sus excepciones', async t => {
    const { procesar, generar } = require('../scripts/generar-cookies-android.cjs');
    const texto = ['! comentario', '##.aviso-cookies', '###banner-cookies', '##.raro:has-text(cookies)',
        'ejemplo.com.ar#@#.aviso-cookies', 'otro.com,~nada.com#@##banner-cookies'].join('\n');
    const { generales, excepciones } = procesar(texto);
    assert.deepEqual(generales, ['#banner-cookies', '.aviso-cookies']);
    assert.deepEqual([...excepciones.get('ejemplo.com.ar')], ['.aviso-cookies']);
    assert.deepEqual([...excepciones.get('otro.com')], ['#banner-cookies']);
    assert.equal(excepciones.has('nada.com'), false);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patagonia-cookies-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    await assert.rejects(generar({ texto, carpeta: dir }), /incompleta/);
});

test('el celu trae la extensión Patagonia Cuida con la hoja de cookies generada', async () => {
    const carpeta = path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'assets', 'patagonia_cuida');
    const manifiesto = JSON.parse(await fs.readFile(path.join(carpeta, 'manifest.json'), 'utf8'));
    assert.equal(manifiesto.browser_specific_settings.gecko.id, 'cuida@patagoniabrowser.com');
    const css = await fs.readFile(path.join(carpeta, 'cookies.css'), 'utf8');
    assert.match(css, /#onetrust-banner-sdk/);
    assert.ok(css.split('display: none !important').length > 50);
    const motor = await fs.readFile(path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'kotlin',
        'com', 'patagoniabrowser', 'patagonia_browser', 'gecko', 'GeckoEngine.kt'), 'utf8');
    assert.match(motor, /ensureBuiltIn\(CUIDA_PATH, CUIDA_ID\)/);
});
