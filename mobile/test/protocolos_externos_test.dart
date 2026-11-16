import 'package:flutter_test/flutter_test.dart';
import 'package:patagonia_browser/src/protocolos_externos.dart';

void main() {
  test('los enlaces que abren una app se reconocen y se resumen', () {
    final claude = ProtocolosExternos.clasificar('claude://login?code=secreto123');
    expect(claude.tipo, TipoEnlace.externo);
    expect(claude.esquema, 'claude');
    expect(claude.resumen, 'claude://login');
    expect(claude.resumen.contains('secreto123'), isFalse);

    expect(ProtocolosExternos.clasificar('whatsapp://send?phone=549').tipo, TipoEnlace.externo);
    expect(ProtocolosExternos.clasificar('mailto:papa@correo.com').resumen, 'mailto:papa@correo.com');
    expect(ProtocolosExternos.clasificar('CLAUDE://Login').tipo, TipoEnlace.externo);
  });

  test('las páginas web las sigue mostrando Patagonia', () {
    for (final url in [
      'https://www.google.com/',
      'http://192.168.0.1/',
      'about:blank',
      'data:text/html,hola',
      'blob:https://x.com/1',
      'resource://gre/x',
      'moz-extension://abc/panel.html',
    ]) {
      expect(ProtocolosExternos.clasificar(url).tipo, TipoEnlace.interno, reason: url);
    }
  });

  test('los enlaces usados para atacar se bloquean', () {
    for (final esquema in ProtocolosExternos.peligrosos) {
      expect(
        ProtocolosExternos.clasificar('$esquema:/cualquier/cosa').tipo,
        TipoEnlace.bloqueado,
        reason: esquema,
      );
    }
    expect(ProtocolosExternos.clasificar('raro://${'a' * 3000}').tipo, TipoEnlace.bloqueado);
    expect(ProtocolosExternos.clasificar('claude://a\nms-msdt:/x').tipo, TipoEnlace.bloqueado);
  });

  test('aguanta direcciones raras', () {
    for (final valor in [null, '', '   ', 'sin-dos-puntos', '://x', '1raro://x', ':vacio']) {
      expect(ProtocolosExternos.clasificar(valor).tipo, TipoEnlace.bloqueado, reason: '$valor');
    }
  });

  test('la decisión es la misma que en la PC', () {
    // Las dos listas tienen que decir lo mismo (ver src/shared/protocolosExternos.js).
    expect(ProtocolosExternos.internos.contains('file'), isTrue);
    expect(ProtocolosExternos.peligrosos.contains('ms-msdt'), isTrue);
    expect(ProtocolosExternos.largoMaximo, 2048);
  });
}
