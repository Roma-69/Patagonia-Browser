// Corre en un "mundo aislado" de la página (como el traductor): comparte el DOM,
// pero la página no puede ver ni tocar el ecualizador.
const MUNDO_AUDIO = 1988;

// Esta función se manda como texto a la página: no puede usar nada de afuera.
function motorAudio(cfg) {
    const yaInstalado = Boolean(window.__patagoniaAudio);
    // Si nunca se activó en esta página, no se toca nada.
    if (!yaInstalado && !cfg.activo) return { instalado: false, conectados: 0 };

    const A = window.__patagoniaAudio || (window.__patagoniaAudio = {
        cfg: null, ctx: null, cadenas: new WeakMap(), lista: [], esperandoGesto: false
    });
    A.cfg = cfg;

    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return { instalado: false, conectados: 0 };

    const FRECUENCIAS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const ganancia = db => Math.pow(10, db / 20);
    const poner = (parametro, valor) => {
        try { parametro.setTargetAtTime(valor, A.ctx.currentTime, 0.03); } catch { parametro.value = valor; }
    };

    // Un audio de otro sitio sin permiso (CORS) sonaría mudo al pasar por el ecualizador.
    // Solo se tocan los seguros: los de streaming (blob:, como YouTube), los del mismo sitio
    // y los que la página pidió con permiso. El resto sigue sonando normal, sin ecualizar.
    function esSeguro(elemento) {
        if (elemento.srcObject) return false;
        const fuente = elemento.currentSrc || elemento.src || "";
        if (!fuente) return false;
        if (fuente.startsWith("blob:")) return true;
        try {
            if (new URL(fuente, location.href).origin === location.origin) return true;
        } catch { return false; }
        return elemento.crossOrigin === "anonymous" || elemento.crossOrigin === "use-credentials";
    }

    function ajustar(cadena) {
        const c = A.cfg;
        const activo = c.activo;
        cadena.filtros.forEach((filtro, i) => poner(filtro.gain, activo ? c.bandas[i] : 0));
        // Si alguna banda sube, se baja un poco la entrada para dejar lugar y no saturar.
        const subida = activo ? Math.max(0, ...c.bandas) : 0;
        poner(cadena.entrada.gain, activo ? ganancia(-subida * 0.5) * (c.volumen / 100) : 1);

        const n = cadena.normalizador;
        const normalizar = activo && c.normalizar;
        n.threshold.value = normalizar ? -30 : 0;
        n.knee.value = normalizar ? 12 : 0;
        n.ratio.value = normalizar ? 4 : 1;
        n.attack.value = 0.01;
        n.release.value = 0.3;
        poner(cadena.compensacion.gain, normalizar ? ganancia(9) : 1);

        // Limitador final: evita que el refuerzo o los graves distorsionen.
        const l = cadena.limitador;
        l.threshold.value = activo ? -1 : 0;
        l.knee.value = 0;
        l.ratio.value = activo ? 20 : 1;
        l.attack.value = 0.002;
        l.release.value = 0.1;
    }

    function conectar(elemento) {
        if (A.cadenas.has(elemento) || !esSeguro(elemento)) return false;
        const ctx = A.ctx;
        let fuente;
        try { fuente = ctx.createMediaElementSource(elemento); } catch { A.cadenas.set(elemento, null); return false; }
        const filtros = FRECUENCIAS.map((frecuencia, i) => {
            const filtro = ctx.createBiquadFilter();
            filtro.type = i === 0 ? "lowshelf" : i === FRECUENCIAS.length - 1 ? "highshelf" : "peaking";
            filtro.frequency.value = frecuencia;
            filtro.Q.value = 1.1;
            filtro.gain.value = 0;
            return filtro;
        });
        const cadena = {
            elemento,
            filtros,
            entrada: ctx.createGain(),
            normalizador: ctx.createDynamicsCompressor(),
            compensacion: ctx.createGain(),
            limitador: ctx.createDynamicsCompressor()
        };
        const orden = [fuente, cadena.entrada, ...filtros, cadena.normalizador, cadena.compensacion, cadena.limitador, ctx.destination];
        for (let i = 0; i < orden.length - 1; i++) orden[i].connect(orden[i + 1]);
        A.cadenas.set(elemento, cadena);
        A.lista.push(cadena);
        ajustar(cadena);
        return true;
    }

    async function contextoListo() {
        if (!A.ctx) A.ctx = new Contexto();
        if (A.ctx.state !== "running") { try { await A.ctx.resume(); } catch { /* sin permiso todavía */ } }
        return A.ctx.state === "running";
    }

    // Si el audio todavía no puede arrancar, se espera al primer clic o tecla.
    // Mientras tanto no se conecta nada, así la página nunca queda muda.
    function esperarGesto() {
        if (A.esperandoGesto) return;
        A.esperandoGesto = true;
        const reintentar = async () => {
            if (!(await contextoListo())) return;
            A.esperandoGesto = false;
            document.removeEventListener("pointerdown", reintentar, true);
            document.removeEventListener("keydown", reintentar, true);
            revisarSonando();
        };
        document.addEventListener("pointerdown", reintentar, true);
        document.addEventListener("keydown", reintentar, true);
    }

    async function procesar(elemento) {
        if (!A.cfg.activo || A.cadenas.has(elemento) || !esSeguro(elemento)) return;
        if (!(await contextoListo())) { esperarGesto(); return; }
        conectar(elemento);
    }

    function revisarSonando() {
        for (const elemento of document.querySelectorAll("video, audio")) {
            if (!elemento.paused) procesar(elemento);
        }
    }

    if (!A.escuchando) {
        A.escuchando = true;
        // "play" no burbujea: se escucha en captura para enterarse de cualquier video o audio.
        document.addEventListener("play", evento => {
            const elemento = evento.target;
            if (elemento && (elemento.tagName === "VIDEO" || elemento.tagName === "AUDIO")) procesar(elemento);
        }, true);
    }

    // Olvida los reproductores que la página ya sacó.
    A.lista = A.lista.filter(c => c.elemento.isConnected || !c.elemento.paused);
    for (const cadena of A.lista) ajustar(cadena);
    if (cfg.activo) revisarSonando();
    return { instalado: true, conectados: A.lista.length };
}

function scriptAudio(ajustes) {
    const cfg = {
        activo: Boolean(ajustes.activo),
        bandas: ajustes.bandas.map(Number),
        volumen: Number(ajustes.volumen),
        normalizar: Boolean(ajustes.normalizar)
    };
    return `(${motorAudio.toString()})(${JSON.stringify(cfg)})`;
}

module.exports = { MUNDO_AUDIO, scriptAudio };
