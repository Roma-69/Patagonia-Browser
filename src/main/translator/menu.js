// Opciones del ícono del traductor (barra de direcciones). Es un menú del sistema:
// se ve encima de la página sin taparla con una barra.
function crearMenuTraduccion(estado, acciones) {
    const idioma = estado?.nombreIdioma || "otro idioma";
    const items = [];
    const traducida = estado?.estado === "traducida" || estado?.estado === "traduciendo";
    if (estado?.estado === "traduciendo") {
        items.push({ label: estado.descarga ? `Bajando el ${idioma} (solo la primera vez)…` : "Traduciendo en tu equipo…", enabled: false });
    } else if (estado?.estado === "error") {
        items.push({ label: estado.error || "No se pudo traducir esta página.", enabled: false });
    } else if (!traducida) {
        items.push({ label: `Esta página está en ${idioma}`, enabled: false });
    }
    if (estado?.local && !traducida) {
        items.push({ label: estado.estado === "error" ? "Volver a intentar" : "Traducir al español (en tu equipo)", click: acciones.traducir });
    }
    if (traducida) items.push({ label: "Mostrar original", click: acciones.original });
    items.push({ type: "separator" });
    if (estado?.local) {
        items.push({ label: `Siempre traducir ${idioma}`, type: "checkbox", checked: Boolean(estado.siempre), click: item => acciones.siempre(item.checked) });
    }
    items.push({ label: "No traducir nunca este sitio", click: acciones.nunca });
    items.push({ type: "separator" });
    items.push({ label: "Traducir con Google (manda la dirección a Google)", click: acciones.google });
    return items;
}

module.exports = { crearMenuTraduccion };
