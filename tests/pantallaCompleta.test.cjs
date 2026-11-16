const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("pantalla completa de videos: la ventana pasa a pantalla completa y la pestaña tapa todo", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert.match(main, /on\("enter-html-full-screen"/);
    assert.match(main, /on\("leave-html-full-screen"/);
    assert.match(main, /ventanaPrincipal\.setFullScreen\(true\)/);
    assert.match(main, /if \(pestanaActiva\.pantallaCompleta\) \{\s*pestanaActiva\.vista\.setBounds\(\{ x: 0, y: 0, width: ancho, height: alto \}\)/);
    assert.match(main, /ventanaPrincipal\.on\("leave-full-screen"/);
});
