const { MUNDO_AUDIO, scriptAudio } = require("./scriptPagina");

const esWeb = url => /^https?:\/\//i.test(String(url || ""));

// Lleva los ajustes de Audio Patagonia a las pestañas abiertas.
function crearGestorAudio({ ajustes, contenidos }) {
    async function aplicar(contenido, { soloSiActivo = false } = {}) {
        if (!contenido || contenido.isDestroyed?.() || !esWeb(contenido.getURL?.())) return false;
        const estado = ajustes.estado();
        // Al cargar una página no hace falta nada si el ecualizador está apagado.
        if (soloSiActivo && !estado.activo) return false;
        try {
            await contenido.executeJavaScriptInIsolatedWorld(MUNDO_AUDIO, [{ code: scriptAudio(estado) }]);
            return true;
        } catch { return false; }
    }

    function aplicarTodas() {
        return Promise.all((contenidos() || []).map(contenido => aplicar(contenido)));
    }

    function cambiar(datos) {
        const estado = ajustes.cambiar(datos);
        aplicarTodas().catch(() => {});
        return estado;
    }

    return {
        estado: () => ajustes.estado(),
        cambiar,
        paginaLista: contenido => aplicar(contenido, { soloSiActivo: true }),
        aplicarTodas
    };
}

module.exports = { crearGestorAudio };
