const { test } = require("node:test");
const assert = require("node:assert/strict");
const { esLoginGoogle, userAgentFirefox, versionFirefox, cabecerasFirefox } = require("../src/main/googleLogin");

test("solo toca las páginas de inicio de sesión de Google", () => {
    assert.equal(esLoginGoogle("https://accounts.google.com/v3/signin/identifier"), true);
    assert.equal(esLoginGoogle("https://accounts.youtube.com/accounts/SetSID"), true);
    assert.equal(esLoginGoogle("https://mail.google.com/mail/u/0/"), false);
    assert.equal(esLoginGoogle("https://www.youtube.com/"), false);
    assert.equal(esLoginGoogle("http://accounts.google.com/"), false);
    assert.equal(esLoginGoogle("https://accounts.google.com.falso.com/"), false);
    assert.equal(esLoginGoogle("no es url"), false);
});

test("la versión de Firefox avanza sola con el tiempo", () => {
    assert.equal(versionFirefox(Date.UTC(2025, 11, 10)), 146);
    assert.equal(versionFirefox(Date.UTC(2026, 10, 9)), 156);
    assert.match(userAgentFirefox(Date.UTC(2026, 10, 9)), /rv:156\.0\) Gecko\/20100101 Firefox\/156\.0$/);
});

test("las cabeceras quedan como Firefox, sin client hints de Chrome", () => {
    const resultado = cabecerasFirefox({
        "User-Agent": "Chrome",
        "sec-ch-ua": "\"Chromium\";v=\"156\"",
        "Sec-CH-UA-Platform": "\"Windows\"",
        Accept: "text/html"
    }, Date.UTC(2026, 10, 9));
    assert.deepEqual(Object.keys(resultado).sort(), ["Accept", "User-Agent"]);
    assert.match(resultado["User-Agent"], /Firefox\/156\.0$/);
});

function pestanaFalsa(uaInicial) {
    const { EventEmitter } = require("node:events");
    const contenido = new EventEmitter();
    contenido.ua = uaInicial;
    contenido.cargas = [];
    contenido.frenada = false;
    contenido.getUserAgent = () => contenido.ua;
    contenido.setUserAgent = ua => { contenido.ua = ua; };
    contenido.isDestroyed = () => false;
    contenido.stop = () => { contenido.frenada = true; };
    contenido.loadURL = (url, opciones) => { contenido.cargas.push({ url, ua: opciones.userAgent }); return Promise.resolve(); };
    return contenido;
}
const esperar = () => new Promise(r => setImmediate(r));
const { conectarPestana } = require("../src/main/googleLogin");
const CHROME = "Mozilla/5.0 Chrome/156";

test("al entrar al login con clic, frena y recarga ya como Firefox", async () => {
    const c = pestanaFalsa(CHROME);
    conectarPestana(c, () => CHROME);
    let frenado = false;
    c.emit("will-navigate", { url: "https://accounts.google.com/signin", preventDefault: () => { frenado = true; } });
    await esperar();
    assert.equal(frenado, true);
    assert.match(c.ua, /Firefox/);
    assert.equal(c.cargas.length, 1);
    assert.match(c.cargas[0].ua, /Firefox/);
});

test("redirección al login (ej. desde YouTube) también recarga como Firefox", async () => {
    const c = pestanaFalsa(CHROME);
    conectarPestana(c, () => CHROME);
    let frenado = false;
    c.emit("will-redirect", { preventDefault: () => { frenado = true; } }, "https://accounts.google.com/ServiceLogin", false, true);
    await esperar();
    assert.equal(frenado, true);
    assert.equal(c.cargas[0].url, "https://accounts.google.com/ServiceLogin");
});

test("desde la barra de direcciones: frena la carga vieja y repite", async () => {
    const c = pestanaFalsa(CHROME);
    conectarPestana(c, () => CHROME);
    c.emit("did-start-navigation", {}, "https://accounts.google.com/", false, true);
    await esperar();
    assert.equal(c.frenada, true);
    assert.equal(c.cargas.length, 1);
});

test("dentro del login ya con Firefox no recarga (sin bucles)", async () => {
    const c = pestanaFalsa(userAgentFirefox());
    conectarPestana(c, () => CHROME);
    c.emit("did-start-navigation", {}, "https://accounts.google.com/v3/signin/challenge", false, true);
    c.emit("will-navigate", { url: "https://accounts.google.com/x", preventDefault: () => assert.fail("no debía frenar") });
    await esperar();
    assert.equal(c.cargas.length, 0);
});

test("al salir del login vuelve a Chrome sin recargar", async () => {
    const c = pestanaFalsa(userAgentFirefox());
    conectarPestana(c, () => CHROME);
    c.emit("did-start-navigation", {}, "https://mail.google.com/mail/u/0/", false, true);
    await esperar();
    assert.equal(c.ua, CHROME);
    assert.equal(c.cargas.length, 0);
});
