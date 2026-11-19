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

test("el preload calcula la misma versión de Firefox que las cabeceras", () => {
    const preload = require("../src/main/googleLoginPreload");
    for (const fecha of [Date.UTC(2025, 11, 10), Date.UTC(2026, 10, 10), Date.UTC(2028, 0, 1)]) {
        assert.equal(preload.versionFirefox(fecha), versionFirefox(fecha));
    }
});

test("el login no cambia el user agent de la pestaña (Chromium recargaría y cortaría la navegación)", () => {
    const fuente = require("node:fs").readFileSync(require.resolve("../src/main/googleLogin"), "utf8");
    assert.doesNotMatch(fuente, /setUserAgent\(/);
});

test("lo que pide la página de login también sale como Firefox (sin cortar Gmail)", () => {
    const { pedidoDelLogin } = require("../src/main/googleLogin");
    const login = "https://accounts.google.com/v3/signin/identifier?continue=x";
    // Recursos de otros servidores de Google pedidos desde el login.
    assert.equal(pedidoDelLogin({ url: "https://ssl.gstatic.com/accounts/a.js", resourceType: "script", referrer: "https://accounts.google.com/" }), true);
    assert.equal(pedidoDelLogin({ url: "https://play.google.com/log", resourceType: "xhr", referrer: "", frame: { url: login, top: { url: login } } }), true);
    assert.equal(pedidoDelLogin({ url: "https://www.google.com/recaptcha/api.js", resourceType: "subFrame", referrer: login }), true);
    // Al terminar el login, la pestaña va a Gmail o YouTube como Chrome normal.
    assert.equal(pedidoDelLogin({ url: "https://mail.google.com/mail/u/0/", resourceType: "mainFrame", referrer: login }), false);
    // Fuera del login no se toca nada.
    assert.equal(pedidoDelLogin({ url: "https://www.gstatic.com/x.js", resourceType: "script", referrer: "https://www.youtube.com/" }), false);
    assert.equal(pedidoDelLogin({ url: "https://www.gstatic.com/x.js", resourceType: "script", frame: { get url() { throw new Error("muerto"); } } }), false);
    assert.equal(pedidoDelLogin({}), false);
});

test("el disfraz también alcanza a los iframes del mismo origen", () => {
    const { disfrazFirefox } = require("../src/main/googleLoginPreload");
    const nuevoNavigator = () => {
        function Navigator() {}
        Object.defineProperty(Navigator.prototype, "userAgent", { get: () => "Chrome/156", configurable: true });
        Navigator.prototype.userAgentData = { brands: [] };
        return Navigator;
    };
    const iframeVentana = { Navigator: nuevoNavigator(), NavigatorUAData: function () {}, chrome: {} };
    function HTMLIFrameElement() {}
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { get: () => iframeVentana, configurable: true });
    const ventana = { Navigator: nuevoNavigator(), NavigatorUAData: function () {}, chrome: {} };
    global.window = ventana;
    global.HTMLIFrameElement = HTMLIFrameElement;
    try {
        disfrazFirefox(157);
        const nav = new ventana.Navigator();
        assert.match(nav.userAgent, /Firefox\/157\.0$/);
        assert.equal("userAgentData" in nav, false);
        assert.equal("NavigatorUAData" in ventana, false);
        assert.equal("chrome" in ventana, false);
        const dentro = new HTMLIFrameElement().contentWindow;
        assert.match(new dentro.Navigator().userAgent, /Firefox\/157\.0$/);
        assert.equal("chrome" in dentro, false);
    } finally {
        delete global.window;
        delete global.HTMLIFrameElement;
    }
});
