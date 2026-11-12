const { detectarIdioma, nombreIdioma } = require("./idioma");
const { MUNDO_AISLADO, MUESTRA, EXTRAER, RESTAURAR, aplicar } = require("./scriptsPagina");

const DESTINO = "es";
const LOTE = 40;

function sitioDe(url) {
    try {
        const u = new URL(url);
        return ["http:", "https:"].includes(u.protocol) ? u.hostname.replace(/^www\./, "") : "";
    } catch { return ""; }
}

function urlGoogle(url) {
    return `https://translate.google.com/translate?sl=auto&tl=${DESTINO}&u=${encodeURIComponent(url)}`;
}

// Orquesta la traducción por pestaña. `notificar(estado)` avisa a la interfaz cuando
// cambia lo que hay que mostrar en la pestaña activa.
// `modelos` (opcional) baja otros idiomas la primera vez que hacen falta (ver modelos.js).
function crearGestorTraduccion({ motor, preferencias, pares, modelos, obtenerContenido, notificar, temporizador = { setInterval, clearInterval } }) {
    const datos = new Map(); // id de webContents → estado

    const inicial = () => ({ estado: "oculta", barraCerrada: false, idioma: "", sitio: "", url: "", hechos: 0, total: 0, error: "", generacion: 0, vigilancia: null, ruta: null, descarga: null });
    const de = contenido => {
        if (!datos.has(contenido.id)) datos.set(contenido.id, inicial());
        return datos.get(contenido.id);
    };
    const tieneModelo = idioma => pares().includes(`${idioma}${DESTINO}`) || Boolean(modelos?.soportado(idioma));
    // Si el idioma no viene incluido, lo baja una sola vez y devuelve el camino de traducción.
    async function ruta(d, contenido) {
        if (d.ruta) return d.ruta;
        const par = `${d.idioma}${DESTINO}`;
        if (!modelos || pares().includes(par)) return (d.ruta = [par]);
        const camino = await modelos.preparar(d.idioma, DESTINO, progreso => {
            d.descarga = progreso;
            avisar(contenido);
        });
        d.descarga = null;
        return (d.ruta = camino);
    }

    function publico(d) {
        return {
            estado: d.barraCerrada ? "oculta" : d.estado,
            traducida: d.estado === "traducida" || d.estado === "traduciendo",
            idioma: d.idioma,
            nombreIdioma: nombreIdioma(d.idioma),
            local: tieneModelo(d.idioma),
            siempre: Boolean(d.idioma) && preferencias.siempreTraducir(d.idioma),
            hechos: d.hechos,
            total: d.total,
            descarga: d.descarga ? { ...d.descarga } : null,
            error: d.error
        };
    }
    function avisar(contenido) {
        if (contenido === obtenerContenido()) notificar(publico(de(contenido)));
    }
    function reenviar() {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed()) { notificar(publico(inicial())); return; }
        notificar(publico(de(contenido)));
    }
    const enPagina = (contenido, codigo) => contenido.executeJavaScriptInIsolatedWorld(MUNDO_AISLADO, [{ code: codigo }]);

    function detenerVigilancia(d) {
        if (d.vigilancia) temporizador.clearInterval(d.vigilancia);
        d.vigilancia = null;
    }
    function olvidar(id) {
        const d = datos.get(id);
        if (d) detenerVigilancia(d);
        datos.delete(id);
    }
    function navego(contenido) {
        const d = de(contenido);
        detenerVigilancia(d);
        Object.assign(d, inicial(), { generacion: d.generacion + 1 });
        avisar(contenido);
    }

    async function paginaLista(contenido) {
        if (!contenido || contenido.isDestroyed()) return;
        const d = de(contenido);
        if (d.estado === "traduciendo" || d.estado === "traducida") return;
        const url = contenido.getURL();
        const sitio = sitioDe(url);
        if (!sitio) return;
        const generacion = d.generacion;
        let muestra;
        try { muestra = await enPagina(contenido, MUESTRA); } catch { return; }
        if (contenido.isDestroyed() || d.generacion !== generacion) return;
        const idioma = detectarIdioma(muestra || {});
        if (!idioma || idioma === DESTINO || preferencias.nuncaEn(sitio)) return;
        Object.assign(d, { idioma, sitio, url, estado: "ofrecer", error: "" });
        if (tieneModelo(idioma) && preferencias.siempreTraducir(idioma)) return traducir(contenido);
        avisar(contenido);
    }

    async function pasada(contenido, d, generacion) {
        const pares = await enPagina(contenido, EXTRAER);
        if (!Array.isArray(pares) || !pares.length) return 0;
        d.total += pares.length;
        avisar(contenido);
        for (let i = 0; i < pares.length; i += LOTE) {
            if (contenido.isDestroyed() || d.generacion !== generacion) return i;
            const lote = pares.slice(i, i + LOTE);
            const traducciones = await motor.traducir(d.ruta || `${d.idioma}${DESTINO}`, lote.map(([, texto]) => texto));
            if (contenido.isDestroyed() || d.generacion !== generacion) return i;
            await enPagina(contenido, aplicar(lote.map(([indice], j) => [indice, traducciones[j]])));
            d.hechos += lote.length;
            avisar(contenido);
        }
        return pares.length;
    }

    async function traducir(contenido = obtenerContenido()) {
        if (!contenido || contenido.isDestroyed()) return;
        const d = de(contenido);
        if (!d.idioma || !tieneModelo(d.idioma) || d.estado === "traduciendo") return;
        const generacion = d.generacion;
        Object.assign(d, { estado: "traduciendo", hechos: 0, total: 0, error: "" });
        avisar(contenido);
        try {
            await ruta(d, contenido);
            if (contenido.isDestroyed() || d.generacion !== generacion) return;
            await pasada(contenido, d, generacion);
            if (contenido.isDestroyed() || d.generacion !== generacion) return;
            d.estado = "traducida";
            avisar(contenido);
            // Las páginas cargan contenido nuevo al bajar o al tocar botones: lo traducimos también.
            detenerVigilancia(d);
            let ocupado = false;
            d.vigilancia = temporizador.setInterval(async () => {
                if (ocupado) return;
                if (contenido.isDestroyed() || d.generacion !== generacion || d.estado !== "traducida") { detenerVigilancia(d); return; }
                ocupado = true;
                try { await pasada(contenido, d, generacion); } catch { /* se reintenta en la próxima vuelta */ }
                finally { ocupado = false; }
            }, 2500);
        } catch (error) {
            if (contenido.isDestroyed() || d.generacion !== generacion) return;
            const sinRed = Boolean(d.descarga) || (!d.ruta && modelos);
            Object.assign(d, { estado: "error", descarga: null, error: sinRed
                ? `No se pudo bajar el idioma ${nombreIdioma(d.idioma)}. Revisá la conexión y probá de nuevo.`
                : "No se pudo traducir esta página." });
            avisar(contenido);
        }
    }

    async function mostrarOriginal(contenido = obtenerContenido()) {
        if (!contenido || contenido.isDestroyed()) return;
        const d = de(contenido);
        detenerVigilancia(d);
        d.generacion++;
        try { await enPagina(contenido, RESTAURAR); } catch { /* la página pudo cambiar */ }
        Object.assign(d, { estado: "ofrecer", hechos: 0, total: 0, error: "" });
        avisar(contenido);
    }

    async function siempre(activo) {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed()) return;
        const d = de(contenido);
        if (!d.idioma) return;
        await preferencias.ponerSiempre(d.idioma, activo);
        if (activo && d.estado !== "traducida") return traducir(contenido);
        avisar(contenido);
    }

    async function nunca() {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed()) return;
        const d = de(contenido);
        if (!d.sitio) return;
        await preferencias.ponerNunca(d.sitio, true);
        if (d.estado === "traducida" || d.estado === "traduciendo") await mostrarOriginal(contenido);
        cerrar();
    }

    function cerrar() {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed()) return;
        de(contenido).barraCerrada = true;
        avisar(contenido);
    }

    function google() {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed()) return null;
        const url = contenido.getURL();
        return sitioDe(url) ? urlGoogle(url) : null;
    }

    // Para el clic derecho o el botón: ofrecer traducir aunque la detección no haya saltado.
    async function abrir(idiomaManual = "en") {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed() || !sitioDe(contenido.getURL())) return;
        const d = de(contenido);
        d.barraCerrada = false;
        if (!d.idioma) Object.assign(d, { idioma: idiomaManual, sitio: sitioDe(contenido.getURL()), estado: "ofrecer" });
        avisar(contenido);
    }

    function visible() {
        const contenido = obtenerContenido();
        if (!contenido || contenido.isDestroyed()) return false;
        const d = datos.get(contenido.id);
        return Boolean(d) && publico(d).estado !== "oculta";
    }

    return { paginaLista, navego, olvidar, traducir, mostrarOriginal, siempre, nunca, cerrar, google, abrir, reenviar, visible, estado: c => publico(de(c)) };
}

module.exports = { crearGestorTraduccion, sitioDe, urlGoogle, DESTINO };
