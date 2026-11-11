// Compartir pantalla (Google Meet, Zoom web, Teams web, etc.).
// Electron no trae selector propio: sin este manejador, "Presentar ahora"
// en Meet falla siempre. Mostramos un aviso con las pantallas y ventanas
// abiertas y el usuario elige cuál compartir (o cancela).

const MAX_OPCIONES = 10;

function recortar(texto, largo = 45) {
    const limpio = String(texto || "").replace(/\s+/g, " ").trim() || "Ventana sin nombre";
    return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
}

// Arma la lista de botones: primero las pantallas, después las ventanas.
function armarOpciones(fuentes = []) {
    const pantallas = fuentes.filter(f => String(f.id).startsWith("screen:"));
    const ventanas = fuentes.filter(f => String(f.id).startsWith("window:"));
    const opciones = [
        ...pantallas.map((f, i) => ({ fuente: f, etiqueta: pantallas.length > 1 ? `Pantalla ${i + 1}` : "Pantalla completa" })),
        ...ventanas.map(f => ({ fuente: f, etiqueta: `Ventana: ${recortar(f.name)}` }))
    ];
    return opciones.slice(0, MAX_OPCIONES);
}

function registrarCompartirPantalla({ sesion, desktopCapturer, dialog, webContents, obtenerVentana, esPestanaPropia, esPestanaActiva, origenSeguro, plataforma = process.platform }) {
    let ocupado = false;

    sesion.setDisplayMediaRequestHandler(async (pedido, callback) => {
        let respondido = false;
        let tomado = false;
        const responder = valor => {
            if (respondido) return;
            respondido = true;
            try { callback(valor); } catch { console.error("No se pudo contestar el pedido de compartir pantalla."); }
        };
        try {
            const marco = pedido?.frame;
            let contenido = null;
            try { contenido = marco ? webContents.fromFrame(marco) : null; } catch { contenido = null; }
            const origen = origenSeguro(pedido?.securityOrigin || marco?.url || "");
            if (ocupado || !contenido || contenido.isDestroyed() || !esPestanaPropia(contenido) ||
                !esPestanaActiva(contenido) || !origen || !pedido?.videoRequested) {
                responder({});
                return;
            }
            ocupado = true;
            tomado = true;
            const fuentes = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } });
            const opciones = armarOpciones(fuentes);
            const ventana = obtenerVentana();
            if (!opciones.length || !ventana || ventana.isDestroyed()) { responder({}); return; }
            const { response } = await dialog.showMessageBox(ventana, {
                type: "question",
                title: "Compartir pantalla",
                message: `${origen} quiere ver tu pantalla.`,
                detail: "Elegí qué compartir. Lo vas a poder dejar de compartir desde la misma página.",
                buttons: ["Cancelar", ...opciones.map(o => o.etiqueta)],
                defaultId: 0,
                cancelId: 0,
                noLink: true
            });
            const elegida = opciones[response - 1];
            if (!elegida || contenido.isDestroyed() || !esPestanaActiva(contenido)) { responder({}); return; }
            const respuesta = { video: elegida.fuente };
            // El sonido de la PC solo se puede compartir en Windows y con la pantalla completa.
            if (pedido.audioRequested && plataforma === "win32" && String(elegida.fuente.id).startsWith("screen:")) {
                respuesta.audio = "loopback";
            }
            responder(respuesta);
        } catch (error) {
            console.error("Compartir pantalla falló:", error?.message);
            responder({});
        } finally {
            if (tomado) ocupado = false;
        }
    });
}

module.exports = { registrarCompartirPantalla, armarOpciones };
