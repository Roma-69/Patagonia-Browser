// Baja las listas públicas de páginas peligrosas para el escudo contra estafas y
// las guarda para la PC (assets/) y el celu (extensión patagonia_escudo). La app
// después las actualiza sola una vez por semana; esto es la copia que viene
// incluida para que el escudo funcione desde el primer uso.
//
// Uso: node scripts/actualizar-listas-escudo.cjs   (lo corre GitHub: escudo-listas.yml)
const fs = require("node:fs/promises");
const path = require("node:path");
const { bajarListas } = require("../src/main/escudo");

const DESTINOS = [
    path.join(__dirname, "..", "assets", "escudo-lista.txt"),
    path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "assets", "patagonia_escudo", "escudo-lista.txt")
];

async function guardar(dominios, { destinos = DESTINOS, fecha = new Date() } = {}) {
    const texto = [
        `# Escudo contra estafas de Patagonia. Generado el ${fecha.toISOString().slice(0, 10)} por scripts/actualizar-listas-escudo.cjs.`,
        "# Fuentes: phishing-filter y urlhaus-filter de malware-filter (https://gitlab.com/malware-filter),",
        "# que reúnen OpenPhish, PhishTank, PhishStats y URLhaus (abuse.ch). Ver THIRD_PARTY_NOTICES.md.",
        ...[...dominios].sort(),
        ""
    ].join("\n");
    for (const destino of destinos) {
        await fs.mkdir(path.dirname(destino), { recursive: true });
        await fs.writeFile(destino, texto, "utf8");
    }
    return texto;
}

if (require.main === module) {
    bajarListas(globalThis.fetch)
        .then(dominios => guardar(dominios).then(() => console.log(`Escudo: ${dominios.size} dominios peligrosos guardados.`)))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { guardar, DESTINOS };
