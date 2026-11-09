const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Audio Patagonia: ecualizador de 10 bandas, refuerzo de volumen y normalización.
// No sube la calidad del archivo que manda la página: ajusta cómo suena.
const FRECUENCIAS = Object.freeze([32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
const LIMITE_BANDA = 12; // dB
const VOLUMEN_MINIMO = 100;
const VOLUMEN_MAXIMO = 200;

const PRESETS = Object.freeze({
    plano: { nombre: "Plano", bandas: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    electronica: { nombre: "Electrónica", bandas: [6, 5, 3, 0, -1, 0, 1, 2, 3, 3] },
    bajo: { nombre: "Más bajo", bandas: [7, 6, 4, 1, 0, 0, 0, 0, 0, 0] },
    voces: { nombre: "Voces", bandas: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
    rock: { nombre: "Rock", bandas: [4, 3, 1, -1, -1, 0, 2, 3, 4, 4] }
});

const POR_DEFECTO = Object.freeze({ activo: false, preset: "plano", bandas: PRESETS.plano.bandas, volumen: 100, normalizar: false });

const numero = (valor, minimo, maximo, paso) => {
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    return Math.min(maximo, Math.max(minimo, Math.round(n / paso) * paso));
};

function normalizarAjustes(valor) {
    const v = valor && typeof valor === "object" ? valor : {};
    const bandas = FRECUENCIAS.map((_, i) => {
        const banda = Array.isArray(v.bandas) ? numero(v.bandas[i], -LIMITE_BANDA, LIMITE_BANDA, 0.5) : null;
        return banda === null ? 0 : banda;
    });
    const preset = typeof v.preset === "string" && (Object.hasOwn(PRESETS, v.preset) || v.preset === "personalizado")
        ? v.preset
        : POR_DEFECTO.preset;
    return {
        activo: v.activo === true,
        preset,
        bandas,
        volumen: numero(v.volumen, VOLUMEN_MINIMO, VOLUMEN_MAXIMO, 5) ?? POR_DEFECTO.volumen,
        normalizar: v.normalizar === true
    };
}

// Se guarda en este equipo (audio.json). Los cambios de los controles llegan seguidos,
// así que se escribe al disco medio segundo después del último.
function crearAjustesAudio(destino, { demora = 500 } = {}) {
    const archivo = () => (typeof destino === "function" ? destino() : destino);
    let datos = normalizarAjustes(POR_DEFECTO);
    let cola = Promise.resolve();
    let temporizador = null;

    async function iniciar() {
        try { datos = normalizarAjustes(JSON.parse(await fs.readFile(archivo(), "utf8"))); } catch { /* valores por defecto */ }
        return estado();
    }
    const estado = () => ({ ...datos, bandas: [...datos.bandas] });

    function escribir() {
        temporizador = null;
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

    function cambiar(nuevos) {
        datos = normalizarAjustes({ ...datos, ...(nuevos && typeof nuevos === "object" ? nuevos : {}) });
        if (temporizador) clearTimeout(temporizador);
        temporizador = setTimeout(escribir, demora);
        temporizador.unref?.();
        return estado();
    }

    // Escribe ya lo pendiente (al cerrar el navegador).
    function esperar() {
        if (temporizador) { clearTimeout(temporizador); escribir(); }
        return cola;
    }

    return { iniciar, estado, cambiar, esperar };
}

function listaPresets() {
    return Object.entries(PRESETS).map(([id, { nombre, bandas }]) => ({ id, nombre, bandas: [...bandas] }));
}

module.exports = { FRECUENCIAS, PRESETS, LIMITE_BANDA, VOLUMEN_MINIMO, VOLUMEN_MAXIMO, normalizarAjustes, crearAjustesAudio, listaPresets };
