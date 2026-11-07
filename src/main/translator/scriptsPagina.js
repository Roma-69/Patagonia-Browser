// Scripts que corren en un "mundo aislado" de la página: comparten el DOM pero no las
// variables de la página, así la página no puede tocar ni ver al traductor.
const MUNDO_AISLADO = 1987;

const MUESTRA = `(() => ({
    lang: document.documentElement.lang || "",
    texto: String(document.body ? (document.body.innerText || document.body.textContent || "") : "").slice(0, 6000)
}))()`;

// Junta los textos todavía sin traducir; los visibles primero.
const EXTRAER = `(() => {
    const E = window.__patagoniaTraductor || (window.__patagoniaTraductor = { nodos: [], originales: new Map() });
    if (!document.body) return [];
    const SALTAR = new Set(["SCRIPT","STYLE","NOSCRIPT","CODE","PRE","TEXTAREA","INPUT","SELECT","OPTION","SVG","MATH","KBD","SAMP","VAR","TEMPLATE","IFRAME","CANVAS"]);
    const omitir = elemento => {
        for (let p = elemento; p; p = p.parentElement) {
            if (SALTAR.has(p.tagName.toUpperCase()) || p.isContentEditable) return true;
            if (p.getAttribute("translate") === "no" || p.classList.contains("notranslate")) return true;
        }
        return false;
    };
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(nodo) {
            if (E.originales.has(nodo)) return NodeFilter.FILTER_REJECT;
            const texto = nodo.nodeValue;
            if (!texto || texto.length > 5000 || !/\\p{L}{2,}/u.test(texto)) return NodeFilter.FILTER_REJECT;
            return omitir(nodo.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
    });
    const nuevos = [];
    for (let nodo = recorrido.nextNode(); nodo && nuevos.length < 4000; nodo = recorrido.nextNode()) {
        E.originales.set(nodo, nodo.nodeValue);
        const indice = E.nodos.push(nodo) - 1;
        const caja = nodo.parentElement.getBoundingClientRect();
        const visible = caja.bottom > 0 && caja.top < innerHeight && caja.width > 0;
        nuevos.push({ indice, texto: nodo.nodeValue.trim(), orden: visible ? caja.top : 100000 + Math.abs(caja.top) });
    }
    nuevos.sort((a, b) => a.orden - b.orden);
    return nuevos.map(({ indice, texto }) => [indice, texto]);
})()`;

function aplicar(pares) {
    return `((pares) => {
        const E = window.__patagoniaTraductor;
        if (!E) return 0;
        let hechos = 0;
        for (const [indice, traduccion] of pares) {
            const nodo = E.nodos[indice];
            const original = nodo && E.originales.get(nodo);
            if (!nodo || original === undefined || !nodo.isConnected || nodo.nodeValue !== original) continue;
            const inicio = original.match(/^\\s*/)[0];
            const fin = original.match(/\\s*$/)[0];
            nodo.nodeValue = inicio + traduccion + fin;
            E.originales.set(nodo, original);
            E.traducidos = (E.traducidos || new WeakMap());
            E.traducidos.set(nodo, nodo.nodeValue);
            hechos++;
        }
        return hechos;
    })(${JSON.stringify(pares)})`;
}

const RESTAURAR = `(() => {
    const E = window.__patagoniaTraductor;
    if (!E) return 0;
    let hechos = 0;
    for (const [nodo, original] of E.originales) {
        if (nodo.isConnected && (!E.traducidos || E.traducidos.get(nodo) === nodo.nodeValue)) { nodo.nodeValue = original; hechos++; }
    }
    delete window.__patagoniaTraductor;
    return hechos;
})()`;

module.exports = { MUNDO_AISLADO, MUESTRA, EXTRAER, RESTAURAR, aplicar };
