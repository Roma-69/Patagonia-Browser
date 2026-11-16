// Aviso en descargas peligrosas: programas (.exe, .apk...) que vienen de sitios
// que Patagonia no conoce. Las mismas listas están en el celu
// (GeckoDownloads.kt); una prueba controla que sean iguales.

const SEGUNDO_NIVEL = new Set(["com", "gob", "gov", "org", "net", "edu", "mil", "int", "tur", "co", "ac", "or", "ne", "nom", "coop", "info"]);

// download.microsoft.com → microsoft.com; www.afip.gob.ar → afip.gob.ar.
function sitioDe(host) {
    const limpio = String(host || "").toLowerCase().replace(/\.$/, "");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(limpio) || limpio.includes(":")) return limpio;
    const partes = limpio.split(".").filter(Boolean);
    const n = partes.length;
    if (n <= 2) return partes.join(".");
    if (partes[n - 1].length === 2 && SEGUNDO_NIVEL.has(partes[n - 2])) return partes.slice(n - 3).join(".");
    return partes.slice(n - 2).join(".");
}

// Archivos que, al abrirlos, ejecutan algo en la PC o instalan una app en el celu.
const EXTENSIONES = Object.freeze([
    "exe", "msi", "msix", "msixbundle", "appx", "appxbundle", "bat", "cmd", "com", "scr", "pif", "ps1",
    "vbs", "vbe", "js", "jse", "wsf", "hta", "jar", "lnk", "reg", "cpl", "dll", "apk", "xapk", "apks"
]);

// Sitios conocidos de donde la gente baja programas y drivers de verdad.
const SITIOS_CONFIABLES = Object.freeze([
    "microsoft.com", "windowsupdate.com", "github.com", "githubusercontent.com", "google.com", "mozilla.org",
    "mozilla.net", "brave.com", "videolan.org", "7-zip.org", "rarlab.com", "notepad-plus-plus.org",
    "libreoffice.org", "documentfoundation.org", "python.org", "nodejs.org", "java.com", "oracle.com",
    "nvidia.com", "amd.com", "intel.com", "asus.com", "lenovo.com", "dell.com", "hp.com", "epson.com",
    "tp-link.com", "motorola.com", "samsung.com", "steampowered.com", "epicgames.com", "ea.com",
    "battle.net", "ubisoft.com", "spotify.com", "zoom.us", "whatsapp.com", "whatsapp.net", "telegram.org",
    "discord.com", "adobe.com", "apple.com", "anydesk.com", "teamviewer.com", "bitwarden.com",
    "malwarebytes.com", "f-droid.org"
]);

function extensionPeligrosa(nombre) {
    const m = /\.([a-z0-9]+)$/i.exec(String(nombre || "").trim());
    return m && EXTENSIONES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : "";
}

function hostDe(direccion) {
    try {
        const url = new URL(direccion);
        return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase() : "";
    } catch { return ""; }
}

function sitioConfiable(host) {
    if (!host) return false;
    const sitio = sitioDe(host);
    return SITIOS_CONFIABLES.includes(sitio) || /\.gob\.ar$/.test(sitio);
}

// null si se puede bajar sin preguntar; si no, los datos para el aviso.
function revisarDescarga({ nombre, url, pagina }) {
    const extension = extensionPeligrosa(nombre);
    if (!extension) return null;
    const hosts = [hostDe(url), hostDe(pagina)].filter(Boolean);
    if (hosts.some(sitioConfiable)) return null;
    return { extension, sitio: hosts.length ? sitioDe(hosts[hosts.length - 1]) : "una página sin dirección" };
}

function textoAviso({ nombre, extension, sitio }) {
    return `"${nombre}" es un programa (.${extension}) y viene de ${sitio}, un sitio que Patagonia no conoce.\n\n` +
        "Los programas de páginas desconocidas son la forma más común de que entre un virus. " +
        "Bajalo solo si sabés qué es y confiás en quién te lo pasó.";
}

module.exports = { sitioDe, EXTENSIONES, SITIOS_CONFIABLES, extensionPeligrosa, sitioConfiable, revisarDescarga, textoAviso };
