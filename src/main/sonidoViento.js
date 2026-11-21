// Sonido de viento al buscar: una ráfaga corta (grabación propia de Patagonia,
// assets/sonidos/viento.ogg). Suena solo cuando se busca algo, no al abrir una
// dirección, y se apaga en Configuración. Android usa el mismo archivo
// (mobile/android/app/src/main/res/raw/viento.ogg).
const fs = require("node:fs/promises");
const path = require("node:path");
const { crearIPCInterfaz } = require("./security");
const { esURLDeBusqueda } = require("../shared/buscadores");

const ARCHIVO = path.join(__dirname, "..", "..", "assets", "sonidos", "viento.ogg");

// Lo que se escribió en la barra o en el inicio es una búsqueda (no una dirección).
function esBusquedaEscrita(texto, destino) {
    const escrito = String(texto || "").trim();
    return Boolean(escrito) && !/^[a-z][a-z0-9+.-]*:/i.test(escrito) && esURLDeBusqueda(destino);
}

function registrarSonidoViento({ ipcMain, obtenerVentana, activo, archivo = ARCHIVO }) {
    const ipc = crearIPCInterfaz(ipcMain, obtenerVentana);
    let datos = null;
    ipc.handle("obtener-sonido-viento", async () => {
        try {
            datos ??= await fs.readFile(archivo);
            return { correcto: true, datos: new Uint8Array(datos) };
        } catch {
            return { correcto: false, error: "No se encontró el sonido de viento." };
        }
    });
    function sonar() {
        if (!activo()) return false;
        const ventana = obtenerVentana();
        if (!ventana || ventana.isDestroyed()) return false;
        ventana.webContents.send("sonido-viento");
        return true;
    }
    return { sonar };
}

module.exports = { registrarSonidoViento, esBusquedaEscrita, ARCHIVO };
