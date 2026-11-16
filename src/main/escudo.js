// Escudo contra estafas en la PC. Las reglas están en src/shared/escudo.js (las
// mismas que el celu). Acá se guarda la lista en el equipo, se actualiza una vez
// por semana y se frenan las páginas peligrosas antes de que carguen.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { crearEscudo, leerLista, FUENTES } = require("../shared/escudo");

const ARCHIVO = "escudo-lista.txt";
const INTERVALO = 7 * 24 * 60 * 60 * 1000;
const MINIMO_DOMINIOS = 500;

// Baja cada lista probando sus copias en orden. Si una lista no baja, se usa
// la anterior: nunca se deja al usuario sin escudo por un problema de red.
async function bajarListas(fetchImpl, { limiteMs = 30000 } = {}) {
    const textos = [];
    for (const copias of FUENTES) {
        let texto = null;
        for (const url of copias) {
            try {
                const respuesta = await fetchImpl(url, { signal: AbortSignal.timeout(limiteMs) });
                if (respuesta.ok === false) continue;
                const cuerpo = await respuesta.text();
                if (/^\s*(?:<!doctype|<html)/i.test(cuerpo) || leerLista(cuerpo).size < 50) continue;
                texto = cuerpo;
                break;
            } catch { /* se prueba la copia siguiente */ }
        }
        if (texto === null) throw new Error("No se pudo bajar una de las listas del escudo.");
        textos.push(texto);
    }
    const dominios = new Set();
    for (const texto of textos) for (const dominio of leerLista(texto)) dominios.add(dominio);
    if (dominios.size < MINIMO_DOMINIOS) throw new Error(`La lista del escudo vino incompleta (${dominios.size}).`);
    return dominios;
}

function crearEscudoPC({ directorioDatos, rutaListaIncluida, fetchImpl = globalThis.fetch, ahora = () => Date.now(), alBloquear }) {
    const archivo = path.join(directorioDatos, ARCHIVO);
    const escudo = crearEscudo("");
    const permitidos = new Map();
    let actualizando = false;

    async function iniciar() {
        const candidatas = [];
        for (const ruta of [archivo, rutaListaIncluida]) {
            try { candidatas.push({ ruta, fecha: (await fs.stat(ruta)).mtimeMs }); } catch { /* no existe */ }
        }
        candidatas.sort((a, b) => b.fecha - a.fecha);
        for (const { ruta } of candidatas) {
            try {
                const dominios = leerLista(await fs.readFile(ruta, "utf8"));
                if (dominios.size) { escudo.cambiarLista(dominios); break; }
            } catch (error) {
                console.error("No se pudo leer la lista del escudo:", error.message);
            }
        }
        return escudo.cantidad();
    }

    async function actualizarSiHaceFalta() {
        if (actualizando || typeof fetchImpl !== "function") return false;
        actualizando = true;
        try {
            try {
                if (ahora() - (await fs.stat(archivo)).mtimeMs < INTERVALO) return false;
            } catch (error) {
                if (error.code !== "ENOENT") return false;
            }
            const dominios = await bajarListas(fetchImpl);
            const temporal = `${archivo}.${randomUUID()}.tmp`;
            try {
                await fs.mkdir(directorioDatos, { recursive: true });
                await fs.writeFile(temporal, `${[...dominios].sort().join("\n")}\n`, "utf8");
                await fs.rename(temporal, archivo);
            } finally {
                await fs.rm(temporal, { force: true }).catch(() => {});
            }
            escudo.cambiarLista(dominios);
            return true;
        } catch (error) {
            console.error("No se pudo actualizar la lista del escudo:", error.message);
            return false;
        } finally {
            actualizando = false;
        }
    }

    // Lo llama el bloqueador para cada página que se abre en una pestaña.
    // true = la página se frenó (y ya se avisó para mostrar la pantalla roja).
    function revisarNavegacion(detalles) {
        if (detalles?.resourceType !== "mainFrame") return false;
        const resultado = escudo.revisar(detalles.url);
        if (!resultado) return false;
        if (permitidos.get(detalles.webContentsId)?.has(resultado.host)) return false;
        alBloquear?.(detalles.webContentsId, detalles.url, resultado);
        return true;
    }

    // "Entrar igual": solo para esa pestaña y hasta que se cierre.
    function permitir(idContenido, direccion) {
        const resultado = escudo.revisar(direccion);
        if (!resultado) return;
        if (!permitidos.has(idContenido)) permitidos.set(idContenido, new Set());
        permitidos.get(idContenido).add(resultado.host);
    }

    return {
        iniciar,
        actualizarSiHaceFalta,
        revisarNavegacion,
        permitir,
        olvidarPestana: idContenido => permitidos.delete(idContenido),
        revisar: direccion => escudo.revisar(direccion),
        cantidad: () => escudo.cantidad()
    };
}

module.exports = { crearEscudoPC, bajarListas, ARCHIVO };
