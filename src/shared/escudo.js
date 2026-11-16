// Escudo contra estafas: decide si una dirección es peligrosa. Todo se revisa en
// el equipo: no se manda a ningún lado qué páginas se visitan.
//
// Dos controles:
// 1. Lista de páginas peligrosas conocidas (estafas que roban claves y páginas
//    con virus), que se baja de listas públicas y se guarda en el equipo.
// 2. Imitaciones: direcciones que usan el nombre de Mercado Pago, ANSES, el
//    Correo, etc., pero que no son las oficiales (mercadopago-seguridad.com,
//    anses-bono.net, correoargentino.com.ar.xyz.top...).
//
// Este mismo archivo va copiado en el celular (extensión patagonia_escudo), por
// eso no usa nada de Node ni del navegador: solo JavaScript común.
(function (raiz) {
    "use strict";

    // Segundo nivel de dominios de país (mercadopago.com.ar → el sitio es mercadopago.com.ar).
    const SEGUNDO_NIVEL = new Set(["com", "gob", "gov", "org", "net", "edu", "mil", "int", "tur", "co", "ac", "or", "ne", "nom", "coop", "info"]);

    // Marcas que más usan las estafas en Argentina (y algunas de todo el mundo).
    // "palabras": cómo aparece el nombre en una dirección trucha.
    // "oficiales": los sitios de verdad (y todo lo que cuelga de ellos).
    const MARCAS = [
        { nombre: "Mercado Pago", palabras: ["mercadopago"],
            oficiales: [/^mercadopago\.com(\.(ar|br|mx|cl|co|pe|uy|ve|ec))?$/] },
        { nombre: "Mercado Libre", palabras: ["mercadolibre", "mercadolivre"],
            oficiales: [/^mercadoli(b|v)re\.com(\.(ar|br|mx|cl|co|pe|uy|ve|ec|do|pa|cr|bo|gt|hn|ni|py|sv))?$/, /^mercadolibre\.(cl|com\.uy)$/] },
        { nombre: "ANSES", palabras: ["anses"], oficiales: ["anses.gob.ar", "anses.gov.ar"] },
        { nombre: "AFIP / ARCA", palabras: ["afip"], oficiales: ["afip.gob.ar", "afip.gov.ar"] },
        { nombre: "Correo Argentino", palabras: ["correoargentino"], oficiales: ["correoargentino.com.ar"] },
        { nombre: "Andreani", palabras: ["andreani"], oficiales: ["andreani.com", "andreani.com.ar"] },
        { nombre: "Banco Galicia", palabras: ["bancogalicia"], oficiales: ["bancogalicia.com", "bancogalicia.com.ar"] },
        { nombre: "Naranja X", palabras: ["naranjax"], oficiales: ["naranjax.com"] },
        { nombre: "Brubank", palabras: ["brubank"], oficiales: ["brubank.com"] },
        { nombre: "PayPal", palabras: ["paypal"], oficiales: ["paypal.com", "paypal.me", "paypalobjects.com", "paypal-community.com", "paypalcorp.com"] },
        { nombre: "Netflix", palabras: ["netflix"], oficiales: ["netflix.com", "netflix.net", "netflixtechblog.com"] },
        { nombre: "WhatsApp", palabras: ["whatsapp"], oficiales: ["whatsapp.com", "whatsapp.net"] },
        { nombre: "Apple (iCloud)", palabras: ["icloud", "appleid"], oficiales: ["icloud.com", "apple.com"] }
    ];

    function normalizarHost(host) {
        return String(host || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    }

    function sitioDe(host) {
        const partes = normalizarHost(host).split(".").filter(Boolean);
        if (partes.length <= 2) return partes.join(".");
        const n = partes.length;
        if (partes[n - 1].length === 2 && SEGUNDO_NIVEL.has(partes[n - 2])) return partes.slice(n - 3).join(".");
        return partes.slice(n - 2).join(".");
    }

    // Las estafas cambian letras por números o meten guiones: m3rcado-pag0 → mercadopago.
    function parecido(texto) {
        return String(texto).toLowerCase()
            .replace(/rn/g, "m").replace(/vv/g, "w")
            .replace(/0/g, "o").replace(/[1i!|]/g, "l").replace(/3/g, "e").replace(/4/g, "a")
            .replace(/5/g, "s").replace(/7/g, "t").replace(/[^a-z]/g, "");
    }

    const PALABRAS = MARCAS.flatMap(marca => marca.palabras.map(palabra => ({ marca, clave: parecido(palabra) })));

    function esOficial(marca, sitio) {
        return marca.oficiales.some(oficial => typeof oficial === "string" ? oficial === sitio : oficial.test(sitio));
    }

    function revisarImitacion(host) {
        const limpio = normalizarHost(host);
        if (!limpio || /^\d+\.\d+\.\d+\.\d+$/.test(limpio) || limpio.includes(":")) return null;
        const sitio = sitioDe(limpio);
        const comparable = parecido(limpio);
        for (const { marca, clave } of PALABRAS) {
            if (comparable.includes(clave) && !esOficial(marca, sitio)) return { motivo: "imitacion", marca: marca.nombre, sitio };
        }
        return null;
    }

    function leerLista(texto) {
        const dominios = new Set();
        for (const linea of String(texto || "").split(/\r?\n/)) {
            const valor = linea.trim().toLowerCase().replace(/^(0\.0\.0\.0|127\.0\.0\.1)\s+/, "").replace(/^\|\|/, "").replace(/\^$/, "");
            if (!valor || valor.startsWith("#") || valor.startsWith("!")) continue;
            if (/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(valor)) dominios.add(valor.replace(/^www\./, ""));
        }
        return dominios;
    }

    function crearEscudo(listaInicial) {
        let dominios = listaInicial instanceof Set ? listaInicial : leerLista(listaInicial);

        function enLista(host) {
            const partes = normalizarHost(host).split(".");
            for (let i = 0; i < partes.length - 1; i++) {
                if (dominios.has(partes.slice(i).join("."))) return true;
            }
            return false;
        }

        // null si se puede entrar; si no, por qué no.
        function revisar(direccion) {
            let url;
            try { url = new URL(direccion); } catch { return null; }
            if (url.protocol !== "http:" && url.protocol !== "https:") return null;
            const host = normalizarHost(url.hostname);
            if (enLista(host)) return { motivo: "lista", sitio: sitioDe(host), host };
            const imitacion = revisarImitacion(host);
            return imitacion ? { ...imitacion, host } : null;
        }

        return {
            revisar,
            cambiarLista(texto) { dominios = texto instanceof Set ? texto : leerLista(texto); },
            cantidad: () => dominios.size
        };
    }

    // Listas públicas (las mismas en la PC y el celu). Se prueban en orden.
    const FUENTES = [
        ["https://malware-filter.gitlab.io/malware-filter/phishing-filter-domains.txt",
            "https://curbengh.github.io/phishing-filter/phishing-filter-domains.txt",
            "https://phishing-filter.pages.dev/phishing-filter-domains.txt"],
        ["https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-domains.txt",
            "https://curbengh.github.io/urlhaus-filter/urlhaus-filter-domains.txt",
            "https://urlhaus-filter.pages.dev/urlhaus-filter-domains.txt"]
    ];

    const api = { crearEscudo, leerLista, revisarImitacion, sitioDe, parecido, MARCAS, FUENTES };
    if (typeof module !== "undefined" && module && module.exports) module.exports = api;
    else raiz.PatagoniaEscudo = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
