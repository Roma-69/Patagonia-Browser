// Electron se presenta como "... (KHTML, like Gecko) Patagonia Browser/1.0.7 Chrome/146... Electron/43... Safari/537.36".
// Sitios como WhatsApp Web no reconocen ese formato y piden "actualizar Chrome".
// Dejamos el formato estándar de Chrome: además expone menos datos (privacidad).
function limpiarUserAgent(ua) {
    return String(ua || "")
        .replace(/\(KHTML, like Gecko\) .*? Chrome\//, "(KHTML, like Gecko) Chrome/")
        .replace(/\sElectron\/\S+/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

module.exports = { limpiarUserAgent };
