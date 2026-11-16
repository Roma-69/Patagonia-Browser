// Abrir una aplicación del equipo desde un enlace de una página (ver
// src/shared/protocolosExternos.js). Siempre se le pregunta al usuario primero:
// la página pide, el usuario decide.

const { clasificarEnlace } = require("../shared/protocolosExternos");

function sitioDe(contenido) {
    try {
        const url = new URL(contenido?.getURL?.() || "");
        return ["http:", "https:"].includes(url.protocol) ? url.host : "";
    } catch { return ""; }
}

function crearEnlacesExternos({ shell, dialog, obtenerVentana }) {
    // Sitios a los que el usuario les dijo "permitir siempre", solo hasta cerrar Patagonia.
    const permitidos = new Set();
    let preguntando = false;

    async function abrir(direccion, sitio) {
        const dato = clasificarEnlace(direccion);
        if (dato.tipo !== "externo") return false;
        const clave = `${sitio}|${dato.esquema}`;
        if (!permitidos.has(clave)) {
            // Una sola pregunta por vez: si no, una página puede llenar la pantalla de avisos.
            if (preguntando) return false;
            const ventana = obtenerVentana();
            if (!ventana || ventana.isDestroyed()) return false;
            preguntando = true;
            let respuesta;
            try {
                respuesta = await dialog.showMessageBox(ventana, {
                    type: "question",
                    title: "Abrir otra aplicación",
                    message: sitio
                        ? `${sitio} quiere abrir una aplicación de tu computadora.`
                        : "Esta página quiere abrir una aplicación de tu computadora.",
                    detail: `Enlace: ${dato.resumen}\n\nAbrila solo si la estabas esperando.`,
                    buttons: ["Cancelar", "Abrir"],
                    defaultId: 1,
                    cancelId: 0,
                    checkboxLabel: sitio ? `Permitir siempre a ${sitio}` : "",
                    noLink: true
                });
            } catch {
                return false;
            } finally {
                preguntando = false;
            }
            if (respuesta?.response !== 1) return false;
            if (respuesta.checkboxChecked && sitio) permitidos.add(clave);
        }
        try {
            await shell.openExternal(direccion);
            return true;
        } catch {
            return false;
        }
    }

    // Enlaces pulsados dentro de una pestaña.
    function observar(contenido) {
        contenido.on("will-navigate", (evento, direccion) => {
            const dato = clasificarEnlace(direccion);
            if (dato.tipo === "interno") return;
            // El navegador no sabe mostrar esto: no lo dejamos como navegación fallida.
            evento.preventDefault();
            if (dato.tipo === "externo") abrir(direccion, sitioDe(contenido));
        });
    }

    // Enlaces con "abrir en una ventana nueva" (target="_blank").
    function desdeVentanaNueva(contenido, direccion) {
        if (clasificarEnlace(direccion).tipo !== "externo") return false;
        abrir(direccion, sitioDe(contenido));
        return true;
    }

    return { abrir, observar, desdeVentanaNueva };
}

module.exports = { crearEnlacesExternos, sitioDe };
