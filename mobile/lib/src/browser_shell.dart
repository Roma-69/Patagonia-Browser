import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'descargas.dart';
import 'gecko/gecko_view.dart';
import 'navigation_input.dart';
import 'favoritos_archivo.dart';
import 'tu_ia.dart';
import 'privacy_protection.dart';
import 'protocolos_externos.dart';
import 'reader_view.dart';
import 'translation.dart';
import 'update_check.dart';
import 'web_permissions.dart';

const _navy = Color(0xFF071827);
const _surface = Color(0xFF102B41);
const _surfaceLight = Color(0xFF173B56);
const _blue = Color(0xFF50A7D8);
const _incognitoColor = Color(0xFFB79CE8);
const _green = Color(0xFF35D35B);
const _muted = Color(0xFFAEC0CF);
const _privacyPolicyUrl =
    'https://github.com/Roma-69/Patagonia-Browser/blob/main/PRIVACY.md';

class BrowserShell extends StatefulWidget {
  const BrowserShell({super.key});

  /// Motor de páginas: en Android, GeckoView + uBlock Origin; en iPhone, WebKit.
  /// Las pruebas pueden forzar uno u otro.
  @visibleForTesting
  static bool? debugUseGecko;

  /// Las pruebas reemplazan la consulta a GitHub del aviso de versión nueva.
  @visibleForTesting
  static Future<MobileRelease?> Function()? debugLatestRelease;

  /// Las pruebas no bajan imágenes de internet en el modo lectura.
  @visibleForTesting
  static bool debugNoNetworkImages = false;

  static bool get usesGecko =>
      debugUseGecko ??
      (!kIsWeb && defaultTargetPlatform == TargetPlatform.android);

  @override
  State<BrowserShell> createState() => _BrowserShellState();
}

class _BrowserShellState extends State<BrowserShell>
    with WidgetsBindingObserver {
  final TextEditingController _address = TextEditingController();
  final FocusNode _addressFocus = FocusNode();
  final List<_BrowserTab> _tabs = [];
  final List<_SavedPage> _favorites = [];
  final List<_SavedPage> _history = [];

  /// Menú → Descargas (solo Android): la lista la lleva el motor y avisa cada cambio.
  final ValueNotifier<List<Descarga>> _downloads = ValueNotifier(const []);
  final Set<String> _unprotectedHosts = {};
  int _currentIndex = 0;
  int _nextTabId = 1;
  bool _preferencesReady = false;
  bool _handlingBack = false;
  bool _askingPermission = false;
  bool _immersive = false;
  final bool _gecko = BrowserShell.usesGecko;
  String _youtubeDocumentStartSource = '';

  // Configuración (igual que en la PC): modo chicos, letra grande, traductor y aviso de versión.
  /// Sitios que ya dijeron "Permitir siempre" para abrir otra app, hasta cerrar Patagonia.
  final Set<String> _allowedExternal = {};
  bool _askingExternal = false;
  bool _kidsMode = false;
  bool _largeText = false;
  SearchEngine _searchEngine = SearchEngine.fallback;
  bool _alwaysTranslate = false;
  bool _updateNotices = true;
  bool _restoreTabs = true;
  bool _windSound = true;
  /// "Tu IA": '' sin elegir, un id de TuIA.lista o una dirección propia.
  String _myAi = '';
  final Set<String> _neverTranslateHosts = {};
  MobileRelease? _availableUpdate;
  bool _installingUpdate = false;
  bool _isDefaultBrowser = false;
  String? _installedVersion;
  Future<void> _pendingSave = Future<void>.value();

  bool _isLive(_BrowserTab tab) => mounted && _tabs.contains(tab);

  Future<void> _withController(
    _BrowserTab tab,
    Future<void> Function(InAppWebViewController) action,
  ) async {
    final controller = tab.controller;
    if (!_isLive(tab) || controller == null) return;
    try {
      await action(controller);
    } on PlatformException {
      if (_isLive(tab) && identical(controller, tab.controller)) {
        _showMessage('No se pudo completar la acción. Volvé a intentarlo.');
      }
    } on MissingPluginException {
      // A native WebView may have been disposed while awaiting a command.
    }
  }

  _BrowserTab get _current => _tabs[_currentIndex];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tabs.add(_BrowserTab(id: _nextTabId++));
    if (_gecko) {
      GeckoEngineInfo.listen(
        onPanel: _showUBlockPanel,
        onExtensionTab: _openExtensionTab,
        onOpenUrl: _openFromShortcut,
        onDownloads: (lista) => _downloads.value = lista,
      );
      GeckoEngineInfo.downloads().then((lista) {
        if (mounted) _downloads.value = lista;
      });
      // Si Patagonia se abrió desde un acceso directo de la pantalla de inicio.
      GeckoEngineInfo.takeLaunchUrl().then((url) {
        if (url != null && mounted) _navigate(url);
      });
      // uBlock Origin se prepara mientras se muestra el inicio.
      GeckoEngineInfo.ensureUBlock().catchError((Object _) => '');
    }
    _loadPreferences();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Al salir de Patagonia (o si Android la cierra) se guardan las pestañas
    // abiertas: la próxima vez se abre donde estabas, igual que en la PC.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      _saveOpenTabs();
    }
  }

  /// Pestañas normales con una página web; las de incógnito nunca se guardan.
  Future<void> _saveOpenTabs() async {
    if (!_preferencesReady) return;
    final urls = <String>[];
    var active = 0;
    for (final tab in _tabs) {
      final url = tab.url;
      if (tab.incognito || !NavigationInput.isWebUri(url)) continue;
      if (identical(tab, _current)) active = urls.length;
      urls.add(url.toString());
      if (urls.length == _maxSavedTabs) break;
    }
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(_openTabsKey, urls);
      await preferences.setInt(_activeTabKey, active);
    } catch (_) {
      // Si no se pudo guardar, la próxima vez arranca en el inicio.
    }
  }

  /// Vuelve a abrir las pestañas de la última vez. Si Patagonia se abrió con un
  /// enlace (por ejemplo desde WhatsApp), ese enlace queda adelante.
  void _restoreOpenTabs(List<String> saved, int active) {
    final urls = saved
        .map(Uri.tryParse)
        .where(NavigationInput.isWebUri)
        .cast<Uri>()
        .take(_maxSavedTabs)
        .toList();
    if (urls.isEmpty) return;
    final restored = [
      for (final url in urls) _BrowserTab(id: _nextTabId++, url: url),
    ];
    final onlyStartPage = _tabs.length == 1 &&
        _tabs.first.url == null &&
        _tabs.first.windowId == null &&
        _tabs.first.pendingLoad == null &&
        !_tabs.first.incognito;
    setState(() {
      if (onlyStartPage) {
        _tabs
          ..clear()
          ..addAll(restored);
        _currentIndex = active >= 0 && active < restored.length ? active : 0;
      } else {
        _tabs.insertAll(0, restored);
        _currentIndex += restored.length;
      }
      _syncAddress();
    });
    _syncActiveTab();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (_gecko) {
      GeckoEngineInfo.stopListening();
      for (final tab in _tabs) {
        tab.disposeGecko();
      }
    }
    _downloads.dispose();
    _address.dispose();
    _addressFocus.dispose();
    super.dispose();
  }

  Future<void> _loadPreferences() async {
    var showProtectionNotice = false;
    try {
      final preferences = await SharedPreferences.getInstance();
      if (!mounted) return;
      setState(() {
        _favorites
          ..clear()
          ..addAll(_decodePages(preferences.getStringList('favorites')));
        _history
          ..clear()
          ..addAll(_decodePages(preferences.getStringList('history')));
        _unprotectedHosts
          ..clear()
          ..addAll(preferences.getStringList('unprotectedHosts') ?? const []);
        _kidsMode = preferences.getBool(_kidsModeKey) ?? false;
        _searchEngine = SearchEngine.fromId(
          preferences.getString(_searchEngineKey),
        );
        _largeText = preferences.getBool(_largeTextKey) ?? false;
        _alwaysTranslate = preferences.getBool(_alwaysTranslateKey) ?? false;
        _updateNotices = preferences.getBool(_updateNoticesKey) ?? true;
        _restoreTabs = preferences.getBool(_restoreTabsKey) ?? true;
        _windSound = preferences.getBool(_windSoundKey) ?? true;
        _myAi = TuIA.normalizar(preferences.getString(_myAiKey));
        _neverTranslateHosts
          ..clear()
          ..addAll(preferences.getStringList(_neverTranslateKey) ?? const []);
      });
      if (_restoreTabs) {
        _restoreOpenTabs(
          preferences.getStringList(_openTabsKey) ?? const [],
          preferences.getInt(_activeTabKey) ?? 0,
        );
      }
      showProtectionNotice =
          _gecko &&
          _unprotectedHosts.isNotEmpty &&
          preferences.getBool(_protectionNoticeKey) != true;
    } catch (_) {
      _showMessage('No pudimos leer los favoritos y el historial guardados.');
    }
    // Con GeckoView la protección la hace uBlock Origin: el script propio de
    // YouTube queda solo para el motor WebView.
    if (!_gecko) {
      try {
        final source = await PrivacyProtection.youtubeProtectionScript;
        if (mounted) _youtubeDocumentStartSource = source;
      } catch (_) {
        if (mounted) {
          _showMessage('No se pudo cargar la protección preventiva de YouTube.');
        }
      }
    }
    if (mounted) setState(() => _preferencesReady = true);
    if (_gecko) {
      // El motor ya los leyó al arrancar; se repiten por las dudas.
      GeckoEngineInfo.setKidsMode(_kidsMode);
      GeckoEngineInfo.setLargeText(_largeText);
      _checkForUpdate();
    }
    if (showProtectionNotice && mounted) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _showProtectionNotice(),
      );
    }
  }

  static const _protectionNoticeKey = 'geckoProtectionNoticeShown';
  static const _kidsModeKey = 'kidsMode';
  static const _searchEngineKey = 'searchEngine';
  static const _largeTextKey = 'largeText';
  static const _alwaysTranslateKey = 'alwaysTranslate';
  static const _updateNoticesKey = 'updateNotices';
  static const _restoreTabsKey = 'restoreTabs';
  static const _windSoundKey = 'windSound';
  static const _myAiKey = 'myAi';
  static const _openTabsKey = 'openTabs';
  static const _activeTabKey = 'openTabsActive';
  static const _maxSavedTabs = 15;
  static const _neverTranslateKey = 'neverTranslateHosts';
  static const _lastUpdateCheckKey = 'lastUpdateCheck';

  UnmodifiableListView<UserScript>? _initialProtectionScripts(_BrowserTab tab) {
    if (defaultTargetPlatform != TargetPlatform.android ||
        !tab.protectionEnabled ||
        _youtubeDocumentStartSource.isEmpty) {
      return null;
    }
    return UnmodifiableListView([
      PrivacyProtection.youtubeDocumentStartScript(_youtubeDocumentStartSource),
    ]);
  }

  Future<void> _syncDocumentStartProtection(
    InAppWebViewController controller, {
    required bool enabled,
  }) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;
    await controller.removeUserScriptsByGroupName(
      groupName: PrivacyProtection.youtubeScriptGroup,
    );
    if (enabled && _youtubeDocumentStartSource.isNotEmpty) {
      await controller.addUserScript(
        userScript: PrivacyProtection.youtubeDocumentStartScript(
          _youtubeDocumentStartSource,
        ),
      );
    }
  }

  List<_SavedPage> _decodePages(List<String>? values) {
    if (values == null) return [];
    return values
        .map((value) {
          try {
            return _SavedPage.fromJson(
              jsonDecode(value) as Map<String, dynamic>,
            );
          } catch (_) {
            return null;
          }
        })
        .whereType<_SavedPage>()
        .where((page) => NavigationInput.isWebUri(Uri.tryParse(page.url)))
        .toList();
  }

  Future<void> _saveStrings(String key, List<String> values) {
    final snapshot = List<String>.of(values);
    _pendingSave = _pendingSave.then((_) async {
      try {
        final preferences = await SharedPreferences.getInstance();
        if (!await preferences.setStringList(key, snapshot)) {
          _showMessage('No pudimos guardar los cambios en el teléfono.');
        }
      } catch (_) {
        _showMessage('No pudimos guardar los cambios en el teléfono.');
      }
    });
    return _pendingSave;
  }

  Future<void> _savePages(String key, List<_SavedPage> pages) => _saveStrings(
    key,
    pages.map((page) => jsonEncode(page.toJson())).toList(),
  );

  void _syncAddress() {
    _address.text = _current.url?.toString() ?? '';
  }

  Future<void> _navigate(String value) async {
    final uri = NavigationInput.resolve(value, engine: _searchEngine);
    // Ráfaga de viento solo si se buscó algo (no al abrir una dirección).
    final typed = value.trim();
    if (_gecko &&
        _windSound &&
        typed.isNotEmpty &&
        !typed.contains('://') &&
        uri == _searchEngine.search(typed)) {
      GeckoEngineInfo.playWind();
    }
    final tab = _current;
    final shouldProtect = !_unprotectedHosts.contains(uri.host.toLowerCase());
    _addressFocus.unfocus();
    _address.text = uri.toString();

    if (_gecko) {
      final controller = tab.gecko;
      final hadView = tab.url != null || tab.windowId != null;
      final rebuild = tab.renderProcessGone;
      setState(() {
        tab.errorMessage = null;
        if (rebuild) {
          // La pestaña se cerró sola: se arma una vista nueva con esta dirección.
          tab.disposeGecko();
          tab.generation++;
          tab.renderProcessGone = false;
          tab.windowId = null;
          tab.url = uri;
        } else if (controller == null) {
          tab.url = uri;
          if (hadView) tab.pendingLoad = uri;
        }
      });
      if (!rebuild && controller != null && _isLive(tab)) {
        await controller.load(uri.toString());
      }
      return;
    }

    if (tab.controller == null) {
      setState(() {
        if (tab.renderProcessGone) tab.generation++;
        tab.renderProcessGone = false;
        tab.url = uri;
        tab.protectionEnabled = shouldProtect;
        tab.errorMessage = null;
      });
      return;
    }

    await _withController(tab, (controller) async {
      if (tab.protectionEnabled != shouldProtect) {
        setState(() => tab.protectionEnabled = shouldProtect);
        await _syncDocumentStartProtection(controller, enabled: shouldProtect);
        await controller.setSettings(settings: _webSettings(tab));
      }
      if (_isLive(tab) && identical(controller, tab.controller)) {
        await controller.loadUrl(urlRequest: URLRequest(url: WebUri.uri(uri)));
      }
    });
  }

  void _openHome() {
    if (_current.fullScreen) _setImmersive(false);
    setState(() {
      _current.disposeGecko();
      _current.generation++;
      _current.windowId = null;
      _current.renderProcessGone = false;
      _current.resetCounters();
      _current
        ..url = null
        ..title = 'Nueva pestaña'
        ..controller = null
        ..progress = 0
        ..protectionEnabled = true
        ..errorMessage = null;
      _address.clear();
    });
  }

  void _addTab({Uri? url, int? windowId, String? title, bool incognito = false}) {
    setState(() {
      _tabs.add(
        _BrowserTab(id: _nextTabId++, url: url, windowId: windowId, incognito: incognito)
          ..protectionEnabled =
              _gecko ||
              url == null ||
              !_unprotectedHosts.contains(url.host.toLowerCase()),
      );
      if (title != null) _tabs.last.title = title;
      _currentIndex = _tabs.length - 1;
      _syncAddress();
    });
    _syncActiveTab();
  }

  void _selectTab(int index) {
    if (index < 0 || index >= _tabs.length) return;
    setState(() {
      _currentIndex = index;
      _syncAddress();
    });
    _syncActiveTab();
  }

  /// Solo la pestaña que se ve queda activa en Gecko: las demás no gastan batería,
  /// y uBlock Origin sabe de qué sitio mostrar su panel.
  void _syncActiveTab() {
    if (!_gecko) return;
    for (final tab in _tabs) {
      tab.gecko?.setActive(identical(tab, _current));
    }
    _setImmersive(_current.fullScreen);
  }

  void _setImmersive(bool enabled) {
    if (_immersive == enabled) return;
    _immersive = enabled;
    SystemChrome.setEnabledSystemUIMode(
      enabled ? SystemUiMode.immersiveSticky : SystemUiMode.manual,
      overlays: enabled ? null : SystemUiOverlay.values,
    );
  }

  void _closeTabAt(int index) {
    if (index < 0 || index >= _tabs.length) return;
    final closingIncognito = _tabs[index].incognito;
    setState(() {
      _tabs[index].disposeGecko();
      _tabs[index].generation++;
      _tabs[index].controller = null;
      _tabs.removeAt(index);
      if (_tabs.isEmpty) {
        _tabs.add(_BrowserTab(id: _nextTabId++));
        _currentIndex = 0;
      } else if (_currentIndex >= _tabs.length) {
        _currentIndex = _tabs.length - 1;
      } else if (index < _currentIndex) {
        _currentIndex--;
      }
      _syncAddress();
    });
    _syncActiveTab();
    // Se cerró la última de incógnito: lo que se bajó ahí no queda en la lista.
    if (_gecko && closingIncognito && !_tabs.any((t) => t.incognito)) {
      GeckoEngineInfo.forgetPrivateDownloads();
    }
  }

  Future<void> _goBack() async {
    if (_gecko) {
      if (_current.canGoBack) await _current.gecko?.back();
      return;
    }
    await _withController(_current, (controller) async {
      if (await controller.canGoBack()) await controller.goBack();
    });
  }

  Future<void> _goForward() async {
    if (_gecko) {
      if (_current.canGoForward) await _current.gecko?.forward();
      return;
    }
    await _withController(_current, (controller) async {
      if (await controller.canGoForward()) await controller.goForward();
    });
  }

  Future<void> _handleSystemBack() async {
    if (_handlingBack) return;
    _handlingBack = true;
    final tab = _current;
    var navigated = false;
    try {
      final gecko = tab.gecko;
      if (_gecko && gecko != null) {
        if (tab.fullScreen) {
          await gecko.exitFullScreen();
          return;
        }
        if (tab.canGoBack) {
          await gecko.back();
          return;
        }
      }
      await _withController(tab, (controller) async {
        if (await controller.canGoBack()) {
          if (_isLive(tab) && identical(tab, _current)) {
            navigated = true;
            await controller.goBack();
          }
        }
      });
      if (navigated || !_isLive(tab) || !identical(tab, _current)) return;
      if (_tabs.length > 1) {
        _closeTabAt(_currentIndex);
      } else if (tab.url != null) {
        _openHome();
      } else {
        await SystemNavigator.pop();
      }
    } finally {
      _handlingBack = false;
    }
  }

  Future<void> _prepareNavigation(_BrowserTab tab, Uri? url) async {
    if (_gecko || !_isLive(tab) || !NavigationInput.isWebUri(url)) return;
    final enabled = !_unprotectedHosts.contains(url!.host.toLowerCase());
    if (tab.protectionEnabled != enabled) {
      setState(() => tab.protectionEnabled = enabled);
      await _withController(tab, (controller) async {
        await _syncDocumentStartProtection(controller, enabled: enabled);
        await controller.setSettings(settings: _webSettings(tab));
      });
    }
  }

  void _onLoadStart(_BrowserTab tab, Uri? url) {
    if (!_isLive(tab)) return;
    tab.resetCounters();
    _onUrlChanged(tab, url);
    _prepareNavigation(tab, url);
  }

  void _onUrlChanged(_BrowserTab tab, Uri? url) {
    if (!_isLive(tab) || url == null) return;
    final changed = tab.url != url;
    setState(() {
      tab.url = url;
      tab.errorMessage = null;
      if (identical(tab, _current) && !_addressFocus.hasFocus) {
        _address.text = url.toString();
      }
    });
    if (changed) _prepareNavigation(tab, url);
  }

  void _onTitleChanged(_BrowserTab tab, String? title) {
    if (!_isLive(tab) || title == null || title.trim().isEmpty) return;
    setState(() => tab.title = title.trim());
  }

  void _onProgressChanged(_BrowserTab tab, int progress) {
    if (!_isLive(tab)) return;
    setState(() => tab.progress = progress / 100);
  }

  Future<void> _injectPageProtection(_BrowserTab tab, Uri? url) async {
    if (_gecko ||
        defaultTargetPlatform != TargetPlatform.android ||
        !_isLive(tab) ||
        !tab.protectionEnabled ||
        !NavigationInput.isWebUri(url)) {
      return;
    }
    final generation = tab.generation;
    final script = await PrivacyProtection.pageScript(url);
    if (!_isLive(tab) ||
        tab.generation != generation ||
        tab.url != url ||
        !tab.protectionEnabled) {
      return;
    }
    await _withController(tab, (controller) async {
      await controller.evaluateJavascript(source: script);
    });
  }

  Future<void> _onPageFinished(_BrowserTab tab, Uri? url) async {
    if (!_isLive(tab) ||
        tab.errorMessage != null ||
        !NavigationInput.isWebUri(url)) {
      return;
    }
    final entry = _SavedPage(title: tab.title, url: url.toString());
    setState(() {
      tab.progress = 1;
      // En incógnito no queda historial.
      if (!tab.incognito) {
        _history.removeWhere((item) => item.url == entry.url);
        _history.insert(0, entry);
        if (_history.length > 100) _history.removeRange(100, _history.length);
      }
    });
    await _injectPageProtection(tab, url);
    if (!tab.incognito) await _savePages('history', _history);
  }

  void _onBlockedResource(_BrowserTab tab, String value) {
    if (!_isLive(tab) ||
        !tab.protectionEnabled ||
        !tab.seenBlockedResources.add(value)) {
      return;
    }
    final kind = PrivacyProtection.classify(value);
    if (kind == null || !mounted) return;
    setState(() {
      if (kind == BlockedKind.advertisement) {
        tab.blockedAds++;
      } else {
        tab.blockedTrackers++;
      }
    });
  }

  bool get _isCurrentFavorite {
    final url = _current.url?.toString();
    return url != null && _favorites.any((item) => item.url == url);
  }

  Future<void> _toggleFavorite() async {
    final url = _current.url;
    if (!NavigationInput.isWebUri(url)) {
      _showMessage('Abrí una página para agregarla a favoritos.');
      return;
    }
    final value = url.toString();
    final existing = _favorites.indexWhere((item) => item.url == value);
    setState(() {
      if (existing >= 0) {
        _favorites.removeAt(existing);
      } else {
        _favorites.insert(0, _SavedPage(title: _current.title, url: value));
      }
    });
    await _savePages('favorites', _favorites);
    _showMessage(
      existing >= 0 ? 'Quitado de favoritos.' : 'Guardado en favoritos.',
    );
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // ---------------------------------------------------------------------------
  // "Tu IA": Patagonia no tiene IA propia. Abre en una pestaña nueva la IA que
  // usa cada persona (ChatGPT, Claude…), sin mandarle nada de la página.
  // ---------------------------------------------------------------------------

  Future<void> _openMyAi() async {
    var destination = TuIA.destino(_myAi);
    if (destination == null) {
      final chosen = await _chooseMyAi();
      if (!chosen || !mounted) return;
      destination = TuIA.destino(_myAi);
      if (destination == null) return;
    }
    _addTab(url: destination);
  }

  /// Devuelve true si quedó elegida una IA.
  Future<bool> _chooseMyAi() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(
                title: Text(
                  'Tu IA',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  'Elegí la IA que usás. Patagonia la abre en una pestaña nueva y no le manda nada de la página.',
                  style: TextStyle(color: _muted),
                ),
              ),
              for (final entry in TuIA.lista.entries)
                ListTile(
                  key: ValueKey('myAi-${entry.key}'),
                  leading: Icon(
                    _myAi == entry.key ? Icons.radio_button_checked : Icons.radio_button_off,
                    color: _blue,
                  ),
                  title: Text(entry.value.nombre),
                  onTap: () => Navigator.pop(sheetContext, entry.key),
                ),
              ListTile(
                key: const ValueKey('myAi-otra'),
                leading: Icon(
                  _myAi.isNotEmpty && !TuIA.lista.containsKey(_myAi)
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: _blue,
                ),
                title: const Text('Otra (pegá la dirección)'),
                onTap: () => Navigator.pop(sheetContext, 'otra'),
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || !mounted) return false;
    if (choice != 'otra') {
      await _setMyAi(choice);
      return true;
    }
    final address = await _askCustomAi();
    if (address == null || !mounted) return false;
    final valid = TuIA.direccionPropia(address);
    if (valid.isEmpty) {
      _showMessage('Esa dirección no es válida. Escribila completa, por ejemplo https://chatgpt.com.');
      return false;
    }
    await _setMyAi(valid);
    return true;
  }

  Future<String?> _askCustomAi() {
    final controller = TextEditingController(
      text: TuIA.lista.containsKey(_myAi) ? '' : _myAi,
    );
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Dirección de tu IA'),
        content: TextField(
          key: const ValueKey('myAi-direccion'),
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(hintText: 'https://…'),
          onSubmitted: (value) => Navigator.pop(dialogContext, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('Guardar'),
          ),
        ],
      ),
    ).whenComplete(controller.dispose);
  }

  Future<void> _setMyAi(String value) async {
    final ai = TuIA.normalizar(value);
    setState(() => _myAi = ai);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_myAiKey, ai);
    } catch (_) {
      _showMessage('No pudimos guardar los cambios en el teléfono.');
    }
  }

  Future<void> _setProtection(_BrowserTab tab, bool enabled) async {
    final host = tab.url?.host.toLowerCase();
    if (!_isLive(tab) || host == null || host.isEmpty) return;
    if (enabled) {
      _unprotectedHosts.remove(host);
    } else {
      _unprotectedHosts.add(host);
    }
    final affected = _tabs
        .where((item) => item.url?.host.toLowerCase() == host)
        .toList();
    setState(() {
      for (final item in affected) {
        item.protectionEnabled = enabled;
        item.resetCounters();
      }
    });
    await _saveStrings('unprotectedHosts', _unprotectedHosts.toList());
    for (final item in affected) {
      await _withController(item, (controller) async {
        await _syncDocumentStartProtection(controller, enabled: enabled);
        await controller.setSettings(settings: _webSettings(item));
        if (_isLive(item) && identical(controller, item.controller)) {
          await controller.reload();
        }
      });
    }
  }

  Future<void> _setDesktopMode(bool enabled) async {
    final tab = _current;
    setState(() => tab.desktopMode = enabled);
    if (_gecko) {
      await tab.gecko?.setDesktop(enabled);
      return;
    }
    await _withController(tab, (controller) async {
      await controller.setSettings(settings: _webSettings(tab));
      if (_isLive(tab) && identical(controller, tab.controller)) {
        await controller.reload();
      }
    });
  }

  InAppWebViewSettings _webSettings(_BrowserTab tab) => InAppWebViewSettings(
    javaScriptEnabled: true,
    domStorageEnabled: true,
    databaseEnabled: true,
    cacheEnabled: true,
    supportZoom: true,
    safeBrowsingEnabled: true,
    allowsBackForwardNavigationGestures: true,
    allowsInlineMediaPlayback: true,
    // Keep WebView audio alive when Home is pressed, another app is opened or
    // the screen is locked. User-initiated playback is still required below.
    allowBackgroundAudioPlaying: true,
    mediaPlaybackRequiresUserGesture: true,
    useShouldOverrideUrlLoading: true,
    useOnRenderProcessGone: true,
    useShouldInterceptRequest: defaultTargetPlatform == TargetPlatform.android,
    thirdPartyCookiesEnabled: !tab.protectionEnabled,
    allowFileAccess: false,
    allowContentAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    supportMultipleWindows: true,
    javaScriptCanOpenWindowsAutomatically: false,
    preferredContentMode: tab.desktopMode
        ? UserPreferredContentMode.DESKTOP
        : UserPreferredContentMode.RECOMMENDED,
    contentBlockers:
        tab.protectionEnabled && defaultTargetPlatform != TargetPlatform.android
        ? PrivacyProtection.rules()
        : [],
  );

  @override
  Widget build(BuildContext context) {
    if (!_preferencesReady) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final fullScreen = _gecko && _current.fullScreen;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _handleSystemBack();
      },
      child: Scaffold(
        body: SafeArea(
          top: !fullScreen,
          bottom: !fullScreen,
          child: Column(
            children: [
              if (!fullScreen) _buildHeader(),
              if (!fullScreen &&
                  _current.progress > 0 &&
                  _current.progress < 1)
                LinearProgressIndicator(
                  value: _current.progress,
                  minHeight: 2,
                  color: _blue,
                  backgroundColor: _surface,
                ),
              Expanded(
                // Con clave: al entrar o salir de pantalla completa la página
                // no se vuelve a crear (no se corta el video).
                key: const ValueKey('pages'),
                child: IndexedStack(
                  index: _currentIndex,
                  children: _tabs
                      .map(
                        (tab) => _gecko
                            ? _buildGeckoTab(tab)
                            : _TabContent(
                          key: ValueKey('${tab.id}:${tab.generation}'),
                          isActive: identical(tab, _current),
                          tab: tab,
                          settings: _webSettings(tab),
                          initialUserScripts: _initialProtectionScripts(tab),
                          onNavigate: _navigate,
                          onController: (controller) {
                            if (_isLive(tab)) tab.controller = controller;
                          },
                          onLoadStart: (url) => _onLoadStart(tab, url),
                          onPrepareNavigation: (url) =>
                              _prepareNavigation(tab, url),
                          onUrlChanged: (url) => _onUrlChanged(tab, url),
                          onTitleChanged: (title) =>
                              _onTitleChanged(tab, title),
                          onProgressChanged: (value) =>
                              _onProgressChanged(tab, value),
                          onPageCommitVisible: (url) =>
                              _injectPageProtection(tab, url),
                          onPageFinished: (url) => _onPageFinished(tab, url),
                          onBlockedResource: (url) =>
                              _onBlockedResource(tab, url),
                          onNewWindow: (action) {
                            if (!_isLive(tab) ||
                                !identical(tab, _current) ||
                                action.hasGesture == false) {
                              return false;
                            }
                            final url = action.request.url;
                            if (url != null &&
                                url.toString() != 'about:blank' &&
                                !NavigationInput.isWebUri(url)) {
                              return false;
                            }
                            _addTab(url: url, windowId: action.windowId);
                            return true;
                          },
                          onRenderProcessGone: () {
                            if (!_isLive(tab)) return;
                            setState(() {
                              tab.controller = null;
                              tab.renderProcessGone = true;
                              tab.windowId = null;
                              tab.errorMessage = 'La página se cerró. Tocá Volver a intentar para abrirla.';
                              tab.progress = 1;
                            });
                          },
                          onCloseWindow: () {
                            if (_isLive(tab)) _closeTabAt(_tabs.indexOf(tab));
                          },
                          onError: (message) {
                            if (_isLive(tab)) {
                              setState(() {
                                tab.errorMessage = message;
                                tab.progress = 1;
                              });
                            }
                          },
                        ),
                      )
                      .toList(),
                ),
              ),
              if (!fullScreen) _buildBottomBar(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF071827), Color(0xFF102D45)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border(bottom: BorderSide(color: Color(0x3350A7D8))),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        child: Column(
          children: [
            Row(
              children: [
                ClipOval(
                  child: Image.asset(
                    'assets/patagonia-emblema.png',
                    width: 34,
                    height: 34,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    _current.incognito ? '🕶️ Incógnito' : 'Patagonia Browser',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                  ),
                ),
                IconButton(
                  tooltip: 'Tu IA',
                  onPressed: _openMyAi,
                  icon: const Icon(Icons.auto_awesome, color: _blue),
                ),
                IconButton(
                  tooltip: 'Centro de Privacidad',
                  onPressed: _showPrivacyCenter,
                  icon: Icon(
                    Icons.shield_outlined,
                    color: _gecko || _current.protectionEnabled
                        ? _green
                        : _muted,
                  ),
                ),
                Semantics(
                  button: true,
                  label: '${_tabs.length} pestañas abiertas',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: _showTabs,
                    child: Container(
                      width: 31,
                      height: 31,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        border: Border.all(color: _muted),
                        borderRadius: BorderRadius.circular(7),
                      ),
                      child: Text(
                        '${_tabs.length}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 7),
            Row(
              children: [
                Expanded(
                  child: Container(
                    height: 46,
                    decoration: BoxDecoration(
                      color: _current.incognito
                          ? const Color(0xD9301E4C)
                          : const Color(0xD90A1D2E),
                      borderRadius: BorderRadius.circular(23),
                      border: Border.all(
                        color: _current.incognito
                            ? _incognitoColor
                            : const Color(0x5550A7D8),
                      ),
                    ),
                    child: TextField(
                      controller: _address,
                      focusNode: _addressFocus,
                      textInputAction: TextInputAction.go,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      enableSuggestions: false,
                      onSubmitted: _navigate,
                      onTap: () => _address.selection = TextSelection(
                        baseOffset: 0,
                        extentOffset: _address.text.length,
                      ),
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        hintText: 'Buscar o escribir una dirección',
                        hintStyle: const TextStyle(color: _muted),
                        prefixIcon: Icon(
                          _current.url == null
                              ? Icons.search
                              : _current.url!.scheme == 'https'
                              ? Icons.lock_outline
                              : Icons.warning_amber_rounded,
                          color: _current.url == null
                              ? _muted
                              : _current.url!.scheme == 'https'
                              ? _green
                              : const Color(0xFFFFC857),
                          size: 21,
                        ),
                        suffixIcon: _current.url == null
                            ? null
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  ?_buildTranslateIcon(),
                                  IconButton(
                                    tooltip: _isCurrentFavorite
                                        ? 'Quitar de favoritos'
                                        : 'Agregar a favoritos',
                                    onPressed: _toggleFavorite,
                                    icon: Icon(
                                      _isCurrentFavorite
                                          ? Icons.star
                                          : Icons.star_border,
                                      color: _isCurrentFavorite
                                          ? const Color(0xFFFFC857)
                                          : _muted,
                                    ),
                                  ),
                                ],
                              ),
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 5),
                IconButton(
                  tooltip: 'Menú',
                  onPressed: _showMenu,
                  icon: const Icon(Icons.more_vert),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomBar() {
    return Container(
      decoration: const BoxDecoration(
        color: _navy,
        border: Border(top: BorderSide(color: Color(0x3350A7D8))),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          IconButton(
            tooltip: 'Atrás',
            onPressed: _goBack,
            icon: const Icon(Icons.arrow_back),
          ),
          IconButton(
            tooltip: 'Adelante',
            onPressed: _goForward,
            icon: const Icon(Icons.arrow_forward),
          ),
          IconButton(
            tooltip: 'Inicio',
            onPressed: _openHome,
            icon: const Icon(Icons.home_outlined),
          ),
          IconButton(
            tooltip: 'Pestañas',
            onPressed: _showTabs,
            icon: const Icon(Icons.tab_outlined),
          ),
          IconButton(
            tooltip: _current.progress > 0 && _current.progress < 1
                ? 'Detener'
                : 'Recargar',
            onPressed: () {
              final tab = _current;
              final gecko = tab.gecko;
              if (_gecko) {
                if (gecko == null) return;
                if (tab.progress > 0 && tab.progress < 1) {
                  gecko.stop();
                  setState(() => tab.progress = 1);
                } else {
                  setState(() => tab.errorMessage = null);
                  gecko.reload();
                }
                return;
              }
              final controller = _current.controller;
              if (controller == null) return;
              if (_current.progress > 0 && _current.progress < 1) {
                _withController(_current, (view) => view.stopLoading());
                setState(() => _current.progress = 1);
              } else {
                _withController(_current, (view) => view.reload());
              }
            },
            icon: Icon(
              _current.progress > 0 && _current.progress < 1
                  ? Icons.close
                  : Icons.refresh,
            ),
          ),
        ],
      ),
    );
  }

  void _showPrivacyCenter() {
    final tab = _current;
    var applying = false;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0x667F9AAF),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 18),
                const Row(
                  children: [
                    Icon(Icons.shield_outlined, color: _green, size: 30),
                    SizedBox(width: 12),
                    Text(
                      'Centro de Privacidad',
                      style: TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                if (_gecko) ..._geckoPrivacyRows(sheetContext, tab),
                if (!_gecko) Material(
                  color: _surface,
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 5,
                    ),
                    child: SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Protección en este sitio'),
                      subtitle: Text(
                        tab.protectionEnabled ? 'Activa' : 'Desactivada',
                        style: TextStyle(
                          color: tab.protectionEnabled ? _green : _muted,
                        ),
                      ),
                      value: tab.protectionEnabled,
                      activeThumbColor: _green,
                      onChanged: applying || tab.url?.host.isNotEmpty != true
                          ? null
                          : (enabled) async {
                              setSheetState(() => applying = true);
                              await _setProtection(tab, enabled);
                              if (sheetContext.mounted) {
                                setSheetState(() => applying = false);
                              }
                            },
                    ),
                  ),
                ),
                if (!_gecko) const SizedBox(height: 18),
                if (!_gecko) _PrivacyRow(
                  icon: Icons.block,
                  color: const Color(0xFFFF5353),
                  label: 'Anuncios bloqueados',
                  value: defaultTargetPlatform == TargetPlatform.android
                      ? tab.blockedAds
                      : null,
                ),
                if (!_gecko) _PrivacyRow(
                  icon: Icons.visibility_outlined,
                  color: _green,
                  label: 'Rastreadores bloqueados',
                  value: defaultTargetPlatform == TargetPlatform.android
                      ? tab.blockedTrackers
                      : null,
                ),
                const Divider(height: 28, color: Color(0x336F8DA5)),
                if (!_gecko && defaultTargetPlatform != TargetPlatform.android)
                  const Text(
                    'El motor de iPhone no informa el número de bloqueos.',
                    style: TextStyle(color: _muted),
                  ),
                const SizedBox(height: 18),
                Text(
                  _gecko
                      ? 'Patagonia usa uBlock Origin para bloquear anuncios y rastreadores antes de que carguen. Los permisos de cámara, micrófono y ubicación se preguntan por separado.'
                      : 'Patagonia bloquea redes publicitarias y rastreadores conocidos antes de que carguen. Los permisos de cámara, micrófono y ubicación se preguntan por separado.',
                  style: const TextStyle(color: _muted, height: 1.4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showTabs() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .72,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Pestañas',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      FilledButton.icon(
                        onPressed: () {
                          _addTab();
                          Navigator.pop(sheetContext);
                        },
                        icon: const Icon(Icons.add),
                        label: const Text('Nueva'),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(10),
                    itemCount: _tabs.length,
                    itemBuilder: (context, index) {
                      final tab = _tabs[index];
                      return Card(
                        color: index == _currentIndex
                            ? _surfaceLight
                            : _surface,
                        child: ListTile(
                          leading: tab.incognito
                              ? const Icon(Icons.visibility_off, color: _incognitoColor)
                              : tab.url == null
                              ? ClipOval(
                                  child: Image.asset(
                                    'assets/patagonia-emblema.png',
                                    width: 32,
                                    height: 32,
                                  ),
                                )
                              : const Icon(Icons.public, color: _blue),
                          title: Text(
                            tab.incognito ? 'Incógnito · ${tab.title}' : tab.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            tab.url?.host ?? 'Inicio de Patagonia',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () {
                            _selectTab(index);
                            Navigator.pop(sheetContext);
                          },
                          trailing: IconButton(
                            tooltip: 'Cerrar pestaña',
                            onPressed: () {
                              _closeTabAt(index);
                              setSheetState(() {});
                            },
                            icon: const Icon(Icons.close),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showMenu() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _MenuTile(
                icon: Icons.add_box_outlined,
                label: 'Nueva pestaña',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _addTab();
                },
              ),
              if (_gecko)
                _MenuTile(
                  icon: Icons.visibility_off_outlined,
                  label: 'Nueva pestaña de incógnito',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _addTab(incognito: true);
                  },
                ),
              _MenuTile(
                icon: _isCurrentFavorite ? Icons.star : Icons.star_border,
                label: _isCurrentFavorite
                    ? 'Quitar de favoritos'
                    : 'Agregar a favoritos',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _toggleFavorite();
                },
              ),
              _MenuTile(
                icon: Icons.bookmarks_outlined,
                label: 'Favoritos',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showSavedPages('Favoritos', _favorites);
                },
              ),
              _MenuTile(
                icon: Icons.history,
                label: 'Historial',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showSavedPages('Historial', _history);
                },
              ),
              if (_gecko)
                ValueListenableBuilder<List<Descarga>>(
                  valueListenable: _downloads,
                  builder: (context, lista, _) {
                    final bajando = lista.where((d) => d.bajando).length;
                    return _MenuTile(
                      icon: Icons.download_outlined,
                      label: bajando == 0
                          ? 'Descargas'
                          : 'Descargas ($bajando en curso)',
                      onTap: () {
                        Navigator.pop(sheetContext);
                        _showDownloads();
                      },
                    );
                  },
                ),
              SwitchListTile(
                secondary: const Icon(Icons.desktop_windows_outlined),
                title: const Text('Sitio de escritorio'),
                value: _current.desktopMode,
                activeThumbColor: _blue,
                onChanged: (enabled) {
                  Navigator.pop(sheetContext);
                  _setDesktopMode(enabled);
                },
              ),
              if (_gecko && _current.url != null) ...[
                _MenuTile(
                  icon: Icons.share_outlined,
                  label: 'Compartir',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _shareCurrent();
                  },
                ),
                _MenuTile(
                  icon: Icons.add_to_home_screen,
                  label: 'Agregar a la pantalla de inicio',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _addShortcut();
                  },
                ),
                _MenuTile(
                  icon: Icons.print_outlined,
                  label: 'Imprimir o guardar PDF',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _printCurrent();
                  },
                ),
                _MenuTile(
                  icon: Icons.chrome_reader_mode_outlined,
                  label: 'Modo lectura',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _openReader();
                  },
                ),
                _MenuTile(
                  icon: Icons.translate,
                  label: 'Traducir página',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _translateCurrent();
                  },
                ),
              ],
              _MenuTile(
                icon: Icons.auto_awesome,
                label: 'Tu IA',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _openMyAi();
                },
              ),
              _MenuTile(
                icon: Icons.shield_outlined,
                label: 'Centro de Privacidad',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showPrivacyCenter();
                },
              ),
              _MenuTile(
                icon: Icons.settings_outlined,
                label: 'Configuración',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showSettings();
                },
              ),
              _MenuTile(
                icon: Icons.policy_outlined,
                label: 'Política de privacidad',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _navigate(_privacyPolicyUrl);
                },
              ),
              _MenuTile(
                icon: Icons.info_outline,
                label: 'Acerca de y licencias',
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showAbout();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }


  // ---------------------------------------------------------------------------
  // Lo que se sumó desde la PC: configuración, traductor, modo lectura,
  // menú de mantener apretado, compartir y aviso de versión nueva.
  // ---------------------------------------------------------------------------

  Future<void> _saveBool(String key, bool value) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(key, value);
    } catch (_) {
      _showMessage('No pudimos guardar los cambios en el teléfono.');
    }
  }

  Future<void> _setKidsMode(bool enabled) async {
    setState(() => _kidsMode = enabled);
    await _saveBool(_kidsModeKey, enabled);
    if (_gecko) {
      await GeckoEngineInfo.setKidsMode(enabled);
      // La página abierta se recarga para que valga al toque.
      if (_current.url != null) await _current.gecko?.reload();
    }
    _showMessage(enabled ? 'Modo chicos activado.' : 'Modo chicos desactivado.');
  }

  Future<void> _setSearchEngine(SearchEngine engine) async {
    setState(() => _searchEngine = engine);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_searchEngineKey, engine.id);
    } catch (_) {
      _showMessage('No pudimos guardar los cambios en el teléfono.');
      return;
    }
    _showMessage('Buscador: ${engine.label}.');
  }

  Future<void> _setLargeText(bool enabled) async {
    setState(() => _largeText = enabled);
    await _saveBool(_largeTextKey, enabled);
    if (_gecko) await GeckoEngineInfo.setLargeText(enabled);
  }

  Future<void> _setAlwaysTranslate(bool enabled) async {
    setState(() => _alwaysTranslate = enabled);
    await _saveBool(_alwaysTranslateKey, enabled);
  }

  Future<void> _setWindSound(bool enabled) async {
    setState(() => _windSound = enabled);
    await _saveBool(_windSoundKey, enabled);
  }

  Future<void> _setRestoreTabs(bool enabled) async {
    setState(() => _restoreTabs = enabled);
    await _saveBool(_restoreTabsKey, enabled);
  }

  Future<void> _setUpdateNotices(bool enabled) async {
    setState(() {
      _updateNotices = enabled;
      if (!enabled) _availableUpdate = null;
    });
    await _saveBool(_updateNoticesKey, enabled);
    if (enabled) await _checkForUpdate(force: true);
  }

  /// Una vez por día como mucho: si en GitHub hay una versión de celular más nueva, avisa.
  Future<void> _checkForUpdate({bool force = false}) async {
    if (!_gecko) return;
    var installed = await GeckoEngineInfo.appVersion();
    if (installed == null || !mounted) return;
    if (_installedVersion != installed) setState(() => _installedVersion = installed);
    if (!_updateNotices) return;
    // "Patagonia Pruebas" (versión -prueba) siempre ofrece la última oficial: así se
    // puede probar el aviso y la instalación directa sin esperar a otra versión.
    if (installed.contains('-prueba')) installed = '0.0.0';
    SharedPreferences? preferences;
    try {
      preferences = await SharedPreferences.getInstance();
      final last = preferences.getInt(_lastUpdateCheckKey) ?? 0;
      final now = DateTime.now().millisecondsSinceEpoch;
      if (!force && now - last < const Duration(hours: 20).inMilliseconds) {
        final known = preferences.getString('latestMobileVersion');
        final tag = preferences.getString('latestMobileTag');
        final apk = preferences.getString('latestMobileApk');
        if (known != null && tag != null && UpdateCheck.isNewer(known, installed)) {
          if (mounted) {
            setState(
              () => _availableUpdate = MobileRelease(
                version: known,
                tag: tag,
                apkUrl: UpdateCheck.isValidApkUrl(apk) ? apk : null,
              ),
            );
          }
        }
        return;
      }
      await preferences.setInt(_lastUpdateCheckKey, now);
    } catch (_) {
      // Sin preferencias igual se consulta.
    }
    final latest =
        await (BrowserShell.debugLatestRelease ?? UpdateCheck.fetchLatest)();
    if (latest == null || !mounted) return;
    try {
      await preferences?.setString('latestMobileVersion', latest.version);
      await preferences?.setString('latestMobileTag', latest.tag);
      final apk = latest.apkUrl;
      if (apk == null) {
        await preferences?.remove('latestMobileApk');
      } else {
        await preferences?.setString('latestMobileApk', apk);
      }
    } catch (_) {
      // No pasa nada: mañana se vuelve a consultar.
    }
    if (UpdateCheck.isNewer(latest.version, installed) && mounted) {
      setState(() => _availableUpdate = latest);
    }
  }

  /// Tocar el aviso baja la versión nueva y abre el instalador de Android, sin pasar
  /// por GitHub. Si algo falla, queda el camino de antes: la página del release.
  Future<void> _openUpdatePage() async {
    final update = _availableUpdate;
    if (update == null || _installingUpdate) return;
    final apk = update.apkUrl;
    if (apk == null) return _openReleasePage(update);
    setState(() => _installingUpdate = true);
    _showMessage(
      'Bajando Patagonia ${update.version}… Tarda un ratito (unos 100 MB). Podés seguir navegando.',
    );
    final result = await GeckoEngineInfo.installUpdate(apk);
    if (!mounted) return;
    setState(() => _installingUpdate = false);
    switch (result) {
      case 'instalando':
        _showMessage('Tocá "Instalar". Se instala arriba, sin perder favoritos ni historial.');
      case 'permiso':
        _showMessage(
          'Activá "Permitir de esta fuente" para Patagonia, volvé y tocá el aviso de nuevo.',
        );
      case 'ocupado':
        _showMessage('Ya se está bajando la versión nueva. Esperá un momento.');
      default:
        _openReleasePage(update);
    }
  }

  void _openReleasePage(MobileRelease update) {
    _addTab(url: Uri.parse(update.pageUrl));
    _showMessage(
      'No se pudo bajar solo. Bajá el archivo .apk de "Assets" y abrilo: tus favoritos no se pierden.',
    );
  }

  Future<void> _copyText(String text, String message) async {
    await Clipboard.setData(ClipboardData(text: text));
    _showMessage(message);
  }

  Future<void> _share(String text, {String? title}) async {
    final shared = _gecko && await GeckoEngineInfo.share(text, title: title);
    if (!shared) await _copyText(text, 'Dirección copiada.');
  }

  /// Lo mismo que "Crear app de esta página" en la PC: un ícono del sitio en el inicio.
  Future<void> _addShortcut() async {
    final url = _current.url;
    if (!NavigationInput.isWebUri(url)) {
      _showMessage('Abrí una página para agregarla al inicio.');
      return;
    }
    final title = _current.title.trim().isEmpty ? url!.host : _current.title;
    final ok = await GeckoEngineInfo.addShortcut(url.toString(), title);
    if (!ok) {
      _showMessage('Tu celular no permite agregar accesos directos desde Patagonia.');
    }
    // Si sale bien, Android muestra su propio aviso para confirmar.
  }

  /// Abrir el sitio de un acceso directo cuando Patagonia ya estaba abierta.
  void _openFromShortcut(String url) {
    if (!mounted) return;
    final uri = Uri.tryParse(url);
    if (uri == null || !NavigationInput.isWebUri(uri)) return;
    _addTab(url: uri);
  }

  /// Imprimir o guardar como PDF (como Ctrl+P en la PC).
  Future<void> _printCurrent() async {
    final gecko = _current.gecko;
    if (gecko == null || !NavigationInput.isWebUri(_current.url)) {
      _showMessage('Abrí una página para imprimirla.');
      return;
    }
    _showMessage('Preparando la página…');
    final ok = await gecko.printPage(_current.title);
    if (!ok && mounted) _showMessage('No se pudo preparar la página para imprimir.');
  }

  /// Favoritos al archivo, para pasarlos a la PC (o a otro celular) sin cuenta ni nube.
  Future<void> _exportFavorites() async {
    if (_favorites.isEmpty) {
      _showMessage('Todavía no hay favoritos para exportar.');
      return;
    }
    final text = FavoritosArchivo.exportar(
      _favorites.map((page) => (titulo: page.title, url: page.url)),
    );
    final ok = await GeckoEngineInfo.saveTextFile(FavoritosArchivo.nombre, text);
    if (ok) _showMessage('Favoritos guardados. Pasá el archivo a la PC y usá Importar.');
  }

  /// Favoritos desde un archivo de la PC (o de otro navegador). No repite los que ya están.
  Future<void> _importFavorites() async {
    final text = await GeckoEngineInfo.openTextFile();
    if (text == null || !mounted) return;
    final pages = FavoritosArchivo.leer(text);
    if (pages.isEmpty) {
      _showMessage('Ese archivo no tiene favoritos.');
      return;
    }
    final known = _favorites.map((page) => page.url).toSet();
    var added = 0;
    setState(() {
      for (final page in pages) {
        if (!known.add(page.url)) continue;
        _favorites.add(_SavedPage(title: page.titulo, url: page.url));
        added++;
      }
    });
    if (added > 0) await _savePages('favorites', _favorites);
    _showMessage(
      added > 0
          ? 'Se agregaron $added favoritos.'
          : 'Esos favoritos ya estaban guardados.',
    );
  }

  /// Un enlace que abre otra app del celular (WhatsApp, Spotify, "Abrir Claude"…).
  /// La página pide, el usuario decide: igual que en la PC.
  Future<void> _openExternalLink(_BrowserTab tab, String url) async {
    final link = ProtocolosExternos.clasificar(url);
    if (link.tipo != TipoEnlace.externo) return;
    final site = tab.url?.host ?? '';
    final key = '$site|${link.esquema}';
    final app = ProtocolosExternos.nombreDe(link.esquema);
    if (!_allowedExternal.contains(key)) {
      // Un solo aviso por vez: si no, una página puede llenar la pantalla.
      if (_askingExternal) return;
      _askingExternal = true;
      var always = false;
      bool? allowed;
      try {
        allowed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => StatefulBuilder(
            builder: (builderContext, setDialogState) => AlertDialog(
              icon: const Icon(Icons.open_in_new, color: _blue),
              title: const Text('Abrir otra aplicación'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    site.isEmpty
                        ? 'Esta página quiere abrir $app.'
                        : '$site quiere abrir $app.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Enlace: ${link.resumen}',
                    style: Theme.of(builderContext).textTheme.bodySmall,
                  ),
                  if (site.isNotEmpty)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: always,
                      onChanged: (value) =>
                          setDialogState(() => always = value ?? false),
                      title: Text('Permitir siempre a $site'),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Abrir'),
                ),
              ],
            ),
          ),
        );
      } finally {
        _askingExternal = false;
      }
      if (allowed != true || !mounted) return;
      if (always && site.isNotEmpty) _allowedExternal.add(key);
    }
    final gecko = tab.gecko;
    if (gecko == null) return;
    final opened = await gecko.openExternal(url);
    if (!opened && mounted) {
      _showMessage('No encontramos una aplicación para abrir $app.');
    }
  }

  Future<void> _shareCurrent() async {
    final url = _current.url;
    if (!NavigationInput.isWebUri(url)) {
      _showMessage('Abrí una página para compartirla.');
      return;
    }
    await _share(url.toString(), title: _current.title);
  }

  /// Abre una pestaña nueva sin dejar la que se está leyendo.
  void _addBackgroundTab(Uri url) {
    final current = _current;
    setState(() {
      _tabs.add(_BrowserTab(id: _nextTabId++, url: url));
      _currentIndex = _tabs.indexOf(current);
    });
    _syncActiveTab();
    if (!mounted) return;
    final tab = _tabs.last;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: const Text('Se abrió en una pestaña nueva.'),
          action: SnackBarAction(
            label: 'Ver',
            onPressed: () => _selectTab(_tabs.indexOf(tab)),
          ),
        ),
      );
  }

  void _searchText(String text) {
    _addTab(url: _searchEngine.search(text));
  }

  void _showContextMenu(_BrowserTab tab, GeckoContextMenu menu) {
    if (!_isLive(tab) || !identical(tab, _current)) return;
    final link = menu.hasLink ? Uri.tryParse(menu.link!) : null;
    final image = menu.isImage ? Uri.tryParse(menu.src!) : null;
    final webLink = NavigationInput.isWebUri(link) ? link : null;
    final webImage = NavigationInput.isWebUri(image) ? image : null;
    if (webLink == null && webImage == null) return;
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        void run(VoidCallback action) {
          Navigator.pop(sheetContext);
          action();
        }

        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 6, 20, 8),
                  child: Text(
                    (webLink ?? webImage).toString(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: _muted, fontSize: 13),
                  ),
                ),
                if (webLink != null) ...[
                  _MenuTile(
                    icon: Icons.open_in_new,
                    label: 'Abrir en pestaña nueva',
                    onTap: () => run(() => _addBackgroundTab(webLink)),
                  ),
                  _MenuTile(
                    icon: Icons.link,
                    label: 'Copiar dirección del enlace',
                    onTap: () => run(
                      () => _copyText(webLink.toString(), 'Dirección copiada.'),
                    ),
                  ),
                  _MenuTile(
                    icon: Icons.share_outlined,
                    label: 'Compartir enlace',
                    onTap: () => run(() => _share(webLink.toString())),
                  ),
                ],
                if (webImage != null) ...[
                  if (webLink != null) const Divider(color: Color(0x336F8DA5)),
                  _MenuTile(
                    icon: Icons.image_outlined,
                    label: 'Abrir imagen en pestaña nueva',
                    onTap: () => run(() => _addBackgroundTab(webImage)),
                  ),
                  _MenuTile(
                    icon: Icons.download_outlined,
                    label: 'Guardar imagen',
                    onTap: () => run(() => tab.gecko?.saveUrl(webImage.toString())),
                  ),
                  _MenuTile(
                    icon: Icons.copy_outlined,
                    label: 'Copiar dirección de la imagen',
                    onTap: () => run(
                      () => _copyText(webImage.toString(), 'Dirección copiada.'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _openReader() async {
    final tab = _current;
    final gecko = tab.gecko;
    if (!_gecko || gecko == null || !NavigationInput.isWebUri(tab.url)) {
      _showMessage('Abrí una nota o artículo para leerlo en modo lectura.');
      return;
    }
    final article = ReaderArticle.fromJson(await gecko.readArticle());
    if (!mounted) return;
    if (article == null) {
      _showMessage('Esta página no tiene una nota para mostrar en modo lectura.');
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => ReaderPage(
          article: article,
          largeText: _largeText,
          showImages: !BrowserShell.debugNoNetworkImages,
        ),
      ),
    );
  }

  // Traductor ------------------------------------------------------------------

  void _onTranslation(_BrowserTab tab, GeckoTranslationState state) {
    if (!_isLive(tab)) return;
    setState(() {
      tab.translation = state;
      if (state.from != null) tab.translating = false;
    });
    final bar = Translation.barFor(state);
    final url = tab.url;
    final host = url?.host.toLowerCase();
    if (bar?.kind != TranslationBarKind.offer ||
        !_alwaysTranslate ||
        url == null ||
        _neverTranslateHosts.contains(host) ||
        tab.autoTranslatedUrl == url) {
      return;
    }
    tab.autoTranslatedUrl = url;
    _translate(tab, bar!.language);
  }

  Future<void> _translate(_BrowserTab tab, String from) async {
    final gecko = tab.gecko;
    if (gecko == null || !_isLive(tab)) return;
    setState(() {
      tab.translating = true;
      tab.translationHidden = false;
    });
    await gecko.translate(from, to: Translation.target);
  }

  Future<void> _translateCurrent() async {
    final tab = _current;
    final bar = Translation.barFor(tab.translation);
    if (!_gecko || tab.gecko == null || tab.url == null) {
      _showMessage('Abrí una página para traducirla.');
      return;
    }
    if (bar == null) {
      _showMessage(
        tab.translation?.docLang == null
            ? 'Todavía no se sabe en qué idioma está la página. Esperá a que termine de cargar.'
            : 'Esta página ya está en castellano o en un idioma que el traductor no conoce.',
      );
      return;
    }
    if (bar.kind != TranslationBarKind.offer) {
      setState(() => tab.translationHidden = false);
      return;
    }
    await _translate(tab, bar.language);
  }

  Future<void> _neverTranslateHere(_BrowserTab tab) async {
    final host = tab.url?.host.toLowerCase();
    if (host == null || host.isEmpty) return;
    setState(() {
      _neverTranslateHosts.add(host);
      tab.translationHidden = true;
    });
    await _saveStrings(_neverTranslateKey, _neverTranslateHosts.toList());
    _showMessage('Listo: en $host no se ofrece traducir.');
  }

  /// Traductor (desde la 1.4.0): un ícono chico en la barra de direcciones en lugar de
  /// una barra encima de la página. Al tocarlo se abren las opciones.
  Widget? _buildTranslateIcon() {
    final tab = _current;
    if (!_gecko || tab.url == null) return null;
    final bar = Translation.barFor(tab.translation);
    if (bar == null) return null;
    final host = tab.url!.host.toLowerCase();
    if (bar.kind == TranslationBarKind.offer &&
        !tab.translating &&
        _neverTranslateHosts.contains(host)) {
      return null;
    }
    final translating =
        tab.translating || bar.kind == TranslationBarKind.translating;
    final translated = bar.kind == TranslationBarKind.translated;
    return IconButton(
      key: const ValueKey('icono-traductor'),
      tooltip: translating
          ? 'Traduciendo…'
          : translated
          ? 'Traducida. Tocá para ver el original'
          : 'Traducir esta página',
      onPressed: () => _showTranslationOptions(tab, bar),
      icon: translating
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFFFFC07A),
              ),
            )
          : Icon(
              translated ? Icons.g_translate : Icons.translate,
              color: const Color(0xFFFFC07A),
              size: 21,
            ),
    );
  }

  void _showTranslationOptions(_BrowserTab tab, TranslationBar bar) {
    final host = tab.url?.host ?? '';
    final idioma = Translation.languageName(bar.language);
    final translating =
        tab.translating || bar.kind == TranslationBarKind.translating;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.translate, color: Color(0xFFFFC07A)),
              title: Text(
                translating ? 'Traduciendo del $idioma…' : bar.message,
              ),
              subtitle: const Text(
                'Se traduce en el teléfono, sin mandar la página a internet.',
              ),
            ),
            if (bar.kind == TranslationBarKind.offer && !translating)
              ListTile(
                leading: const Icon(Icons.check_circle_outline, color: _blue),
                title: const Text('Traducir al español'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _translate(tab, bar.language);
                },
              )
            else
              ListTile(
                leading: const Icon(Icons.undo, color: _blue),
                title: const Text('Mostrar original'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  setState(() => tab.translating = false);
                  tab.gecko?.restoreTranslation();
                },
              ),
            SwitchListTile(
              secondary: const Icon(Icons.autorenew, color: _blue),
              title: const Text('Siempre traducir al español'),
              value: _alwaysTranslate,
              onChanged: (value) {
                Navigator.pop(sheetContext);
                _setAlwaysTranslate(value);
                if (value && bar.kind == TranslationBarKind.offer) {
                  _translate(tab, bar.language);
                }
              },
            ),
            if (host.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.block, color: _muted),
                title: Text('No traducir nunca en $host'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _neverTranslateHere(tab);
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStartPage({bool incognito = false}) => _StartPage(
    onNavigate: _navigate,
    incognito: incognito,
    onWhatsApp: () async {
      if (!await GeckoEngineInfo.openWhatsApp()) {
        _showMessage('No encontramos WhatsApp instalado en este teléfono.');
      }
    },
    kidsMode: _kidsMode,
    update: _availableUpdate,
    onUpdate: _openUpdatePage,
  );

  Future<void> _showSettings() async {
    if (_gecko) {
      final isDefault = await GeckoEngineInfo.isDefaultBrowser();
      if (!mounted) return;
      _isDefaultBrowser = isDefault;
    }
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          Future<void> toggle(Future<void> Function(bool) apply, bool value) async {
            await apply(value);
            if (sheetContext.mounted) setSheetState(() {});
          }

          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(8, 14, 8, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: Row(
                      children: [
                        Icon(Icons.settings_outlined, color: _blue, size: 28),
                        SizedBox(width: 12),
                        Text(
                          'Configuración',
                          style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.child_care_outlined),
                    title: const Text('Modo chicos'),
                    subtitle: const Text(
                      'Bloquea sitios para adultos, fuerza la búsqueda segura y pone YouTube en modo restringido.',
                      style: TextStyle(color: _muted),
                    ),
                    value: _kidsMode,
                    activeThumbColor: _green,
                    onChanged: _gecko ? (value) => toggle(_setKidsMode, value) : null,
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.format_size),
                    title: const Text('Letra grande'),
                    subtitle: const Text(
                      'Las páginas se ven con la letra al 125 %.',
                      style: TextStyle(color: _muted),
                    ),
                    value: _largeText,
                    activeThumbColor: _blue,
                    onChanged: _gecko ? (value) => toggle(_setLargeText, value) : null,
                  ),
                  ListTile(
                    leading: const Icon(Icons.search),
                    title: const Text('Buscador'),
                    subtitle: const Text(
                      'Brave Search usa su propio índice: no depende de Google ni de Microsoft. DuckDuckGo queda de respaldo.',
                      style: TextStyle(color: _muted),
                    ),
                    trailing: DropdownButton<SearchEngine>(
                      key: const ValueKey('searchEngine'),
                      value: _searchEngine,
                      dropdownColor: _navy,
                      underline: const SizedBox.shrink(),
                      items: [
                        for (final engine in SearchEngine.values)
                          DropdownMenuItem(
                            value: engine,
                            child: Text(
                              engine == SearchEngine.brave ? 'Brave' : engine.label,
                            ),
                          ),
                      ],
                      onChanged: (engine) async {
                        if (engine == null || engine == _searchEngine) return;
                        await _setSearchEngine(engine);
                        if (sheetContext.mounted) setSheetState(() {});
                      },
                    ),
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.translate),
                    title: const Text('Siempre traducir'),
                    subtitle: const Text(
                      'Las páginas en otro idioma se traducen solas al castellano, en el teléfono.',
                      style: TextStyle(color: _muted),
                    ),
                    value: _alwaysTranslate,
                    activeThumbColor: _blue,
                    onChanged: _gecko
                        ? (value) => toggle(_setAlwaysTranslate, value)
                        : null,
                  ),
                  if (_neverTranslateHosts.isNotEmpty)
                    ListTile(
                      leading: const Icon(Icons.do_not_disturb_on_outlined),
                      title: const Text('Sitios sin traductor'),
                      subtitle: Text(
                        (_neverTranslateHosts.toList()..sort()).join(', '),
                        style: const TextStyle(color: _muted),
                      ),
                      trailing: TextButton(
                        onPressed: () async {
                          setState(() => _neverTranslateHosts.clear());
                          setSheetState(() {});
                          await _saveStrings(_neverTranslateKey, const []);
                        },
                        child: const Text('Borrar'),
                      ),
                    ),
                  ListTile(
                    key: const ValueKey('myAiSetting'),
                    leading: const Icon(Icons.auto_awesome),
                    title: const Text('Tu IA'),
                    subtitle: Text(
                      '${TuIA.nombre(_myAi)} · se abre en una pestaña nueva, sin mandarle nada de la página.',
                      style: const TextStyle(color: _muted),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await _chooseMyAi();
                      if (sheetContext.mounted) setSheetState(() {});
                    },
                  ),
                  SwitchListTile(
                    key: const ValueKey('windSound'),
                    secondary: const Icon(Icons.air),
                    title: const Text('Sonido de viento al buscar'),
                    subtitle: const Text(
                      'Una ráfaga cortita cada vez que buscás algo. No suena al abrir una dirección.',
                      style: TextStyle(color: _muted),
                    ),
                    value: _windSound,
                    activeThumbColor: _blue,
                    onChanged: _gecko ? (value) => toggle(_setWindSound, value) : null,
                  ),
                  SwitchListTile(
                    key: const ValueKey('restoreTabs'),
                    secondary: const Icon(Icons.restore_page_outlined),
                    title: const Text('Recuperar pestañas al abrir Patagonia'),
                    subtitle: const Text(
                      'Si la desactivás, Patagonia arranca en el inicio. Las de incógnito nunca se guardan.',
                      style: TextStyle(color: _muted),
                    ),
                    value: _restoreTabs,
                    activeThumbColor: _blue,
                    onChanged: (value) => toggle(_setRestoreTabs, value),
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.system_update_outlined),
                    title: const Text('Avisar si hay versión nueva'),
                    subtitle: const Text(
                      'Consulta GitHub una vez por día. No manda ningún dato tuyo.',
                      style: TextStyle(color: _muted),
                    ),
                    value: _updateNotices,
                    activeThumbColor: _blue,
                    onChanged: _gecko
                        ? (value) => toggle(_setUpdateNotices, value)
                        : null,
                  ),
                  ListTile(
                    key: const ValueKey('defaultBrowser'),
                    leading: const Icon(Icons.open_in_browser),
                    title: const Text('Navegador predeterminado'),
                    subtitle: Text(
                      _isDefaultBrowser
                          ? 'Patagonia ya abre los links de WhatsApp, el mail y otras apps.'
                          : 'Hacé que los links de WhatsApp, el mail y otras apps se abran en Patagonia.',
                      style: const TextStyle(color: _muted),
                    ),
                    trailing: _isDefaultBrowser
                        ? const Icon(Icons.check_circle, color: _green)
                        : TextButton(
                            onPressed: _gecko
                                ? () async {
                                    Navigator.of(sheetContext).pop();
                                    final ok = await GeckoEngineInfo.makeDefaultBrowser();
                                    if (!ok && mounted) {
                                      _showMessage(
                                        'Elegilo en Ajustes → Apps → Apps predeterminadas → Navegador.',
                                      );
                                    }
                                  }
                                : null,
                            child: const Text('Usar Patagonia'),
                          ),
                  ),
                  ListTile(
                    key: const ValueKey('appVersion'),
                    leading: const Icon(Icons.info_outline),
                    title: const Text('Versión'),
                    subtitle: Text(
                      _installedVersion == null
                          ? 'Patagonia Browser'
                          : 'Patagonia Browser ${_installedVersion!}',
                      style: const TextStyle(color: _muted),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Motor Gecko (Android): pestañas, permisos, uBlock Origin y licencias.
  // ---------------------------------------------------------------------------

  Widget _buildGeckoTab(_BrowserTab tab) {
    final key = ValueKey('${tab.id}:${tab.generation}');
    if (tab.url == null && tab.windowId == null) {
      return KeyedSubtree(key: key, child: _buildStartPage(incognito: tab.incognito));
    }
    final generation = tab.generation;
    return Stack(
      key: key,
      children: [
        if (!tab.renderProcessGone)
          GeckoBrowserView(
            initialUrl: tab.windowId == null ? tab.url?.toString() : null,
            windowId: tab.windowId,
            desktop: tab.desktopMode,
            incognito: tab.incognito,
            active: identical(tab, _current),
            events: _geckoEvents(tab, generation),
            onCreated: (controller) {
              if (!_isLive(tab) || tab.generation != generation) {
                controller.dispose();
                return;
              }
              tab.gecko = controller;
              controller.setActive(identical(tab, _current));
              final pending = tab.pendingLoad;
              tab.pendingLoad = null;
              if (pending != null) controller.load(pending.toString());
            },
          ),
        if (tab.errorMessage != null)
          _PageError(tab: tab, onNavigate: _navigate),
      ],
    );
  }

  GeckoEvents _geckoEvents(_BrowserTab tab, int generation) {
    bool alive() => _isLive(tab) && tab.generation == generation;
    return GeckoEvents(
      onLocation: (value) {
        if (!alive()) return;
        final url = Uri.tryParse(value);
        if (!NavigationInput.isWebUri(url)) return;
        setState(() {
          tab.url = url;
          if (identical(tab, _current) && !_addressFocus.hasFocus) {
            _address.text = url.toString();
          }
        });
      },
      onTitle: (title) {
        if (alive()) _onTitleChanged(tab, title);
      },
      onProgress: (value) {
        if (alive() && value > 0 && value < 100) _onProgressChanged(tab, value);
      },
      onCanGoBack: (value) {
        if (alive()) setState(() => tab.canGoBack = value);
      },
      onCanGoForward: (value) {
        if (alive()) setState(() => tab.canGoForward = value);
      },
      onPageStart: (value) {
        if (!alive()) return;
        tab.navigation++;
        final url = Uri.tryParse(value);
        setState(() {
          // La página de error vacía que pone Gecko no borra el aviso de Patagonia.
          if (NavigationInput.isWebUri(url)) tab.errorMessage = null;
          tab.progress = .05;
          tab.resetTranslation();
        });
      },
      onPageStop: (success) {
        if (!alive()) return;
        if (success) {
          _onPageFinished(tab, tab.url);
        } else {
          setState(() => tab.progress = 1);
        }
      },
      onLoadError: (_) {
        if (!alive()) return;
        setState(() {
          tab.errorMessage =
              'No pudimos abrir esta página. Revisá la conexión e intentá otra vez.';
          tab.progress = 1;
        });
      },
      onFullScreen: (full) {
        if (!alive()) return;
        setState(() => tab.fullScreen = full);
        if (identical(tab, _current)) _setImmersive(full);
      },
      onCrash: () {
        if (!alive()) return;
        if (tab.fullScreen && identical(tab, _current)) _setImmersive(false);
        setState(() {
          tab.disposeGecko();
          tab.renderProcessGone = true;
          tab.windowId = null;
          tab.errorMessage =
              'La página se cerró. Tocá Volver a intentar para abrirla.';
          tab.progress = 1;
        });
      },
      onCloseRequest: () {
        if (alive()) _closeTabAt(_tabs.indexOf(tab));
      },
      onNewWindow: (id, value) async {
        if (!alive() || !identical(tab, _current)) return false;
        final url = Uri.tryParse(value);
        final web = NavigationInput.isWebUri(url);
        if (value.isNotEmpty && value != 'about:blank' && !web) return false;
        // Lo que se abre desde una pestaña de incógnito también es de incógnito.
        _addTab(url: web ? url : null, windowId: id, incognito: tab.incognito);
        return true;
      },
      onPermission: (origin, kinds) async =>
          alive() && await _askGeckoPermission(tab, origin, kinds),
      onContextMenu: (menu) {
        if (alive()) _showContextMenu(tab, menu);
      },
      onSearchText: (text) {
        if (alive()) _searchText(text);
      },
      onTranslation: (state) {
        if (alive()) _onTranslation(tab, state);
      },
      onTranslationError: (_) {
        if (!alive()) return;
        setState(() => tab.translating = false);
        _showMessage('No se pudo traducir la página. Revisá la conexión e intentá otra vez.');
      },
      onExternalLink: (url) {
        if (alive()) _openExternalLink(tab, url);
      },
      onDownload: (status, name, id) {
        if (!alive()) return;
        switch (status) {
          case 'start':
            _showMessage('Descargando $name… Lo ves en Menú → Descargas.');
          case 'done':
            _showDownloadReady(name, id);
          case 'cancel':
            _showMessage('Descarga cancelada: $name.');
          default:
            _showMessage('No se pudo descargar $name.');
        }
      },
    );
  }

  bool _canGrant(_BrowserTab tab, String origin, int navigation) =>
      _isLive(tab) &&
      identical(tab, _current) &&
      tab.navigation == navigation &&
      WebPermissions.sameSecureOrigin(origin, tab.url);

  /// Mismo cuidado que con WebView: solo la pestaña que se ve, en https, y si la
  /// página cambia mientras se pregunta, se niega.
  Future<bool> _askGeckoPermission(
    _BrowserTab tab,
    String origin,
    List<String> kinds,
  ) async {
    const names = {
      'camera': 'cámara',
      'microphone': 'micrófono',
      'location': 'tu ubicación',
    };
    if (kinds.isEmpty || kinds.any((kind) => !names.containsKey(kind))) {
      return false;
    }
    final navigation = tab.navigation;
    if (_askingPermission || !_canGrant(tab, origin, navigation)) return false;
    final description = kinds.map((kind) => names[kind]!).join(' y ');
    final site = Uri.tryParse(origin)?.host ?? origin;
    _askingPermission = true;
    try {
      final allowed =
          await showDialog<bool>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              icon: const Icon(Icons.privacy_tip_outlined, color: _blue),
              title: Text('Permitir $description'),
              content: Text(
                '$site solicita acceso a $description. ¿Querés permitirlo?',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Bloquear'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Permitir'),
                ),
              ],
            ),
          ) ??
          false;
      if (!allowed || !_canGrant(tab, origin, navigation)) return false;
      final granted = await WebPermissions.requestDevice(kinds);
      return granted && _canGrant(tab, origin, navigation);
    } finally {
      _askingPermission = false;
    }
  }

  List<Widget> _geckoPrivacyRows(BuildContext sheetContext, _BrowserTab tab) {
    return [
      Material(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          leading: const Icon(Icons.verified_user_outlined, color: _green),
          title: const Text('Protección en este sitio'),
          subtitle: Text(
            tab.url == null
                ? 'Abrí una página para ver qué se bloqueó.'
                : 'La hace uBlock Origin. Tocá para ver qué bloqueó y apagarla o prenderla en ${tab.url!.host}.',
            style: const TextStyle(color: _muted),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: tab.url == null
              ? null
              : () {
                  Navigator.pop(sheetContext);
                  _openUBlockPanel();
                },
        ),
      ),
    ];
  }

  Future<void> _openUBlockPanel() async {
    if (!await GeckoEngineInfo.openUBlockPanel()) {
      _showMessage(
        'uBlock Origin todavía se está preparando. Probá de nuevo en unos segundos.',
      );
    }
  }

  /// El panel de uBlock Origin, tal cual lo dibuja uBO, en una hoja de Patagonia.
  Future<void> _showUBlockPanel(int id) async {
    if (!mounted) {
      await GeckoEngineInfo.dropPending(id);
      return;
    }
    GeckoController? panel;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      enableDrag: false,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .8,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 10, 6, 6),
                child: Row(
                  children: [
                    const Icon(Icons.shield_outlined, color: _green),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text(
                        'uBlock Origin',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        _current.gecko?.reload();
                      },
                      icon: const Icon(Icons.refresh),
                      label: const Text('Recargar página'),
                    ),
                    IconButton(
                      tooltip: 'Cerrar',
                      onPressed: () => Navigator.pop(sheetContext),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(18, 0, 18, 8),
                child: Text(
                  'El botón grande prende o apaga la protección en este sitio. Después tocá Recargar página.',
                  style: TextStyle(color: _muted, fontSize: 13),
                ),
              ),
              Expanded(
                child: GeckoBrowserView(
                  windowId: id,
                  popup: true,
                  events: GeckoEvents(
                    onCloseRequest: () {
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
                    },
                  ),
                  onCreated: (controller) => panel = controller,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    panel?.dispose();
    await GeckoEngineInfo.dropPending(id);
  }

  /// uBO abre su configuración o el registro en una pestaña nueva.
  Future<bool> _openExtensionTab(int id, String url) async {
    if (!mounted || !_preferencesReady) return false;
    _addTab(windowId: id, title: 'uBlock Origin');
    return true;
  }

  /// Aviso único: la lista vieja de sitios sin protección no pasa sola a uBlock Origin.
  Future<void> _showProtectionNotice() async {
    if (!mounted) return;
    final hosts = _unprotectedHosts.toList()..sort();
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.shield_outlined, color: _green),
        title: const Text('Nueva protección'),
        content: SingleChildScrollView(
          child: Text(
            'Patagonia ahora bloquea anuncios con uBlock Origin.\n\n'
            'Antes tenías la protección apagada en:\n'
            '${hosts.map((host) => '• $host').join('\n')}\n\n'
            'Si la necesitás apagada otra vez, abrí ese sitio, tocá el escudo '
            'y usá el botón grande de uBlock Origin.',
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_protectionNoticeKey, true);
    } catch (_) {
      // Si no se pudo guardar, el aviso vuelve a salir la próxima vez.
    }
  }

  void _showAbout() {
    void open(String url) {
      Navigator.pop(context);
      _addTab(url: Uri.parse(url));
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .8,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
            children: [
              const Text(
                'Acerca de Patagonia Browser',
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              const Text(
                'Patagonia Labs · Hecho por Christian Ariel Williams',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              const Text(
                'Patagonia Browser es software libre con licencia MIT.',
                style: TextStyle(color: _muted, height: 1.4),
              ),
              if (_gecko) ...[
                const Divider(height: 32, color: Color(0x336F8DA5)),
                const Text(
                  'uBlock Origin ${_LicenseInfo.uboVersion}',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Bloqueador de anuncios y rastreadores de Raymond Hill y colaboradores. '
                  'Se incluye sin modificar. Licencia GNU GPL versión 3. '
                  'Las listas de filtros que usa (EasyList, EasyPrivacy y otras) tienen sus propios autores y licencias.',
                  style: TextStyle(color: _muted, height: 1.4),
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => _showLicenseText(sheetContext),
                      child: const Text('Ver licencia (GPLv3)'),
                    ),
                    TextButton(
                      onPressed: () => open(_LicenseInfo.uboSource),
                      child: const Text('Código fuente'),
                    ),
                  ],
                ),
                const Divider(height: 32, color: Color(0x336F8DA5)),
                const Text(
                  'GeckoView ${_LicenseInfo.geckoVersion}',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Patagonia usa el motor GeckoView de Mozilla para mostrar las páginas. '
                  'Licencia Mozilla Public License 2.0.',
                  style: TextStyle(color: _muted, height: 1.4),
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => open(_LicenseInfo.mplText),
                      child: const Text('Ver licencia (MPL 2.0)'),
                    ),
                    TextButton(
                      onPressed: () => open(_LicenseInfo.geckoSource),
                      child: const Text('Código fuente'),
                    ),
                  ],
                ),
                const Divider(height: 32, color: Color(0x336F8DA5)),
                const Text(
                  'Readability ${_LicenseInfo.readabilityVersion}',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                const Text(
                  'El modo lectura usa Readability de Mozilla para separar la nota del resto de la página. '
                  'Licencia Apache 2.0.',
                  style: TextStyle(color: _muted, height: 1.4),
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => open(_LicenseInfo.apacheText),
                      child: const Text('Ver licencia (Apache 2.0)'),
                    ),
                    TextButton(
                      onPressed: () => open(_LicenseInfo.readabilitySource),
                      child: const Text('Código fuente'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text(
                  'Patagonia no es un producto de Mozilla ni de Raymond Hill, y ellos no lo respaldan.',
                  style: TextStyle(color: _muted, fontSize: 13, height: 1.4),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showLicenseText(BuildContext sheetContext) async {
    String text;
    try {
      text = await rootBundle.loadString(_LicenseInfo.uboLicenseAsset);
    } catch (_) {
      text = 'No se pudo abrir el texto. Está en ${_LicenseInfo.uboSource}';
    }
    if (!sheetContext.mounted) return;
    await Navigator.of(sheetContext).push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          appBar: AppBar(title: const Text('Licencia de uBlock Origin')),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: SelectableText(
                text,
                style: const TextStyle(fontSize: 12.5, height: 1.35),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Cartel al terminar una descarga, con "Abrir" para no tener que buscar el archivo.
  void _showDownloadReady(String name, int id) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Descarga lista: $name'),
          duration: const Duration(seconds: 6),
          action: id > 0
              ? SnackBarAction(label: 'Abrir', onPressed: () => _openDownload(id))
              : null,
        ),
      );
  }

  Future<void> _openDownload(int id) async {
    final result = await GeckoEngineInfo.openDownload(id);
    if (result == 'sinapp') {
      _showMessage('No hay una app en el celular para abrir este tipo de archivo.');
    } else if (result == 'noexiste') {
      _showMessage('El archivo ya no está en la carpeta Descargas.');
      _downloads.value = await GeckoEngineInfo.downloads();
    }
  }

  Future<void> _openDownloadsFolder() async {
    if (!await GeckoEngineInfo.openDownloadsFolder()) {
      _showMessage('Abrí la app Archivos del celular y entrá a la carpeta Descargas.');
    }
  }

  /// Menú → Descargas: lo mismo que el panel de descargas de la PC.
  void _showDownloads() {
    // Al abrir se vuelve a pedir la lista: si borraste un archivo, ya no aparece.
    GeckoEngineInfo.downloads().then((lista) {
      if (mounted) _downloads.value = lista;
    });
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .7,
          child: ValueListenableBuilder<List<Descarga>>(
            valueListenable: _downloads,
            builder: (context, lista, _) => Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 12, 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Descargas',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Abrir la carpeta Descargas',
                        icon: const Icon(Icons.folder_open_outlined),
                        onPressed: _openDownloadsFolder,
                      ),
                      if (lista.any((d) => !d.bajando))
                        TextButton(
                          onPressed: GeckoEngineInfo.clearDownloads,
                          child: const Text('Limpiar lista'),
                        ),
                    ],
                  ),
                ),
                Expanded(
                  child: lista.isEmpty
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'Todavía no bajaste nada.\nLo que bajes queda en la carpeta Descargas del celular.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: _muted, height: 1.4),
                            ),
                          ),
                        )
                      : ListView.separated(
                          itemCount: lista.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) =>
                              _downloadTile(lista[index]),
                        ),
                ),
                if (lista.isNotEmpty)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(20, 8, 20, 12),
                    child: Text(
                      '"Limpiar lista" no borra los archivos: siguen en la carpeta Descargas.',
                      style: TextStyle(color: _muted, fontSize: 12.5),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _downloadTile(Descarga d) {
    final icon = switch (d.estado) {
      'descargando' => Icons.downloading,
      'completada' => Icons.insert_drive_file_outlined,
      'cancelada' => Icons.block,
      _ => Icons.error_outline,
    };
    return ListTile(
      leading: Icon(icon, color: d.lista || d.bajando ? _blue : _muted),
      title: Text(d.nombre, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (d.bajando)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: LinearProgressIndicator(
                value: d.avance,
                color: _blue,
                backgroundColor: _surfaceLight,
              ),
            ),
          Text(d.detalle, style: const TextStyle(color: _muted, fontSize: 12.5)),
        ],
      ),
      trailing: d.bajando
          ? IconButton(
              tooltip: 'Cancelar descarga',
              icon: const Icon(Icons.close),
              onPressed: () => GeckoEngineInfo.cancelDownload(d.id),
            )
          : null,
      onTap: d.lista ? () => _openDownload(d.id) : null,
    );
  }

  void _showSavedPages(String title, List<_SavedPage> sourcePages) {
    final pages = List<_SavedPage>.of(sourcePages);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _navy,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .7,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    if (title == 'Favoritos' && _gecko) ...[
                      IconButton(
                        tooltip: 'Exportar a un archivo',
                        icon: const Icon(Icons.file_upload_outlined),
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _exportFavorites();
                        },
                      ),
                      IconButton(
                        tooltip: 'Importar de un archivo',
                        icon: const Icon(Icons.file_download_outlined),
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _importFavorites();
                        },
                      ),
                    ],
                    if (title == 'Historial' && pages.isNotEmpty)
                      TextButton(
                        onPressed: () {
                          setState(() => _history.clear());
                          _savePages('history', _history);
                          Navigator.pop(sheetContext);
                        },
                        child: const Text('Borrar'),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: pages.isEmpty
                    ? Center(
                        child: Text(
                          title == 'Favoritos'
                              ? 'Todavía no guardaste favoritos.'
                              : 'El historial está vacío.',
                          style: const TextStyle(color: _muted),
                        ),
                      )
                    : ListView.separated(
                        itemCount: pages.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final page = pages[index];
                          return ListTile(
                            leading: const Icon(Icons.public, color: _blue),
                            title: Text(
                              page.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              page.url,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () {
                              Navigator.pop(sheetContext);
                              _navigate(page.url);
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabContent extends StatefulWidget {
  const _TabContent({
    super.key,
    required this.tab,
    required this.isActive,
    required this.settings,
    required this.initialUserScripts,
    required this.onNavigate,
    required this.onController,
    required this.onLoadStart,
    required this.onPrepareNavigation,
    required this.onUrlChanged,
    required this.onTitleChanged,
    required this.onProgressChanged,
    required this.onPageCommitVisible,
    required this.onPageFinished,
    required this.onBlockedResource,
    required this.onNewWindow,
    required this.onCloseWindow,
    required this.onRenderProcessGone,
    required this.onError,
  });

  final _BrowserTab tab;
  final bool isActive;
  final InAppWebViewSettings settings;
  final UnmodifiableListView<UserScript>? initialUserScripts;
  final ValueChanged<String> onNavigate;
  final ValueChanged<InAppWebViewController> onController;
  final ValueChanged<Uri?> onLoadStart;
  final Future<void> Function(Uri?) onPrepareNavigation;
  final ValueChanged<Uri?> onUrlChanged;
  final ValueChanged<String?> onTitleChanged;
  final ValueChanged<int> onProgressChanged;
  final ValueChanged<Uri?> onPageCommitVisible;
  final ValueChanged<Uri?> onPageFinished;
  final ValueChanged<String> onBlockedResource;
  final bool Function(CreateWindowAction action) onNewWindow;
  final VoidCallback onCloseWindow;
  final VoidCallback onRenderProcessGone;
  final ValueChanged<String> onError;

  @override
  State<_TabContent> createState() => _TabContentState();
}

class _TabContentState extends State<_TabContent> {
  late final int _generation = widget.tab.generation;
  bool get _alive => mounted && widget.tab.generation == _generation;
  int _navigation = 0;
  bool _askingPermission = false;

  bool _canGrant(String origin, int navigation) =>
      _alive &&
      widget.isActive &&
      navigation == _navigation &&
      WebPermissions.sameSecureOrigin(origin, widget.tab.url);

  Future<bool> _requestPermission(
    String origin,
    String description,
    List<String> devicePermissions,
  ) async {
    final navigation = _navigation;
    if (_askingPermission || !_canGrant(origin, navigation)) return false;
    _askingPermission = true;
    try {
      final allowed =
          await showDialog<bool>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              icon: const Icon(Icons.privacy_tip_outlined, color: _blue),
              title: Text('Permitir $description'),
              content: Text(
                '$origin solicita acceso a $description. ¿Querés permitirlo?',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Bloquear'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Permitir'),
                ),
              ],
            ),
          ) ??
          false;
      if (!allowed || !_canGrant(origin, navigation)) return false;
      final granted = await WebPermissions.requestDevice(devicePermissions);
      return granted && _canGrant(origin, navigation);
    } finally {
      _askingPermission = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.tab.url == null && widget.tab.windowId == null) {
      return _StartPage(onNavigate: widget.onNavigate, onWhatsApp: null);
    }

    return Stack(
      children: [
        if (!widget.tab.renderProcessGone)
          InAppWebView(
            windowId: widget.tab.windowId,
            initialUrlRequest:
                widget.tab.windowId == null && widget.tab.url != null
                ? URLRequest(url: WebUri.uri(widget.tab.url!))
                : null,
            initialSettings: widget.settings,
            initialUserScripts: widget.initialUserScripts,
            onWebViewCreated: (controller) {
              if (_alive) widget.onController(controller);
            },
            onLoadStart: (controller, url) {
              if (!_alive) return;
              _navigation++;
              widget.onLoadStart(url);
            },
            onPageCommitVisible: (controller, url) {
              if (_alive) widget.onPageCommitVisible(url);
            },
            onLoadStop: (controller, url) {
              if (_alive) widget.onPageFinished(url);
            },
            onUpdateVisitedHistory: (controller, url, isReload) {
              if (_alive) widget.onUrlChanged(url);
            },
            onTitleChanged: (controller, title) {
              if (_alive) widget.onTitleChanged(title);
            },
            onProgressChanged: (controller, progress) {
              if (_alive) widget.onProgressChanged(progress);
            },
            shouldInterceptRequest: (controller, request) async {
              if (!_alive || !widget.tab.protectionEnabled) return null;
              final value = request.url.toString();
              final kind = PrivacyProtection.blockedRequest(
                value,
                isMainFrame: request.isForMainFrame ?? true,
              );
              if (kind == null) return null;
              widget.onBlockedResource(value);
              return WebResourceResponse(
                contentType: 'text/plain',
                contentEncoding: 'utf-8',
                statusCode: 403,
                reasonPhrase: 'Blocked by Patagonia',
                data: Uint8List(0),
              );
            },
            shouldOverrideUrlLoading: (controller, action) async {
              if (!_alive) return NavigationActionPolicy.CANCEL;
              final url = action.request.url;
              if (url?.toString() == 'about:blank') {
                return NavigationActionPolicy.ALLOW;
              }
              if (!NavigationInput.isWebUri(url)) {
                return NavigationActionPolicy.CANCEL;
              }
              if (action.isForMainFrame) await widget.onPrepareNavigation(url);
              return mounted
                  ? NavigationActionPolicy.ALLOW
                  : NavigationActionPolicy.CANCEL;
            },
            onCreateWindow: (controller, action) async =>
                _alive && widget.onNewWindow(action),
            onCloseWindow: (controller) {
              if (_alive) widget.onCloseWindow();
            },
            onPermissionRequest: (controller, request) async {
              final supported =
                  request.resources.isNotEmpty &&
                  request.resources.every(
                    (resource) => WebPermissions.name(resource) != null,
                  );
              final allowed =
                  supported &&
                  await _requestPermission(
                    request.origin.toString(),
                    request.resources.map(WebPermissions.name).join(' y '),
                    WebPermissions.devicePermissions(request.resources),
                  );
              return PermissionResponse(
                resources: allowed ? request.resources : [],
                action: allowed
                    ? PermissionResponseAction.GRANT
                    : PermissionResponseAction.DENY,
              );
            },
            onPermissionRequestCanceled: (controller, request) {
              _navigation++;
            },
            onGeolocationPermissionsShowPrompt: (controller, origin) async {
              final allowed = await _requestPermission(origin, 'tu ubicación', [
                'location',
              ]);
              return GeolocationPermissionShowPromptResponse(
                origin: origin,
                allow: allowed,
                retain: false,
              );
            },
            onGeolocationPermissionsHidePrompt: (controller) {
              _navigation++;
            },
            onReceivedError: (controller, request, error) {
              if (_alive && (request.isForMainFrame ?? false)) {
                widget.onError(
                  'No pudimos abrir esta página. Revisá la conexión e intentá otra vez.',
                );
              }
            },
            onRenderProcessGone: (controller, detail) {
              if (_alive) widget.onRenderProcessGone();
            },
            onWebContentProcessDidTerminate: (controller) {
              if (_alive) {
                widget.onError(
                  'La página se cerró. Tocá Volver a intentar para abrirla.',
                );
              }
            },
          ),
        if (widget.tab.errorMessage != null)
          _PageError(tab: widget.tab, onNavigate: widget.onNavigate),
      ],
    );
  }
}

/// Pantalla de Patagonia cuando una página no abre o se cerró sola.
class _PageError extends StatelessWidget {
  const _PageError({required this.tab, required this.onNavigate});

  final _BrowserTab tab;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: ColoredBox(
        color: _navy,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, size: 56, color: _muted),
                const SizedBox(height: 16),
                Text(
                  tab.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 17, height: 1.4),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () {
                    final url = tab.url;
                    if (url != null) onNavigate(url.toString());
                  },
                  icon: const Icon(Icons.refresh),
                  label: const Text('Volver a intentar'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StartPage extends StatelessWidget {
  const _StartPage({
    required this.onNavigate,
    required this.onWhatsApp,
    this.incognito = false,
    this.kidsMode = false,
    this.update,
    this.onUpdate,
  });

  final ValueChanged<String> onNavigate;

  /// null: sin acceso rápido de WhatsApp (iPhone).
  final VoidCallback? onWhatsApp;

  /// Pestaña de incógnito: se explica qué hace y qué no.
  final bool incognito;
  final bool kidsMode;
  final MobileRelease? update;
  final VoidCallback? onUpdate;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        image: DecorationImage(
          image: AssetImage('assets/patagonia-start.png'),
          fit: BoxFit.cover,
          alignment: Alignment.center,
        ),
      ),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0x66000000), Color(0xB32A1216)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, 34, 22, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Center(
                child: Container(
                  key: const ValueKey('start-page-logo'),
                  width: 94,
                  height: 94,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black54,
                        blurRadius: 18,
                        offset: Offset(0, 7),
                      ),
                    ],
                  ),
                  child: ClipOval(
                    child: Image.asset(
                      'assets/patagonia-emblema.png',
                      fit: BoxFit.contain,
                      alignment: Alignment.center,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Patagonia Browser',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.bold,
                  shadows: [Shadow(color: Colors.black87, blurRadius: 8)],
                ),
              ),
              const SizedBox(height: 3),
              const Text(
                'Navegá libre. Navegá seguro.',
                style: TextStyle(fontSize: 17, color: Color(0xFFE2EDF5)),
              ),
              if (incognito) ...[
                const SizedBox(height: 18),
                Container(
                  key: const ValueKey('aviso-incognito'),
                  constraints: const BoxConstraints(maxWidth: 560),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xE6301E4C),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '🕶️ Estás en modo incógnito',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Patagonia no guarda lo que hagas en estas pestañas: ni el historial, ni las cuentas que '
                        'abras, ni lo que escribas en las páginas. Al cerrar la última pestaña de incógnito se '
                        'borra todo.',
                        style: TextStyle(height: 1.4),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Ojo: no te hace invisible. Tu proveedor de internet, la red de la escuela o del trabajo y '
                        'las páginas que visitás igual pueden ver que entraste. Las descargas y los favoritos que '
                        'guardes sí quedan.',
                        style: TextStyle(height: 1.4, color: Color(0xFFE6DCF5)),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 28),
              Container(
                constraints: const BoxConstraints(maxWidth: 560),
                decoration: BoxDecoration(
                  color: const Color(0xE60A1D2E),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: const Color(0xAA91B8CE)),
                  boxShadow: const [
                    BoxShadow(color: Colors.black38, blurRadius: 14),
                  ],
                ),
                child: TextField(
                  textInputAction: TextInputAction.search,
                  onSubmitted: onNavigate,
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: 'Buscar en la web',
                    prefixIcon: Icon(Icons.search, color: _blue),
                    contentPadding: EdgeInsets.symmetric(vertical: 15),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                alignment: WrapAlignment.center,
                children: [
                  _QuickLink(
                    icon: Icons.g_mobiledata,
                    label: 'Google',
                    color: const Color(0xFF4285F4),
                    onTap: () => onNavigate('https://www.google.com'),
                  ),
                  _QuickLink(
                    icon: Icons.play_arrow_rounded,
                    label: 'YouTube',
                    color: const Color(0xFFFF2D2D),
                    onTap: () => onNavigate('https://www.youtube.com'),
                  ),
                  _QuickLink(
                    icon: Icons.menu_book_outlined,
                    label: 'Wikipedia',
                    color: Colors.white,
                    onTap: () => onNavigate('https://es.wikipedia.org'),
                  ),
                  _QuickLink(
                    icon: Icons.mail_outline,
                    label: 'Gmail',
                    color: const Color(0xFFEA4335),
                    onTap: () => onNavigate('https://mail.google.com'),
                  ),
                  if (onWhatsApp != null)
                    _QuickLink(
                      icon: Icons.chat_outlined,
                      label: 'WhatsApp',
                      color: const Color(0xFF25D366),
                      onTap: onWhatsApp!,
                    ),
                  _QuickLink(
                    icon: Icons.air,
                    label: 'Windguru',
                    color: const Color(0xFF7FD3FF),
                    onTap: () => onNavigate('https://www.windguru.cz'),
                  ),
                ],
              ),
              if (update != null && onUpdate != null) ...[
                const SizedBox(height: 24),
                Material(
                  color: const Color(0xE60A1D2E),
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: onUpdate,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 560),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xAA35D35B)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.system_update, color: _green),
                          const SizedBox(width: 10),
                          Flexible(
                            child: Text(
                              'Hay una versión nueva: ${update!.version}. Tocá para bajarla.',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 34),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 15,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xCC0A1D2E),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: const Color(0x5542D86B)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      kidsMode ? Icons.child_care_outlined : Icons.lock_outline,
                      color: _green,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        kidsMode
                            ? 'Modo chicos activo'
                            : 'Protección de privacidad activa',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickLink extends StatelessWidget {
  const _QuickLink({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Abrir $label',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: 76,
          padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: BoxDecoration(
            color: const Color(0xD9132D42),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0x557F9AAF)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 32),
              const SizedBox(height: 7),
              Text(label, style: const TextStyle(fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

class _PrivacyRow extends StatelessWidget {
  const _PrivacyRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final Color color;
  final String label;
  final int? value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        children: [
          Icon(icon, color: color, size: 25),
          const SizedBox(width: 13),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 16))),
          Text(
            value?.toString() ?? '—',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(leading: Icon(icon), title: Text(label), onTap: onTap);
  }
}

class _BrowserTab {
  _BrowserTab({required this.id, this.url, this.windowId, this.incognito = false});

  /// Modo incógnito: sesión privada de Gecko, sin historial; al cerrar la última se borra todo.
  final bool incognito;

  int? windowId;
  int generation = 0;
  void resetCounters() {
    blockedAds = 0;
    blockedTrackers = 0;
    seenBlockedResources.clear();
  }

  final int id;
  Uri? url;
  String title = 'Nueva pestaña';
  InAppWebViewController? controller;

  // Motor Gecko (Android).
  GeckoController? gecko;
  bool canGoBack = false;
  bool canGoForward = false;
  bool fullScreen = false;
  int navigation = 0;
  Uri? pendingLoad;

  // Traductor.
  GeckoTranslationState? translation;
  bool translating = false;
  bool translationHidden = false;
  Uri? autoTranslatedUrl;

  void resetTranslation() {
    translation = null;
    translating = false;
    translationHidden = false;
  }

  void disposeGecko() {
    gecko?.dispose();
    gecko = null;
    canGoBack = false;
    canGoForward = false;
    fullScreen = false;
    pendingLoad = null;
    resetTranslation();
  }

  double progress = 0;
  int blockedAds = 0;
  int blockedTrackers = 0;
  bool protectionEnabled = true;
  bool desktopMode = false;
  bool renderProcessGone = false;
  String? errorMessage;
  final Set<String> seenBlockedResources = {};
}

class _SavedPage {
  const _SavedPage({required this.title, required this.url});

  final String title;
  final String url;

  factory _SavedPage.fromJson(Map<String, dynamic> json) => _SavedPage(
    title: json['title'] as String? ?? 'Página',
    url: json['url'] as String? ?? '',
  );

  Map<String, String> toJson() => {'title': title, 'url': url};
}

/// Datos de los programas de terceros que trae Patagonia en Android.
class _LicenseInfo {
  const _LicenseInfo._();

  static const uboVersion = '1.75.0';
  static const uboSource = 'https://github.com/gorhill/uBlock/tree/1.75.0';
  static const uboLicenseAsset = 'assets/licenses/ublock-origin-LICENSE.txt';
  static const geckoVersion = '159';
  static const geckoSource = 'https://github.com/mozilla-firefox/firefox';
  static const mplText = 'https://www.mozilla.org/MPL/2.0/';
  static const readabilityVersion = '0.6.0';
  static const readabilitySource =
      'https://github.com/mozilla/readability/tree/0.6.0';
  static const apacheText = 'https://www.apache.org/licenses/LICENSE-2.0';
}
