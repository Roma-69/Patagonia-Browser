(() => {
    const abrir = document.getElementById("abrirAudio");
    const panel = document.getElementById("panelAudio");
    const activo = document.getElementById("audioActivo");
    const preset = document.getElementById("audioPreset");
    const contenedorBandas = document.getElementById("audioBandas");
    const volumen = document.getElementById("audioVolumen");
    const volumenValor = document.getElementById("audioVolumenValor");
    const normalizar = document.getElementById("audioNormalizar");
    const restablecer = document.getElementById("audioRestablecer");
    const estado = document.getElementById("estadoAudio");

    let presets = [];
    let deslizadores = [];
    let cargado = false;
    let temporizador = null;

    const etiquetaFrecuencia = f => (f >= 1000 ? `${f / 1000}k` : String(f));
    const textoDb = valor => `${valor > 0 ? "+" : ""}${valor} dB`;

    function armarBandas(frecuencias) {
        contenedorBandas.textContent = "";
        deslizadores = frecuencias.map((frecuencia, i) => {
            const id = `audioBanda${i}`;
            const etiqueta = document.createElement("span");
            etiqueta.textContent = etiquetaFrecuencia(frecuencia);
            const control = document.createElement("input");
            Object.assign(control, { id, type: "range", min: "-12", max: "12", step: "0.5", value: "0" });
            control.setAttribute("aria-label", `${etiquetaFrecuencia(frecuencia)} Hz`);
            const valor = document.createElement("output");
            valor.htmlFor = id;
            valor.textContent = "0 dB";
            control.addEventListener("input", () => {
                valor.textContent = textoDb(Number(control.value));
                preset.value = "personalizado";
                enviar();
            });
            contenedorBandas.append(etiqueta, control, valor);
            return { control, valor };
        });
    }

    function armarPresets() {
        preset.textContent = "";
        for (const { id, nombre } of [...presets, { id: "personalizado", nombre: "Personalizado" }]) {
            const opcion = document.createElement("option");
            opcion.value = id;
            opcion.textContent = nombre;
            preset.append(opcion);
        }
    }

    function mostrar(audio) {
        activo.checked = audio.activo;
        panel.classList.toggle("apagado", !audio.activo);
        preset.value = audio.preset;
        audio.bandas.forEach((valor, i) => {
            if (!deslizadores[i]) return;
            deslizadores[i].control.value = String(valor);
            deslizadores[i].valor.textContent = textoDb(valor);
        });
        volumen.value = String(audio.volumen);
        volumenValor.textContent = `${audio.volumen}%`;
        normalizar.checked = audio.normalizar;
    }

    function leer() {
        return {
            activo: activo.checked,
            preset: preset.value,
            bandas: deslizadores.map(({ control }) => Number(control.value)),
            volumen: Number(volumen.value),
            normalizar: normalizar.checked
        };
    }

    // Los controles se aplican en vivo, sin mandar un mensaje por cada píxel que se mueve.
    function enviar() {
        panel.classList.toggle("apagado", !activo.checked);
        volumenValor.textContent = `${volumen.value}%`;
        if (temporizador) clearTimeout(temporizador);
        temporizador = setTimeout(async () => {
            temporizador = null;
            try {
                const respuesta = await window.patagonia.guardarAudio(leer());
                if (!respuesta?.correcto) throw new Error(respuesta?.error);
                estado.textContent = respuesta.audio.activo ? "Ecualizador activo. Se guarda solo." : "Ecualizador apagado.";
            } catch (error) {
                estado.textContent = error.message || "No se pudo aplicar el cambio.";
            }
        }, 60);
    }

    async function cargar() {
        try {
            const respuesta = await window.patagonia.obtenerAudio();
            if (!respuesta?.correcto) throw new Error(respuesta?.error);
            presets = respuesta.presets;
            armarPresets();
            armarBandas(respuesta.frecuencias);
            mostrar(respuesta.audio);
            cargado = true;
            estado.textContent = "";
        } catch (error) {
            estado.textContent = error.message || "No se pudieron cargar los ajustes de audio.";
        }
    }

    function aplicarPreset(id) {
        const elegido = presets.find(p => p.id === id);
        if (!elegido) return;
        elegido.bandas.forEach((valor, i) => {
            deslizadores[i].control.value = String(valor);
            deslizadores[i].valor.textContent = textoDb(valor);
        });
    }

    abrir.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        abrir.setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) {
            panel.scrollIntoView({ block: "start" });
            if (!cargado) cargar();
        }
    });
    activo.addEventListener("change", enviar);
    normalizar.addEventListener("change", enviar);
    volumen.addEventListener("input", enviar);
    preset.addEventListener("change", () => {
        aplicarPreset(preset.value);
        // Elegir un estilo con el ecualizador apagado lo prende: es lo que uno espera.
        if (preset.value !== "personalizado") activo.checked = true;
        enviar();
    });
    restablecer.addEventListener("click", () => {
        preset.value = "plano";
        aplicarPreset("plano");
        volumen.value = "100";
        normalizar.checked = false;
        enviar();
    });
})();
