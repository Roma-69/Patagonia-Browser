'use strict';
// Modo chicos (igual que en la PC, src/main/modoChicos.js): búsqueda segura forzada y YouTube en
// modo restringido. El bloqueo de sitios para adultos lo hace el DNS familiar de Cloudflare, que
// prende Patagonia en el motor (GeckoEngine.kt). Patagonia avisa si el modo está prendido.

const BUSCADORES = [
  { dominio: /(^|\.)duckduckgo\.com$/, ruta: /^\/($|html|lite)/, param: 'kp', valor: '1' },
  { dominio: /(^|\.)google\.[a-z.]+$/, ruta: /^\/(search|webhp|images|$)/, param: 'safe', valor: 'active' },
  { dominio: /(^|\.)bing\.com$/, ruta: /^\/(search|images|videos)/, param: 'adlt', valor: 'strict' },
  { dominio: /(^|\.)search\.yahoo\.com$/, ruta: /^\/search/, param: 'vm', valor: 'r' },
];

const DOMINIOS_YOUTUBE =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|youtubei\.googleapis\.com|youtube\.googleapis\.com)$/;

let activo = false;

// Devuelve la dirección con búsqueda segura, o null si ya está bien o no es un buscador.
function urlSegura(direccion) {
  let url;
  try {
    url = new URL(direccion);
  } catch (_) {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const buscador = BUSCADORES.find((b) => b.dominio.test(host) && b.ruta.test(url.pathname));
  if (!buscador || url.searchParams.get(buscador.param) === buscador.valor) return null;
  url.searchParams.set(buscador.param, buscador.valor);
  return url.href;
}

browser.webRequest.onBeforeRequest.addListener(
  (pedido) => {
    if (!activo) return {};
    const segura = urlSegura(pedido.url);
    return segura ? { redirectUrl: segura } : {};
  },
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame'] },
  ['blocking'],
);

// YouTube aplica el "modo restringido" cuando recibe esta cabecera.
browser.webRequest.onBeforeSendHeaders.addListener(
  (pedido) => {
    if (!activo) return {};
    let host;
    try {
      host = new URL(pedido.url).hostname.toLowerCase();
    } catch (_) {
      return {};
    }
    if (!DOMINIOS_YOUTUBE.test(host)) return {};
    const cabeceras = pedido.requestHeaders.filter((h) => h.name.toLowerCase() !== 'youtube-restrict');
    cabeceras.push({ name: 'YouTube-Restrict', value: 'Strict' });
    return { requestHeaders: cabeceras };
  },
  { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googleapis.com/*'] },
  ['blocking', 'requestHeaders'],
);

function aplicar(valor) {
  activo = valor === true;
  browser.storage.local.set({ activo }).catch(() => {});
}

// Mientras Patagonia no avisa, se usa lo último que dijo (así no queda apagado al arrancar).
browser.storage.local
  .get('activo')
  .then((guardado) => {
    if (guardado && typeof guardado.activo === 'boolean') activo = guardado.activo;
  })
  .catch(() => {});

let intentos = 0;
function conectar() {
  let port;
  try {
    port = browser.runtime.connectNative('patagonia');
  } catch (_) {
    reintentar();
    return;
  }
  port.onMessage.addListener((mensaje) => {
    intentos = 0;
    if (mensaje && typeof mensaje.chicos === 'boolean') aplicar(mensaje.chicos);
  });
  port.onDisconnect.addListener(reintentar);
}

function reintentar() {
  intentos++;
  setTimeout(conectar, Math.min(30000, 1000 * intentos));
}

conectar();
