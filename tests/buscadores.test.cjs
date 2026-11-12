const { test } = require("node:test");
const assert = require("node:assert/strict");
const buscadores = require("../src/shared/buscadores");
const { validarConfiguracion } = require("../src/main/settings");
const { prepararDireccion } = require("../src/main/navigation");

test("Brave Search es el buscador por defecto y DuckDuckGo el respaldo", () => {
    assert.equal(buscadores.BUSCADOR_PREDETERMINADO, "brave");
    assert.equal(buscadores.urlBusqueda("río Senguer", "brave"), "https://search.brave.com/search?q=r%C3%ADo%20Senguer");
    assert.equal(buscadores.urlBusqueda("río Senguer", "duckduckgo"), "https://duckduckgo.com/?q=r%C3%ADo%20Senguer");
    assert.equal(buscadores.obtenerBuscador("cualquiera").id, "brave");
});

test("la barra de direcciones usa el buscador elegido", t => {
    t.after(() => buscadores.elegirBuscador("brave"));
    buscadores.elegirBuscador("duckduckgo");
    assert.equal(prepararDireccion("clima Sarmiento"), "https://duckduckgo.com/?q=clima%20Sarmiento");
    buscadores.elegirBuscador("inventado");
    assert.equal(buscadores.buscadorActual(), "brave");
    assert.equal(prepararDireccion("clima Sarmiento"), "https://search.brave.com/search?q=clima%20Sarmiento");
});

test("la configuración guarda el buscador y pasa a Brave las de versiones anteriores", () => {
    assert.equal(validarConfiguracion({ inicio: "https://example.com/", restaurar: true }).buscador, "brave");
    assert.equal(validarConfiguracion({ inicio: "https://example.com/", restaurar: true, buscador: "duckduckgo" }).buscador, "duckduckgo");
    assert.equal(validarConfiguracion({ inicio: "https://example.com/", restaurar: true, buscador: "google" }).buscador, "brave");
    // Configuración vieja con el inicio de fábrica (DuckDuckGo): pasa a Brave.
    assert.equal(validarConfiguracion({ inicio: "https://duckduckgo.com/", restaurar: true }).inicio, "https://search.brave.com/");
    // Si ya eligió DuckDuckGo a propósito, se respeta.
    assert.equal(validarConfiguracion({ inicio: "https://duckduckgo.com/", restaurar: true, buscador: "duckduckgo" }).inicio, "https://duckduckgo.com/");
    // Una página de inicio propia nunca se toca.
    assert.equal(validarConfiguracion({ inicio: "https://www.windguru.cz/", restaurar: true }).inicio, "https://www.windguru.cz/");
});
