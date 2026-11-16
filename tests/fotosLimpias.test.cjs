const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { limpiarFoto, tipoDeImagen } = require("../src/main/fotosLimpias");
const { limpiarFotoDescargada } = require("../src/main/downloads");

const foto = nombre => fs.readFileSync(path.join(__dirname, "fixtures", nombre));
const texto = bytes => Buffer.from(bytes).toString("latin1");
const DATOS_ESCONDIDOS = /FBMD|Motorola|moto edge|secreto|MOTIONVIDEO|ubicacion|xmpmeta|GPS/;

test("JPEG: borra EXIF (GPS, celular), XMP, IPTC con la marca FBMD, comentarios y lo que sobra al final", () => {
    const original = foto("foto-con-datos.jpg");
    assert.match(texto(original), DATOS_ESCONDIDOS);
    const limpia = limpiarFoto(original);
    assert.ok(limpia);
    assert.doesNotMatch(texto(limpia), DATOS_ESCONDIDOS);
    assert.equal(tipoDeImagen(limpia), "jpeg");
    assert.deepEqual([...limpia.subarray(-2)], [0xFF, 0xD9]);
});

test("JPEG: conserva la orientación (para que no quede girada) y el perfil de color", () => {
    const limpia = texto(limpiarFoto(foto("foto-con-datos.jpg")));
    assert.ok(limpia.includes("Exif\0\0MM\0*"));
    assert.ok(limpia.includes("\x01\x12\x00\x03\x00\x00\x00\x01\x00\x06"));
    assert.ok(limpia.includes("ICC_PROFILE\0"));
    assert.ok(limpia.includes("JFIF\0"));
});

test("PNG y WebP: borra textos, EXIF y XMP", () => {
    for (const nombre of ["foto-con-datos.png", "foto-con-datos.webp"]) {
        const original = foto(nombre);
        assert.match(texto(original), DATOS_ESCONDIDOS, nombre);
        const limpia = limpiarFoto(original);
        assert.ok(limpia, nombre);
        assert.doesNotMatch(texto(limpia), DATOS_ESCONDIDOS, nombre);
        assert.equal(tipoDeImagen(limpia), tipoDeImagen(original), nombre);
    }
    const webp = limpiarFoto(foto("foto-con-datos.webp"));
    assert.equal(Buffer.from(webp).readUInt32LE(4), webp.length - 8);
    assert.equal(webp[20] & 0x0C, 0);
});

test("una foto ya limpia, un archivo que no es foto o uno roto quedan como están", () => {
    const limpia = limpiarFoto(foto("foto-con-datos.jpg"));
    assert.equal(limpiarFoto(limpia), null);
    assert.equal(limpiarFoto(Buffer.from("no soy una foto, soy un texto cualquiera")), null);
    assert.equal(limpiarFoto(foto("foto-con-datos.jpg").subarray(0, 60)), null);
    assert.equal(limpiarFoto(new Uint8Array(0)), null);
});

test("las fotos descargadas se limpian en el lugar; los otros archivos no se tocan", async t => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "patagonia-fotos-"));
    t.after(() => fsp.rm(dir, { recursive: true, force: true }));
    const ruta = path.join(dir, "de-facebook.jpg");
    await fsp.writeFile(ruta, foto("foto-con-datos.jpg"));
    assert.equal(await limpiarFotoDescargada(ruta), true);
    assert.doesNotMatch(texto(await fsp.readFile(ruta)), DATOS_ESCONDIDOS);
    assert.deepEqual(await fsp.readdir(dir), ["de-facebook.jpg"]);
    const otro = path.join(dir, "documento.pdf");
    await fsp.writeFile(otro, foto("foto-con-datos.jpg"));
    assert.equal(await limpiarFotoDescargada(otro), false);
    assert.match(texto(await fsp.readFile(otro)), DATOS_ESCONDIDOS);
});

test("las páginas reciben el limpiador como preload de la sesión", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert.match(main, /id: "patagonia-fotos-limpias"[\s\S]{0,80}src", "main", "fotosLimpias\.js"/);
    const codigo = fs.readFileSync(path.join(__dirname, "..", "src", "main", "fotosLimpias.js"), "utf8");
    assert.doesNotMatch(codigo, /\brequire\(/, "el preload corre en sandbox: no puede usar require");
});

test("el celu limpia igual que la PC: mismas reglas en Kotlin, al subir y al bajar fotos", () => {
    const base = path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "kotlin", "com", "patagoniabrowser", "patagonia_browser");
    const kotlin = fs.readFileSync(path.join(base, "FotosLimpias.kt"), "utf8");
    const js = fs.readFileSync(path.join(__dirname, "..", "src", "main", "fotosLimpias.js"), "utf8");
    assert.match(kotlin, /LIMITE_BYTES = 60 \* 1024 \* 1024/);
    assert.match(js, /LIMITE_BYTES = 60 \* 1024 \* 1024/);
    assert.match(kotlin, /setOf\("tEXt", "zTXt", "iTXt", "eXIf", "tIME"\)/);
    assert.match(js, /\["tEXt", "zTXt", "iTXt", "eXIf", "tIME"\]/);
    assert.match(fs.readFileSync(path.join(base, "gecko", "GeckoPrompts.kt"), "utf8"), /fotoLimpia\(activity, it\)/);
    assert.match(fs.readFileSync(path.join(base, "gecko", "GeckoDownloads.kt"), "utf8"), /FotosLimpias\.limpiar\(bytes\)/);
});
