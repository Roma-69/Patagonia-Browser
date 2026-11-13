import 'package:flutter_test/flutter_test.dart';
import 'package:patagonia_browser/src/gecko/gecko_view.dart';
import 'package:patagonia_browser/src/reader_view.dart';
import 'package:patagonia_browser/src/translation.dart';
import 'package:patagonia_browser/src/update_check.dart';

void main() {
  group('traductor', () {
    test('nombres de idiomas en castellano', () {
      expect(Translation.languageName('en'), 'inglés');
      expect(Translation.languageName('pt-BR'), 'portugués');
      expect(Translation.languageName('xx'), 'otro idioma');
      expect(Translation.languageName(null), 'otro idioma');
    });

    test('qué barra mostrar', () {
      expect(Translation.barFor(null), isNull);
      expect(
        Translation.barFor(const GeckoTranslationState(docLang: 'es-AR', supported: true)),
        isNull,
      );
      expect(
        Translation.barFor(const GeckoTranslationState(docLang: 'chr', supported: false)),
        isNull,
      );
      final offer = Translation.barFor(
        const GeckoTranslationState(docLang: 'en', supported: true),
      )!;
      expect(offer.kind, TranslationBarKind.offer);
      expect(offer.message, 'Esta página está en inglés.');
      final working = Translation.barFor(
        const GeckoTranslationState(docLang: 'fr', supported: true, from: 'fr', to: 'es'),
      )!;
      expect(working.kind, TranslationBarKind.translating);
      final done = Translation.barFor(
        const GeckoTranslationState(from: 'de', to: 'es', ready: true),
      )!;
      expect(done.kind, TranslationBarKind.translated);
      expect(done.message, 'Traducida del alemán.');
    });
  });

  group('aviso de versión nueva', () {
    test('compara versiones', () {
      expect(UpdateCheck.isNewer('1.2.1', '1.2.0'), isTrue);
      expect(UpdateCheck.isNewer('1.10.0', '1.9.9'), isTrue);
      expect(UpdateCheck.isNewer('1.2.0', '1.2.0-prueba'), isFalse);
      expect(UpdateCheck.isNewer('1.1.9', '1.2.0'), isFalse);
      expect(UpdateCheck.isNewer('basura', '1.2.0'), isFalse);
    });

    test('toma el APK del release para instalarlo directo', () {
      const apk =
          'https://github.com/Roma-69/Patagonia-Browser/releases/download/movil-v1.3.0/Patagonia-Android-1.3.0-Publicacion.apk';
      final latest = UpdateCheck.latestMobile([
        {
          'tag_name': 'movil-v1.3.0',
          'draft': false,
          'prerelease': false,
          'assets': [
            {'browser_download_url': 'https://otro-sitio.com/trucho.apk'},
            {'browser_download_url': apk},
          ],
        },
      ])!;
      expect(latest.apkUrl, apk);
      expect(UpdateCheck.isValidApkUrl('https://otro-sitio.com/trucho.apk'), isFalse);
      expect(
        UpdateCheck.isValidApkUrl(
          'https://github.com/Roma-69/Patagonia-Browser/releases/download/v1.3.0/Setup.exe',
        ),
        isFalse,
      );
    });

    test('elige la versión de celular más nueva publicada', () {
      final latest = UpdateCheck.latestMobile([
        {'tag_name': 'v1.0.11', 'draft': false, 'prerelease': false},
        {'tag_name': 'movil-v1.3.0', 'draft': true, 'prerelease': false},
        {'tag_name': 'movil-v1.2.5', 'draft': false, 'prerelease': true},
        {'tag_name': 'movil-v1.2.0', 'draft': false, 'prerelease': false},
        {'tag_name': 'movil-v1.1.1', 'draft': false, 'prerelease': false},
      ])!;
      expect(latest.version, '1.2.0');
      expect(
        latest.pageUrl,
        'https://github.com/Roma-69/Patagonia-Browser/releases/tag/movil-v1.2.0',
      );
      expect(latest.apkUrl, isNull);
      expect(UpdateCheck.latestMobile('nada'), isNull);
      expect(UpdateCheck.latestMobile([]), isNull);
    });
  });

  group('modo lectura', () {
    test('arma la nota desde el JSON del lector', () {
      final article = ReaderArticle.fromJson(
        '{"title":"Título","byline":"","site":"Sitio","url":"https://a.com/",'
        '"blocks":[{"t":"p","x":"Hola"},{"t":"img","x":"javascript:alert(1)"},'
        '{"t":"raro","x":"?"},{"t":"img","x":"https://a.com/f.png","alt":"foto"}]}',
      )!;
      expect(article.title, 'Título');
      expect(article.blocks.map((b) => b.kind), [
        ReaderBlockKind.paragraph,
        ReaderBlockKind.image,
      ]);
      expect(article.blocks.last.alt, 'foto');
    });

    test('sin párrafos no hay nota', () {
      expect(ReaderArticle.fromJson('{"blocks":[{"t":"h","x":"Solo título"}]}'), isNull);
      expect(ReaderArticle.fromJson('no es json'), isNull);
      expect(ReaderArticle.fromJson(null), isNull);
    });
  });
}
