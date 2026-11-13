import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patagonia_browser/main.dart';
import 'package:patagonia_browser/src/browser_shell.dart';
import 'package:patagonia_browser/src/gecko/gecko_view.dart';
import 'package:patagonia_browser/src/update_check.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Simula las vistas nativas GeckoView (GeckoPlatformView.kt) para probar la interfaz
/// de Patagonia con el motor de Android.
class FakeGecko {
  final views = <int, Map<String, Object?>>{};
  final calls = <int, List<MethodCall>>{};
  final engineCalls = <MethodCall>[];
  final permissionRequests = <List<Object?>>[];
  final disposed = <int>[];
  Map<String, Object?>? pageText;
  String? article;
  String? appVersion;
  String installResult = 'instalando';
  bool isDefaultBrowser = false;

  int get lastId => views.keys.last;
  List<String> methods(int id) => (calls[id] ?? []).map((c) => c.method).toList();

  void install(WidgetTester tester) {
    final messenger = tester.binding.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(SystemChannels.platform_views, (call) async {
      final args = call.arguments;
      switch (call.method) {
        case 'create':
          final map = args as Map;
          final id = map['id'] as int;
          final raw = map['params'] as Uint8List;
          final params = const StandardMessageCodec().decodeMessage(
            ByteData.sublistView(raw),
          ) as Map;
          views[id] = params.cast<String, Object?>();
          calls[id] = [];
          messenger.setMockMethodCallHandler(
            MethodChannel('patagonia/gecko_view_$id'),
            (viewCall) async {
              calls[id]!.add(viewCall);
              if (viewCall.method == 'readPage') return pageText;
              if (viewCall.method == 'readArticle') return article;
              return null;
            },
          );
          return id;
        case 'resize':
          final map = args as Map;
          return {'width': map['width'], 'height': map['height']};
        case 'dispose':
          final id = args is Map ? args['id'] : args;
          if (id is int) disposed.add(id);
          return null;
      }
      return null;
    });
    messenger.setMockMethodCallHandler(
      const MethodChannel('patagonia/gecko_engine'),
      (call) async {
        engineCalls.add(call);
        if (call.method == 'ensureUBlock') return '1.75.0';
        if (call.method == 'openUBlockPanel') return true;
        if (call.method == 'appVersion') return appVersion;
        if (call.method == 'installUpdate') return installResult;
        if (call.method == 'isDefaultBrowser') return isDefaultBrowser;
        if (call.method == 'makeDefaultBrowser') return true;
        if (call.method == 'share') return true;
        return null;
      },
    );
    messenger.setMockMethodCallHandler(
      const MethodChannel('com.patagoniabrowser/permissions'),
      (call) async {
        permissionRequests.add(call.arguments as List<Object?>);
        return true;
      },
    );
  }

  /// La vista nativa le avisa algo a Dart. Devuelve la respuesta de Dart (si la hay).
  Future<Object?> emit(
    WidgetTester tester,
    int id,
    String method, [
    Object? arguments,
  ]) {
    const codec = StandardMethodCodec();
    final reply = Completer<Object?>();
    tester.binding.defaultBinaryMessenger.handlePlatformMessage(
      'patagonia/gecko_view_$id',
      codec.encodeMethodCall(MethodCall(method, arguments)),
      (data) => reply.complete(data == null ? null : codec.decodeEnvelope(data)),
    );
    return reply.future;
  }
}

void main() {
  late FakeGecko gecko;

  setUp(() {
    BrowserShell.debugUseGecko = true;
    BrowserShell.debugNoNetworkImages = true;
    gecko = FakeGecko();
  });
  tearDown(() {
    BrowserShell.debugUseGecko = null;
    BrowserShell.debugLatestRelease = null;
  });

  Future<int> open(
    WidgetTester tester,
    String url, {
    Map<String, Object> preferences = const {},
  }) async {
    SharedPreferences.setMockInitialValues(preferences);
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, url);
    await tester.testTextInput.receiveAction(TextInputAction.go);
    await tester.pumpAndSettle();
    return gecko.lastId;
  }

  Future<void> loadPage(
    WidgetTester tester,
    int id,
    String url,
    String title,
  ) async {
    await gecko.emit(tester, id, 'pageStart', url);
    await gecko.emit(tester, id, 'location', url);
    await gecko.emit(tester, id, 'title', title);
    await gecko.emit(tester, id, 'pageStop', true);
    await tester.pumpAndSettle();
  }

  testWidgets('abre la página en GeckoView y la guarda en el historial', (
    tester,
  ) async {
    final id = await open(tester, 'example.com');
    expect(gecko.views[id]!['url'], 'https://example.com');
    expect(gecko.views[id]!['active'], isTrue);
    expect(gecko.views[id]!['desktop'], isFalse);

    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getStringList('history')!.single, contains('Ejemplo'));
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'https://example.com/',
    );

    await tester.tap(find.byTooltip('Agregar a favoritos'));
    await tester.pumpAndSettle();
    expect(
      preferences.getStringList('favorites')!.single,
      contains('https://example.com/'),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('mantiene favoritos e historial guardados por la versión anterior', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'favorites': ['{"title":"Diario","url":"https://diario.com.ar/"}'],
      'history': ['{"title":"Clima","url":"https://clima.com/"}'],
    });
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Menú'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Favoritos'));
    await tester.pumpAndSettle();
    expect(find.text('Diario'), findsOneWidget);
    await tester.tap(find.text('Diario'));
    await tester.pumpAndSettle();
    expect(gecko.views[gecko.lastId]!['url'], 'https://diario.com.ar/');

    await tester.tap(find.byTooltip('Menú'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Historial'));
    await tester.pumpAndSettle();
    expect(find.text('Clima'), findsOneWidget);
  });

  testWidgets('atrás, adelante, recargar y el botón Atrás del teléfono', (
    tester,
  ) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');

    await tester.tap(find.byTooltip('Atrás'));
    await tester.pumpAndSettle();
    expect(gecko.methods(id), isNot(contains('back')));

    await gecko.emit(tester, id, 'canGoBack', true);
    await gecko.emit(tester, id, 'canGoForward', true);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Atrás'));
    await tester.tap(find.byTooltip('Adelante'));
    await tester.tap(find.byTooltip('Recargar'));
    await tester.pumpAndSettle();
    expect(gecko.methods(id), containsAll(['back', 'forward', 'reload']));

    // Atrás del teléfono: primero navega hacia atrás en la página...
    gecko.calls[id]!.clear();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(gecko.methods(id), contains('back'));

    // ...y si no hay a dónde volver, vuelve al inicio de Patagonia.
    await gecko.emit(tester, id, 'canGoBack', false);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Navegá libre. Navegá seguro.'), findsOneWidget);
  });

  testWidgets('modo escritorio por pestaña', (tester) async {
    final id = await open(tester, 'https://example.com');
    await tester.tap(find.byTooltip('Menú'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sitio de escritorio'));
    await tester.pumpAndSettle();
    final call = gecko.calls[id]!.lastWhere((c) => c.method == 'setDesktop');
    expect(call.arguments, isTrue);
  });

  testWidgets('una ventana nueva abre una pestaña y la anterior queda en pausa', (
    tester,
  ) async {
    final first = await open(tester, 'https://example.com');
    final accepted = gecko.emit(tester, first, 'newWindow', {
      'id': 7,
      'url': 'https://login.example.com/',
    });
    await tester.pumpAndSettle();
    expect(await accepted, isTrue);
    final second = gecko.lastId;
    expect(second, isNot(first));
    expect(gecko.views[second]!['windowId'], 7);
    expect(gecko.views[second]!['url'], isNull);
    expect(find.text('2'), findsOneWidget);
    final setActive = gecko.calls[first]!.lastWhere((c) => c.method == 'setActive');
    expect(setActive.arguments, isFalse);

    // La página de la ventana pide cerrarse (por ejemplo, al terminar de iniciar sesión).
    await gecko.emit(tester, second, 'closeRequest');
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget);
    expect(
      gecko.calls[first]!.lastWhere((c) => c.method == 'setActive').arguments,
      isTrue,
    );
  });

  testWidgets('no abre ventanas de esquemas raros', (tester) async {
    final id = await open(tester, 'https://example.com');
    final accepted = gecko.emit(tester, id, 'newWindow', {
      'id': 8,
      'url': 'javascript:alert(1)',
    });
    await tester.pumpAndSettle();
    expect(await accepted, isFalse);
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('pregunta antes de dar la cámara y pide el permiso de Android', (
    tester,
  ) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    final answer = gecko.emit(tester, id, 'permission', {
      'origin': 'https://example.com/videollamada',
      'kinds': ['camera', 'microphone'],
    });
    await tester.pumpAndSettle();
    expect(find.text('Permitir cámara y micrófono'), findsOneWidget);
    await tester.tap(find.text('Permitir'));
    await tester.pumpAndSettle();
    expect(await answer, isTrue);
    expect(gecko.permissionRequests.single, ['camera', 'microphone']);
  });

  testWidgets('niega el permiso si la página cambia mientras pregunta', (
    tester,
  ) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    final answer = gecko.emit(tester, id, 'permission', {
      'origin': 'https://example.com/',
      'kinds': ['location'],
    });
    await tester.pumpAndSettle();
    expect(find.text('Permitir tu ubicación'), findsOneWidget);
    await gecko.emit(tester, id, 'pageStart', 'https://other.com/');
    await tester.tap(find.text('Permitir'));
    await tester.pumpAndSettle();
    expect(await answer, isFalse);
  });

  testWidgets('niega permisos de otro sitio o sin https', (tester) async {
    final id = await open(tester, 'http://example.com');
    await loadPage(tester, id, 'http://example.com/', 'Ejemplo');
    final answer = gecko.emit(tester, id, 'permission', {
      'origin': 'http://example.com/',
      'kinds': ['camera'],
    });
    await tester.pumpAndSettle();
    expect(await answer, isFalse);
    expect(find.text('Permitir cámara'), findsNothing);
  });

  testWidgets('el escudo abre el panel de uBlock Origin', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await tester.tap(find.byTooltip('Centro de Privacidad'));
    await tester.pumpAndSettle();
    expect(find.byType(Switch), findsNothing);
    expect(find.textContaining('uBlock Origin'), findsWidgets);
    await tester.tap(find.text('Protección en este sitio'));
    await tester.pumpAndSettle();
    expect(gecko.engineCalls.map((c) => c.method), contains('openUBlockPanel'));
  });

  testWidgets('avisa una vez los sitios que tenían la protección apagada', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'unprotectedHosts': ['banco.com.ar'],
    });
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    expect(find.text('Nueva protección'), findsOneWidget);
    expect(find.textContaining('banco.com.ar'), findsOneWidget);
    await tester.tap(find.text('Entendido'));
    await tester.pumpAndSettle();
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getBool('geckoProtectionNoticeShown'), isTrue);
    expect(preferences.getStringList('unprotectedHosts'), ['banco.com.ar']);
  });

  testWidgets('muestra el error de Patagonia y vuelve a intentar', (tester) async {
    final id = await open(tester, 'https://example.com');
    await gecko.emit(tester, id, 'pageStart', 'https://example.com/');
    await gecko.emit(tester, id, 'loadError', 'https://example.com/');
    // Gecko carga una página vacía en lugar de su página de error.
    await gecko.emit(tester, id, 'pageStart', 'about:blank');
    await gecko.emit(tester, id, 'pageStop', false);
    await tester.pumpAndSettle();
    expect(find.text('Volver a intentar'), findsOneWidget);
    await tester.tap(find.text('Volver a intentar'));
    await tester.pumpAndSettle();
    expect(find.text('Volver a intentar'), findsNothing);
    expect(gecko.calls[id]!.last.method, 'load');
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getStringList('history'), isNull);
  });

  testWidgets('si la pestaña se cierra sola, Volver a intentar arma otra', (
    tester,
  ) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await gecko.emit(tester, id, 'crash');
    await tester.pumpAndSettle();
    expect(find.textContaining('La página se cerró'), findsOneWidget);
    await tester.tap(find.text('Volver a intentar'));
    await tester.pumpAndSettle();
    expect(gecko.lastId, isNot(id));
    expect(gecko.views[gecko.lastId]!['url'], 'https://example.com/');
  });

  testWidgets('pantalla completa esconde las barras y Atrás la cierra', (
    tester,
  ) async {
    final id = await open(tester, 'https://m.youtube.com');
    await gecko.emit(tester, id, 'fullScreen', true);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Menú'), findsNothing);
    // La página sigue siendo la misma vista (el video no se corta).
    expect(gecko.lastId, id);
    expect(gecko.disposed, isEmpty);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(gecko.methods(id), contains('exitFullScreen'));
    await gecko.emit(tester, id, 'fullScreen', false);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Menú'), findsOneWidget);
  });

  testWidgets('Patagonia AI lee el texto con el lector de Gecko', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    gecko.pageText = {
      'title': 'Ejemplo',
      'url': 'https://example.com/',
      'text':
          'La Patagonia es una región geográfica del extremo sur de América. Tiene lagos, montañas y glaciares enormes.',
    };
    await tester.tap(find.byTooltip('Patagonia AI'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('assistant-input')),
      'Resumí esta página',
    );
    await tester.tap(find.byTooltip('Enviar mensaje'));
    await tester.pumpAndSettle();
    expect(gecko.methods(id), contains('readPage'));
    expect(find.textContaining('región geográfica'), findsOneWidget);
  });

  testWidgets('muestra licencias de uBlock Origin y GeckoView', (tester) async {
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Menú'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Acerca de y licencias'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Acerca de y licencias'));
    await tester.pumpAndSettle();
    expect(find.text('uBlock Origin 1.75.0'), findsOneWidget);
    expect(find.text('GeckoView 159'), findsOneWidget);
    await tester.tap(find.text('Ver licencia (GPLv3)'));
    await tester.pumpAndSettle();
    expect(find.textContaining('GNU GENERAL PUBLIC LICENSE'), findsOneWidget);
  });

  testWidgets('avisa las descargas', (tester) async {
    final id = await open(tester, 'https://example.com');
    await gecko.emit(tester, id, 'download', {'status': 'done', 'name': 'boleta.pdf'});
    await tester.pump();
    expect(find.text('Descarga lista: boleta.pdf (carpeta Descargas).'), findsOneWidget);
  });

  test('con TalkBack la página usa vista nativa para que el lector la pueda recorrer', () {
    expect(GeckoBrowserView.usarVistaNativa(const MediaQueryData(accessibleNavigation: true)), isTrue);
    expect(GeckoBrowserView.usarVistaNativa(const MediaQueryData()), isFalse);
    expect(GeckoBrowserView.usarVistaNativa(null), isFalse);
  });

  // --- Lo que llegó de la PC en la 1.2.0 -------------------------------------

  Future<void> openMenuItem(WidgetTester tester, String label) async {
    await tester.tap(find.byTooltip('Menú'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text(label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  testWidgets('ofrece traducir una página en inglés y muestra el original', (
    tester,
  ) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Example');
    await gecko.emit(tester, id, 'translation', {
      'docLang': 'en',
      'userLang': 'es',
      'supported': true,
      'ready': false,
    });
    await tester.pumpAndSettle();
    expect(find.text('Esta página está en inglés.'), findsOneWidget);

    await tester.tap(find.text('Traducir'));
    await tester.pump();
    final call = gecko.calls[id]!.lastWhere((c) => c.method == 'translate');
    expect(call.arguments, {'from': 'en', 'to': 'es'});

    await gecko.emit(tester, id, 'translation', {
      'docLang': 'en',
      'supported': true,
      'from': 'en',
      'to': 'es',
      'ready': true,
    });
    await tester.pumpAndSettle();
    expect(find.text('Traducida del inglés.'), findsOneWidget);
    await tester.tap(find.text('Mostrar original'));
    await tester.pumpAndSettle();
    expect(gecko.methods(id), contains('restoreTranslation'));
    expect(find.text('Traducida del inglés.'), findsNothing);
  });

  testWidgets('no ofrece traducir páginas en castellano', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await gecko.emit(tester, id, 'translation', {
      'docLang': 'es',
      'supported': true,
    });
    await tester.pumpAndSettle();
    expect(find.text('Traducir'), findsNothing);
  });

  testWidgets('con Siempre traducir, traduce sola', (tester) async {
    final id = await open(
      tester,
      'https://example.com',
      preferences: {'alwaysTranslate': true},
    );
    await loadPage(tester, id, 'https://example.com/', 'Exemplo');
    await gecko.emit(tester, id, 'translation', {
      'docLang': 'pt',
      'supported': true,
    });
    await tester.pump();
    final call = gecko.calls[id]!.lastWhere((c) => c.method == 'translate');
    expect(call.arguments, {'from': 'pt', 'to': 'es'});
    await tester.pump();
    expect(find.text('Traduciendo del portugués…'), findsOneWidget);
    // Termina de traducir: se va la ruedita.
    await gecko.emit(tester, id, 'translation', {
      'docLang': 'pt',
      'supported': true,
      'from': 'pt',
      'to': 'es',
      'ready': true,
    });
    await tester.pumpAndSettle();
    expect(find.text('Traducida del portugués.'), findsOneWidget);
  });

  testWidgets('modo chicos y letra grande desde Configuración', (tester) async {
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    expect(find.text('Protección de privacidad activa'), findsOneWidget);

    await openMenuItem(tester, 'Configuración');
    await tester.tap(find.text('Modo chicos'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Letra grande'));
    await tester.pumpAndSettle();

    final kids = gecko.engineCalls.lastWhere((c) => c.method == 'setKidsMode');
    expect(kids.arguments, isTrue);
    final large = gecko.engineCalls.lastWhere((c) => c.method == 'setLargeText');
    expect(large.arguments, isTrue);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getBool('kidsMode'), isTrue);
    expect(preferences.getBool('largeText'), isTrue);

    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(find.text('Modo chicos activo'), findsOneWidget);
  });

  testWidgets('el modo chicos guardado se aplica al abrir Patagonia', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'kidsMode': true});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    final kids = gecko.engineCalls.lastWhere((c) => c.method == 'setKidsMode');
    expect(kids.arguments, isTrue);
    expect(find.text('Modo chicos activo'), findsOneWidget);
  });

  testWidgets('mantener apretado un enlace lo abre en otra pestaña', (
    tester,
  ) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await gecko.emit(tester, id, 'contextMenu', {
      'type': 'none',
      'link': 'https://example.com/nota',
    });
    await tester.pumpAndSettle();
    expect(find.text('Copiar dirección del enlace'), findsOneWidget);
    await tester.tap(find.text('Abrir en pestaña nueva'));
    await tester.pumpAndSettle();
    expect(gecko.views[gecko.lastId]!['url'], 'https://example.com/nota');
    expect(gecko.views[gecko.lastId]!['active'], isFalse);
    expect(find.text('Se abrió en una pestaña nueva.'), findsOneWidget);
    // La página que se estaba leyendo sigue a la vista.
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'https://example.com/',
    );
  });

  testWidgets('mantener apretado una imagen permite guardarla', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await gecko.emit(tester, id, 'contextMenu', {
      'type': 'image',
      'src': 'https://example.com/foto.jpg',
    });
    await tester.pumpAndSettle();
    await tester.tap(find.text('Guardar imagen'));
    await tester.pumpAndSettle();
    final call = gecko.calls[id]!.lastWhere((c) => c.method == 'saveUrl');
    expect(call.arguments, 'https://example.com/foto.jpg');
  });

  testWidgets('ignora enlaces raros al mantener apretado', (tester) async {
    final id = await open(tester, 'https://example.com');
    await gecko.emit(tester, id, 'contextMenu', {
      'type': 'none',
      'link': 'javascript:alert(1)',
    });
    await tester.pumpAndSettle();
    expect(find.text('Abrir en pestaña nueva'), findsNothing);
  });

  testWidgets('Buscar el texto seleccionado abre Brave Search', (tester) async {
    final id = await open(tester, 'https://example.com');
    await gecko.emit(tester, id, 'searchText', 'estepa patagónica');
    await tester.pumpAndSettle();
    final url = Uri.parse(gecko.views[gecko.lastId]!['url'] as String);
    expect(url.host, 'search.brave.com');
    expect(url.path, '/search');
    expect(url.queryParameters['q'], 'estepa patagónica');
  });

  testWidgets('con DuckDuckGo elegido, Buscar usa DuckDuckGo', (tester) async {
    final id = await open(
      tester,
      'https://example.com',
      preferences: {'searchEngine': 'duckduckgo'},
    );
    await gecko.emit(tester, id, 'searchText', 'estepa patagónica');
    await tester.pumpAndSettle();
    final url = Uri.parse(gecko.views[gecko.lastId]!['url'] as String);
    expect(url.host, 'duckduckgo.com');
    expect(url.queryParameters['q'], 'estepa patagónica');
  });

  testWidgets('el buscador se elige en Configuración', (tester) async {
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();

    await openMenuItem(tester, 'Configuración');
    final selector = find.byKey(const ValueKey('searchEngine'));
    await tester.ensureVisible(selector);
    await tester.pumpAndSettle();
    expect(find.text('Brave'), findsOneWidget);
    await tester.tap(selector);
    await tester.pumpAndSettle();
    await tester.tap(find.text('DuckDuckGo').last);
    await tester.pumpAndSettle();

    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getString('searchEngine'), 'duckduckgo');
  });

  testWidgets('modo lectura muestra la nota sola', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    gecko.article =
        '{"title":"Viento en la meseta","site":"Diario","byline":"Ana",'
        '"url":"https://example.com/","blocks":['
        '{"t":"h","x":"Un día de ráfagas"},'
        '{"t":"p","x":"El viento sopló a 90 km/h en Sarmiento."},'
        '{"t":"img","x":"https://example.com/foto.jpg"}]}';
    await openMenuItem(tester, 'Modo lectura');
    expect(gecko.methods(id), contains('readArticle'));
    expect(find.text('Viento en la meseta'), findsOneWidget);
    expect(find.text('El viento sopló a 90 km/h en Sarmiento.'), findsOneWidget);
    expect(find.text('Diario · Ana'), findsOneWidget);
  });

  testWidgets('modo lectura avisa si la página no tiene nota', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await openMenuItem(tester, 'Modo lectura');
    expect(
      find.text('Esta página no tiene una nota para mostrar en modo lectura.'),
      findsOneWidget,
    );
  });

  testWidgets('compartir la página usa la hoja de Android', (tester) async {
    final id = await open(tester, 'https://example.com');
    await loadPage(tester, id, 'https://example.com/', 'Ejemplo');
    await openMenuItem(tester, 'Compartir');
    final call = gecko.engineCalls.lastWhere((c) => c.method == 'share');
    expect(call.arguments, {'text': 'https://example.com/', 'title': 'Ejemplo'});
  });

  testWidgets('avisa en el inicio cuando hay una versión nueva', (tester) async {
    gecko.appVersion = '1.2.0';
    BrowserShell.debugLatestRelease = () async =>
        const MobileRelease(version: '1.2.1', tag: 'movil-v1.2.1');
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    expect(
      find.text('Hay una versión nueva: 1.2.1. Tocá para bajarla.'),
      findsOneWidget,
    );
    await tester.ensureVisible(
      find.text('Hay una versión nueva: 1.2.1. Tocá para bajarla.'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hay una versión nueva: 1.2.1. Tocá para bajarla.'));
    await tester.pumpAndSettle();
    expect(
      gecko.views[gecko.lastId]!['url'],
      'https://github.com/Roma-69/Patagonia-Browser/releases/tag/movil-v1.2.1',
    );
  });

  testWidgets('tocar el aviso baja e instala el APK sin pasar por GitHub', (tester) async {
    gecko.appVersion = '1.3.0';
    const apk =
        'https://github.com/Roma-69/Patagonia-Browser/releases/download/movil-v1.3.1/Patagonia-Android-1.3.1-Publicacion.apk';
    BrowserShell.debugLatestRelease = () async =>
        const MobileRelease(version: '1.3.1', tag: 'movil-v1.3.1', apkUrl: apk);
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    final aviso = find.text('Hay una versión nueva: 1.3.1. Tocá para bajarla.');
    await tester.ensureVisible(aviso);
    await tester.pumpAndSettle();
    final pestanas = gecko.views.length;
    await tester.tap(aviso);
    await tester.pumpAndSettle();
    final call = gecko.engineCalls.lastWhere((c) => c.method == 'installUpdate');
    expect(call.arguments, apk);
    // No abre la página de GitHub.
    expect(gecko.views.length, pestanas);
  });

  testWidgets('si no se puede bajar solo, abre la página del release', (tester) async {
    gecko.appVersion = '1.3.0';
    gecko.installResult = 'error';
    BrowserShell.debugLatestRelease = () async => const MobileRelease(
      version: '1.3.1',
      tag: 'movil-v1.3.1',
      apkUrl:
          'https://github.com/Roma-69/Patagonia-Browser/releases/download/movil-v1.3.1/Patagonia.apk',
    );
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    final aviso = find.text('Hay una versión nueva: 1.3.1. Tocá para bajarla.');
    await tester.ensureVisible(aviso);
    await tester.pumpAndSettle();
    await tester.tap(aviso);
    await tester.pumpAndSettle();
    expect(
      gecko.views[gecko.lastId]!['url'],
      'https://github.com/Roma-69/Patagonia-Browser/releases/tag/movil-v1.3.1',
    );
  });

  testWidgets('Configuración muestra la versión instalada', (tester) async {
    gecko.appVersion = '1.3.0';
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await openMenuItem(tester, 'Configuración');
    final version = find.byKey(const ValueKey('appVersion'));
    await tester.ensureVisible(version);
    await tester.pumpAndSettle();
    expect(find.text('Patagonia Browser 1.3.0'), findsOneWidget);
  });

  testWidgets('Configuración ofrece usar Patagonia como navegador predeterminado', (tester) async {
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await openMenuItem(tester, 'Configuración');
    final boton = find.text('Usar Patagonia');
    await tester.ensureVisible(boton);
    await tester.pumpAndSettle();
    await tester.tap(boton);
    await tester.pumpAndSettle();
    expect(gecko.engineCalls.map((c) => c.method), contains('makeDefaultBrowser'));
  });

  testWidgets('si ya es el predeterminado, no muestra el botón', (tester) async {
    gecko.isDefaultBrowser = true;
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await openMenuItem(tester, 'Configuración');
    final fila = find.byKey(const ValueKey('defaultBrowser'));
    await tester.ensureVisible(fila);
    await tester.pumpAndSettle();
    expect(find.text('Usar Patagonia'), findsNothing);
    expect(
      find.text('Patagonia ya abre los links de WhatsApp, el mail y otras apps.'),
      findsOneWidget,
    );
  });

  testWidgets('no avisa si ya está actualizada', (tester) async {
    gecko.appVersion = '1.2.0';
    BrowserShell.debugLatestRelease = () async =>
        const MobileRelease(version: '1.2.0', tag: 'movil-v1.2.0');
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    expect(find.textContaining('Hay una versión nueva'), findsNothing);
  });

  testWidgets('accesos rápidos de WhatsApp y Windguru', (tester) async {
    SharedPreferences.setMockInitialValues({});
    gecko.install(tester);
    await tester.pumpWidget(const PatagoniaBrowserApp());
    await tester.pumpAndSettle();
    await tester.tap(find.text('WhatsApp'));
    await tester.pumpAndSettle();
    expect(gecko.engineCalls.map((c) => c.method), contains('openWhatsApp'));
    expect(
      find.text('No encontramos WhatsApp instalado en este teléfono.'),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Windguru'));
    await tester.tap(find.text('Windguru'));
    await tester.pumpAndSettle();
    expect(gecko.views[gecko.lastId]!['url'], 'https://www.windguru.cz');
  });
}
