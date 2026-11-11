const { test } = require("node:test");
const assert = require("node:assert/strict");
const { registrarCompartirPantalla, armarOpciones } = require("../src/main/compartirPantalla");
const { origenSeguro } = require("../src/main/permissions");

const FUENTES = [
    { id: "window:1:0", name: "Excel - planilla" },
    { id: "screen:0:0", name: "Entire screen" },
    { id: "window:2:0", name: "Bloc de notas" }
];

function fixture({ respuesta = 1, activa = true, propia = true } = {}) {
    let manejador;
    const sesion = { setDisplayMediaRequestHandler(fn) { manejador = fn; } };
    const contenido = { isDestroyed: () => false };
    const avisos = [];
    registrarCompartirPantalla({
        sesion,
        desktopCapturer: { getSources: async () => FUENTES },
        dialog: { showMessageBox: async (_v, o) => { avisos.push(o); return { response: respuesta }; } },
        webContents: { fromFrame: () => contenido },
        obtenerVentana: () => ({ isDestroyed: () => false }),
        esPestanaPropia: c => propia && c === contenido,
        esPestanaActiva: c => activa && c === contenido,
        origenSeguro,
        plataforma: "win32"
    });
    const pedir = (pedido = {}) => new Promise(resolve => manejador({
        frame: { url: "https://meet.google.com/abc" }, securityOrigin: "https://meet.google.com",
        videoRequested: true, audioRequested: false, ...pedido
    }, resolve));
    return { pedir, avisos };
}

test("screens come first, then windows", () => {
    assert.deepEqual(armarOpciones(FUENTES).map(o => o.etiqueta),
        ["Pantalla completa", "Ventana: Excel - planilla", "Ventana: Bloc de notas"]);
});

test("Meet can share the chosen screen, with PC sound on Windows", async () => {
    const f = fixture({ respuesta: 1 });
    const r = await f.pedir({ audioRequested: true });
    assert.equal(r.video.id, "screen:0:0");
    assert.equal(r.audio, "loopback");
    assert.match(f.avisos[0].message, /meet\.google\.com/);
    assert.equal(f.avisos[0].buttons[0], "Cancelar");
});

test("a window is shared without system audio", async () => {
    const r = await fixture({ respuesta: 2 }).pedir({ audioRequested: true });
    assert.equal(r.video.id, "window:1:0");
    assert.equal(r.audio, undefined);
});

test("cancel, background tabs, foreign pages and http are refused", async () => {
    assert.deepEqual(await fixture({ respuesta: 0 }).pedir(), {});
    const fondo = fixture({ activa: false });
    assert.deepEqual(await fondo.pedir(), {});
    assert.equal(fondo.avisos.length, 0);
    assert.deepEqual(await fixture({ propia: false }).pedir(), {});
    assert.deepEqual(await fixture().pedir({ securityOrigin: "http://meet.example", frame: { url: "http://meet.example" } }), {});
});
