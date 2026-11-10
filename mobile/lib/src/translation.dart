import 'gecko/gecko_view.dart';

/// Traductor de páginas (igual que el de la PC, versión 1.0.8): usa el motor de Firefox
/// (Bergamot) y traduce en el teléfono. La primera vez baja el idioma desde Mozilla.
class Translation {
  const Translation._();

  /// Idioma al que se traduce.
  static const target = 'es';

  static const _names = {
    'en': 'inglés',
    'pt': 'portugués',
    'fr': 'francés',
    'de': 'alemán',
    'it': 'italiano',
    'nl': 'neerlandés',
    'pl': 'polaco',
    'ru': 'ruso',
    'uk': 'ucraniano',
    'tr': 'turco',
    'ja': 'japonés',
    'ko': 'coreano',
    'zh': 'chino',
    'ar': 'árabe',
    'ca': 'catalán',
    'sv': 'sueco',
    'da': 'danés',
    'fi': 'finés',
    'el': 'griego',
    'cs': 'checo',
    'ro': 'rumano',
    'hu': 'húngaro',
    'bg': 'búlgaro',
    'hr': 'croata',
    'sl': 'esloveno',
    'sk': 'eslovaco',
    'et': 'estonio',
    'lv': 'letón',
    'lt': 'lituano',
    'id': 'indonesio',
    'vi': 'vietnamita',
    'fa': 'persa',
    'he': 'hebreo',
    'hi': 'hindi',
    'nb': 'noruego',
    'nn': 'noruego',
  };

  /// 'en-US' → 'en'.
  static String base(String tag) => tag.toLowerCase().split(RegExp('[-_]')).first;

  /// Nombre en castellano para mostrar ("inglés"), o "otro idioma".
  static String languageName(String? tag) =>
      tag == null ? 'otro idioma' : _names[base(tag)] ?? 'otro idioma';

  /// Qué mostrar arriba de la página según lo que avisó el motor.
  static TranslationBar? barFor(GeckoTranslationState? state) {
    if (state == null) return null;
    final from = state.from;
    if (from != null) {
      return TranslationBar(
        kind: state.ready ? TranslationBarKind.translated : TranslationBarKind.translating,
        language: from,
      );
    }
    final doc = state.docLang;
    if (doc == null || !state.supported || base(doc) == target) return null;
    return TranslationBar(kind: TranslationBarKind.offer, language: doc);
  }
}

enum TranslationBarKind { offer, translating, translated }

class TranslationBar {
  const TranslationBar({required this.kind, required this.language});

  final TranslationBarKind kind;

  /// Idioma de la página (ej. 'en').
  final String language;

  String get message => switch (kind) {
    TranslationBarKind.offer =>
      'Esta página está en ${Translation.languageName(language)}.',
    TranslationBarKind.translating =>
      'Traduciendo del ${Translation.languageName(language)}…',
    TranslationBarKind.translated =>
      'Traducida del ${Translation.languageName(language)}.',
  };
}
