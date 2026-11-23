const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { IAS, normalizarIA, resolverIA } = require('../src/shared/tuIA');
const texto = archivo => fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
const turno = () => new Promise(resolve => setTimeout(resolve, 0));

test('Tu IA: abre solo IA de la lista o direcciones web propias', () => {
    assert.equal(resolverIA('claude'), 'https://claude.ai/');
    assert.equal(resolverIA(''), '');
    assert.equal(resolverIA('https://compu-colo.example.ts.net/'), 'https://compu-colo.example.ts.net/');
    assert.equal(normalizarIA('javascript:alert(1)'), '');
    assert.equal(normalizarIA('file:///C:/Windows'), '');
    assert.equal(normalizarIA('https://usuario:clave@ejemplo.com/'), '');
    assert.equal(normalizarIA('__proto__'), '');
    assert.equal(normalizarIA({}), '');
});

test('Tu IA: las opciones de la tarjeta coinciden con la lista del navegador', () => {
    const dom = new JSDOM(texto('index.html'));
    const valores = [...dom.window.document.querySelectorAll('#eleccionIA option')].map(o => o.value).filter(v => v && v !== 'otra');
    assert.deepEqual(valores, Object.keys(IAS));
    dom.window.close();
});

test('Patagonia ya no trae asistente de IA propio', () => {
    const html = texto('index.html');
    assert.doesNotMatch(html, /Patagonia AI|panelAsistente|assistant\.js/);
    assert.doesNotMatch(texto('preload.js'), /procesarConsultaIA|obtenerContextoPagina/);
    assert.doesNotMatch(texto('main.js'), /procesar-consulta-ia|obtener-contexto-pagina/);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'services', 'ai.js')), false);
});

test('Tu IA: elegir guarda la configuración sin pisar lo demás y el botón la abre', async t => {
    const dom = new JSDOM(texto('index.html'), { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window;
    let config = { inicio: 'https://search.brave.com/', restaurar: true, modoChicos: true, buscador: 'brave', ia: '' };
    let abiertas = 0;
    w.patagonia = {
        obtenerConfiguracion: async () => ({ correcto: true, configuracion: config }),
        guardarConfiguracion: async datos => { config = { ...datos, ia: normalizarIA(datos.ia) }; return { correcto: true, configuracion: config }; },
        abrirMiIA: async () => { abiertas++; return { correcto: true }; }
    };
    w.eval(texto('ui/modules/tuIA.js'));
    assert.equal(w.PatagoniaTuIA.iniciar(), true);
    await turno();
    const eleccion = w.document.getElementById('eleccionIA');
    const boton = w.document.getElementById('abrirMiIA');
    assert.equal(boton.disabled, true);
    eleccion.value = 'gemini';
    eleccion.dispatchEvent(new w.Event('change'));
    await turno(); await turno();
    assert.equal(config.ia, 'gemini');
    assert.equal(config.modoChicos, true);
    assert.equal(boton.disabled, false);
    boton.click(); await turno();
    assert.equal(abiertas, 1);

    eleccion.value = 'otra';
    eleccion.dispatchEvent(new w.Event('change'));
    const direccion = w.document.getElementById('direccionIA');
    assert.equal(direccion.hidden, false);
    direccion.value = 'compu-colo.example.ts.net';
    direccion.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await turno(); await turno();
    assert.equal(config.ia, 'https://compu-colo.example.ts.net/');
});
