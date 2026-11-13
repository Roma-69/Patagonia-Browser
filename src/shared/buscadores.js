// Buscadores de Patagonia: Brave Search (índice propio, sin Google ni Microsoft)
// por defecto y DuckDuckGo como respaldo opcional. Igual que en Android
// (mobile/lib/src/navigation_input.dart).

const BUSCADORES = Object.freeze({
    brave: Object.freeze({
        id: "brave",
        nombre: "Brave Search",
        inicio: "https://search.brave.com/",
        busqueda: "https://search.brave.com/search?q="
    }),
    duckduckgo: Object.freeze({
        id: "duckduckgo",
        nombre: "DuckDuckGo",
        inicio: "https://duckduckgo.com/",
        busqueda: "https://duckduckgo.com/?q="
    })
});

const BUSCADOR_PREDETERMINADO = "brave";

let actual = BUSCADOR_PREDETERMINADO;

function esBuscadorValido(id) {
    return typeof id === "string" && Object.prototype.hasOwnProperty.call(BUSCADORES, id);
}

function obtenerBuscador(id = actual) {
    return BUSCADORES[esBuscadorValido(id) ? id : BUSCADOR_PREDETERMINADO];
}

// La configuración avisa cuál eligió el usuario; lo demás pregunta acá.
function elegirBuscador(id) {
    actual = esBuscadorValido(id) ? id : BUSCADOR_PREDETERMINADO;
    return actual;
}

function buscadorActual() {
    return actual;
}

function urlBusqueda(texto, id = actual) {
    return obtenerBuscador(id).busqueda + encodeURIComponent(String(texto || ""));
}

// Es la portada de algún buscador (sirve para no pisar una página de inicio propia).
function esInicioDeBuscador(direccion) {
    return Object.values(BUSCADORES).some(b => b.inicio === direccion);
}

module.exports = {
    BUSCADORES,
    BUSCADOR_PREDETERMINADO,
    esBuscadorValido,
    obtenerBuscador,
    elegirBuscador,
    buscadorActual,
    urlBusqueda,
    esInicioDeBuscador
};
