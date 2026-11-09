// Modo chicos: búsqueda segura forzada, YouTube restringido y bloqueo de
// sitios para adultos mediante el DNS familiar de Cloudflare (1.1.1.3).

const DNS_FAMILIAR = "https://family.cloudflare-dns.com/dns-query";

const BUSCADORES = [
    { dominio: /(^|\.)duckduckgo\.com$/, ruta: /^\/($|html|lite)/, param: "kp", valor: "1" },
    { dominio: /(^|\.)google\.[a-z.]+$/, ruta: /^\/(search|webhp|images|$)/, param: "safe", valor: "active" },
    { dominio: /(^|\.)bing\.com$/, ruta: /^\/(search|images|videos)/, param: "adlt", valor: "strict" },
    { dominio: /(^|\.)search\.yahoo\.com$/, ruta: /^\/search/, param: "vm", valor: "r" }
];

const DOMINIOS_YOUTUBE = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtubei\.googleapis\.com|youtube\.googleapis\.com)$/;

// Devuelve la dirección con búsqueda segura, o null si ya está bien o no es un buscador.
function urlSegura(direccion) {
    let url;
    try { url = new URL(direccion); } catch { return null; }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const buscador = BUSCADORES.find(b => b.dominio.test(host) && b.ruta.test(url.pathname));
    if (!buscador || url.searchParams.get(buscador.param) === buscador.valor) return null;
    url.searchParams.set(buscador.param, buscador.valor);
    return url.href;
}

// YouTube aplica el "modo restringido" cuando recibe esta cabecera.
function cabecerasChicos(direccion, cabeceras) {
    try {
        if (!DOMINIOS_YOUTUBE.test(new URL(direccion).hostname.toLowerCase())) return cabeceras;
    } catch { return cabeceras; }
    return { ...cabeceras, "YouTube-Restrict": "Strict" };
}

function crearModoChicos({ app, sesion }) {
    let activo = false;

    function aplicar(valor) {
        activo = Boolean(valor);
        try {
            app.configureHostResolver(activo
                ? { secureDnsMode: "secure", secureDnsServers: [DNS_FAMILIAR] }
                : { secureDnsMode: "automatic", secureDnsServers: [] });
        } catch (error) {
            console.error("No se pudo cambiar el DNS del modo chicos:", error.message);
        }
        // Que no queden direcciones guardadas de antes del cambio.
        Promise.resolve(sesion.clearHostResolverCache?.()).catch(() => {});
    }

    // Si se entra a un buscador sin búsqueda segura, se recarga con ella.
    app.on("web-contents-created", (_evento, contenido) => {
        contenido.on("did-start-navigation", (_e, url, mismaPagina, principal) => {
            if (!activo || !principal) return;
            const segura = urlSegura(url);
            if (!segura) return;
            // Cambiar de dirección dentro del mismo evento no funciona: se hace al toque después.
            setImmediate(() => {
                if (!contenido.isDestroyed()) contenido.loadURL(segura).catch(() => {});
            });
        });
    });

    return {
        aplicar,
        activo: () => activo,
        ajustarCabeceras: (url, cabeceras) => (activo ? cabecerasChicos(url, cabeceras) : cabeceras)
    };
}

module.exports = { DNS_FAMILIAR, urlSegura, cabecerasChicos, crearModoChicos };
