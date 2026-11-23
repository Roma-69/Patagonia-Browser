// Tarjeta "Tu IA" del Centro de privacidad.
// La persona elige qué IA usa (o pega la dirección de otra) y el botón la abre
// en una pestaña nueva. Patagonia no tiene IA propia ni le manda nada de la página.
(() => {
    const PREDEFINIDAS = ["chatgpt", "claude", "gemini", "copilot", "perplexity", "lechat"];
    let inicializado = false;

    function iniciar() {
        if (inicializado) return true;
        const eleccion = document.getElementById("eleccionIA");
        const direccion = document.getElementById("direccionIA");
        const abrir = document.getElementById("abrirMiIA");
        const estado = document.getElementById("estadoTuIA");
        if (!eleccion || !direccion || !abrir || !estado || !window.patagonia) return false;
        inicializado = true;

        let guardada = "";
        let ocupado = false;

        function mostrar(ia) {
            guardada = ia || "";
            if (!guardada) {
                eleccion.value = "";
                direccion.hidden = true;
            } else if (PREDEFINIDAS.includes(guardada)) {
                eleccion.value = guardada;
                direccion.hidden = true;
            } else {
                eleccion.value = "otra";
                direccion.hidden = false;
                direccion.value = guardada;
            }
            abrir.disabled = ocupado || !guardada;
        }

        async function cargar() {
            try {
                const respuesta = await window.patagonia.obtenerConfiguracion?.();
                if (respuesta?.correcto) mostrar(respuesta.configuracion.ia);
            } catch {
                // Sin configuración la tarjeta queda en "Elegí una…".
            }
        }

        async function guardar(ia) {
            ocupado = true;
            abrir.disabled = true;
            estado.textContent = "Guardando…";
            try {
                const actual = await window.patagonia.obtenerConfiguracion();
                if (!actual?.correcto) throw new Error(actual?.error);
                const respuesta = await window.patagonia.guardarConfiguracion({ ...actual.configuracion, ia });
                if (!respuesta?.correcto) throw new Error(respuesta?.error);
                ocupado = false;
                mostrar(respuesta.configuracion.ia);
                if (ia && !respuesta.configuracion.ia) {
                    estado.textContent = "Esa dirección no es válida. Escribila completa, por ejemplo https://chatgpt.com.";
                } else {
                    estado.textContent = respuesta.configuracion.ia ? "Listo. Tocá \"Abrir mi IA\"." : "";
                }
                window.dispatchEvent(new CustomEvent("patagonia:ia-cambiada", { detail: respuesta.configuracion.ia }));
            } catch (error) {
                ocupado = false;
                mostrar(guardada);
                estado.textContent = error?.message || "No se pudo guardar. Volvé a intentar.";
            }
        }

        eleccion.addEventListener("change", () => {
            if (eleccion.value === "otra") {
                direccion.hidden = false;
                direccion.value = PREDEFINIDAS.includes(guardada) ? "" : guardada;
                abrir.disabled = true;
                estado.textContent = "Pegá la dirección y tocá Enter.";
                direccion.focus();
                return;
            }
            direccion.hidden = true;
            guardar(eleccion.value);
        });

        direccion.addEventListener("keydown", evento => {
            if (evento.isComposing || evento.key !== "Enter") return;
            evento.preventDefault();
            const valor = direccion.value.trim();
            if (valor) guardar(/^[a-z][a-z0-9+.-]*:/i.test(valor) ? valor : `https://${valor}`);
        });

        abrir.addEventListener("click", async () => {
            estado.textContent = "";
            try {
                const respuesta = await window.patagonia.abrirMiIA();
                if (!respuesta?.correcto) estado.textContent = respuesta?.error || "No se pudo abrir.";
            } catch {
                estado.textContent = "No se pudo abrir.";
            }
        });

        cargar();
        return true;
    }

    window.PatagoniaTuIA = { iniciar };
})();
