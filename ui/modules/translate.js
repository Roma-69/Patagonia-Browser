// Traductor: un ícono chico en la barra de direcciones (desde la 1.4.0 ya no hay
// barra encima de la página). Al tocarlo se abre el menú con las opciones.
(() => {
    const boton = document.getElementById("botonTraduccion");
    const estadoTexto = document.getElementById("estadoTraduccion");
    const api = window.patagonia;

    boton.addEventListener("click", () => {
        const r = boton.getBoundingClientRect();
        api.menuTraduccion({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
    });

    api.recibirTraduccion(estado => {
        const visible = Boolean(estado?.detectado);
        boton.hidden = !visible;
        estadoTexto.hidden = true;
        boton.className = "boton-traduccion";
        if (!visible) return;
        const idioma = estado.nombreIdioma || "otro idioma";
        let titulo = `Esta página está en ${idioma}. Tocá para traducirla al español.`;
        let texto = "";
        if (estado.estado === "ofrecer") {
            boton.classList.add("ofrece");
            if (!estado.local) titulo = `Esta página está en ${idioma}. Tocá para ver las opciones.`;
        } else if (estado.estado === "traduciendo") {
            boton.classList.add("traduciendo");
            if (estado.descarga) {
                const { hechos = 0, total = 0 } = estado.descarga;
                texto = `Bajando el ${idioma}… ${total ? Math.min(100, Math.round(hechos * 100 / total)) : 0} %`;
            } else {
                texto = estado.total ? `Traduciendo… ${Math.min(estado.hechos, estado.total)} de ${estado.total}` : "Preparando el traductor…";
            }
            titulo = texto;
        } else if (estado.estado === "traducida") {
            boton.classList.add("traducida");
            titulo = `Traducida del ${idioma} en tu equipo. Tocá para ver el original.`;
        } else if (estado.estado === "error") {
            boton.classList.add("error");
            texto = estado.error || "No se pudo traducir esta página.";
            titulo = texto;
        }
        boton.title = titulo;
        boton.setAttribute("aria-label", `Traductor: ${titulo}`);
        if (texto) {
            estadoTexto.textContent = texto;
            estadoTexto.hidden = false;
        }
    });
})();
