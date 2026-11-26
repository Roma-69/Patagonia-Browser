// Corre en cada página antes que sus scripts. En YouTube pide al proceso
// principal los filtros contra anuncios (scriptlets) y los aplica en el acto,
// antes de que YouTube lea qué anuncios tiene que mostrar.
//
// Por qué: Ghostery los manda por un pedido asincrónico y, con el primer video
// después de abrir Patagonia, a veces llegaban tarde y el anuncio se colaba
// (al recargar la página ya andaba). Así llegan siempre a tiempo.
//
// Corre en sandbox: no puede importar archivos propios.
const SITIOS_YOUTUBE = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"];

function esPaginaYouTube(ubicacion) {
    return Boolean(ubicacion) && ubicacion.protocol === "https:" && SITIOS_YOUTUBE.includes(ubicacion.hostname);
}

if (typeof location !== "undefined" && typeof window !== "undefined" && window.top === window && esPaginaYouTube(location)) {
    try {
        const { ipcRenderer, webFrame } = require("electron");
        const codigo = ipcRenderer.sendSync("patagonia-scriptlets-youtube", location.href);
        if (typeof codigo === "string" && codigo) webFrame.executeJavaScript(codigo).catch(() => {});
    } catch { /* si falla, Ghostery los manda como siempre */ }
}

if (typeof module !== "undefined") module.exports = { esPaginaYouTube, SITIOS_YOUTUBE };
