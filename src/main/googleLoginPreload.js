// Corre en cada página antes que sus scripts. En el login de Google, Patagonia
// se presenta como Firefox, pero el motor deja ver dos huellas de Chrome que
// Firefox no tiene: navigator.userAgentData ("Chromium") y window.chrome.
// Google nota la contradicción y responde "el navegador no es seguro".
// Solo las borramos en las páginas de login; el resto de los sitios no cambia.
const { contextBridge } = require("electron");

const DOMINIOS_LOGIN = ["accounts.google.com", "accounts.youtube.com"];

if (location.protocol === "https:" && DOMINIOS_LOGIN.includes(location.hostname)) {
    contextBridge.executeInMainWorld({
        func: () => {
            try { delete Navigator.prototype.userAgentData; } catch { /* sin cambios */ }
            try { delete window.chrome; } catch { /* sin cambios */ }
        }
    });
}
