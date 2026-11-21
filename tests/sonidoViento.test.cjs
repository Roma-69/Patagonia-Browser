const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { registrarSonidoViento, esBusquedaEscrita, ARCHIVO } = require("../src/main/sonidoViento");
const { prepararDireccion } = require("../src/main/navigation");
const leer = (...partes) => fs.readFileSync(path.join(__dirname, "..", ...partes), "utf8");

test("suena al buscar, no al abrir una dirección", () => {
    const busca = texto => esBusquedaEscrita(texto, prepararDireccion(texto));
    assert.equal(busca("clima sarmiento"), true);
    assert.equal(busca("windguru"), true);
    assert.equal(busca("windguru.cz"), false);
    assert.equal(busca("https://search.brave.com/search?q=hola"), false, "pegar el link de una búsqueda no cuenta");
    assert.equal(busca("localhost:3000"), false);
    assert.equal(busca("   "), false);
});

test("respeta el tilde y entrega el archivo solo a la interfaz de Patagonia", async () => {
    const ipcMain = new EventEmitter();
    const manejadores = {};
    ipcMain.handle = (canal, accion) => { manejadores[canal] = accion; };
    const enviados = [];
    const contenido = { send: canal => enviados.push(canal) };
    const ventana = { isDestroyed: () => false, webContents: contenido };
    let activo = true;
    const sonido = registrarSonidoViento({ ipcMain, obtenerVentana: () => ventana, activo: () => activo });
    assert.equal(sonido.sonar(), true);
    activo = false;
    assert.equal(sonido.sonar(), false);
    assert.deepEqual(enviados, ["sonido-viento"]);
    const propia = await manejadores["obtener-sonido-viento"]({ sender: contenido, senderFrame: contenido.mainFrame });
    assert.equal(propia.correcto, true);
    assert.equal(Buffer.from(propia.datos).subarray(0, 4).toString(), "OggS");
    const ajena = await manejadores["obtener-sonido-viento"]({ sender: {}, senderFrame: {} });
    assert.equal(ajena.correcto, false);
});

test("el mismo sonido en la PC y en el celu", () => {
    const pc = fs.readFileSync(ARCHIVO);
    const celu = fs.readFileSync(path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "res", "raw", "viento.ogg"));
    assert.ok(pc.equals(celu));
    assert.ok(pc.length < 64 * 1024, "liviano");
});

test("la búsqueda desde el inicio y desde la barra hacen sonar el viento", () => {
    const main = leer("main.js");
    assert.match(main, /esBusquedaEscrita\(direccion, prepararDireccion\(direccion\)\)\) sonidoViento\.sonar\(\)/);
    assert.match(main, /esNuevaPestanaPatagonia\(vista\.webContents\.getURL\(\)\) && esURLDeBusqueda\(destino\)\) sonidoViento\.sonar\(\)/);
    assert.match(leer("index.html"), /id="sonidoViento" type="checkbox"/);
});
