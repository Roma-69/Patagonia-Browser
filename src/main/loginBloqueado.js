// Cuando Google no deja iniciar sesión desde Patagonia ("No puedes acceder"),
// Patagonia lo dice claro y ofrece abrir esa página en otro navegador del equipo
// (Brave, Chrome, Firefox o Edge), en vez de dejar a la persona sin saber qué pasó.
//
// Por qué pasa: Google bloquea el inicio de sesión en navegadores hechos con
// Electron. Es una decisión de Google, no una falla de la cuenta ni de Patagonia.
const path = require("node:path");

const TITULOS_RECHAZO = [
    "no puedes acceder",
    "no se ha podido iniciar sesión",
    "no se pudo iniciar sesión",
    "couldn't sign you in",
    "couldn’t sign you in"
];

function esPaginaRechazo(url, titulo = "") {
    let direccion;
    try { direccion = new URL(url); } catch { return false; }
    if (direccion.protocol !== "https:" || direccion.hostname.toLowerCase() !== "accounts.google.com") return false;
    if (/\/signin\/rejected\b/.test(direccion.pathname)) return true;
    const limpio = String(titulo || "").trim().toLowerCase();
    return TITULOS_RECHAZO.some(texto => limpio === texto || limpio.startsWith(`${texto} `));
}

// A dónde ir en el otro navegador: lo que la persona quería abrir (Gmail, YouTube…)
// si viene en la dirección, y si no, el inicio de sesión de Google.
function destinoEnOtroNavegador(url) {
    try {
        const continuar = new URL(url).searchParams.get("continue");
        if (continuar) {
            const destino = new URL(continuar);
            if (destino.protocol === "https:" && /(^|\.)(google|youtube)\.com$/i.test(destino.hostname)) return destino.toString();
        }
    } catch { /* dirección rara */ }
    return "https://accounts.google.com/";
}

// Navegadores conocidos en Windows, en orden de preferencia.
function candidatosWindows(entorno = process.env) {
    const local = entorno.LOCALAPPDATA || "";
    const programas = entorno.ProgramFiles || "C:\\Program Files";
    const programas86 = entorno["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const unir = (...partes) => path.win32.join(...partes);
    return [
        { nombre: "Brave", rutas: [
            unir(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            unir(programas, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            unir(programas86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
        ] },
        { nombre: "Google Chrome", rutas: [
            unir(programas, "Google", "Chrome", "Application", "chrome.exe"),
            unir(programas86, "Google", "Chrome", "Application", "chrome.exe"),
            unir(local, "Google", "Chrome", "Application", "chrome.exe")
        ] },
        { nombre: "Firefox", rutas: [
            unir(programas, "Mozilla Firefox", "firefox.exe"),
            unir(programas86, "Mozilla Firefox", "firefox.exe")
        ] },
        { nombre: "Microsoft Edge", rutas: [
            unir(programas86, "Microsoft", "Edge", "Application", "msedge.exe"),
            unir(programas, "Microsoft", "Edge", "Application", "msedge.exe")
        ] }
    ].map(candidato => ({ ...candidato, rutas: candidato.rutas.filter(ruta => path.win32.isAbsolute(ruta)) }));
}

function buscarOtroNavegador({ existe, entorno = process.env } = {}) {
    for (const candidato of candidatosWindows(entorno)) {
        const ruta = candidato.rutas.find(cadaRuta => existe(cadaRuta));
        if (ruta) return { nombre: candidato.nombre, ruta };
    }
    return null;
}

// Arma el aviso para una pestaña. Pregunta una sola vez por pestaña (si la persona
// vuelve a intentar y Google la rechaza de nuevo, no la llena de cartelitos).
function crearAvisoLoginBloqueado({ dialog, obtenerVentana, existe, abrirPrograma, entorno = process.env }) {
    const avisados = new Set();

    function revisar(contenido, url, titulo) {
        if (!contenido || contenido.isDestroyed() || avisados.has(contenido.id) || !esPaginaRechazo(url, titulo)) return false;
        avisados.add(contenido.id);
        contenido.once("destroyed", () => avisados.delete(contenido.id));
        const otro = buscarOtroNavegador({ existe, entorno });
        const destino = destinoEnOtroNavegador(url);
        const ventana = obtenerVentana?.();
        const opciones = {
            type: "info",
            title: "Patagonia Browser",
            message: "Google no deja iniciar sesión desde Patagonia en la PC",
            detail: "No es un problema de tu cuenta ni de tu contraseña: Google bloquea el inicio de sesión en los navegadores hechos como Patagonia en la PC. " +
                (otro
                    ? `Podés entrar desde ${otro.nombre}, que tenés instalado. En el celular, Patagonia entra a Google sin problema.`
                    : "Podés entrar desde otro navegador. En el celular, Patagonia entra a Google sin problema."),
            buttons: otro ? [`Abrir en ${otro.nombre}`, "Cerrar"] : ["Entendido"],
            defaultId: 0,
            cancelId: otro ? 1 : 0,
            noLink: true
        };
        const promesa = ventana && !ventana.isDestroyed()
            ? dialog.showMessageBox(ventana, opciones)
            : dialog.showMessageBox(opciones);
        return Promise.resolve(promesa).then(({ response } = {}) => {
            if (otro && response === 0) abrirPrograma(otro.ruta, [destino]);
            return true;
        }).catch(() => false);
    }

    return { revisar };
}

module.exports = { esPaginaRechazo, destinoEnOtroNavegador, candidatosWindows, buscarOtroNavegador, crearAvisoLoginBloqueado, TITULOS_RECHAZO };
