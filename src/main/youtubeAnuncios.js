// Red de seguridad para YouTube en la PC. El bloqueador (Ghostery) frena los
// anuncios antes de que carguen, pero YouTube cambia seguido y cada tanto se
// cuela alguno hasta que las listas se actualizan. Si pasa, este script lo
// saltea solo: toca "Saltar" si está, y si no, adelanta el anuncio hasta el
// final (en silencio) para que siga la música o el video.
// Corre en un mundo aislado: la página no lo ve ni lo puede tocar.
const MUNDO_YOUTUBE = 1988;
const SITIOS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

function esYouTube(direccion) {
    try {
        const url = new URL(direccion);
        return url.protocol === "https:" && SITIOS.has(url.hostname.toLowerCase());
    } catch { return false; }
}

// Se manda como texto a la página: no puede usar nada de afuera.
function vigilarAnuncios() {
    if (window.__patagoniaAnuncios) return;
    window.__patagoniaAnuncios = true;
    let silenciadoPorPatagonia = false;
    function revisar() {
        const reproductor = document.querySelector(".html5-video-player");
        const video = reproductor && reproductor.querySelector("video");
        if (!reproductor || !video) return;
        if (!reproductor.classList.contains("ad-showing")) {
            // Terminó el anuncio: se devuelve el sonido si lo sacamos nosotros.
            if (silenciadoPorPatagonia) { video.muted = false; silenciadoPorPatagonia = false; }
            return;
        }
        if (!video.muted) { video.muted = true; silenciadoPorPatagonia = true; }
        const saltar = reproductor.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern");
        if (saltar) saltar.click();
        if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
            video.currentTime = video.duration;
        }
    }
    setInterval(revisar, 300);
    revisar();
}

const CODIGO = `(${vigilarAnuncios.toString()})();`;

// Se llama cuando una pestaña termina de armar la página.
function protegerYouTube(contenido, { activa = true } = {}) {
    if (!activa || !contenido || contenido.isDestroyed() || !esYouTube(contenido.getURL())) return false;
    contenido.executeJavaScriptInIsolatedWorld(MUNDO_YOUTUBE, [{ code: CODIGO }]).catch(() => {});
    return true;
}

module.exports = { protegerYouTube, esYouTube, vigilarAnuncios, CODIGO, MUNDO_YOUTUBE };
