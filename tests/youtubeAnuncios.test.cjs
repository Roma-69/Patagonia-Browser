const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { CODIGO, esYouTube, protegerYouTube } = require("../src/main/youtubeAnuncios");

function pagina() {
    const dom = new JSDOM('<div class="html5-video-player"><video></video></div>', { url: "https://www.youtube.com/watch?v=1", runScripts: "outside-only" });
    const w = dom.window;
    const vueltas = [];
    w.setInterval = fn => { vueltas.push(fn); return 1; };
    const video = w.document.querySelector("video");
    let duracion = NaN;
    Object.defineProperty(video, "duration", { get: () => duracion });
    video.currentTime = 0;
    w.eval(CODIGO);
    return { w, video, reproductor: w.document.querySelector(".html5-video-player"), vuelta: () => vueltas.forEach(fn => fn()), duracion: v => { duracion = v; } };
}

test("si se cuela un anuncio en YouTube: lo silencia, toca Saltar y lo adelanta al final", () => {
    const p = pagina();
    p.vuelta();
    assert.equal(p.video.muted, false, "sin anuncio no toca nada");
    assert.equal(p.video.currentTime, 0);
    p.reproductor.classList.add("ad-showing");
    p.duracion(15);
    let saltos = 0;
    const boton = p.w.document.createElement("button");
    boton.className = "ytp-skip-ad-button";
    boton.addEventListener("click", () => saltos++);
    p.reproductor.appendChild(boton);
    p.vuelta();
    assert.equal(p.video.muted, true);
    assert.equal(p.video.currentTime, 15);
    assert.equal(saltos, 1);
    p.reproductor.classList.remove("ad-showing");
    p.vuelta();
    assert.equal(p.video.muted, false, "vuelve el sonido para la música");
});

test("si la persona ya tenía el video en silencio, no se lo cambia", () => {
    const p = pagina();
    p.video.muted = true;
    p.reproductor.classList.add("ad-showing");
    p.duracion(10);
    p.vuelta();
    p.reproductor.classList.remove("ad-showing");
    p.vuelta();
    assert.equal(p.video.muted, true);
});

test("solo actúa en YouTube, en un mundo aislado, y respeta la protección apagada", () => {
    assert.equal(esYouTube("https://www.youtube.com/watch?v=1"), true);
    assert.equal(esYouTube("https://music.youtube.com/"), true);
    assert.equal(esYouTube("https://youtube.com.estafa.top/"), false);
    assert.equal(esYouTube("http://www.youtube.com/"), false);
    const llamadas = [];
    const contenido = url => ({ isDestroyed: () => false, getURL: () => url,
        executeJavaScriptInIsolatedWorld: (mundo, codigo) => { llamadas.push([mundo, codigo[0].code]); return Promise.resolve(); } });
    assert.equal(protegerYouTube(contenido("https://www.clarin.com/")), false);
    assert.equal(protegerYouTube(contenido("https://www.youtube.com/"), { activa: false }), false);
    assert.equal(protegerYouTube(contenido("https://www.youtube.com/")), true);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0][0], 1988);
    assert.match(fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8"), /youtubeAnuncios"\)\.protegerYouTube/);
});

test("celu: las reglas de cookies no se aplican en YouTube", () => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "assets", "patagonia_cuida", "manifest.json"), "utf8"));
    assert.ok(m.content_scripts[0].exclude_matches.includes("*://*.youtube.com/*"));
});
