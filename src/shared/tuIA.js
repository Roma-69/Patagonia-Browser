// "Tu IA": accesos a las IA que usa cada persona. Patagonia no tiene IA propia:
// solo abre el sitio que la persona eligió, en una pestaña nueva, sin mandarle
// nada de la página que está viendo.

const IAS = Object.freeze({
    chatgpt: { nombre: "ChatGPT", url: "https://chatgpt.com/" },
    claude: { nombre: "Claude", url: "https://claude.ai/" },
    gemini: { nombre: "Gemini", url: "https://gemini.google.com/" },
    copilot: { nombre: "Copilot", url: "https://copilot.microsoft.com/" },
    perplexity: { nombre: "Perplexity", url: "https://www.perplexity.ai/" },
    lechat: { nombre: "Le Chat (Mistral)", url: "https://chat.mistral.ai/" }
});

const MAX_URL = 2048;

// Dirección propia ("Otra"): solo http/https y sin usuario ni contraseña en la URL.
function urlPropiaValida(valor) {
    if (typeof valor !== "string" || !valor || valor.length > MAX_URL) return "";
    try {
        const url = new URL(valor.trim());
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
        return url.href;
    } catch {
        return "";
    }
}

// Valor guardado en la configuración: "" (sin elegir), un id de la lista o una dirección.
function normalizarIA(valor) {
    if (typeof valor !== "string" || !valor) return "";
    if (Object.hasOwn(IAS, valor)) return valor;
    return urlPropiaValida(valor);
}

// Dirección a abrir, o "" si todavía no eligió ninguna.
function resolverIA(valor) {
    const ia = normalizarIA(valor);
    if (!ia) return "";
    return Object.hasOwn(IAS, ia) ? IAS[ia].url : ia;
}

module.exports = { IAS, normalizarIA, resolverIA, urlPropiaValida };
