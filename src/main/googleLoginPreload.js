// Corre en cada página antes que sus scripts. En el login de Google, Patagonia
// se presenta como Firefox: las cabeceras se cambian en googleLogin.js y acá se
// cambia lo que lee la página (navigator.userAgent y compañía). Además se borran
// huellas de Chrome que Firefox no tiene (navigator.userAgentData, NavigatorUAData,
// window.chrome), también en los iframes del mismo origen. Si Google nota la contradicción responde "el navegador no es
// seguro". Fuera de las páginas de login no se toca nada.
//
// Ojo: NO usar webContents.setUserAgent para esto. Si se llama mientras una
// pestaña carga, Chromium recarga la página actual y cancela la navegación
// (Gmail no abría y el login quedaba colgado después de la clave de paso).
const DOMINIOS_LOGIN = ["accounts.google.com", "accounts.youtube.com"];

// Misma cuenta que versionFirefox() en googleLogin.js (este preload corre en
// sandbox y no puede importar archivos propios; hay un test que las compara).
function versionFirefox(ahora = Date.now()) {
    const base = Date.UTC(2025, 11, 9);
    const ciclos = Math.floor((ahora - base) / (28 * 24 * 60 * 60 * 1000));
    return Math.max(146, 146 + ciclos - 1);
}

function disfrazFirefox(version) {
    const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
    const disfrazar = ventana => {
        try {
            if (!ventana || ventana.__patagoniaFirefox) return;
            Object.defineProperty(ventana, "__patagoniaFirefox", { value: true });
            const proto = ventana.Navigator && ventana.Navigator.prototype;
            const fijar = (nombre, valor) => {
                try {
                    Object.defineProperty(proto, nombre, { get: () => valor, configurable: true });
                } catch { /* sin cambios */ }
            };
            fijar("userAgent", ua);
            fijar("appVersion", "5.0 (Windows)");
            fijar("vendor", "");
            fijar("productSub", "20100101");
            try { delete proto.userAgentData; } catch { /* sin cambios */ }
            try { delete ventana.NavigatorUAData; } catch { /* sin cambios */ }
            try { delete ventana.chrome; } catch { /* sin cambios */ }
        } catch { /* ventana de otro origen: no se puede tocar */ }
    };
    disfrazar(window);
    // Google pide la clave de paso apenas abre el login ("autocompletar" de claves de
    // paso). Chrome lo muestra como una sugerencia chiquita bajo el campo del mail, pero
    // Electron no la tiene y Windows tira la ventana "Elige una clave de paso" encima de
    // todo. Decimos que esa sugerencia no está: la clave de paso se sigue pudiendo usar
    // cuando Google la pide después del mail.
    try {
        if (window.PublicKeyCredential) {
            Object.defineProperty(window.PublicKeyCredential, "isConditionalMediationAvailable", {
                configurable: true,
                writable: true,
                value: () => Promise.resolve(false)
            });
        }
    } catch { /* sin cambios */ }
    // Truco conocido para descubrir disfraces: crear un iframe vacío y leer ahí el
    // navigator "limpio". Disfrazamos también cada iframe del mismo origen.
    try {
        const marco = HTMLIFrameElement.prototype;
        const original = Object.getOwnPropertyDescriptor(marco, "contentWindow");
        Object.defineProperty(marco, "contentWindow", {
            configurable: true,
            enumerable: original.enumerable,
            get() {
                const ventana = original.get.call(this);
                disfrazar(ventana);
                return ventana;
            }
        });
    } catch { /* sin cambios */ }
}

if (typeof location !== "undefined" && location.protocol === "https:" && DOMINIOS_LOGIN.includes(location.hostname)) {
    require("electron").contextBridge.executeInMainWorld({ func: disfrazFirefox, args: [versionFirefox()] });
}

if (typeof module !== "undefined") module.exports = { versionFirefox, disfrazFirefox };
