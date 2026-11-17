const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { detectarIdioma, nombreIdioma } = require("../src/main/translator/idioma");
const { crearMenuTraduccion } = require("../src/main/translator/menu");
const FINES = 'Hallitus ilmoitti tänään uusista toimista perheiden ja työntekijöiden tukemiseksi koko maassa. Ministerin mukaan hinnat ovat nousseet nopeasti viime kuukausina, ja monet kotitaloudet ovat vaikeassa tilanteessa. Uudet toimet tulevat voimaan ensi vuoden alussa, ja niiden arvioidaan auttavan satojatuhansia ihmisiä eri puolilla Suomea. Opposition mielestä toimet ovat kuitenkin liian pieniä ja tulevat liian myöhään, koska kriisi on jo kestänyt pitkään.';

test("detecta muchos más idiomas: por alfabeto, por palabras o por lo que declara la página", () => {
    const casos = {
        ru: "Президент России заявил сегодня о новых мерах поддержки для семей и работников по всей стране",
        uk: "Президент України заявив сьогодні про нові заходи підтримки для сімей і працівників по всій країні",
        ja: "日本の政府は今日、新しい経済対策を発表しました。これは家族と労働者を支援するためのものです。",
        zh: "中国政府今天宣布了新的经济措施，以支持全国各地的家庭和工人，这些措施将在明年实施。",
        ko: "한국 정부는 오늘 가족과 근로자를 지원하기 위한 새로운 경제 대책을 발표했습니다",
        ar: "أعلنت الحكومة اليوم عن إجراءات جديدة لدعم الأسر والعمال في جميع أنحاء البلاد",
        el: "Η κυβέρνηση ανακοίνωσε σήμερα νέα μέτρα για τις οικογένειες και τους εργαζόμενους σε όλη τη χώρα",
        nl: "De regering heeft vandaag nieuwe maatregelen aangekondigd voor de gezinnen en de werknemers die in een moeilijke situatie zijn met de prijzen van het leven in het land en dat is niet goed",
        pl: "Rząd ogłosił dzisiaj nowe środki dla rodzin i pracowników, którzy są w trudnej sytuacji, ale to nie jest jeszcze koniec i jak powiedział minister, to tylko początek przez kryzys"
    };
    for (const [idioma, texto] of Object.entries(casos)) assert.equal(detectarIdioma({ texto }), idioma, idioma);
    assert.equal(detectarIdioma({ texto: casos.ru, lang: "bg" }), "bg");
    assert.equal(detectarIdioma({ texto: FINES, lang: "fi-FI" }), "fi");
    assert.equal(nombreIdioma("ja"), "japonés");
});

test("el menú del ícono: traducir, mostrar original, siempre, nunca y Google", () => {
    const hechas = [];
    const acciones = { traducir: () => hechas.push("traducir"), original: () => hechas.push("original"),
        siempre: v => hechas.push(`siempre:${v}`), nunca: () => hechas.push("nunca"), google: () => hechas.push("google") };
    const ofrecer = crearMenuTraduccion({ estado: "ofrecer", nombreIdioma: "inglés", local: true, siempre: false }, acciones);
    ofrecer.find(i => i.label === "Traducir al español (en tu equipo)").click();
    ofrecer.find(i => i.label === "Siempre traducir inglés").click({ checked: true });
    ofrecer.find(i => i.label === "No traducir nunca este sitio").click();
    ofrecer.find(i => /Google/.test(i.label || "")).click();
    assert.deepEqual(hechas, ["traducir", "siempre:true", "nunca", "google"]);
    assert.equal(ofrecer.some(i => i.label === "Mostrar original"), false);
    const traducida = crearMenuTraduccion({ estado: "traducida", nombreIdioma: "inglés", local: true }, acciones);
    traducida.find(i => i.label === "Mostrar original").click();
    assert.equal(hechas.at(-1), "original");
    const error = crearMenuTraduccion({ estado: "error", nombreIdioma: "ruso", local: true, error: "No se pudo." }, acciones);
    assert.equal(error[0].label, "No se pudo.");
    assert.ok(error.some(i => i.label === "Volver a intentar"));
});

test("apps con poco texto en castellano (como Meet) no muestran el traductor aunque digan lang=en", () => {
    assert.equal(detectarIdioma({ texto: "Reunión lista Añadir a alguien Entendido Meet quiere protegerte", lang: "en" }), "");
    const castellanoLargo = "La reunión está lista. Podés compartir este enlace con las personas que quieras que asistan a la reunión de hoy. " +
        "Si se denuncia un abuso durante una llamada, puede que se envíe un fragmento solo de video para que lo verifiquemos con el equipo.";
    assert.equal(detectarIdioma({ texto: castellanoLargo, lang: "en" }), "es");
});

test("ya no hay barra encima de la página: es un ícono en la barra de direcciones", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.doesNotMatch(html, /<section id="barraTraduccion"/);
    assert.match(html, /id="botonTraduccion"/);
    assert.match(fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8"), /ipcInterfaz\.on\("traduccion-menu"/);
});

test("un idioma que Mozilla no tiene avisa claro y ofrece Google", async () => {
    const { crearGestorTraduccion } = require("../src/main/translator/gestor");
    const avisos = [];
    const contenido = { id: 1, isDestroyed: () => false, getURL: () => "https://ejemplo.fi/",
        executeJavaScriptInIsolatedWorld: async () => ({ texto: FINES, lang: "fi" }) };
    const gestor = crearGestorTraduccion({
        motor: { traducir: async () => [] }, pares: () => ["enes"],
        preferencias: { siempreTraducir: () => false, nuncaEn: () => false },
        modelos: { soportado: () => true, preparar: async () => { throw new Error("Idioma no disponible."); } },
        obtenerContenido: () => contenido, notificar: e => avisos.push(e)
    });
    await gestor.paginaLista(contenido);
    await gestor.traducir();
    assert.equal(avisos.at(-1).estado, "error");
    assert.match(avisos.at(-1).error, /finés todavía no se puede traducir.*Google/);
});
