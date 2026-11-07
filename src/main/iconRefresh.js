const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

// Windows guarda los íconos en caché: después de una actualización que cambia el ícono,
// el acceso directo puede seguir mostrando el viejo hasta reiniciar. La primera vez que
// arranca una versión nueva le pedimos a Windows que refresque la caché (ie4uinit -show).
function refrescarIconosSiCambioVersion({
    carpeta,
    version,
    plataforma = process.platform,
    ejecutar = execFile,
    sistema = fs
}) {
    if (plataforma !== "win32" || !carpeta || !version) return false;
    const archivo = path.join(carpeta, "version-iconos.txt");
    let anterior = "";
    try { anterior = String(sistema.readFileSync(archivo, "utf8")).trim(); } catch { /* primera vez */ }
    if (anterior === version) return false;
    try {
        sistema.mkdirSync(carpeta, { recursive: true });
        sistema.writeFileSync(archivo, version);
    } catch { /* si no se puede guardar, igual refrescamos */ }
    try { ejecutar("ie4uinit.exe", ["-show"], { windowsHide: true }, () => {}); } catch { /* nunca frena el arranque */ }
    return true;
}

module.exports = { refrescarIconosSiCambioVersion };
