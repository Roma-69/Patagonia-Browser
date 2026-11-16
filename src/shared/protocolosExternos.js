// Enlaces que abren una aplicación del equipo en vez de una página web.
//
// Son las direcciones que no empiezan con http:// ni https://, como las de
// "Abrir Claude", Zoom, Spotify o WhatsApp. El navegador no las sabe mostrar:
// se las tiene que pasar al sistema para que abra la aplicación que corresponde.
//
// Esta misma decisión la toma la versión de Android (ProtocolosExternos.kt).

// Las maneja el propio navegador: acá no tocamos nada y siguen como siempre.
const INTERNOS = Object.freeze([
    "http", "https", "about", "blob", "data", "file", "filesystem",
    "javascript", "view-source", "ws", "wss",
    "chrome", "chrome-extension", "devtools", "moz-extension", "resource"
]);

// Nunca se le pasan al sistema: se usaron para hacer daño desde una página web.
const PELIGROSOS = Object.freeze([
    "ms-msdt", "search-ms", "ms-officecmd", "ms-cxh", "ms-cxh-full",
    "ms-appinstaller", "ms-availablenetworks", "ms-settings",
    "shell", "vbscript", "vnd.ms-cmd", "cmd", "powershell",
    "ldap", "ldaps", "smb", "nfs", "res", "mk", "cid", "help", "afp", "jar"
]);

const LARGO_MAXIMO = 2048;

const SOLO_ESQUEMA = /^[a-z][a-z0-9+.-]*$/;

function esquemaDe(direccion) {
    const texto = String(direccion || "").trim();
    const corte = texto.indexOf(":");
    if (corte <= 0) return "";
    const esquema = texto.slice(0, corte).toLowerCase();
    return SOLO_ESQUEMA.test(esquema) ? esquema : "";
}

/**
 * Dice qué hacer con un enlace:
 *   "interno"   → lo muestra el navegador (no tocar).
 *   "externo"   → hay que preguntarle al usuario y abrirlo con el sistema.
 *   "bloqueado" → no se abre nunca.
 */
function clasificarEnlace(direccion) {
    const texto = String(direccion || "").trim();
    const esquema = esquemaDe(texto);
    if (!esquema) return { tipo: "bloqueado", esquema: "", resumen: "" };
    if (INTERNOS.includes(esquema)) return { tipo: "interno", esquema, resumen: "" };
    if (PELIGROSOS.includes(esquema)) return { tipo: "bloqueado", esquema, resumen: "" };
    // Una dirección enorme puede esconder una orden para el sistema.
    if (texto.length > LARGO_MAXIMO || /[\r\n\t]/.test(texto)) {
        return { tipo: "bloqueado", esquema, resumen: "" };
    }
    return { tipo: "externo", esquema, resumen: resumirEnlace(texto, esquema) };
}

// Texto corto para mostrarle al usuario, sin la parte larga con códigos de sesión.
function resumirEnlace(direccion, esquema) {
    const crudo = direccion.slice(esquema.length + 1);
    const barras = crudo.startsWith("//") ? "//" : "";
    const resto = crudo.replace(/^\/+/, "");
    const limpio = resto.split(/[?#]/)[0].replace(/\/+$/, "");
    const corto = limpio.length > 60 ? `${limpio.slice(0, 59)}…` : limpio;
    return `${esquema}:${barras}${corto}`;
}

module.exports = { clasificarEnlace, esquemaDe, INTERNOS, PELIGROSOS, LARGO_MAXIMO };
