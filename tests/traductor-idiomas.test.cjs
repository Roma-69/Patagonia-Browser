const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { crearModelos, elegirArchivos, ADJUNTOS } = require("../src/main/translator/modelos");
const { crearPlantillaMenu } = require("../src/main/contextMenu");

const sha = d => crypto.createHash("sha256").update(d).digest("hex");

// Servidor falso con los mismos campos que el servicio de modelos de Firefox.
function servidor(pares, { corromper = false } = {}) {
    const archivos = new Map();
    const registros = [];
    for (const par of pares) {
        for (const [tipo, nombre] of [["model", `model.${par}.intgemm.alphas.bin`], ["lex", `lex.50.50.${par}.s2t.bin`], ["vocab", `vocab.${par}.spm`]]) {
            const plano = Buffer.from(`${tipo}-${par}`);
            const comprimido = zlib.zstdCompressSync(plano);
            const ubicacion = `main-workspace/translations-models-v2/${nombre}.zst`;
            archivos.set(ADJUNTOS + ubicacion, corromper ? Buffer.from("roto") : comprimido);
            registros.push({ name: nombre, fileType: tipo, version: "3.0", architecture: "base-memory", filter_expression: "",
                sourceLanguage: par.slice(0, 2), targetLanguage: par.slice(2), decompressedHash: sha(plano),
                attachment: { hash: sha(comprimido), size: comprimido.length, filename: `${nombre}.zst`, location: ubicacion } });
        }
    }
    const pedidos = [];
    const pedir = async url => {
        pedidos.push(url);
        const u = new URL(url);
        if (u.hostname === "firefox.settings.services.mozilla.com") {
            const origen = u.searchParams.get("sourceLanguage"), destino = u.searchParams.get("targetLanguage");
            const data = registros.filter(r => r.sourceLanguage === origen && r.targetLanguage === destino);
            return { ok: true, json: async () => ({ data }) };
        }
        const datos = archivos.get(url);
        return datos ? { ok: true, arrayBuffer: async () => datos } : { ok: false, status: 404 };
    };
    return { pedir, pedidos };
}

function carpetas() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "patagonia-modelos-"));
    const incluida = path.join(base, "incluida");
    fs.mkdirSync(path.join(incluida, "enes"), { recursive: true });
    for (const n of ["model.enes.bin", "lex.enes.bin", "vocab.enes.spm"]) fs.writeFileSync(path.join(incluida, "enes", n), "x");
    return { incluida, descargas: path.join(base, "descargas") };
}

test("portugués se baja una vez, verificado, y se traduce pasando por el inglés", async () => {
    const { incluida, descargas } = carpetas();
    const red = servidor(["pten"]);
    const modelos = crearModelos({ carpetaIncluida: incluida, carpetaDescargas: descargas, pedir: red.pedir });
    assert.equal(modelos.soportado("pt"), true);
    assert.equal(modelos.soportado("ru"), false);
    const progreso = [];
    assert.deepEqual(await modelos.preparar("pt", "es", p => progreso.push(p)), ["pten", "enes"]);
    assert.ok(progreso.length >= 1 && progreso.at(-1).hechos === progreso.at(-1).total);
    assert.equal(fs.readFileSync(path.join(descargas, "pten", "vocab.pten.spm"), "utf8"), "vocab-pten");
    const leido = modelos.leer("pten");
    assert.equal(Buffer.from(leido.model).toString(), "model-pten");
    const antes = red.pedidos.length;
    assert.deepEqual(await modelos.preparar("pt", "es"), ["pten", "enes"]);
    assert.equal(red.pedidos.length, antes + 1, "la segunda vez solo pregunta por el par directo, no baja nada");
});

test("si Mozilla tiene el par directo, no pasa por el inglés", async () => {
    const { incluida, descargas } = carpetas();
    const modelos = crearModelos({ carpetaIncluida: incluida, carpetaDescargas: descargas, pedir: servidor(["fres"]).pedir });
    assert.deepEqual(await modelos.preparar("fr", "es"), ["fres"]);
});

test("un archivo alterado no se guarda", async () => {
    const { incluida, descargas } = carpetas();
    const modelos = crearModelos({ carpetaIncluida: incluida, carpetaDescargas: descargas, pedir: servidor(["deen"], { corromper: true }).pedir });
    await assert.rejects(modelos.preparar("de", "es"), /verificación/);
    assert.equal(fs.existsSync(path.join(descargas, "deen")), false);
});

test("elige el juego estable más nuevo y descarta los de prueba", () => {
    const r = (fileType, version, extra = {}) => ({ name: `${fileType}.x`, fileType, version, architecture: "base-memory", filter_expression: "",
        attachment: { hash: "a".repeat(64), location: `l/${fileType}${version}` }, ...extra });
    const elegidos = elegirArchivos([
        r("model", "2.0"), r("lex", "2.0"), r("vocab", "2.0"),
        r("model", "3.0"), r("lex", "3.0"), r("vocab", "3.0"),
        r("model", "4.0a1"), r("lex", "4.0a1"), r("vocab", "4.0a1"),
        r("model", "5.0", { filter_expression: "env.channel == 'nightly'" })
    ]);
    assert.deepEqual(elegidos.map(x => x.version), ["3.0", "3.0", "3.0"]);
    assert.equal(elegirArchivos([r("model", "1.0")]), null);
});

test("clic derecho: 'Mostrar original' cuando la página ya está traducida", () => {
    const contenido = { getURL: () => "https://example.com", navigationHistory: { canGoBack: () => false, canGoForward: () => false } };
    const etiquetas = traducida => crearPlantillaMenu({ selectionText: "", linkURL: "", mediaType: "none", isEditable: false },
        { contenido, clipboard: {}, abrirEnPestana() {}, traducir() {}, traducida: () => traducida, original() {} }).map(i => i.label);
    assert.ok(etiquetas(true).includes("Mostrar original"));
    assert.ok(!etiquetas(true).includes("Traducir página al español"));
    assert.ok(etiquetas(false).includes("Traducir página al español"));
});

test("favoritos: el archivo de la PC se lee igual en el otro lado y no duplica", async () => {
    const { exportarFavoritos, leerFavoritos } = require("../src/shared/favoritosArchivo");
    const html = exportarFavoritos([
        { titulo: "Windguru <Sarmiento> & \"más\"", url: "https://www.windguru.cz/123" },
        { titulo: "malo", url: "javascript:alert(1)" },
        { titulo: "Ruta", url: "file:///C:/x" }
    ]);
    assert.match(html, /NETSCAPE-Bookmark-file-1/);
    assert.deepEqual(leerFavoritos(html), [{ titulo: "Windguru <Sarmiento> & \"más\"", url: "https://www.windguru.cz/123" }]);
    // Formato de Chrome/Firefox, con carpetas y atributos extra.
    const otro = `<DL><DT><H3>Barra</H3><DL><DT><A HREF="https://duckduckgo.com/" ADD_DATE="1">Duck&amp;Go</A>
        <DT><A HREF='https://duckduckgo.com/'>repetido</A><DT><A HREF="https://user:pw@x.com/">no</A></DL></DL>`;
    assert.deepEqual(leerFavoritos(otro), [{ titulo: "Duck&Go", url: "https://duckduckgo.com/" }]);

    const fsp = require("node:fs/promises");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "patagonia-fav-"));
    const { crearAlmacenFavoritos } = require("../src/main/bookmarks");
    const almacen = crearAlmacenFavoritos(path.join(dir, "favoritos.json"));
    const primera = await almacen.importar(leerFavoritos(html + otro));
    assert.equal(primera.agregados, 2);
    const segunda = await almacen.importar(leerFavoritos(html));
    assert.equal(segunda.agregados, 0);
    assert.equal((await almacen.listar()).length, 2);
    await fsp.rm(dir, { recursive: true, force: true });
});
