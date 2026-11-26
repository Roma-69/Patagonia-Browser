const test = require("node:test");
const assert = require("node:assert/strict");
const {
    requiereCompatibilidad,
    normalizarDominio,
    instalarCompatibilidadGhostery
} = require("../src/main/siteCompatibility");

test("detecta dominios dinámicos con compatibilidad especial", () => {
    assert.equal(normalizarDominio("WWW.ChatGPT.com."), "chatgpt.com");
    assert.equal(requiereCompatibilidad("chatgpt.com"), true);
    assert.equal(requiereCompatibilidad("www.youtube.com"), false, "YouTube recibe los scriptlets (1.4.1)");
    assert.equal(requiereCompatibilidad("example.com"), false);
});

test("desactiva sólo scriptlets y conserva filtros cosméticos", () => {
    const original = function (opciones) {
        return { styles: [".ad{display:none}"], scripts: ["proxyScript"] };
    };
    class FakeBlocker {}
    FakeBlocker.prototype.getCosmeticsFilters = original;

    instalarCompatibilidadGhostery(FakeBlocker);
    const chatgpt = new FakeBlocker().getCosmeticsFilters({ hostname: "chatgpt.com" });
    const normal = new FakeBlocker().getCosmeticsFilters({ hostname: "example.com" });

    assert.deepEqual(chatgpt.styles, [".ad{display:none}"]);
    assert.deepEqual(chatgpt.scripts, []);
    assert.deepEqual(normal.scripts, ["proxyScript"]);
});
