const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { JSDOM } = require("jsdom");
const { detectarIdioma, nombreIdioma } = require("../src/main/translator/idioma");
const { EXTRAER, RESTAURAR, MUESTRA, aplicar } = require("../src/main/translator/scriptsPagina");
const { crearMotor, paresDisponibles } = require("../src/main/translator/motor");
const { crearPreferencias } = require("../src/main/translator/preferencias");
const { crearGestorTraduccion, sitioDe, urlGoogle } = require("../src/main/translator/gestor");
const { crearPlantillaMenu } = require("../src/main/contextMenu");

const INGLES = "NASA will provide an update on the agency's progress toward establishing a sustained human presence on the Moon. The mission is part of a program that has been running for years and will continue with more flights.";
const ESPANOL = "La NASA dará una actualización sobre el progreso de la agencia para establecer una presencia humana en la Luna. La misión es parte de un programa que lleva años y que va a seguir con más vuelos.";

test("detecta el idioma por el texto aunque el atributo lang mienta", () => {
    assert.equal(detectarIdioma({ texto: INGLES, lang: "" }), "en");
    assert.equal(detectarIdioma({ texto: ESPANOL, lang: "en" }), "es");
    assert.equal(detectarIdioma({ texto: "Hola", lang: "pt-BR" }), "pt");
    assert.equal(detectarIdioma({ texto: "", lang: "" }), "");
    assert.equal(nombreIdioma("en"), "inglés");
});

function pagina(html) {
    const dom = new JSDOM(`<!doctype html><html lang="en"><body>${html}</body></html>`, { runScripts: "outside-only" });
    // Como en Electron, el resultado de la página llega copiado (serializado).
    const copiar = valor => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));
    return { dom, correr: codigo => copiar(dom.window.eval(codigo)) };
}

test("recorre la página, traduce solo texto visible al lector y restaura el original", () => {
    const { dom, correr } = pagina(`<h1>Featured News</h1><p>Hello <b>world</b>!</p>
        <code>let x = 1</code><script>var a = "skip me";</script><p translate="no">Brand Name</p>
        <p class="notranslate">Other Brand</p><textarea>typed text</textarea><p>   Spaced text   </p>`);
    const muestra = correr(MUESTRA);
    assert.equal(muestra.lang, "en");
    const pares = correr(EXTRAER);
    const textos = pares.map(([, t]) => t);
    assert.deepEqual(textos.sort(), ["Featured News", "Hello", "Spaced text", "world"].sort());
    assert.deepEqual(correr(EXTRAER), [], "no vuelve a juntar lo que ya tomó");
    const traduccion = { "Featured News": "Noticias destacadas", Hello: "Hola", world: "mundo", "Spaced text": "Texto con espacios" };
    assert.equal(correr(aplicar(pares.map(([i, t]) => [i, traduccion[t]]))), 4);
    const doc = dom.window.document;
    assert.equal(doc.querySelector("h1").textContent, "Noticias destacadas");
    assert.equal(doc.querySelectorAll("p")[0].textContent, "Hola mundo!");
    assert.equal(doc.querySelectorAll("p")[3].textContent, "   Texto con espacios   ", "conserva los espacios de alrededor");
    assert.equal(doc.querySelector("code").textContent, "let x = 1");
    // Contenido nuevo que carga la página después: se junta en la siguiente pasada.
    doc.body.insertAdjacentHTML("beforeend", "<p>Load more</p>");
    assert.deepEqual(correr(EXTRAER).map(([, t]) => t), ["Load more"]);
    assert.ok(correr(RESTAURAR) >= 4);
    assert.equal(doc.querySelector("h1").textContent, "Featured News");
    assert.equal(doc.querySelectorAll("p")[0].textContent, "Hello world!");
});

test("si la página cambió un texto mientras se traducía, no se pisa", () => {
    const { dom, correr } = pagina("<p>Price: 10</p>");
    const pares = correr(EXTRAER);
    dom.window.document.querySelector("p").firstChild.nodeValue = "Price: 12";
    assert.equal(correr(aplicar([[pares[0][0], "Precio: 10"]])), 0);
    assert.equal(dom.window.document.querySelector("p").textContent, "Price: 12");
});

test("solo ofrece pares con modelo incluido", async () => {
    assert.ok(paresDisponibles().includes("enes"), "el modelo inglés→español viene con el navegador");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pares-"));
    await fs.mkdir(path.join(dir, "enes"));
    await fs.mkdir(path.join(dir, "frde"));
    await fs.writeFile(path.join(dir, "enes", "model.enes.bin.gz"), "x");
    assert.deepEqual(paresDisponibles(dir), ["enes"]);
    assert.deepEqual(paresDisponibles(path.join(dir, "no-existe")), []);
});

function hiloFalso() {
    const hilo = new EventEmitter();
    hilo.llamadas = [];
    hilo.terminate = () => { hilo.terminado = true; };
    hilo.postMessage = ({ id, name, args }) => {
        hilo.llamadas.push(name);
        setImmediate(() => {
            if (name === "translate") {
                const result = args[0].texts.map(({ text }) => ({ target: { text: `ES(${text})` } }));
                hilo.emit("message", { id, result });
            } else hilo.emit("message", { id, result: true });
        });
    };
    return hilo;
}

test("el motor carga el modelo una vez, usa caché y se cierra si queda ocioso", async () => {
    const hilo = hiloFalso();
    let cierre;
    const motor = crearMotor({
        crearProceso: () => hilo,
        cargarModelo: () => ({ model: new ArrayBuffer(1), shortlist: new ArrayBuffer(1), vocabs: [new ArrayBuffer(1)] }),
        temporizador: { setTimeout: fn => { cierre = fn; return 1; }, clearTimeout() {} }
    });
    assert.deepEqual(await motor.traducir("enes", ["Hello", "World", "Hello"]), ["ES(Hello)", "ES(World)", "ES(Hello)"]);
    assert.deepEqual(await motor.traducir("enes", ["Hello"]), ["ES(Hello)"]);
    assert.deepEqual(hilo.llamadas, ["initialize", "loadTranslationModel", "translate"], "la segunda vez sale de la caché");
    cierre();
    assert.equal(hilo.terminado, true);
});

test("si el hilo se cae, las traducciones pendientes fallan sin colgarse", async () => {
    const hilo = new EventEmitter();
    hilo.postMessage = () => setImmediate(() => hilo.emit("exit", 1));
    const motor = crearMotor({ crearProceso: () => hilo, cargarModelo: () => ({}) });
    await assert.rejects(motor.traducir("enes", ["Hello"]), /se cerró/);
});

test("las preferencias se guardan y se vuelven a leer", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trad-"));
    const archivo = path.join(dir, "traductor.json");
    const prefs = crearPreferencias(() => archivo);
    await prefs.iniciar();
    await prefs.ponerSiempre("en");
    await prefs.ponerNunca("ejemplo.com");
    await prefs.ponerSiempre("<script>");
    const otra = crearPreferencias(archivo);
    await otra.iniciar();
    assert.equal(otra.siempreTraducir("en"), true);
    assert.equal(otra.nuncaEn("ejemplo.com"), true);
    assert.deepEqual(otra.estado().siempre, ["en"]);
    await otra.ponerSiempre("en", false);
    assert.equal(otra.siempreTraducir("en"), false);
});

function contenidoFalso(url, { texto = INGLES } = {}) {
    const { correr, dom } = pagina(`<p>${texto}</p><p>Second line</p>`);
    return {
        id: Math.floor(Math.random() * 1e9),
        dom,
        isDestroyed: () => false,
        getURL: () => url,
        executeJavaScriptInIsolatedWorld: async (_mundo, [{ code }]) => correr(code)
    };
}

function armarGestor(contenido, { siempre = [], nunca = [] } = {}) {
    const avisos = [];
    const intervalos = [];
    const prefs = {
        siempre: new Set(siempre), nunca: new Set(nunca),
        siempreTraducir(i) { return this.siempre.has(i); }, nuncaEn(s) { return this.nunca.has(s); },
        async ponerSiempre(i, a) { if (a) this.siempre.add(i); else this.siempre.delete(i); },
        async ponerNunca(s) { this.nunca.add(s); }
    };
    const motor = { traducir: async (_par, textos) => textos.map(t => `[es] ${t}`) };
    const gestor = crearGestorTraduccion({
        motor, preferencias: prefs, pares: () => ["enes"],
        obtenerContenido: () => contenido,
        notificar: estado => avisos.push(estado),
        temporizador: { setInterval: fn => { intervalos.push(fn); return intervalos.length; }, clearInterval() {} }
    });
    return { gestor, avisos, prefs, intervalos, ultimo: () => avisos.at(-1) };
}

test("ofrece traducir una página en inglés y la traduce en el equipo", async () => {
    const contenido = contenidoFalso("https://www.nasa.gov/");
    const { gestor, ultimo, intervalos } = armarGestor(contenido);
    await gestor.paginaLista(contenido);
    assert.equal(ultimo().estado, "ofrecer");
    assert.equal(ultimo().idioma, "en");
    assert.equal(ultimo().local, true);
    assert.equal(gestor.visible(), true);
    await gestor.traducir();
    assert.equal(ultimo().estado, "traducida");
    assert.equal(ultimo().hechos, 2);
    assert.match(contenido.dom.window.document.querySelector("p").textContent, /^\[es\] NASA will/);
    // Contenido nuevo: la vigilancia lo traduce.
    contenido.dom.window.document.body.insertAdjacentHTML("beforeend", "<p>Load more stories</p>");
    await intervalos[0]();
    assert.equal(contenido.dom.window.document.querySelectorAll("p")[2].textContent, "[es] Load more stories");
    await gestor.mostrarOriginal();
    assert.equal(ultimo().estado, "ofrecer");
    assert.match(contenido.dom.window.document.querySelector("p").textContent, /^NASA will/);
});

test("no molesta en páginas en español, internas o de sitios marcados como nunca", async () => {
    const espanol = contenidoFalso("https://www.lanacion.com.ar/", { texto: ESPANOL });
    let armado = armarGestor(espanol);
    await armado.gestor.paginaLista(espanol);
    assert.equal(armado.avisos.length, 0);
    const interna = contenidoFalso("file:///C:/Patagonia/ui/new-tab.html");
    armado = armarGestor(interna);
    await armado.gestor.paginaLista(interna);
    assert.equal(armado.avisos.length, 0);
    const bloqueado = contenidoFalso("https://www.nasa.gov/");
    armado = armarGestor(bloqueado, { nunca: ["nasa.gov"] });
    await armado.gestor.paginaLista(bloqueado);
    assert.equal(armado.avisos.length, 0);
});

test("'siempre traducir inglés' traduce solo al cargar, y 'nunca' cierra la barra", async () => {
    const contenido = contenidoFalso("https://www.nasa.gov/");
    const { gestor, ultimo, prefs } = armarGestor(contenido, { siempre: ["en"] });
    await gestor.paginaLista(contenido);
    assert.equal(ultimo().estado, "traducida");
    await gestor.nunca();
    assert.ok(prefs.nunca.has("nasa.gov"));
    assert.equal(ultimo().estado, "oculta");
    assert.match(contenido.dom.window.document.querySelector("p").textContent, /^NASA will/, "vuelve al original");
});

test("cerrar la barra y navegar a otra página la reinicia", async () => {
    const contenido = contenidoFalso("https://www.nasa.gov/");
    const { gestor, ultimo } = armarGestor(contenido);
    await gestor.paginaLista(contenido);
    gestor.cerrar();
    assert.equal(ultimo().estado, "oculta");
    assert.equal(gestor.visible(), false);
    gestor.navego(contenido);
    await gestor.paginaLista(contenido);
    assert.equal(ultimo().estado, "ofrecer");
    gestor.olvidar(contenido.id);
});

test("idiomas sin modelo local solo ofrecen Google, con aviso de privacidad", async () => {
    const contenido = contenidoFalso("https://www.lemonde.fr/", {
        texto: "Le gouvernement a annoncé une nouvelle loi pour les familles et les travailleurs qui sont dans une situation difficile avec la crise des prix dans le pays."
    });
    const { gestor, ultimo } = armarGestor(contenido);
    await gestor.paginaLista(contenido);
    assert.equal(ultimo().idioma, "fr");
    assert.equal(ultimo().local, false);
    await gestor.traducir();
    assert.equal(ultimo().estado, "ofrecer", "no intenta traducir sin modelo");
    assert.equal(gestor.google(), urlGoogle("https://www.lemonde.fr/"));
    assert.match(urlGoogle("https://a.com/?q=1&b=2"), /^https:\/\/translate\.google\.com\/translate\?sl=auto&tl=es&u=https%3A%2F%2Fa\.com%2F%3Fq%3D1%26b%3D2$/);
    assert.equal(sitioDe("https://www.nasa.gov/x"), "nasa.gov");
    assert.equal(sitioDe("about:blank"), "");
});

test("el clic derecho ofrece traducir la página", () => {
    let llamado = false;
    const contenido = { getURL: () => "https://www.nasa.gov/", navigationHistory: { canGoBack: () => false, canGoForward: () => false } };
    const menu = crearPlantillaMenu({ editFlags: {} }, { contenido, clipboard: {}, abrirEnPestana() {}, traducir: () => { llamado = true; } });
    const item = menu.find(i => i.label === "Traducir página al español");
    assert.ok(item);
    item.click();
    assert.equal(llamado, true);
    const interna = { ...contenido, getURL: () => "file:///C:/x/new-tab.html" };
    assert.ok(!crearPlantillaMenu({ editFlags: {} }, { contenido: interna, clipboard: {}, abrirEnPestana() {}, traducir() {} })
        .some(i => i.label === "Traducir página al español"));
});
