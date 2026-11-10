// Modo lectura: muestra solo el texto de la nota en una ventana limpia,
// con letra cómoda y sin anuncios. La ventana no ejecuta JavaScript.

const ETIQUETAS = new Set([
    "A", "ABBR", "B", "BLOCKQUOTE", "BR", "CAPTION", "CODE", "DD", "DEL", "DIV", "DL", "DT", "EM",
    "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "IMG", "INS", "LI", "MARK",
    "OL", "P", "PICTURE", "PRE", "Q", "S", "SECTION", "ARTICLE", "SMALL", "SPAN", "STRONG", "SUB", "SUP",
    "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TIME", "TR", "U", "UL"
]);
const ATRIBUTOS = { A: ["href", "title"], IMG: ["src", "alt", "title", "width", "height"], TD: ["colspan", "rowspan"], TH: ["colspan", "rowspan"] };

function escapar(texto) {
    return String(texto || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function urlSegura(valor, base, permitirData = false) {
    try {
        const url = new URL(String(valor || ""), base);
        if (["http:", "https:"].includes(url.protocol)) return url.href;
        if (permitirData && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(url.href)) return url.href;
    } catch {}
    return null;
}

// Deja solo etiquetas y atributos de texto; todo lo demás se saca.
function limpiarArticulo(html, base, JSDOM) {
    const dom = new JSDOM(`<!doctype html><body>${html || ""}</body>`);
    try {
        const documento = dom.window.document;
        const recorrer = nodo => {
            for (const hijo of [...nodo.children]) {
                if (!ETIQUETAS.has(hijo.tagName)) {
                    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "MATH", "TEMPLATE", "LINK", "META", "VIDEO", "AUDIO", "SOURCE", "NOSCRIPT"].includes(hijo.tagName)) {
                        hijo.remove();
                        continue;
                    }
                    recorrer(hijo);
                    hijo.replaceWith(...hijo.childNodes);
                    continue;
                }
                const permitidos = ATRIBUTOS[hijo.tagName] || [];
                for (const { name } of [...hijo.attributes]) if (!permitidos.includes(name)) hijo.removeAttribute(name);
                if (hijo.tagName === "A") {
                    const href = urlSegura(hijo.getAttribute("href"), base);
                    if (href) hijo.setAttribute("href", href); else hijo.removeAttribute("href");
                }
                if (hijo.tagName === "IMG") {
                    const src = urlSegura(hijo.getAttribute("src"), base, true);
                    if (!src) { hijo.remove(); continue; }
                    hijo.setAttribute("src", src);
                }
                recorrer(hijo);
            }
        };
        recorrer(documento.body);
        return documento.body.innerHTML;
    } finally { dom.window.close(); }
}

function paginaLectura({ titulo, sitio, contenido, letraGrande }) {
    const tamano = letraGrande ? 24 : 20;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'">
<title>${escapar(titulo)} — Modo lectura</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; background: #fbf7ef; color: #222; font: ${tamano}px/1.7 Georgia, "Times New Roman", serif; }
@media (prefers-color-scheme: dark) { body { background: #14181f; color: #e6e1d6; } a { color: #f0a868; } }
main { max-width: 42em; margin: 0 auto; padding: 2.2em 1.4em 4em; }
.sitio { font: 600 0.7em system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase; opacity: .65; }
h1 { font-size: 1.7em; line-height: 1.25; margin: .3em 0 1em; }
img, picture { max-width: 100%; height: auto; border-radius: 6px; }
figure { margin: 1.5em 0; } figcaption { font-size: .75em; opacity: .7; }
pre { white-space: pre-wrap; font-size: .8em; } table { border-collapse: collapse; } td, th { border: 1px solid #8884; padding: .3em .5em; }
a { color: #b4541a; }
</style></head><body><main>
<div class="sitio">${escapar(sitio)}</div>
<h1>${escapar(titulo)}</h1>
${contenido}
</main></body></html>`;
}

function crearVentanaLectura({ BrowserWindow, html, titulo, icono, abrirEnNavegador }) {
    const ventana = new BrowserWindow({
        width: 900, height: 900, minWidth: 420, minHeight: 300,
        show: false, title: `${titulo} — Modo lectura`, autoHideMenuBar: true, icon: icono,
        webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
    });
    ventana.setMenuBarVisibility?.(false);
    const contenido = ventana.webContents;
    // Los enlaces de la nota se abren en el navegador, no en esta ventana.
    contenido.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) abrirEnNavegador(url); return { action: "deny" }; });
    contenido.on("will-navigate", (evento, url) => {
        evento.preventDefault();
        if (/^https?:/i.test(url)) abrirEnNavegador(url);
    });
    contenido.on("before-input-event", (evento, tecla) => {
        if (tecla.type === "keyDown" && (tecla.key === "Escape" || ((tecla.control || tecla.meta) && String(tecla.key).toLowerCase() === "w"))) {
            evento.preventDefault();
            ventana.close();
        }
    });
    ventana.once("ready-to-show", () => ventana.show());
    contenido.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => { if (!ventana.isDestroyed()) ventana.show(); });
    return ventana;
}

module.exports = { limpiarArticulo, paginaLectura, crearVentanaLectura, escapar };
