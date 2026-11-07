const { test } = require("node:test");
const assert = require("node:assert/strict");
const { limpiarUserAgent } = require("../src/main/userAgent");
const { refrescarIconosSiCambioVersion } = require("../src/main/iconRefresh");

test("el user agent queda como Chrome estándar (WhatsApp Web lo acepta)", () => {
    const electron = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Patagonia Browser/1.0.7 Chrome/146.0.7680.65 Electron/43.1.1 Safari/537.36";
    assert.equal(limpiarUserAgent(electron),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.65 Safari/537.36");
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    assert.equal(limpiarUserAgent(chrome), chrome);
    assert.equal(limpiarUserAgent(undefined), "");
});

function sistemaFalso(inicial) {
    const archivos = new Map(inicial);
    return {
        archivos,
        readFileSync: f => { if (!archivos.has(f)) throw new Error("no existe"); return archivos.get(f); },
        writeFileSync: (f, v) => archivos.set(f, v),
        mkdirSync: () => {}
    };
}

test("refresca los íconos una sola vez por versión y solo en Windows", () => {
    const llamadas = [];
    const ejecutar = (programa, args) => llamadas.push([programa, ...args]);
    const sistema = sistemaFalso();
    const base = { carpeta: "C:/datos", plataforma: "win32", ejecutar, sistema };
    assert.equal(refrescarIconosSiCambioVersion({ ...base, version: "1.0.7" }), true);
    assert.deepEqual(llamadas, [["ie4uinit.exe", "-show"]]);
    assert.equal(refrescarIconosSiCambioVersion({ ...base, version: "1.0.7" }), false);
    assert.equal(llamadas.length, 1);
    assert.equal(refrescarIconosSiCambioVersion({ ...base, version: "1.0.8" }), true);
    assert.equal(llamadas.length, 2);
    assert.equal(refrescarIconosSiCambioVersion({ ...base, version: "1.0.9", plataforma: "linux" }), false);
    assert.doesNotThrow(() => refrescarIconosSiCambioVersion({ ...base, version: "2.0.0", ejecutar: () => { throw new Error("x"); } }));
});
