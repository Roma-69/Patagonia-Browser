const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const leer = (...partes) => fs.readFileSync(path.join(__dirname, "..", ...partes), "utf8");

test("Ctrl+Shift+N abre una pestaña de incógnito (atajo y menú)", () => {
    const { registrarAtajos } = require("../src/main/shortcuts");
    const contenido = new EventEmitter();
    let abiertas = 0;
    registrarAtajos(contenido, { nuevaIncognito: () => abiertas++ });
    let frenado = false;
    contenido.emit("before-input-event", { preventDefault: () => { frenado = true; } },
        { type: "keyDown", key: "N", control: true, shift: true, alt: false, meta: false });
    assert.equal(abiertas, 1);
    assert.equal(frenado, true);
    let plantilla;
    require("../src/main/menu").registrarMenu({ buildFromTemplate: p => { plantilla = p; return p; }, setApplicationMenu() {} }, {}, "win32");
    const item = plantilla[0].submenu.find(i => i.label === "Nueva pestaña de incógnito");
    assert.equal(item.accelerator, "CmdOrCtrl+Shift+N");
});

test("clic derecho en un enlace: abrirlo en una pestaña de incógnito", () => {
    const { crearPlantillaMenu } = require("../src/main/contextMenu");
    const abiertos = [];
    const plantilla = crearPlantillaMenu({ linkURL: "https://ejemplo.com/", mediaType: "none", editFlags: {}, selectionText: "" },
        { contenido: { navigationHistory: {} }, clipboard: {}, abrirEnPestana() {}, abrirEnIncognito: url => abiertos.push(url) });
    plantilla.find(i => i.label === "Abrir enlace en pestaña de incógnito").click();
    assert.deepEqual(abiertos, ["https://ejemplo.com/"]);
});

test("en la PC: sesión aparte en memoria, sin historial, sin guardar la sesión y se vacía al cerrar la última", () => {
    const main = leer("main.js");
    assert.match(main, /session\.fromPartition\(PARTICION_INCOGNITO/);
    assert.match(main, /const PARTICION_INCOGNITO = "patagonia-incognito";/, "sin persist: no se guarda en el disco");
    assert.match(main, /if \(!incognito\) observarVisitas\(vista\.webContents\)/);
    assert.match(main, /pestanas\.filter\(pestana => !pestana\.incognito\)/);
    assert.match(main, /if \(recordar && !pestanaCerrada\.incognito\) pestañasCerradas\.guardar/);
    assert.match(main, /sesion\.clearStorageData\(\)/);
    assert.match(main, /gestorProteccion\?\.agregarSesion\?\.\(sesionIncognito\)/, "anuncios, escudo y cookies también en incógnito");
    assert.match(main, /gestorDescargas\?\.agregarSesion\?\.\(sesionIncognito\)/, "aviso de descargas y fotos limpias también en incógnito");
    assert.match(main, /prepararSesionPaginas\(sesionIncognito\)/, "permisos, fotos limpias y login de Google también en incógnito");
});

test("la pestaña nueva de incógnito explica qué hace y qué no", () => {
    const html = leer("ui", "new-tab.html");
    assert.match(html, /Estás en modo incógnito/);
    assert.match(html, /no te hace invisible/);
    assert.match(leer("ui", "new-tab.js"), /get\("incognito"\) === "1"/);
});

test("en el celu: sesión privada de Gecko, extensiones activas en incógnito y sin historial", () => {
    const kotlin = leer("mobile", "android", "app", "src", "main", "kotlin", "com", "patagoniabrowser", "patagonia_browser", "gecko", "GeckoEngine.kt");
    assert.match(kotlin, /\.usePrivateMode\(privado\)/);
    assert.match(kotlin, /setAllowedInPrivateBrowsing\(extension, true\)/);
    const vista = leer("mobile", "android", "app", "src", "main", "kotlin", "com", "patagoniabrowser", "patagonia_browser", "gecko", "GeckoPlatformView.kt");
    assert.match(vista, /params\["private"\] == true/);
    assert.equal((vista.match(/newSession\(desktop, privado\)/g) || []).length, 2);
    const dart = leer("mobile", "lib", "src", "browser_shell.dart");
    assert.match(dart, /label: 'Nueva pestaña de incógnito'/);
    assert.match(dart, /if \(!tab\.incognito\) await _savePages\('history', _history\)/);
    assert.match(leer("mobile", "lib", "src", "gecko", "gecko_view.dart"), /'private': incognito/);
});
