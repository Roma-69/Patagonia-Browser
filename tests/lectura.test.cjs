const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { limpiarArticulo, paginaLectura } = require("../src/main/lectura");
const { crearPlantillaMenu } = require("../src/main/contextMenu");

test("el modo lectura saca scripts, eventos y enlaces peligrosos", () => {
    const html = `<p onclick="x()">Hola <a href="javascript:alert(1)">mal</a> <a href="/nota">bien</a></p>
        <script>alert(1)</script><img src="x.jpg" onerror="alert(1)"><img src="javascript:1">
        <iframe src="https://evil.example"></iframe><custom-tag>texto suelto</custom-tag><style>p{}</style>`;
    const limpio = limpiarArticulo(html, "https://diario.example/a/b", JSDOM);
    assert.doesNotMatch(limpio, /script|onclick|onerror|javascript:|iframe|<style|custom-tag/i);
    assert.match(limpio, /href="https:\/\/diario\.example\/nota"/);
    assert.match(limpio, /src="https:\/\/diario\.example\/a\/x\.jpg"/);
    assert.match(limpio, /texto suelto/);
});

test("la página de lectura no permite scripts y escapa el título", () => {
    const pagina = paginaLectura({ titulo: "<b>Hola</b>", sitio: "diario", contenido: "<p>x</p>", letraGrande: true });
    assert.match(pagina, /default-src 'none'/);
    assert.match(pagina, /&lt;b&gt;Hola&lt;\/b&gt;/);
    assert.match(pagina, /font: 24px/);
});

test("el clic derecho ofrece Modo lectura solo en páginas web", () => {
    const contenido = (url) => ({ getURL: () => url, navigationHistory: { canGoBack: () => false, canGoForward: () => false } });
    const etiquetas = url => crearPlantillaMenu({}, { contenido: contenido(url), clipboard: {}, abrirEnPestana() {}, leer() {} }).map(i => i.label);
    assert.ok(etiquetas("https://diario.example/nota").includes("Modo lectura"));
    assert.ok(!etiquetas("file:///C:/nueva.html").includes("Modo lectura"));
});
