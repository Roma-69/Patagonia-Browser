// Sonido de viento al buscar (Configuración → "Sonido de viento al buscar").
// El archivo lo entrega el proceso principal la primera vez y queda en memoria.
(() => {
    const api = window.patagonia;
    if (!api?.recibirSonidoViento) return;
    let contexto = null;
    let sonido = null;
    let cargando = null;
    async function cargar() {
        const Contexto = window.AudioContext || window.webkitAudioContext;
        if (!Contexto) return null;
        contexto ??= new Contexto();
        if (sonido) return sonido;
        cargando ??= (async () => {
            const respuesta = await api.obtenerSonidoViento();
            if (!respuesta?.correcto) throw new Error(respuesta?.error || "Sin sonido.");
            const bytes = respuesta.datos;
            const copia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            sonido = await contexto.decodeAudioData(copia);
            return sonido;
        })().catch(() => { cargando = null; return null; });
        return cargando;
    }
    async function sonar() {
        try {
            const buffer = await cargar();
            if (!buffer || !contexto) return;
            if (contexto.state === "suspended") await contexto.resume();
            const fuente = contexto.createBufferSource();
            const volumen = contexto.createGain();
            volumen.gain.value = 0.6;
            fuente.buffer = buffer;
            fuente.connect(volumen).connect(contexto.destination);
            fuente.start();
        } catch {
            // Un sonido que no sale no tiene que molestar la búsqueda.
        }
    }
    api.recibirSonidoViento(() => { void sonar(); });
})();
