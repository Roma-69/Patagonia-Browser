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
