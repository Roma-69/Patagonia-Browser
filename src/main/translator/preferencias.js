const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// "Siempre traducir <idioma>" y "Nunca traducir <sitio>". Se guarda en este equipo.
// `destino` es la ruta del archivo o una función que la devuelve (se resuelve al usarla).
function crearPreferencias(destino) {
    const archivo = () => (typeof destino === "function" ? destino() : destino);
    let datos = { siempre: [], nunca: [] };
    let cola = Promise.resolve();
    const limpiar = valor => ({
        siempre: [...new Set((valor?.siempre || []).filter(x => typeof x === "string" && /^[a-z]{2,3}$/.test(x)))].slice(0, 50),
        nunca: [...new Set((valor?.nunca || []).filter(x => typeof x === "string" && x.length <= 253))].slice(0, 2000)
    });
    async function iniciar() {
        try { datos = limpiar(JSON.parse(await fs.readFile(archivo(), "utf8"))); } catch { /* valores por defecto */ }
        return estado();
    }
    const estado = () => ({ siempre: [...datos.siempre], nunca: [...datos.nunca] });
    function guardar() {
        const copia = JSON.stringify(datos, null, 2);
        cola = cola.then(async () => {
            const ruta = archivo();
            const temporal = `${ruta}.${randomUUID()}.tmp`;
            try {
                await fs.mkdir(path.dirname(ruta), { recursive: true });
                await fs.writeFile(temporal, copia, "utf8");
                await fs.rename(temporal, ruta);
            } catch { /* no es crítico */ } finally { await fs.rm(temporal, { force: true }).catch(() => {}); }
        });
        return cola;
    }
    function cambiar(lista, valor, activo) {
        const actual = new Set(datos[lista]);
        if (activo) actual.add(valor); else actual.delete(valor);
        datos = limpiar({ ...datos, [lista]: [...actual] });
        return guardar();
    }
    return {
        iniciar,
        estado,
        siempreTraducir: idioma => datos.siempre.includes(idioma),
        nuncaEn: sitio => datos.nunca.includes(sitio),
        ponerSiempre: (idioma, activo = true) => cambiar("siempre", idioma, activo),
        ponerNunca: (sitio, activo = true) => cambiar("nunca", sitio, activo),
        esperar: () => cola
    };
}

module.exports = { crearPreferencias };
