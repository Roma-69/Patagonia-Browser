(() => {
    const barra = document.getElementById("barraTraduccion");
    const texto = document.getElementById("textoTraduccion");
    const traducir = document.getElementById("botonTraducir");
    const original = document.getElementById("botonOriginal");
    const opcionSiempre = document.getElementById("opcionSiempre");
    const casillaSiempre = document.getElementById("casillaSiempre");
    const textoSiempre = document.getElementById("textoSiempre");
    const nunca = document.getElementById("botonNunca");
    const google = document.getElementById("botonGoogle");
    const cerrar = document.getElementById("cerrarTraduccion");
    const api = window.patagonia;

    traducir.addEventListener("click", () => api.traducirPagina());
    original.addEventListener("click", () => api.mostrarOriginal());
    casillaSiempre.addEventListener("change", () => api.traducirSiempre(casillaSiempre.checked));
    nunca.addEventListener("click", () => api.nuncaTraducirSitio());
    google.addEventListener("click", () => api.traducirConGoogle());
    cerrar.addEventListener("click", () => api.cerrarTraduccion());
    barra.addEventListener("keydown", evento => {
        if (evento.key === "Escape") { evento.preventDefault(); api.cerrarTraduccion(); }
    });

    const mostrar = (elemento, visible) => { elemento.hidden = !visible; };

    api.recibirTraduccion(estado => {
        const visible = Boolean(estado) && estado.estado !== "oculta";
        barra.hidden = !visible;
        document.documentElement.style.setProperty("--alto-traduccion", visible ? "44px" : "0px");
        if (!visible) return;
        const idioma = estado.nombreIdioma || "otro idioma";
        const local = estado.local;
        textoSiempre.textContent = `Siempre traducir ${idioma}`;
        casillaSiempre.checked = Boolean(estado.siempre);

        if (estado.estado === "ofrecer") {
            texto.textContent = local
                ? `Esta página está en ${idioma}.`
                : `Esta página está en ${idioma}. La traducción privada todavía no está disponible para este idioma.`;
        } else if (estado.estado === "traduciendo" && estado.descarga) {
            const { hechos = 0, total = 0 } = estado.descarga;
            const porcentaje = total ? Math.min(100, Math.round(hechos * 100 / total)) : 0;
            texto.textContent = `Bajando el ${idioma} (solo la primera vez)… ${porcentaje} %`;
        } else if (estado.estado === "traduciendo") {
            texto.textContent = estado.total
                ? `Traduciendo en tu equipo… ${Math.min(estado.hechos, estado.total)} de ${estado.total}`
                : "Preparando el traductor…";
        } else if (estado.estado === "traducida") {
            texto.textContent = `Traducida del ${idioma} en tu equipo, sin mandar nada a internet.`;
        } else if (estado.estado === "error") {
            texto.textContent = estado.error || "No se pudo traducir esta página.";
        }

        mostrar(traducir, local && (estado.estado === "ofrecer" || estado.estado === "error"));
        traducir.textContent = estado.estado === "error" ? "Reintentar" : "Traducir al español";
        mostrar(original, estado.estado === "traduciendo" || estado.estado === "traducida");
        mostrar(opcionSiempre, local);
        mostrar(nunca, estado.estado === "ofrecer");
        mostrar(google, estado.estado === "ofrecer" || estado.estado === "error");
    });
})();
