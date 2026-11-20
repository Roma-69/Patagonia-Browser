/// Enlaces que abren una aplicación del celular en vez de una página web.
///
/// Son las direcciones que no empiezan con http:// ni https://, como las de
/// WhatsApp, Spotify, Zoom, los mapas o "Abrir Claude". El navegador no las sabe
/// mostrar: se las tiene que pasar a Android para que abra la app que corresponde.
///
/// Es la misma decisión que toma la versión de PC (src/shared/protocolosExternos.js).
enum TipoEnlace {
  /// Lo muestra el propio navegador: no se toca.
  interno,

  /// Hay que preguntarle al usuario y abrirlo con otra app.
  externo,

  /// No se abre nunca.
  bloqueado,
}

class EnlaceExterno {
  const EnlaceExterno(this.tipo, this.esquema, this.resumen);

  final TipoEnlace tipo;
  final String esquema;
  final String resumen;
}

class ProtocolosExternos {
  const ProtocolosExternos._();

  /// Las maneja el propio navegador.
  static const internos = {
    'http', 'https', 'about', 'blob', 'data', 'file', 'filesystem',
    'javascript', 'view-source', 'ws', 'wss',
    'chrome', 'chrome-extension', 'devtools', 'moz-extension', 'resource',
  };

  /// Nunca se le pasan al sistema: se usaron para hacer daño desde una página web.
  static const peligrosos = {
    'ms-msdt', 'search-ms', 'ms-officecmd', 'ms-cxh', 'ms-cxh-full',
    'ms-appinstaller', 'ms-availablenetworks', 'ms-settings',
    'shell', 'vbscript', 'vnd.ms-cmd', 'cmd', 'powershell',
    'ldap', 'ldaps', 'smb', 'nfs', 'res', 'mk', 'cid', 'help', 'afp', 'jar',
    // En Android, estos permiten pedirle cosas a otras apps sin que se note.
    'intent', 'android-app', 'content', 'package',
  };

  static const largoMaximo = 2048;

  static final _soloEsquema = RegExp(r'^[a-z][a-z0-9+.-]*$');

  static String esquemaDe(String? direccion) {
    final texto = (direccion ?? '').trim();
    final corte = texto.indexOf(':');
    if (corte <= 0) return '';
    final esquema = texto.substring(0, corte).toLowerCase();
    return _soloEsquema.hasMatch(esquema) ? esquema : '';
  }

  static EnlaceExterno clasificar(String? direccion) {
    final texto = (direccion ?? '').trim();
    final esquema = esquemaDe(texto);
    if (esquema.isEmpty) return const EnlaceExterno(TipoEnlace.bloqueado, '', '');
    if (internos.contains(esquema)) return EnlaceExterno(TipoEnlace.interno, esquema, '');
    if (peligrosos.contains(esquema)) return EnlaceExterno(TipoEnlace.bloqueado, esquema, '');
    // Una dirección enorme puede esconder una orden para el sistema.
    if (texto.length > largoMaximo || RegExp(r'[\r\n\t]').hasMatch(texto)) {
      return EnlaceExterno(TipoEnlace.bloqueado, esquema, '');
    }
    return EnlaceExterno(TipoEnlace.externo, esquema, _resumir(texto, esquema));
  }

  /// Texto corto para mostrarle al usuario, sin la parte larga con códigos de sesión.
  static String _resumir(String direccion, String esquema) {
    final crudo = direccion.substring(esquema.length + 1);
    final barras = crudo.startsWith('//') ? '//' : '';
    final resto = crudo.replaceFirst(RegExp(r'^/+'), '');
    var limpio = resto.split(RegExp(r'[?#]')).first.replaceFirst(RegExp(r'/+$'), '');
    if (limpio.length > 60) limpio = '${limpio.substring(0, 59)}…';
    return '$esquema:$barras$limpio';
  }

  /// Nombre de la app, para el aviso: 'whatsapp' → 'WhatsApp' cuando lo conocemos.
  static String nombreDe(String esquema) => _nombres[esquema] ?? esquema;

  static const _nombres = {
    'mailto': 'tu app de correo',
    'tel': 'el teléfono',
    'sms': 'los mensajes',
    'smsto': 'los mensajes',
    'geo': 'los mapas',
    'whatsapp': 'WhatsApp',
    'market': 'Google Play',
    'spotify': 'Spotify',
    'zoommtg': 'Zoom',
    'claude': 'Claude',
    'tg': 'Telegram',
  };
}
