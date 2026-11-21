const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const leer = (...partes) => fs.readFileSync(path.join(__dirname, "..", ...partes), "utf8");

test("PC: cerrar la última pestaña cierra la ventana (salvo al moverla a otra ventana)", () => {
    const main = leer("main.js");
    assert.match(main, /cerrarVentanaSiEsLaUltima && pestanas\.length === 1[^\n]*\n\s*ventanaPrincipal\.close\(\);/);
    assert.match(main, /cerrarPestana\(id, \{ cerrarVentanaSiEsLaUltima: false \}\)/);
});

test("Android: guarda las pestañas al salir y las recupera, sin incógnito", () => {
    const dart = leer("mobile", "lib", "src", "browser_shell.dart");
    assert.match(dart, /with WidgetsBindingObserver/);
    assert.match(dart, /WidgetsBinding\.instance\.addObserver\(this\)/);
    assert.match(dart, /WidgetsBinding\.instance\.removeObserver\(this\)/);
    assert.match(dart, /state == AppLifecycleState\.paused[\s\S]{0,200}_saveOpenTabs\(\)/);
    assert.match(dart, /if \(tab\.incognito \|\| !NavigationInput\.isWebUri\(url\)\) continue;/);
    assert.match(dart, /if \(_restoreTabs\) \{\s*_restoreOpenTabs\(/);
    assert.match(dart, /key: const ValueKey\('restoreTabs'\)/);
});

test("PARIDAD y CHANGELOG cuentan el cambio en las dos", () => {
    assert.match(leer("PARIDAD.md"), /\| Seguir donde lo dejaste/);
    assert.match(leer("CHANGELOG.md"), /Seguís donde lo dejaste/);
});
