const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { crearEscudo, leerLista, sitioDe, FUENTES } = require("../src/shared/escudo");
const { crearEscudoPC, bajarListas } = require("../src/main/escudo");

test("frena imitaciones de Mercado Pago, ANSES, el Correo y otras marcas", () => {
    const escudo = crearEscudo("");
    const casos = {
        "https://mercadopago-seguridad.com/login": "Mercado Pago",
        "https://m3rcado-pag0.net/": "Mercado Pago",
        "https://www.mercadopago.com.ar.verificar-cuenta.top/": "Mercado Pago",
        "https://anses-bono-extra.net/": "ANSES",
        "https://correo-argentino.com.ar.paquete-retenido.xyz/": "Correo Argentino",
        "https://chat.whatsapp-grupos.net/": "WhatsApp",
        "http://paypa1-ayuda.com/": "PayPal"
    };
    for (const [url, marca] of Object.entries(casos)) {
        const resultado = escudo.revisar(url);
        assert.equal(resultado?.motivo, "imitacion", url);
        assert.equal(resultado.marca, marca, url);
    }
});

test("deja pasar los sitios oficiales y las páginas comunes", () => {
    const escudo = crearEscudo("");
    for (const url of ["https://www.mercadopago.com.ar/home", "https://articulo.mercadolibre.com.ar/MLA-1",
        "https://www.mercadolivre.com.br/", "https://www.anses.gob.ar/", "https://www.correoargentino.com.ar/",
        "https://web.whatsapp.com/", "https://www.paypal.com/ar", "https://www.netflix.com/ar/", "https://appleid.apple.com/",
        "https://www.google.com/", "https://www.clarin.com/", "https://www.lanacion.com.ar/economia/anses-aumento",
        "https://192.168.0.1/", "http://localhost:3000/", "file:///C:/foto.jpg", "about:blank", "no es una url"]) {
        assert.equal(escudo.revisar(url), null, url);
    }
});

test("la lista frena el dominio y todo lo que cuelga de él", () => {
    const escudo = crearEscudo("# comentario\nestafa-ejemplo.top\n0.0.0.0 virus-ejemplo.xyz\n||otra-estafa.click^\nno valido\n");
    assert.equal(escudo.cantidad(), 3);
    assert.equal(escudo.revisar("https://estafa-ejemplo.top/")?.motivo, "lista");
    assert.equal(escudo.revisar("https://cuenta.estafa-ejemplo.top/x")?.sitio, "estafa-ejemplo.top");
    assert.equal(escudo.revisar("http://virus-ejemplo.xyz/a.exe")?.motivo, "lista");
    assert.equal(escudo.revisar("https://otra-estafa.click/")?.motivo, "lista");
    assert.equal(escudo.revisar("https://ejemplo.top/"), null);
});

test("el sitio real se calcula bien con dominios de país", () => {
    assert.equal(sitioDe("www.anses.gob.ar"), "anses.gob.ar");
    assert.equal(sitioDe("a.b.mercadopago.com.ar"), "mercadopago.com.ar");
    assert.equal(sitioDe("mercadopago.com.ar.estafa.top"), "estafa.top");
    assert.equal(sitioDe("x.ejemplo.co.uk"), "ejemplo.co.uk");
});

function respuesta(texto, ok = true) { return { ok, status: ok ? 200 : 503, text: async () => texto }; }
const listaGrande = n => Array.from({ length: n }, (_, i) => `estafa-${i}.top`).join("\n");

test("bajar las listas prueba las copias en orden y rechaza respuestas rotas", async () => {
    const pedidos = [];
    const dominios = await bajarListas(async url => {
        pedidos.push(url);
        if (url === FUENTES[0][0]) return respuesta("", false);
        if (url === FUENTES[0][1]) return respuesta("<!doctype html><html>portal cautivo</html>");
        if (url === FUENTES[0][2]) return respuesta(listaGrande(600));
        if (url === FUENTES[1][0]) return respuesta("virus-1.xyz\nvirus-2.xyz\n" + listaGrande(60));
        throw new Error("no debería pedirse " + url);
    });
    assert.deepEqual(pedidos, [...FUENTES[0], FUENTES[1][0]]);
    assert.ok(dominios.has("virus-1.xyz") && dominios.has("estafa-599.top"));
    await assert.rejects(bajarListas(async () => respuesta(listaGrande(80))), /incompleta/);
    await assert.rejects(bajarListas(async () => { throw new Error("sin red"); }), /No se pudo bajar/);
});

test("en la PC frena solo la página principal, avisa y respeta 'Entrar igual' por pestaña", async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "patagonia-escudo-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const incluida = path.join(dir, "incluida.txt");
    await fs.writeFile(incluida, "estafa-ejemplo.top\n");
    const avisos = [];
    const escudo = crearEscudoPC({ directorioDatos: dir, rutaListaIncluida: incluida, fetchImpl: null,
        alBloquear: (...datos) => avisos.push(datos) });
    assert.equal(await escudo.iniciar(), 1);
    const url = "https://estafa-ejemplo.top/clave";
    assert.equal(escudo.revisarNavegacion({ resourceType: "subFrame", url, webContentsId: 7 }), false);
    assert.equal(escudo.revisarNavegacion({ resourceType: "mainFrame", url: "https://www.anses.gob.ar/", webContentsId: 7 }), false);
    assert.equal(escudo.revisarNavegacion({ resourceType: "mainFrame", url, webContentsId: 7 }), true);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0][0], 7);
    assert.equal(avisos[0][2].motivo, "lista");
    escudo.permitir(7, url);
    assert.equal(escudo.revisarNavegacion({ resourceType: "mainFrame", url, webContentsId: 7 }), false);
    assert.equal(escudo.revisarNavegacion({ resourceType: "mainFrame", url, webContentsId: 8 }), true);
    escudo.olvidarPestana(7);
    assert.equal(escudo.revisarNavegacion({ resourceType: "mainFrame", url, webContentsId: 7 }), true);
});

test("la PC actualiza la lista una vez por semana y la guarda en el equipo", async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "patagonia-escudo-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    let pedidos = 0;
    const escudo = crearEscudoPC({ directorioDatos: dir, rutaListaIncluida: path.join(dir, "no-existe.txt"),
        fetchImpl: async () => { pedidos++; return respuesta(listaGrande(600)); } });
    await escudo.iniciar();
    assert.equal(escudo.cantidad(), 0);
    assert.equal(await escudo.actualizarSiHaceFalta(), true);
    assert.equal(escudo.cantidad(), 600);
    assert.equal(await escudo.actualizarSiHaceFalta(), false);
    assert.equal(pedidos, FUENTES.length);
    const otra = crearEscudoPC({ directorioDatos: dir, rutaListaIncluida: path.join(dir, "no-existe.txt"), fetchImpl: null });
    assert.equal(await otra.iniciar(), 600);
});

test("el celu usa exactamente las mismas reglas y lista que la PC", async () => {
    const carpeta = path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "assets", "patagonia_escudo");
    assert.equal(await fs.readFile(path.join(carpeta, "escudo-reglas.js"), "utf8"),
        await fs.readFile(path.join(__dirname, "..", "src", "shared", "escudo.js"), "utf8"),
        "copiar src/shared/escudo.js a la extensión del celu");
    const manifiesto = JSON.parse(await fs.readFile(path.join(carpeta, "manifest.json"), "utf8"));
    assert.equal(manifiesto.browser_specific_settings.gecko.id, "escudo@patagoniabrowser.com");
    assert.deepEqual(manifiesto.background.scripts, ["escudo-reglas.js", "escudo.js"]);
    const pc = leerLista(await fs.readFile(path.join(__dirname, "..", "assets", "escudo-lista.txt"), "utf8"));
    const celu = leerLista(await fs.readFile(path.join(carpeta, "escudo-lista.txt"), "utf8"));
    assert.ok(pc.size >= 500, `la lista incluida tiene ${pc.size} dominios`);
    assert.deepEqual([...celu].sort(), [...pc].sort());
    const motor = await fs.readFile(path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "kotlin",
        "com", "patagoniabrowser", "patagonia_browser", "gecko", "GeckoEngine.kt"), "utf8");
    assert.match(motor, /ensureBuiltIn\(ESCUDO_PATH, ESCUDO_ID\)/);
});

test("la pantalla roja no se borra cuando la carga frenada termina, y sí al ir a otra página", () => {
    const { EventEmitter } = require("node:events");
    const { registrarErroresCarga } = require("../src/main/loadErrors");
    const contenido = Object.assign(new EventEmitter(), { isDestroyed: () => false, getURL: () => "https://anterior.example/" });
    const vista = { webContents: contenido, visible: true, setVisible(v) { this.visible = v; } };
    const pestana = { vista, url: "" };
    registrarErroresCarga(pestana, () => {});
    contenido.emit("did-start-navigation", {}, "https://estafa.top/", false, true);
    pestana.peligro = { url: "https://estafa.top/", motivo: "lista" };
    vista.setVisible(false);
    contenido.emit("did-fail-load", {}, -20, "ERR_BLOCKED_BY_CLIENT", "https://estafa.top/", true);
    assert.equal(pestana.errorCarga ?? null, null);
    assert.equal(pestana.url, "https://estafa.top/");
    assert.ok(pestana.peligro);
    contenido.emit("did-start-navigation", {}, "https://www.google.com/", false, true);
    assert.equal(pestana.peligro, null);
    assert.equal(vista.visible, true);
});
