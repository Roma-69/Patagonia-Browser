const { test } = require("node:test");
const assert = require("node:assert/strict");
const { urlSegura, cabecerasChicos } = require("../src/main/modoChicos");
const { validarConfiguracion } = require("../src/main/settings");

test("fuerza la búsqueda segura en los buscadores", () => {
    assert.equal(urlSegura("https://duckduckgo.com/?q=hola"), "https://duckduckgo.com/?q=hola&kp=1");
    assert.equal(urlSegura("https://duckduckgo.com/?q=hola&kp=-2"), "https://duckduckgo.com/?q=hola&kp=1");
    assert.equal(urlSegura("https://www.google.com.ar/search?q=hola"), "https://www.google.com.ar/search?q=hola&safe=active");
    assert.equal(urlSegura("https://www.bing.com/search?q=hola"), "https://www.bing.com/search?q=hola&adlt=strict");
});

test("Brave Search pasa a su dominio con búsqueda segura estricta", () => {
    assert.equal(urlSegura("https://search.brave.com/search?q=hola"), "https://safe.search.brave.com/search?q=hola");
    assert.equal(urlSegura("https://search.brave.com/images?q=hola"), "https://safe.search.brave.com/images?q=hola");
    assert.equal(urlSegura("https://search.brave.com/"), "https://safe.search.brave.com/");
    assert.equal(urlSegura("https://safe.search.brave.com/search?q=hola"), null);
    assert.equal(
        urlSegura("https://safe.search.brave.com/search?q=hola&bypass_safesearch_strict=1"),
        "https://safe.search.brave.com/search?q=hola"
    );
    assert.equal(urlSegura("https://brave.com/download/"), null);
});

test("no toca lo que ya es seguro ni otros sitios", () => {
    assert.equal(urlSegura("https://duckduckgo.com/?q=hola&kp=1"), null);
    assert.equal(urlSegura("https://www.google.com/search?q=x&safe=active"), null);
    assert.equal(urlSegura("https://mail.google.com/mail/u/0/"), null);
    assert.equal(urlSegura("https://accounts.google.com/signin"), null);
    assert.equal(urlSegura("https://web.whatsapp.com/"), null);
    assert.equal(urlSegura("no es url"), null);
});

test("YouTube recibe la cabecera de modo restringido", () => {
    assert.equal(cabecerasChicos("https://www.youtube.com/watch?v=1", {})["YouTube-Restrict"], "Strict");
    assert.equal(cabecerasChicos("https://youtubei.googleapis.com/x", {})["YouTube-Restrict"], "Strict");
    assert.deepEqual(cabecerasChicos("https://example.com/", { a: "1" }), { a: "1" });
});

test("el modo chicos arranca apagado y solo se activa con true", () => {
    assert.equal(validarConfiguracion({ inicio: "https://duckduckgo.com/", restaurar: true }).modoChicos, false);
    assert.equal(validarConfiguracion({ inicio: "https://duckduckgo.com/", restaurar: true, modoChicos: "si" }).modoChicos, false);
    assert.equal(validarConfiguracion({ inicio: "https://duckduckgo.com/", restaurar: true, modoChicos: true }).modoChicos, true);
});
