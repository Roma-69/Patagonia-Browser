// Archivo de favoritos para pasar entre la PC y el celular, sin cuenta ni nube.
// Usa el formato estándar de favoritos (el mismo que Chrome, Firefox y Edge), así que
// también sirve para traer favoritos de otro navegador. El celular usa el mismo formato
// (mobile/lib/src/favoritos_archivo.dart).

const MAXIMO = 5000;

const escapar = texto => String(texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function desescapar(texto) {
    return String(texto)
        .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ""; } })
        .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function urlWeb(valor) {
    try {
        const url = new URL(String(valor).trim());
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        return url.href;
    } catch { return null; }
}

function exportarFavoritos(lista = []) {
    const filas = lista
        .map(f => ({ url: urlWeb(f.url), titulo: String(f.titulo ?? f.title ?? "").trim() }))
        .filter(f => f.url)
        .map(f => `    <DT><A HREF="${escapar(f.url)}">${escapar(f.titulo || new URL(f.url).hostname)}</A>`);
    return [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        "<!-- Favoritos de Patagonia Browser. Se pueden importar en Patagonia (PC o celular) o en otro navegador. -->",
        "<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">",
        "<TITLE>Favoritos de Patagonia</TITLE>",
        "<H1>Favoritos de Patagonia</H1>",
        "<DL><p>",
        ...filas,
        "</DL><p>",
        ""
    ].join("\n");
}

// Devuelve [{ titulo, url }] solo con páginas web válidas, sin repetidas.
function leerFavoritos(texto) {
    const vistos = new Set();
    const resultado = [];
    const patron = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
    for (const [, dobles, simples, contenido] of String(texto).matchAll(patron)) {
        const url = urlWeb(desescapar(dobles ?? simples ?? ""));
        if (!url || vistos.has(url)) continue;
        vistos.add(url);
        const titulo = desescapar(contenido.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim().slice(0, 300);
        resultado.push({ titulo: titulo || new URL(url).hostname, url });
        if (resultado.length >= MAXIMO) break;
    }
    return resultado;
}

module.exports = { exportarFavoritos, leerFavoritos };
