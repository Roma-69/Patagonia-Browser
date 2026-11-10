(() => {
    const abrir = document.getElementById("abrirConfiguracion");
    const panel = document.getElementById("panelConfiguracion");
    const formulario = document.getElementById("formularioConfiguracion");
    const inicio = document.getElementById("paginaInicio");
    const restaurar = document.getElementById("restaurarPestanas");
    const actualizar = document.getElementById("actualizarAutomatico");
    const chicos = document.getElementById("modoChicos");
    const letra = document.getElementById("letraGrande");
    const guardar = document.getElementById("guardarConfiguracion");
    const estado = document.getElementById("estadoConfiguracion");
    let ocupado = false;
    let bloqueada = false;
    function habilitar() {
        for (const elemento of [inicio, restaurar, actualizar, chicos, letra, guardar]) elemento.disabled = ocupado || bloqueada;
    }
    async function ejecutar(accion, guardando = false) {
        if (ocupado) return;
        ocupado = true;
        habilitar();
        estado.textContent = guardando ? "Guardando…" : "Cargando…";
        try {
            const respuesta = await accion();
            if (!respuesta.correcto) throw new Error(respuesta.error);
            const configuracion = respuesta.configuracion;
            inicio.value = configuracion.inicio;
            restaurar.checked = configuracion.restaurar;
            actualizar.checked = configuracion.actualizar !== false;
            chicos.checked = configuracion.modoChicos === true;
            letra.checked = configuracion.letraGrande === true;
            bloqueada = Boolean(configuracion.error);
            const avisos = {
                chicos: configuracion.modoChicos ? "Modo chicos activado." : "Modo chicos desactivado.",
                letra: configuracion.letraGrande ? "Letra grande activada." : "Letra grande desactivada."
            };
            estado.textContent = configuracion.error || avisos[guardando] || (guardando ? "Configuración guardada." : "");
        } catch (error) { estado.textContent = error.message || "No se pudo completar la operación."; }
        finally { ocupado = false; habilitar(); }
    }
    abrir.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        abrir.setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) {
            panel.scrollIntoView({ block: "start" });
            ejecutar(() => window.patagonia.obtenerConfiguracion());
        }
    });
    const predeterminado = document.getElementById("usarPredeterminado");
    const estadoPredeterminado = document.getElementById("estadoPredeterminado");
    predeterminado.addEventListener("click", async () => {
        predeterminado.disabled = true;
        estadoPredeterminado.textContent = "Abriendo la configuración de Windows…";
        try {
            const respuesta = await window.patagonia.usarComoPredeterminado();
            if (!respuesta?.correcto) throw new Error(respuesta?.error);
            estadoPredeterminado.textContent = "En la ventana de Windows, elegí Patagonia Browser para HTTP y HTTPS (o tocá \"Establecer como predeterminado\").";
        } catch (error) {
            estadoPredeterminado.textContent = error.message || "No se pudo abrir la configuración de Windows.";
        } finally {
            predeterminado.disabled = false;
        }
    });
    const datosFormulario = () => ({ inicio: inicio.value.trim(), restaurar: restaurar.checked, actualizar: actualizar.checked, modoChicos: chicos.checked, letraGrande: letra.checked });
    formulario.addEventListener("submit", evento => {
        evento.preventDefault();
        ejecutar(() => window.patagonia.guardarConfiguracion(datosFormulario()), true);
    });
    // El tilde del modo chicos se guarda y aplica al instante.
    for (const [casilla, aviso] of [[chicos, "chicos"], [letra, "letra"]]) {
        casilla.addEventListener("change", () => {
            if (!formulario.reportValidity()) { casilla.checked = !casilla.checked; return; }
            ejecutar(() => window.patagonia.guardarConfiguracion(datosFormulario()), aviso);
        });
    }
})();
