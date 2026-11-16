'use strict';
// Escudo contra estafas en el celu (igual que la PC, src/main/escudo.js). Las reglas
// están en escudo-reglas.js, copia exacta de src/shared/escudo.js.
const { crearEscudo, leerLista, FUENTES } = globalThis.PatagoniaEscudo;
const SEMANA = 7 * 24 * 60 * 60 * 1000;
const PERMISO_MS = 30 * 60 * 1000;
const escudo = crearEscudo('');
// "Entrar igual": ese sitio se deja pasar un rato (30 minutos).
const permitidos = new Map();

async function bajar() {
  const dominios = new Set();
  for (const copias of FUENTES) {
    let ok = false;
    for (const url of copias) {
      try {
        const respuesta = await fetch(url, { cache: 'no-store' });
        if (!respuesta.ok) continue;
        const lista = leerLista(await respuesta.text());
        if (lista.size < 50) continue;
        for (const d of lista) dominios.add(d);
        ok = true;
        break;
      } catch (_) { /* se prueba la copia siguiente */ }
    }
    if (!ok) return null;
  }
  return dominios.size >= 500 ? dominios : null;
}

async function iniciar() {
  const guardado = await browser.storage.local.get(['lista', 'fecha']);
  if (guardado.lista) {
    escudo.cambiarLista(guardado.lista);
  } else {
    try {
      escudo.cambiarLista(await (await fetch(browser.runtime.getURL('escudo-lista.txt'))).text());
    } catch (_) { /* queda el control de imitaciones */ }
  }
  if (Date.now() - (guardado.fecha || 0) < SEMANA) return;
  const nueva = await bajar();
  if (!nueva) return;
  const texto = [...nueva].join('\n');
  escudo.cambiarLista(nueva);
  await browser.storage.local.set({ lista: texto, fecha: Date.now() });
}

browser.webRequest.onBeforeRequest.addListener(
  (detalles) => {
    const resultado = escudo.revisar(detalles.url);
    if (!resultado) return {};
    const hasta = permitidos.get(resultado.host);
    if (hasta && hasta > Date.now()) return {};
    const datos = new URLSearchParams({
      u: detalles.url, m: resultado.motivo, b: resultado.marca || '', s: resultado.sitio || '',
    });
    return { redirectUrl: `${browser.runtime.getURL('aviso.html')}?${datos}` };
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['blocking'],
);

browser.runtime.onMessage.addListener((mensaje) => {
  if (mensaje && mensaje.tipo === 'entrar' && typeof mensaje.url === 'string') {
    const resultado = escudo.revisar(mensaje.url);
    if (resultado) permitidos.set(resultado.host, Date.now() + PERMISO_MS);
  }
  return Promise.resolve(true);
});

iniciar().catch(() => {});
