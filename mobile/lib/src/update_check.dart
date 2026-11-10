import 'dart:convert';
import 'dart:io';

/// Aviso de versión nueva de Patagonia para Android. Consulta los releases públicos del
/// repositorio en GitHub (una vez por día como mucho); no manda ningún dato de la persona.
class UpdateCheck {
  const UpdateCheck._();

  static const releasesApi =
      'https://api.github.com/repos/Roma-69/Patagonia-Browser/releases?per_page=30';
  static const releasePage =
      'https://github.com/Roma-69/Patagonia-Browser/releases/tag/';

  /// Las versiones del celular se publican con la etiqueta movil-vX.Y.Z.
  static const mobileTagPrefix = 'movil-v';

  /// '1.2.0-prueba+12' → [1, 2, 0]. null si no es una versión.
  static List<int>? parse(String? version) {
    if (version == null) return null;
    final match = RegExp(r'^v?(\d+)\.(\d+)(?:\.(\d+))?').firstMatch(version.trim());
    if (match == null) return null;
    return [
      int.parse(match.group(1)!),
      int.parse(match.group(2)!),
      int.parse(match.group(3) ?? '0'),
    ];
  }

  /// true si [candidate] es más nueva que [installed].
  static bool isNewer(String candidate, String installed) {
    final a = parse(candidate);
    final b = parse(installed);
    if (a == null || b == null) return false;
    for (var i = 0; i < 3; i++) {
      if (a[i] != b[i]) return a[i] > b[i];
    }
    return false;
  }

  /// La versión de celular más nueva publicada (sin borradores ni versiones de prueba).
  static MobileRelease? latestMobile(Object? releases) {
    if (releases is! List) return null;
    MobileRelease? best;
    for (final item in releases) {
      if (item is! Map) continue;
      if (item['draft'] == true || item['prerelease'] == true) continue;
      final tag = item['tag_name'];
      if (tag is! String || !tag.startsWith(mobileTagPrefix)) continue;
      final version = tag.substring(mobileTagPrefix.length);
      if (parse(version) == null) continue;
      if (best == null || isNewer(version, best.version)) {
        best = MobileRelease(version: version, tag: tag);
      }
    }
    return best;
  }

  /// null si no hay conexión o GitHub no contesta bien.
  static Future<MobileRelease?> fetchLatest() async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 10);
    try {
      final request = await client.getUrl(Uri.parse(releasesApi));
      request.headers
        ..set(HttpHeaders.acceptHeader, 'application/vnd.github+json')
        ..set(HttpHeaders.userAgentHeader, 'Patagonia-Browser-Android');
      final response = await request.close().timeout(const Duration(seconds: 15));
      if (response.statusCode != 200) return null;
      final body = await response.transform(utf8.decoder).join();
      return latestMobile(jsonDecode(body));
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }
}

class MobileRelease {
  const MobileRelease({required this.version, required this.tag});

  final String version;
  final String tag;

  String get pageUrl => '${UpdateCheck.releasePage}$tag';
}
