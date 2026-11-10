import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Lo que avisa una pestaña Gecko (ver GeckoPlatformView.kt). Todo es opcional.
class GeckoEvents {
  const GeckoEvents({
    this.onLocation,
    this.onTitle,
    this.onProgress,
    this.onCanGoBack,
    this.onCanGoForward,
    this.onPageStart,
    this.onPageStop,
    this.onLoadError,
    this.onFullScreen,
    this.onCrash,
    this.onCloseRequest,
    this.onNewWindow,
    this.onPermission,
    this.onDownload,
    this.onContextMenu,
    this.onSearchText,
    this.onTranslation,
    this.onTranslationError,
  });

  final ValueChanged<String>? onLocation;
  final ValueChanged<String>? onTitle;
  final ValueChanged<int>? onProgress;
  final ValueChanged<bool>? onCanGoBack;
  final ValueChanged<bool>? onCanGoForward;
  final ValueChanged<String>? onPageStart;
  final ValueChanged<bool>? onPageStop;
  final ValueChanged<String>? onLoadError;
  final ValueChanged<bool>? onFullScreen;
  final VoidCallback? onCrash;
  final VoidCallback? onCloseRequest;

  /// Una página abre una ventana nueva. Devolver true la muestra en una pestaña nueva
  /// con `windowId: id`; false la cancela.
  final Future<bool> Function(int id, String url)? onNewWindow;

  /// La página pide `kinds` ('camera', 'microphone', 'location') para `origin`.
  final Future<bool> Function(String origin, List<String> kinds)? onPermission;

  /// status: 'start' | 'done' | 'error'.
  final void Function(String status, String name)? onDownload;

  /// Mantener apretado un enlace o una imagen.
  final ValueChanged<GeckoContextMenu>? onContextMenu;

  /// "Buscar" en el menú del texto seleccionado.
  final ValueChanged<String>? onSearchText;

  /// Novedades del traductor (idioma detectado, página traducida, errores).
  final ValueChanged<GeckoTranslationState>? onTranslation;
  final ValueChanged<String>? onTranslationError;
}

/// Lo que se mantuvo apretado en la página.
class GeckoContextMenu {
  const GeckoContextMenu({
    required this.type,
    this.link,
    this.src,
    this.title,
    this.alt,
  });

  /// 'image' | 'video' | 'audio' | 'none'.
  final String type;
  final String? link;
  final String? src;
  final String? title;
  final String? alt;

  bool get isImage => type == 'image' && (src?.isNotEmpty ?? false);
  bool get hasLink => link?.isNotEmpty ?? false;

  static GeckoContextMenu fromMap(Map<Object?, Object?> map) {
    String? text(Object? value) =>
        value is String && value.trim().isNotEmpty ? value.trim() : null;
    return GeckoContextMenu(
      type: text(map['type']) ?? 'none',
      link: text(map['link']),
      src: text(map['src']),
      title: text(map['title']),
      alt: text(map['alt']),
    );
  }
}

/// Estado del traductor de Gecko para la página abierta.
class GeckoTranslationState {
  const GeckoTranslationState({
    this.docLang,
    this.userLang,
    this.supported = false,
    this.from,
    this.to,
    this.error,
    this.ready = false,
  });

  /// Idioma detectado de la página (ej. 'en').
  final String? docLang;
  final String? userLang;

  /// El traductor sabe traducir desde ese idioma.
  final bool supported;

  /// Si la página está traducida (o traduciéndose): de qué idioma a cuál.
  final String? from;
  final String? to;
  final String? error;
  final bool ready;

  static GeckoTranslationState fromMap(Map<Object?, Object?> map) {
    String? text(Object? value) =>
        value is String && value.isNotEmpty ? value : null;
    return GeckoTranslationState(
      docLang: text(map['docLang']),
      userLang: text(map['userLang']),
      supported: map['supported'] == true,
      from: text(map['from']),
      to: text(map['to']),
      error: text(map['error']),
      ready: map['ready'] == true,
    );
  }
}

/// Texto de la página para el asistente, leído por la extensión patagonia_lector.
class GeckoPageText {
  const GeckoPageText({required this.title, required this.url, required this.text});

  final String title;
  final String url;
  final String text;
}

/// Habla con una pestaña GeckoView nativa.
class GeckoController {
  GeckoController(int id, this.events)
    : _channel = MethodChannel('patagonia/gecko_view_$id') {
    _channel.setMethodCallHandler(_onEvent);
  }

  final MethodChannel _channel;
  final GeckoEvents events;
  bool _disposed = false;

  static String _text(Object? value) => value is String ? value : '';

  Future<Object?> _onEvent(MethodCall call) async {
    if (_disposed) return null;
    final value = call.arguments;
    switch (call.method) {
      case 'location':
        events.onLocation?.call(_text(value));
      case 'title':
        events.onTitle?.call(_text(value));
      case 'progress':
        events.onProgress?.call(value is int ? value : 0);
      case 'canGoBack':
        events.onCanGoBack?.call(value == true);
      case 'canGoForward':
        events.onCanGoForward?.call(value == true);
      case 'pageStart':
        events.onPageStart?.call(_text(value));
      case 'pageStop':
        events.onPageStop?.call(value == true);
      case 'loadError':
        events.onLoadError?.call(_text(value));
      case 'fullScreen':
        events.onFullScreen?.call(value == true);
      case 'crash':
        events.onCrash?.call();
      case 'closeRequest':
        events.onCloseRequest?.call();
      case 'newWindow':
        final map = value is Map ? value : const {};
        final id = map['id'];
        if (id is! int) return false;
        return await events.onNewWindow?.call(id, _text(map['url'])) ?? false;
      case 'permission':
        final map = value is Map ? value : const {};
        final kinds = (map['kinds'] as List? ?? const [])
            .whereType<String>()
            .toList();
        return await events.onPermission?.call(_text(map['origin']), kinds) ??
            false;
      case 'download':
        final map = value is Map ? value : const {};
        events.onDownload?.call(_text(map['status']), _text(map['name']));
      case 'contextMenu':
        if (value is Map) {
          events.onContextMenu?.call(GeckoContextMenu.fromMap(value));
        }
      case 'searchText':
        final text = _text(value).trim();
        if (text.isNotEmpty) events.onSearchText?.call(text);
      case 'translation':
        if (value is Map) {
          events.onTranslation?.call(GeckoTranslationState.fromMap(value));
        }
      case 'translationError':
        events.onTranslationError?.call(_text(value));
    }
    return null;
  }

  Future<void> _call(String method, [Object? arguments]) async {
    if (_disposed) return;
    try {
      await _channel.invokeMethod<void>(method, arguments);
    } on MissingPluginException {
      // La vista nativa ya se cerró.
    }
  }

  Future<void> load(String url) => _call('load', url);
  Future<void> back() => _call('back');
  Future<void> forward() => _call('forward');
  Future<void> reload() => _call('reload');
  Future<void> stop() => _call('stop');
  Future<void> exitFullScreen() => _call('exitFullScreen');
  Future<void> setDesktop(bool enabled) => _call('setDesktop', enabled);
  Future<void> setActive(bool active) => _call('setActive', active);
  Future<void> saveUrl(String url) => _call('saveUrl', url);

  /// Traduce la página de [from] a [to] en el teléfono (baja el idioma la primera vez).
  Future<void> translate(String from, {String to = 'es'}) =>
      _call('translate', {'from': from, 'to': to});
  Future<void> restoreTranslation() => _call('restoreTranslation');

  /// Modo lectura: la nota de la página en JSON (ver patagonia_lector/lector.js),
  /// o null si la página no tiene una nota para leer.
  Future<String?> readArticle() async {
    if (_disposed) return null;
    try {
      final value = await _channel.invokeMethod<Object?>('readArticle');
      return value is String && value.isNotEmpty ? value : null;
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  /// null si la página no se puede leer (o no contesta a tiempo).
  Future<GeckoPageText?> readPage() async {
    if (_disposed) return null;
    try {
      final value = await _channel.invokeMethod<Object?>('readPage');
      if (value is! Map) return null;
      return GeckoPageText(
        title: _text(value['title']),
        url: _text(value['url']),
        text: _text(value['text']),
      );
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  void dispose() {
    _disposed = true;
    _channel.setMethodCallHandler(null);
  }
}

/// Canal general del motor: uBlock Origin y pestañas que abre uBO por su cuenta.
class GeckoEngineInfo {
  const GeckoEngineInfo._();

  static const channel = MethodChannel('patagonia/gecko_engine');

  /// Avisos del motor. [onPanel] muestra el panel de uBO (sesión `id`);
  /// [onExtensionTab] abre una pestaña de uBO (configuración, registro).
  static void listen({
    required ValueChanged<int> onPanel,
    required Future<bool> Function(int id, String url) onExtensionTab,
  }) {
    channel.setMethodCallHandler((call) async {
      final value = call.arguments;
      switch (call.method) {
        case 'uboPanel':
          if (value is int) onPanel(value);
        case 'extensionTab':
          final map = value is Map ? value : const {};
          final id = map['id'];
          if (id is! int) return false;
          final url = map['url'];
          return onExtensionTab(id, url is String ? url : '');
      }
      return null;
    });
  }

  static void stopListening() => channel.setMethodCallHandler(null);

  /// Devuelve la versión de uBO instalada (lo instala si hace falta).
  static Future<String> ensureUBlock() async =>
      await channel.invokeMethod<String>('ensureUBlock') ?? '';

  /// Abre el panel de uBO de la pestaña que se ve. false si uBO todavía no está listo.
  static Future<bool> openUBlockPanel() async {
    try {
      return await channel.invokeMethod<bool>('openUBlockPanel') ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  static Future<T?> _engine<T>(String method, [Object? arguments]) async {
    try {
      return await channel.invokeMethod<T>(method, arguments);
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  /// Modo chicos: DNS familiar, búsqueda segura y YouTube restringido.
  static Future<void> setKidsMode(bool enabled) =>
      _engine<void>('setKidsMode', enabled);

  /// Letra grande (125 %) en todas las páginas.
  static Future<void> setLargeText(bool enabled) =>
      _engine<void>('setLargeText', enabled);

  /// Hoja de compartir de Android. false si no se pudo abrir.
  static Future<bool> share(String text, {String? title}) async =>
      await _engine<bool>('share', {'text': text, 'title': title}) ?? false;

  /// Abre la app de WhatsApp. false si no está instalada.
  static Future<bool> openWhatsApp() async =>
      await _engine<bool>('openWhatsApp') ?? false;

  /// Versión instalada de Patagonia (ej. '1.2.0'), o null si no se sabe.
  static Future<String?> appVersion() => _engine<String>('appVersion');

  /// Libera una sesión que se preparó pero nunca se llegó a mostrar.
  static Future<void> dropPending(int id) async {
    try {
      await channel.invokeMethod<void>('dropPending', id);
    } on PlatformException {
      // Nada que liberar.
    } on MissingPluginException {
      // Nada que liberar.
    }
  }
}

/// Una página web con el motor Gecko (solo Android).
///
/// Se dibuja como textura dentro de Flutter (TLHC) con GeckoView en TextureView: es la
/// combinación que anduvo bien en la prueba de fuego. Así los menús y hojas de Patagonia
/// se pueden mostrar encima de la página.
class GeckoBrowserView extends StatelessWidget {
  const GeckoBrowserView({
    super.key,
    this.initialUrl,
    this.windowId,
    this.desktop = false,
    this.active = true,
    this.popup = false,
    required this.events,
    required this.onCreated,
  });

  static const viewType = 'patagonia/gecko_view';

  /// Página a abrir. Se ignora si hay [windowId] (la sesión ya existe del lado nativo).
  final String? initialUrl;
  final int? windowId;
  final bool desktop;
  final bool active;

  /// Panel de una extensión (uBO): se muestra, pero no cuenta como pestaña.
  final bool popup;
  final GeckoEvents events;
  final void Function(GeckoController controller) onCreated;

  /// Con TalkBack (u otro lector de pantalla) la página va como vista nativa de Android
  /// ("hybrid composition"): así el lector recorre textos, links y botones de la página.
  /// Sin lector se usa la composición por textura, más liviana.
  static bool usarVistaNativa(MediaQueryData? media) => media?.accessibleNavigation ?? false;

  @override
  Widget build(BuildContext context) {
    final nativa = usarVistaNativa(MediaQuery.maybeOf(context));
    return PlatformViewLink(
      // Si se prende o apaga el lector, se vuelve a crear la vista en el modo que corresponde.
      key: ValueKey<bool>(nativa),
      viewType: viewType,
      surfaceFactory: (context, controller) => AndroidViewSurface(
        controller: controller as AndroidViewController,
        // La página se queda con todos los gestos: scroll, pellizco, toques.
        gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{
          Factory<OneSequenceGestureRecognizer>(EagerGestureRecognizer.new),
        },
        hitTestBehavior: PlatformViewHitTestBehavior.opaque,
      ),
      onCreatePlatformView: (params) {
        final crear = nativa
            ? PlatformViewsService.initExpensiveAndroidView
            : PlatformViewsService.initSurfaceAndroidView;
        final controller = crear(
          id: params.id,
          viewType: viewType,
          layoutDirection: TextDirection.ltr,
          creationParams: <String, Object?>{
            'url': initialUrl,
            'windowId': windowId,
            'desktop': desktop,
            'active': active,
            'popup': popup,
          },
          creationParamsCodec: const StandardMessageCodec(),
          onFocus: () => params.onFocusChanged(true),
        );
        controller
          ..addOnPlatformViewCreatedListener(params.onPlatformViewCreated)
          ..addOnPlatformViewCreatedListener(
            (id) => onCreated(GeckoController(id, events)),
          )
          ..create();
        return controller;
      },
    );
  }
}
