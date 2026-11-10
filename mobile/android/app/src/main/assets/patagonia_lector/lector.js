'use strict';
// Solo responde cuando Patagonia lo pide (Patagonia AI o modo lectura). El texto queda en el teléfono.
(() => {
  let port;
  try {
    port = browser.runtime.connectNative('patagonia');
  } catch (_) {
    return;
  }

  const limpiar = (texto) => (texto || '').replace(/\s+/g, ' ').trim();
  const MAX_BLOQUES = 1500;
  const MAX_TEXTO = 200000;

  // Modo lectura: la nota sola, en bloques simples (títulos, párrafos, listas, citas, imágenes).
  // Patagonia la dibuja con sus propios controles: no se ejecuta nada de la página.
  function articulo() {
    if (typeof Readability !== 'function') return null;
    let leido;
    try {
      leido = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse();
    } catch (_) {
      return null;
    }
    if (!leido || !leido.content) return null;
    const html = new DOMParser().parseFromString(leido.content, 'text/html');
    const bloques = [];
    let total = 0;

    const agregar = (tipo, texto) => {
      const limpio = limpiar(texto);
      if (!limpio || bloques.length >= MAX_BLOQUES || total >= MAX_TEXTO) return;
      total += limpio.length;
      bloques.push({ t: tipo, x: limpio });
    };
    const imagen = (el) => {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      let url;
      try {
        url = new URL(src, location.href);
      } catch (_) {
        return;
      }
      if (!/^https?:$/.test(url.protocol) || bloques.length >= MAX_BLOQUES) return;
      bloques.push({ t: 'img', x: url.href, alt: limpiar(el.getAttribute('alt')) });
    };
    const recorrer = (nodo) => {
      for (const el of nodo.children) {
        const tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) agregar('h', el.textContent);
        else if (tag === 'p') {
          el.querySelectorAll('img').forEach(imagen);
          agregar('p', el.textContent);
        } else if (tag === 'li') agregar('li', el.textContent);
        else if (tag === 'blockquote') agregar('q', el.textContent);
        else if (tag === 'pre') {
          if (bloques.length < MAX_BLOQUES) bloques.push({ t: 'pre', x: (el.textContent || '').slice(0, 5000) });
        } else if (tag === 'img') imagen(el);
        else if (tag === 'figure') {
          el.querySelectorAll('img').forEach(imagen);
          const pie = el.querySelector('figcaption');
          if (pie) agregar('cap', pie.textContent);
        } else if (tag === 'table') agregar('p', el.innerText || el.textContent);
        else recorrer(el);
      }
    };
    recorrer(html.body);
    if (!bloques.some((b) => b.t === 'p')) return null;
    return {
      title: limpiar(leido.title) || document.title || '',
      byline: limpiar(leido.byline),
      site: limpiar(leido.siteName) || location.hostname,
      url: location.href,
      blocks: bloques,
    };
  }

  port.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === 'read') {
      const body = document.body;
      port.postMessage({
        id: message.id,
        title: document.title || '',
        url: location.href || '',
        text: ((body && body.innerText) || '').slice(0, 30000),
      });
    } else if (message.type === 'reader') {
      const nota = articulo();
      port.postMessage({ id: message.id, article: nota ? JSON.stringify(nota) : '' });
    }
  });
})();
