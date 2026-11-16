// Detección de idioma liviana. No sale nada del equipo.
// 1) Por el alfabeto (ruso, griego, árabe, chino, japonés, coreano...).
// 2) Por palabras frecuentes (idiomas con letras como las nuestras).
// 3) Por lo que declara la página (lang="..."), si lo demás no alcanza.
const PALABRAS = {
    en: "the and of to in is that for it with as was on are be this by from at or have an not they which you were but his we has their been more will can would there what all about if when your our also who into",
    es: "el la de que y en los del se las por un una para con no es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también fue hay donde desde todo nos durante",
    pt: "o a de que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está também só pelo pela até isso",
    fr: "le la de et les des en un une du est que pour dans qui sur pas au avec il ce par plus sont ne se nous vous elle ou mais leur été cette aux tout ses son comme",
    de: "der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über",
    it: "il di che e la per un in è non una con del da sono le si dei gli alla più nel al anche come ma questo della lo ha delle nella se ci tra stato essere molto",
    nl: "de het een en van in is op te dat die voor met zijn niet aan er ook als bij door om maar was naar hij worden of dan wordt uit kan nog over deze heeft zij werd al",
    pl: "i w na z do nie się że to jest o jak po co ale od za przez dla jego są tak może jej oraz tym który już być ich tylko przy gdy też była został",
    sv: "och i att det som en på är av för med till den har de inte om ett han men var jag sig från vi så kan man när år säger hon under också efter",
    ro: "și în de la a cu pe din care că este un o pentru nu mai se au fost ca sau dar sunt prin acest după fi lui această către despre",
    tr: "ve bir bu da de için ile olarak çok daha ne gibi kadar olan en ama ya sonra her şey o değil var mı olduğu ise ancak tarafından"
};
const LISTAS = Object.fromEntries(Object.entries(PALABRAS).map(([k, v]) => [k, new Set(v.split(" "))]));

const NOMBRES = {
    en: "inglés", es: "español", pt: "portugués", fr: "francés", de: "alemán", it: "italiano", nl: "neerlandés",
    pl: "polaco", sv: "sueco", ro: "rumano", tr: "turco", ru: "ruso", uk: "ucraniano", bg: "búlgaro", el: "griego",
    ar: "árabe", fa: "persa", zh: "chino", ja: "japonés", ko: "coreano", cs: "checo", ca: "catalán", da: "danés",
    fi: "finés", hu: "húngaro", id: "indonesio", sk: "eslovaco", sl: "esloveno", et: "estonio", lt: "lituano",
    lv: "letón", vi: "vietnamita"
};

// Alfabetos que alcanzan para saber el idioma (o casi).
const ALFABETOS = [
    ["ko", /[\uac00-\ud7af\u1100-\u11ff]/gu],
    ["ja", /[\u3040-\u30ff]/gu],
    ["zh", /[\u4e00-\u9fff]/gu],
    ["ar", /[\u0600-\u06ff]/gu],
    ["el", /[\u0370-\u03ff]/gu],
    ["ru", /[\u0400-\u04ff]/gu]
];

function detectarPorAlfabeto(texto, lang = "") {
    const muestra = String(texto || "").slice(0, 4000);
    const letras = (muestra.match(/\p{L}/gu) || []).length;
    if (letras < 20) return "";
    for (const [idioma, patron] of ALFABETOS) {
        const cantidad = (muestra.match(patron) || []).length;
        // El japonés mezcla kanji (chinos) con kana: alcanza con algo de kana.
        const minimo = idioma === "ja" ? 0.05 : 0.3;
        if (cantidad / letras < minimo) continue;
        const declarado = idiomaDeAtributo(lang);
        if (idioma === "ru") {
            if (declarado === "uk" || /[іїєґ]/i.test(muestra)) return "uk";
            if (declarado === "bg") return "bg";
            return "ru";
        }
        if (idioma === "ar" && declarado === "fa") return "fa";
        return idioma;
    }
    return "";
}

function detectarPorTexto(texto) {
    const palabras = String(texto || "").toLowerCase().match(/\p{L}+/gu) || [];
    if (palabras.length < 12) return "";
    const puntos = Object.fromEntries(Object.keys(LISTAS).map(k => [k, 0]));
    for (const palabra of palabras.slice(0, 1500)) {
        for (const [idioma, lista] of Object.entries(LISTAS)) if (lista.has(palabra)) puntos[idioma]++;
    }
    const orden = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
    const [primero, segundo] = orden;
    if (primero[1] < 6 || primero[1] < segundo[1] * 1.4) return "";
    return primero[0];
}

function idiomaDeAtributo(lang) {
    const base = String(lang || "").trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(base) ? base : "";
}

// El texto manda: muchos sitios declaran lang="en" aunque estén en español.
// Lo que declara la página solo se usa si hay texto de verdad para traducir y no
// parece castellano (las apps como Meet tienen poco texto y a veces dicen "en").
function detectarIdioma({ texto, lang } = {}) {
    const porTexto = detectarPorAlfabeto(texto, lang) || detectarPorTexto(texto);
    if (porTexto) return porTexto;
    const palabras = String(texto || "").toLowerCase().match(/\p{L}+/gu) || [];
    if (palabras.length < 40) return "";
    const castellano = palabras.filter(p => LISTAS.es.has(p)).length;
    if (castellano >= 5 && castellano / palabras.length > 0.08) return "";
    return idiomaDeAtributo(lang);
}

function nombreIdioma(codigo) {
    return NOMBRES[codigo] || codigo;
}

module.exports = { detectarIdioma, detectarPorTexto, detectarPorAlfabeto, idiomaDeAtributo, nombreIdioma, NOMBRES };
