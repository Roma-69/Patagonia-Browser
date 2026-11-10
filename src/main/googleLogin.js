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
    sesion.webRequest.onBeforeSendHeaders((detalles, responder) => {
        let cabeceras = esLoginGoogle(detalles.url)
            ? cabecerasFirefox(detalles.requestHeaders)
            : detalles.requestHeaders;
        for (const ajustar of extras) cabeceras = ajustar(detalles.url, cabeceras);
        responder({ requestHeaders: cabeceras });
    });

    // Además del pedido de red, la página lee navigator.userAgent. Ese valor se
    // fija cuando ARRANCA la navegación: si cambiamos el user agent recién en
    // "did-start-navigation", el login carga diciendo Chrome por dentro y Firefox
    // en las cabeceras, y Google lo rechaza ("el navegador no es seguro").
    // Por eso, al ENTRAR al login con el user agent equivocado, frenamos esa
    // carga y la repetimos ya con el de Firefox. Al salir solo lo devolvemos.
    app.on("web-contents-created", (_evento, contenido) => conectarPestana(contenido, userAgentNormal));
}

function conectarPestana(contenido, userAgentNormal) {
    const recargarConFirefox = url => {
        const ua = userAgentFirefox();
        contenido.setUserAgent(ua);
        setImmediate(() => {
            if (!contenido.isDestroyed()) contenido.loadURL(url, { userAgent: ua }).catch(() => {});
        });
    };
    const entraConUAViejo = url => esLoginGoogle(url) && contenido.getUserAgent() !== userAgentFirefox();

    // Navegaciones que pide la página (clic en "Iniciar sesión"): se pueden frenar antes de arrancar.
    contenido.on("will-navigate", evento => {
        if (!entraConUAViejo(evento.url)) return;
        evento.preventDefault();
        recargarConFirefox(evento.url);
    });
    // Redirecciones (YouTube, Gmail, etc. mandan al login con un 302).
    contenido.on("will-redirect", (evento, url, _m, principal) => {
        if (principal === false || !entraConUAViejo(url)) return;
        evento.preventDefault();
        recargarConFirefox(url);
    });
    // Navegaciones del navegador (barra de direcciones, favoritos): no se pueden
    // frenar antes, así que si arrancaron con el user agent viejo se repiten.
    contenido.on("did-start-navigation", (_e, url, mismaPagina, principal) => {
        if (!principal || mismaPagina) return;
        if (entraConUAViejo(url)) {
            contenido.stop();
            recargarConFirefox(url);
        } else if (!esLoginGoogle(url)) {
            const normal = userAgentNormal();
            if (contenido.getUserAgent() !== normal) contenido.setUserAgent(normal);
        }
    });
}

module.exports = { conectarPestana, esLoginGoogle, userAgentFirefox, versionFirefox, cabecerasFirefox, instalarLoginGoogle };
