// Google bloquea el inicio de sesión en navegadores hechos con Electron
// ("No se ha podido iniciar sesión. Es posible que el navegador no sea seguro").
// Aunque el user agent diga Chrome, detecta que al motor le faltan cosas de
// Google Chrome. Con un user agent de Firefox, Google usa su flujo estándar
// (sin esas comprobaciones) y deja entrar. Solo lo aplicamos en las páginas de
// inicio de sesión: el resto de los sitios sigue viendo Patagonia como Chrome.

const DOMINIOS_LOGIN = new Set(["accounts.google.com", "accounts.youtube.com"]);

// Firefox saca versión cada 4 semanas; la 146 salió el 9/12/2025.
// Calculamos la versión actual (una atrás, por las dudas) para no quedar viejos.
function versionFirefox(ahora = Date.now()) {
    const base = Date.UTC(2025, 11, 9);
    const ciclos = Math.floor((ahora - base) / (28 * 24 * 60 * 60 * 1000));
    return Math.max(146, 146 + ciclos - 1);
}

function userAgentFirefox(ahora) {
    const v = versionFirefox(ahora);
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}

function esLoginGoogle(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "https:" && DOMINIOS_LOGIN.has(hostname.toLowerCase());
    } catch {
        return false;
    }
}

// La página de login pide cosas a otros servidores de Google (gstatic, play.google.com,
// apis.google.com, recaptcha...). Si esos pedidos salen como Chrome mientras la página
// dice ser Firefox, Google ve la contradicción y a veces corta con "No puedes acceder"
// (pasaba en el primer intento y andaba al reintentar). Por eso todo lo que pide la
// página de login también sale como Firefox.
// Ojo: las navegaciones de pestaña se deciden solo por su propia dirección. Si no, al
// terminar el login Gmail recibiría cabeceras de Firefox y no abriría.
function pedidoDelLogin(detalles = {}) {
    if (esLoginGoogle(detalles.url)) return true;
    if (detalles.resourceType === "mainFrame") return false;
    if (esLoginGoogle(detalles.referrer)) return true;
    try {
        const marco = detalles.frame;
        if (marco && (esLoginGoogle(marco.url) || esLoginGoogle(marco.top?.url))) return true;
    } catch { /* el marco ya no existe */ }
    return false;
}

// Cabeceras como las mandaría Firefox: otro user agent y sin "client hints"
// (Sec-CH-UA*), que solo existen en Chrome y delatan al motor.
function cabecerasFirefox(cabeceras, ahora) {
    const nuevas = {};
    for (const [nombre, valor] of Object.entries(cabeceras || {})) {
        const minuscula = nombre.toLowerCase();
        if (minuscula === "user-agent" || minuscula.startsWith("sec-ch-ua")) continue;
        nuevas[nombre] = valor;
    }
    nuevas["User-Agent"] = userAgentFirefox(ahora);
    return nuevas;
}

// Electron permite un solo onBeforeSendHeaders por sesión: los otros ajustes
// de cabeceras (por ejemplo el modo chicos) se pasan en "extras".
function instalarLoginGoogle({ app, sesion, userAgentNormal, extras = [] }) {
    // Borra las huellas de Chrome que quedan en el login (ver googleLoginPreload.js).
    if (typeof sesion.registerPreloadScript === "function") {
        sesion.registerPreloadScript({
            id: "patagonia-login-google",
            type: "frame",
            filePath: require("path").join(__dirname, "googleLoginPreload.js")
        });
    }

    sesion.webRequest.onBeforeSendHeaders((detalles, responder) => {
        let cabeceras = pedidoDelLogin(detalles)
            ? cabecerasFirefox(detalles.requestHeaders)
            : detalles.requestHeaders;
        for (const ajustar of extras) cabeceras = ajustar(detalles.url, cabeceras);
        responder({ requestHeaders: cabeceras });
    });
    // Lo que lee la página (navigator.userAgent, etc.) lo cambia googleLoginPreload.js.
}

module.exports = { esLoginGoogle, pedidoDelLogin, userAgentFirefox, versionFirefox, cabecerasFirefox, instalarLoginGoogle };
