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

// Cómo se presenta Patagonia en el login de Google.
// Nov 2026: Google rechaza ("No se ha podido iniciar sesión. Es posible que el navegador
// no sea seguro") a todo lo que se disfraza: tanto el disfraz de Firefox como el user
// agent "limpio" de Chrome. Probado el 26/11/2026 con un correo inventado, en una
// sesión nueva sin cookies: si el user agent dice la verdad ("... Chrome/156 Electron/45
// ..."), Google pasa al paso siguiente; si dice Chrome o Firefox, rechaza en el acto.
// - "electron" (por defecto): en las páginas de login, Patagonia dice lo que es.
// - "chrome": como Chrome, con la marca "Google Chrome" (lo que se probó en la 1.4.1).
// - "chromium": sin tocar nada (el user agent limpio de Chrome que usa todo Patagonia).
// - "firefox": el disfraz anterior.
// Para probar otra forma, se abre Patagonia con --login-google=chrome (o chromium, firefox).
const MODOS_LOGIN = ["electron", "chrome", "chromium", "firefox"];

function modoLogin(argv = process.argv) {
    for (const argumento of argv || []) {
        const encontrado = /^--login-google=(\w+)$/.exec(String(argumento));
        if (encontrado && MODOS_LOGIN.includes(encontrado[1].toLowerCase())) return encontrado[1].toLowerCase();
    }
    return "electron";
}

// El user agent honesto: como el de Chrome, con "Electron/x" al final (sin el nombre
// de la app, que Electron mete con un espacio y no es un formato estándar).
function userAgentElectron(versiones = process.versions) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${versiones.chrome} Electron/${versiones.electron} Safari/537.36`;
}

// Solo cambia el user agent; las pistas del navegador (sec-ch-ua) quedan como las
// manda el motor ("Chromium"), que es la verdad.
function cabecerasElectron(cabeceras, ua = userAgentElectron()) {
    const nuevas = {};
    for (const [nombre, valor] of Object.entries(cabeceras || {})) {
        if (nombre.toLowerCase() !== "user-agent") nuevas[nombre] = valor;
    }
    nuevas["User-Agent"] = ua;
    return nuevas;
}

// Suma la marca "Google Chrome" a una lista de marcas (sec-ch-ua), si falta.
// Ej.: '"Chromium";v="156", "Not_A Brand";v="24"' → '... , "Google Chrome";v="156"'.
function conMarcaChrome(valor) {
    const texto = String(valor || "");
    if (!texto || /"Google Chrome"/.test(texto)) return texto;
    const chromium = /"Chromium";v="([^"]+)"/.exec(texto);
    if (!chromium) return texto;
    return `${texto}, "Google Chrome";v="${chromium[1]}"`;
}

function cabecerasChrome(cabeceras) {
    const nuevas = { ...(cabeceras || {}) };
    for (const nombre of Object.keys(nuevas)) {
        const minuscula = nombre.toLowerCase();
        if (minuscula === "sec-ch-ua" || minuscula === "sec-ch-ua-full-version-list") {
            nuevas[nombre] = conMarcaChrome(nuevas[nombre]);
        }
    }
    return nuevas;
}

function cabecerasDelLogin(cabeceras, modo) {
    if (modo === "electron") return cabecerasElectron(cabeceras);
    if (modo === "firefox") return cabecerasFirefox(cabeceras);
    if (modo === "chrome") return cabecerasChrome(cabeceras);
    return cabeceras;
}

// Electron permite un solo onBeforeSendHeaders por sesión: los otros ajustes
// de cabeceras (por ejemplo el modo chicos) se pasan en "extras".
function instalarLoginGoogle({ app, sesion, userAgentNormal, extras = [], modo = modoLogin() }) {
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
            ? cabecerasDelLogin(detalles.requestHeaders, modo)
            : detalles.requestHeaders;
        for (const ajustar of extras) cabeceras = ajustar(detalles.url, cabeceras);
        responder({ requestHeaders: cabeceras });
    });
    // Lo que lee la página (navigator.userAgent, etc.) lo cambia googleLoginPreload.js.
}

module.exports = {
    esLoginGoogle, pedidoDelLogin, userAgentFirefox, versionFirefox, cabecerasFirefox,
    MODOS_LOGIN, modoLogin, userAgentElectron, cabecerasElectron, conMarcaChrome, cabecerasChrome, cabecerasDelLogin, instalarLoginGoogle
};
