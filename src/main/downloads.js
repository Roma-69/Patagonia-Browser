const { randomUUID } = require("node:crypto");
const { stat, readFile, writeFile, rename, rm } = require("node:fs/promises");
const path = require("node:path");

const EXTENSIONES_FOTO = /\.(jpe?g|png|webp)$/i;

// Fotos limpias: a las fotos que se bajan se les borran los datos escondidos
// (ubicación, celular, la marca FBMD de Facebook/Instagram). Si algo falla, la
// foto queda tal cual: nunca se pierde una descarga por esto.
async function limpiarFotoDescargada(ruta, { limpiarFoto = require("./fotosLimpias").limpiarFoto } = {}) {
    if (!ruta || !EXTENSIONES_FOTO.test(ruta)) return false;
    const temporal = `${ruta}.${randomUUID()}.limpia`;
    try {
        const limpia = limpiarFoto(await readFile(ruta));
        if (!limpia) return false;
        await writeFile(temporal, limpia);
        await rename(temporal, ruta);
        return true;
    } catch (error) {
        console.error("No se pudo limpiar la foto descargada:", error.message);
        return false;
    } finally {
        await rm(temporal, { force: true }).catch(() => {});
    }
}

function registrarDescargas({ ipcMain, sesion, shell, obtenerVentana, esPestanaPropia, comprobarArchivo = stat, limpiarFoto = limpiarFotoDescargada, confirmarPeligrosa }) {
    const registros = new Map();
    const activos = new Map();
    let revision = 0;
    let temporizador;

    function snapshot() {
        return { revision, descargas: [...registros.values()].reverse().map(({ ruta, ...dato }) => ({ ...dato })) };
    }
    function enviar() {
        clearTimeout(temporizador);
        temporizador = undefined;
        const ventana = obtenerVentana();
        if (ventana && !ventana.isDestroyed()) ventana.webContents.send("descargas-actualizadas", snapshot());
    }
    function actualizar(inmediato = false) {
        revision++;
        if (inmediato) enviar();
        else if (!temporizador) temporizador = setTimeout(enviar, 250);
    }
    function limitar() {
        const terminadas = [...registros.keys()].filter(id => !activos.has(id));
        for (const id of terminadas.slice(0, Math.max(0, terminadas.length - 100))) registros.delete(id);
    }
    function alDescargar(evento, item, contenido) {
        if (!esPestanaPropia(contenido)) return;
        // Aviso en descargas peligrosas: un programa de un sitio desconocido se pregunta antes de bajarlo.
        if (confirmarPeligrosa && !confirmarPeligrosa(item, contenido)) {
            evento.preventDefault();
            return;
        }
        const id = randomUUID();
        const dato = { id, nombre: item.getFilename(), estado: "descargando", recibidos: 0, total: 0, ruta: "" };
        registros.set(id, dato);
        activos.set(id, item);
        function leer() {
            dato.recibidos = Math.max(0, item.getReceivedBytes());
            dato.total = Math.max(0, item.getTotalBytes());
            dato.ruta = item.getSavePath();
            if (dato.ruta) dato.nombre = path.basename(dato.ruta);
        }
        function progreso(_evento, estado) {
            leer();
            dato.estado = estado === "interrupted" ? "interrumpida" : "descargando";
            actualizar();
        }
        item.on("updated", progreso);
        item.once("done", (_evento, estado) => {
            leer();
            item.removeListener("updated", progreso);
            const terminar = () => {
                dato.estado = estado === "completed" ? "completada" : estado === "cancelled" ? "cancelada" : "fallida";
                activos.delete(id);
                limitar();
                actualizar(true);
            };
            // Mientras se limpia la foto sigue figurando "descargando".
            if (estado === "completed" && EXTENSIONES_FOTO.test(dato.ruta)) {
                Promise.resolve().then(() => limpiarFoto(dato.ruta)).catch(() => {}).finally(terminar);
            } else terminar();
        });
        // Electron conserva el diálogo Guardar como y la elección de ubicación del usuario.
        leer();
        actualizar(true);
    }
    const sesionesEscuchadas = new Set();
    function agregarSesion(otra) {
        if (sesionesEscuchadas.has(otra)) return;
        sesionesEscuchadas.add(otra);
        otra.on("will-download", alDescargar);
    }
    agregarSesion(sesion);

    function registrar(canal, accion) {
        ipcMain.handle(canal, async (evento, id) => {
            try {
                const ventana = obtenerVentana();
                if (!ventana || ventana.isDestroyed() || evento.sender !== ventana.webContents ||
                    evento.senderFrame !== ventana.webContents.mainFrame) throw new Error("Acceso no permitido.");
                await accion(id);
                return { correcto: true, ...snapshot() };
            } catch (error) {
                return { correcto: false, error: error.message };
            }
        });
    }
    registrar("listar-descargas", () => {});
    registrar("cancelar-descarga", id => {
        const item = activos.get(id);
        if (!item) throw new Error("Esta descarga ya terminó o no está disponible.");
        item.cancel();
    });
    registrar("mostrar-descarga", async id => {
        const dato = registros.get(id);
        if (!dato || dato.estado !== "completada" || !dato.ruta) throw new Error("El archivo todavía no está disponible.");
        try {
            if (!(await comprobarArchivo(dato.ruta)).isFile()) throw new Error();
        } catch {
            throw new Error("No encontramos el archivo. Puede haberse movido o eliminado.");
        }
        shell.showItemInFolder(dato.ruta);
    });
    // agregarSesion: las descargas de las pestañas de incógnito van a la misma lista.
    return { snapshot, contarActivas: () => activos.size, agregarSesion };
}

module.exports = { registrarDescargas, limpiarFotoDescargada };
