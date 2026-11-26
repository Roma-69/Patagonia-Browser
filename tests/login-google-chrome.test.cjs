// Login de Google (nov 2026): Google dejó de aceptar el disfraz de Firefox.
// Patagonia se presenta como el Chrome que tiene adentro y, si igual Google no
// deja entrar, lo avisa claro y ofrece abrirlo en otro navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const { modoLogin, conMarcaChrome, cabecerasChrome, cabecerasDelLogin, userAgentElectron, cabecerasElectron } = require('../src/main/googleLogin');
const { esPaginaRechazo, destinoEnOtroNavegador, buscarOtroNavegador, crearAvisoLoginBloqueado } = require('../src/main/loginBloqueado');

test('el modo del login sale de --login-google y por defecto es electron', () => {
    assert.equal(modoLogin([]), 'electron');
    assert.equal(modoLogin(['--login-google=chrome']), 'chrome');
    assert.equal(modoLogin(['patagonia.exe', '--login-google=firefox']), 'firefox');
    assert.equal(modoLogin(['--login-google=CHROMIUM']), 'chromium');
    assert.equal(modoLogin(['--login-google=otro']), 'electron');
});

test('se suma la marca Google Chrome una sola vez', () => {
    const base = '"Chromium";v="156", "Not_A Brand";v="24"';
    assert.equal(conMarcaChrome(base), `${base}, "Google Chrome";v="156"`);
    assert.equal(conMarcaChrome(conMarcaChrome(base)), `${base}, "Google Chrome";v="156"`);
    assert.equal(conMarcaChrome(''), '');
});

test('las cabeceras del login según el modo', () => {
    const cab = { 'User-Agent': 'Mozilla/5.0 Chrome/156.0.0.0', 'sec-ch-ua': '"Chromium";v="156"', Accept: '*/*' };
    const chrome = cabecerasChrome(cab);
    assert.equal(chrome['User-Agent'], cab['User-Agent'], 'el user agent no se toca');
    assert.match(chrome['sec-ch-ua'], /"Google Chrome";v="156"/);
    assert.equal(cab['sec-ch-ua'], '"Chromium";v="156"', 'no modifica el original');
    assert.deepEqual(cabecerasDelLogin(cab, 'chromium'), cab);
    assert.match(cabecerasDelLogin(cab, 'firefox')['User-Agent'], /Firefox\//);
});

test('reconoce la página de "No puedes acceder" de Google', () => {
    assert.equal(esPaginaRechazo('https://accounts.google.com/v3/signin/rejected?continue=x'), true);
    assert.equal(esPaginaRechazo('https://accounts.google.com/v3/signin/identifier', 'No puedes acceder'), true);
    assert.equal(esPaginaRechazo('https://accounts.google.com/v3/signin/identifier', 'Acceder: Cuentas de Google'), false);
    assert.equal(esPaginaRechazo('https://trucho.com/signin/rejected', 'No puedes acceder'), false);
    assert.equal(esPaginaRechazo('no es una dirección'), false);
});

test('en el otro navegador se abre lo que la persona quería, solo si es de Google', () => {
    const gmail = 'https://accounts.google.com/v3/signin/rejected?continue=' + encodeURIComponent('https://mail.google.com/mail/');
    assert.equal(destinoEnOtroNavegador(gmail), 'https://mail.google.com/mail/');
    const raro = 'https://accounts.google.com/v3/signin/rejected?continue=' + encodeURIComponent('https://malo.com/');
    assert.equal(destinoEnOtroNavegador(raro), 'https://accounts.google.com/');
});

test('busca primero Brave, después Chrome, Firefox y Edge', () => {
    const entorno = { LOCALAPPDATA: 'C:\\Users\\Colo\\AppData\\Local', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const brave = 'C:\\Users\\Colo\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
    assert.deepEqual(buscarOtroNavegador({ entorno, existe: r => r === edge }), { nombre: 'Microsoft Edge', ruta: edge });
    assert.deepEqual(buscarOtroNavegador({ entorno, existe: r => r === edge || r === brave }), { nombre: 'Brave', ruta: brave });
    assert.equal(buscarOtroNavegador({ entorno, existe: () => false }), null);
});

test('el aviso sale una sola vez por pestaña y abre el otro navegador', async () => {
    const abiertos = [];
    let avisos = 0;
    const contenido = { id: 3, isDestroyed: () => false, once() {} };
    const aviso = crearAvisoLoginBloqueado({
        dialog: { showMessageBox: async () => { avisos++; return { response: 0 }; } },
        obtenerVentana: () => null,
        existe: r => r.endsWith('brave.exe'),
        abrirPrograma: (ruta, args) => abiertos.push([ruta, args]),
        entorno: { LOCALAPPDATA: 'C:\\L', ProgramFiles: 'C:\\P', 'ProgramFiles(x86)': 'C:\\P86' }
    });
    const url = 'https://accounts.google.com/v3/signin/rejected';
    assert.equal(await aviso.revisar(contenido, url, ''), true);
    assert.equal(aviso.revisar(contenido, url, ''), false, 'la segunda vez no molesta');
    assert.equal(avisos, 1);
    assert.equal(abiertos.length, 1);
    assert.match(abiertos[0][0], /brave\.exe$/);
    assert.deepEqual(abiertos[0][1], ['https://accounts.google.com/']);
});

// 26/11/2026, probado con un correo inventado en una sesión limpia: Google rechaza el
// user agent de Chrome "limpio" y el de Firefox, y deja seguir al que dice Electron.
test('modo electron: el user agent dice la verdad y solo cambia esa cabecera', () => {
    const ua = userAgentElectron({ chrome: '156.0.8078.100', electron: '45.4.1' });
    assert.equal(ua, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.100 Electron/45.4.1 Safari/537.36');
    const cab = { 'user-agent': 'Mozilla/5.0 Chrome/156.0.0.0', 'sec-ch-ua': '"Chromium";v="156"', Accept: '*/*' };
    const nuevas = cabecerasElectron(cab, ua);
    assert.equal(nuevas['User-Agent'], ua);
    assert.equal('user-agent' in nuevas, false, 'no quedan dos user agents');
    assert.equal(nuevas['sec-ch-ua'], '"Chromium";v="156"', 'sin la marca Google Chrome');
    assert.equal(nuevas.Accept, '*/*');
    assert.match(cabecerasDelLogin(cab, 'electron')['User-Agent'], / Electron\//);
});

test('modo electron: la página lee el mismo user agent que las cabeceras', () => {
    const { userAgentHonesto } = require('../src/main/googleLoginPreload');
    function Navigator() {}
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'viejo', configurable: true });
    const anterior = globalThis.window;
    globalThis.window = { Navigator };
    try {
        userAgentHonesto('Mozilla/5.0 (X) Chrome/156.0.8078.100 Electron/45.4.1 Safari/537.36');
        const nav = new Navigator();
        assert.equal(nav.userAgent, 'Mozilla/5.0 (X) Chrome/156.0.8078.100 Electron/45.4.1 Safari/537.36');
        assert.equal(nav.appVersion, '5.0 (X) Chrome/156.0.8078.100 Electron/45.4.1 Safari/537.36');
    } finally {
        globalThis.window = anterior;
    }
});
