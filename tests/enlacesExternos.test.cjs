const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { clasificarEnlace, PELIGROSOS } = require("../src/shared/protocolosExternos");
const { crearEnlacesExternos } = require("../src/main/enlacesExternos");
const { registrarAperturas } = require("../src/main/newWindows");

function fixture({ respuesta = 1, marcado = false, ventana = {} } = {}) {
    const avisos = [];
    const abiertos = [];
    const dialog = {
        showMessageBox: async (_v, opciones) => {
            avisos.push(opciones);
            return { response: respuesta, checkboxChecked: marcado };
        }
    };
    const shell = { openExternal: async url => { abiertos.push(url); } };
    const enlaces = crearEnlacesExternos({
        shell,
        dialog,
        obtenerVentana: () => (ventana ? { isDestroyed: () => false, ...ventana } : null)
    });
    return { enlaces, avisos, abiertos };
}

function pagina(url = "https://claude.ai/login") {
    const contenido = new EventEmitter();
    contenido.getURL = () => url;
    contenido.setWindowOpenHandler = fn => { contenido.abrirVentana = fn; };
    return contenido;
}

// Esperar a que termine el aviso, que es asincrónico.
const esperar = () => new Promise(resolve => setImmediate(() => setImmediate(resolve)));

test("el botón 'Abrir Claude' abre la aplicación después de que el usuario acepta", async () => {
    const f = fixture();
    const contenido = pagina();
    f.enlaces.observar(contenido);
    let frenado = false;
    contenido.emit("will-navigate", { preventDefault: () => { frenado = true; } }, "claude://login?code=secreto123");
    await esperar();
    assert.equal(frenado, true, "no deja la navegación fallida");
    assert.equal(f.avisos.length, 1);
    assert.match(f.avisos[0].message, /claude\.ai/);
    assert.match(f.avisos[0].detail, /claude:\/\/login/);
    assert.ok(!f.avisos[0].detail.includes("secreto123"), "no muestra el código de la sesión");
    assert.deepEqual(f.abiertos, ["claude://login?code=secreto123"]);
});

test("si el usuario cancela, no se abre nada", async () => {
    const f = fixture({ respuesta: 0 });
    const contenido = pagina();
    f.enlaces.observar(contenido);
    contenido.emit("will-navigate", { preventDefault() {} }, "zoommtg://zoom.us/join?x=1");
    await esperar();
    assert.deepEqual(f.abiertos, []);
});

test("'Permitir siempre' evita volver a preguntar en ese sitio, pero no en otro", async () => {
    const f = fixture({ marcado: true });
    const contenido = pagina("https://claude.ai/login");
    f.enlaces.observar(contenido);
    contenido.emit("will-navigate", { preventDefault() {} }, "claude://uno");
    await esperar();
    contenido.emit("will-navigate", { preventDefault() {} }, "claude://dos");
    await esperar();
    assert.equal(f.avisos.length, 1, "la segunda vez no pregunta");
    assert.deepEqual(f.abiertos, ["claude://uno", "claude://dos"]);

    const otro = pagina("https://sitio-raro.example/");
    f.enlaces.observar(otro);
    otro.emit("will-navigate", { preventDefault() {} }, "claude://tres");
    await esperar();
    assert.equal(f.avisos.length, 2, "otro sitio vuelve a preguntar");
});

test("las páginas web y la pestaña nueva siguen navegando como siempre", async () => {
    const f = fixture();
    const contenido = pagina();
    f.enlaces.observar(contenido);
    for (const destino of ["https://www.google.com/", "about:blank", "file:///C:/Patagonia/nueva.html", "blob:https://x.com/1"]) {
        let frenado = false;
        contenido.emit("will-navigate", { preventDefault: () => { frenado = true; } }, destino);
        assert.equal(frenado, false, `frenó ${destino}`);
    }
    await esperar();
    assert.equal(f.avisos.length, 0);
    assert.deepEqual(f.abiertos, []);
});

test("los enlaces usados para atacar Windows se bloquean sin preguntar", async () => {
    const f = fixture();
    const contenido = pagina();
    f.enlaces.observar(contenido);
    for (const esquema of PELIGROSOS) {
        let frenado = false;
        contenido.emit("will-navigate", { preventDefault: () => { frenado = true; } }, `${esquema}:/cualquier/cosa`);
        assert.equal(frenado, true, `${esquema} tiene que frenarse`);
    }
    // Una dirección larguísima también.
    contenido.emit("will-navigate", { preventDefault() {} }, `raro://${"a".repeat(3000)}`);
    await esperar();
    assert.equal(f.avisos.length, 0);
    assert.deepEqual(f.abiertos, []);
});

test("una página no puede llenar la pantalla de avisos", async () => {
    let soltar;
    const avisos = [];
    const abiertos = [];
    const enlaces = crearEnlacesExternos({
        shell: { openExternal: async url => { abiertos.push(url); } },
        dialog: {
            showMessageBox: (_v, opciones) => {
                avisos.push(opciones);
                return new Promise(resolve => { soltar = resolve; });
            }
        },
        obtenerVentana: () => ({ isDestroyed: () => false })
    });
    const contenido = pagina();
    enlaces.observar(contenido);
    for (let i = 0; i < 20; i++) {
        contenido.emit("will-navigate", { preventDefault() {} }, `raro://${i}`);
    }
    await esperar();
    assert.equal(avisos.length, 1);
    soltar({ response: 0, checkboxChecked: false });
    await esperar();
    assert.deepEqual(abiertos, []);
});

test("también funciona con enlaces que abren una ventana nueva", async () => {
    const f = fixture();
    const contenido = pagina();
    let creada = false;
    registrarAperturas({
        contenido,
        crearVista: () => ({ webContents: {} }),
        agregarPestana: () => { creada = true; },
        puedeAbrir: () => true,
        abrirExterno: destino => f.enlaces.desdeVentanaNueva(contenido, destino)
    });
    assert.deepEqual(contenido.abrirVentana({ url: "claude://desde-ventana" }), { action: "deny" });
    await esperar();
    assert.deepEqual(f.abiertos, ["claude://desde-ventana"]);
    assert.equal(creada, false);
    // Una página web normal sigue abriéndose como pestaña dentro de Patagonia.
    assert.equal(contenido.abrirVentana({ url: "https://www.windguru.cz/" }).action, "allow");
});

test("sin ventana de Patagonia no se abre nada", async () => {
    const f = fixture({ ventana: null });
    assert.equal(await f.enlaces.abrir("claude://x", "claude.ai"), false);
    assert.deepEqual(f.abiertos, []);
});

test("clasificarEnlace aguanta direcciones raras", () => {
    for (const valor of [undefined, null, "", "   ", "sin-dos-puntos", "://x", "1raro://x", ":vacio"]) {
        assert.equal(clasificarEnlace(valor).tipo, "bloqueado", `${valor}`);
    }
    assert.equal(clasificarEnlace("CLAUDE://Login").tipo, "externo");
    assert.equal(clasificarEnlace("claude://a\nms-msdt:/x").tipo, "bloqueado", "sin saltos de línea");
});
