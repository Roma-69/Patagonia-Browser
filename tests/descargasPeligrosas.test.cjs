const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const d = require("../src/shared/descargasPeligrosas");
const { registrarDescargas } = require("../src/main/downloads");

test("pregunta antes de bajar programas de sitios desconocidos", () => {
    assert.deepEqual(d.revisarDescarga({ nombre: "Comprobante.pdf.exe", url: "https://descargas-gratis.xyz/c.exe", pagina: "https://descargas-gratis.xyz/" }),
        { extension: "exe", sitio: "descargas-gratis.xyz" });
    assert.deepEqual(d.revisarDescarga({ nombre: "WhatsApp Plus.APK", url: "blob:https://raro.top/1", pagina: "https://raro.top/" }),
        { extension: "apk", sitio: "raro.top" });
    assert.equal(d.revisarDescarga({ nombre: "factura.vbs", url: "data:text/plain,x", pagina: "" }).sitio, "una página sin dirección");
});

test("no molesta con fotos, documentos ni programas de sitios conocidos", () => {
    for (const caso of [
        { nombre: "foto.jpg", url: "https://raro.top/foto.jpg" },
        { nombre: "factura.pdf", url: "https://raro.top/f.pdf" },
        { nombre: "setup.exe", url: "https://download.microsoft.com/s.exe" },
        { nombre: "Patagonia-1.4.0.exe", url: "https://objects.githubusercontent.com/x", pagina: "https://github.com/Roma-69/Patagonia-Browser" },
        { nombre: "aplicativo.exe", url: "https://servicios1.afip.gob.ar/a.exe" },
        { nombre: "driver.exe", url: "https://cdn.raro.net/d.exe", pagina: "https://www.nvidia.com/drivers" }
    ]) assert.equal(d.revisarDescarga(caso), null, caso.nombre);
});

test("si la persona elige 'No bajar', la descarga no arranca", () => {
    const sesion = new EventEmitter();
    const contenido = { getURL: () => "https://raro.top/" };
    const preguntas = [];
    let respuesta = false;
    registrarDescargas({
        ipcMain: { handle() {} }, sesion, shell: {}, obtenerVentana: () => null, esPestanaPropia: () => true,
        confirmarPeligrosa: (item, wc) => { preguntas.push([item.getFilename(), wc]); return respuesta; }
    });
    const item = Object.assign(new EventEmitter(), { getFilename: () => "virus.exe", getReceivedBytes: () => 0, getTotalBytes: () => 0, getSavePath: () => "" });
    let cancelada = false;
    sesion.emit("will-download", { preventDefault: () => { cancelada = true; } }, item, contenido);
    assert.equal(cancelada, true);
    assert.deepEqual(preguntas, [["virus.exe", contenido]]);
    respuesta = true;
    cancelada = false;
    sesion.emit("will-download", { preventDefault: () => { cancelada = true; } }, item, contenido);
    assert.equal(cancelada, false);
});

test("la PC usa el aviso en sus descargas", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert.match(main, /confirmarPeligrosa: confirmarDescargaPeligrosa/);
    assert.match(main, /buttons: \["No bajar", "Bajar igual"\]/);
});

test("el celu usa exactamente las mismas listas y lo pregunta antes de guardar", () => {
    const base = path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "kotlin", "com", "patagoniabrowser", "patagonia_browser");
    const kotlin = fs.readFileSync(path.join(base, "DescargasPeligrosas.kt"), "utf8");
    const lista = nombre => JSON.parse(`[${new RegExp(`val ${nombre} = listOf\\(([^)]*)\\)`).exec(kotlin)[1].trim().replace(/,\s*$/, "")}]`);
    assert.deepEqual(lista("EXTENSIONES"), [...d.EXTENSIONES]);
    assert.deepEqual(lista("SITIOS_CONFIABLES"), [...d.SITIOS_CONFIABLES]);
    const descargas = fs.readFileSync(path.join(base, "gecko", "GeckoDownloads.kt"), "utf8");
    assert.match(descargas, /DescargasPeligrosas\.revisar\(name, response\.uri, pagina\)/);
});

test("una dirección IP se muestra tal cual", () => {
    assert.equal(d.revisarDescarga({ nombre: "x.exe", url: "http://192.168.0.50/x.exe" }).sitio, "192.168.0.50");
});
