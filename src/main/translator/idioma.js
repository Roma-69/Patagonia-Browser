// Detección de idioma liviana por palabras frecuentes. No sale nada del equipo.
const PALABRAS = {
    en: "the and of to in is that for it with as was on are be this by from at or have an not they which you were but his we has their been more will can would there what all about if when your our also who into",
    es: "el la de que y en los del se las por un una para con no es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también fue hay donde desde todo nos durante",
    pt: "o a de que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está também só pelo pela até isso",
    fr: "le la de et les des en un une du est que pour dans qui sur pas au avec il ce par plus sont ne se nous vous elle ou mais leur été cette aux tout ses son comme",
    de: "der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über",
    it: "il di che e la per un in è non una con del da sono le si dei gli alla più nel al anche come ma questo della lo ha delle nella se ci tra stato essere molto"
};
const LISTAS = Object.fromEntries(Object.entries(PALABRAS).map(([k, v]) => [k, new Set(v.split(" "))]));

const NOMBRES = { en: "inglés", es: "español", pt: "portugués", fr: "francés", de: "alemán", it: "italiano" };

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
function detectarIdioma({ texto, lang } = {}) {
    return detectarPorTexto(texto) || idiomaDeAtributo(lang);
}

function nombreIdioma(codigo) {
    return NOMBRES[codigo] || codigo;
}

module.exports = { detectarIdioma, detectarPorTexto, idiomaDeAtributo, nombreIdioma };
