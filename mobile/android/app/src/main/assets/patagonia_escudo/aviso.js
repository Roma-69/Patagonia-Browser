'use strict';
const datos = new URLSearchParams(location.search);
const destino = datos.get('u') || '';
document.getElementById('mensaje').textContent = datos.get('m') === 'imitacion'
  ? `Esta página se hace pasar por ${datos.get('b')}, pero su dirección no es la oficial.`
  : 'Esta página está marcada como peligrosa: es conocida por robar claves, datos de tarjetas o meter virus.';
document.getElementById('sitio').textContent = datos.get('s') || '';
document.getElementById('volver').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.replace('about:blank');
});
document.getElementById('entrar').addEventListener('click', async () => {
  if (!/^https?:\/\//i.test(destino)) return;
  await browser.runtime.sendMessage({ tipo: 'entrar', url: destino });
  location.replace(destino);
});
