// Corre en cada página antes que sus scripts. En el login de Google, Patagonia
// se presenta como Firefox: las cabeceras se cambian en googleLogin.js y acá se
// cambia lo que lee la página (navigator.userAgent y compañía). Además se borran
// dos huellas de Chrome que Firefox no tiene: navigator.userAgentData y
// window.chrome. Si Google nota la contradicción responde "el navegador no es
// seguro". Fuera de las páginas de login no se toca nada.
//
// Ojo: NO usar webContents.setUserAgent para esto. Si se llama mientras una
// pestaña carga, Chromium recarga la página actual y cancela la navegación
// (Gmail no abría y el login quedaba colgado después de la clave de paso).
const DOMINIOS_LOGIN = ["accounts.google.com", "accounts.youtube.com"];

// Misma cuenta que versionFirefox() en googleLogin.js (este preload corre en
// sandbox y no puede importar archivos propios; hay un test que las compara).
function versionFirefox(ahora = Date.now()) {
    const base = Date.UTC(2025, 11, 9);
    const ciclos = Math.floor((ahora - base) / (28 * 24 * 60 * 60 * 1000));
    return Math.max(146, 146 + ciclos - 1);
}

function disfrazFirefox(version) {
    const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
    const fijar = (nombre, valor) => {
        try {
            Object.defineProperty(Navigator.prototype, nombre, { get: () => valor, configurable: true });
        } catch { /* sin cambios */ }
    };
    fijar("userAgent", ua);
    fijar("appVersion", "5.0 (Windows)");
    fijar("vendor", "");
    fijar("productSub", "20100101");
    try { delete Navigator.prototype.userAgentData; } catch { /* sin cambios */ }
    try { delete window.chrome; } catch { /* sin cambios */ }
}

if (typeof location !== "undefined" && location.protocol === "https:" && DOMINIOS_LOGIN.includes(location.hostname)) {
    require("electron").contextBridge.executeInMainWorld({ func: disfrazFirefox, args: [versionFirefox()] });
}

if (typeof module !== "undefined") module.exports = { versionFirefox, disfrazFirefox };
