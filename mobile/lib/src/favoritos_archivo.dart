/// Archivo de favoritos para pasar entre el celular y la PC, sin cuenta ni nube.
///
/// Mismo formato que la PC (src/shared/favoritosArchivo.js): el estándar de favoritos de
/// Chrome, Firefox y Edge, así que también sirve para traer favoritos de otro navegador.
class FavoritosArchivo {
  const FavoritosArchivo._();

  static const maximo = 5000;
  static const nombre = 'favoritos-patagonia.html';

  static String _escapar(String texto) => texto
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  static String _desescapar(String texto) => texto
      .replaceAllMapped(RegExp(r'&#(\d+);'), (m) => _codigo(int.tryParse(m[1]!)))
      .replaceAllMapped(
        RegExp(r'&#x([0-9a-fA-F]+);'),
        (m) => _codigo(int.tryParse(m[1]!, radix: 16)),
      )
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&apos;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&');

  static String _codigo(int? valor) {
    if (valor == null || valor <= 0 || valor > 0x10FFFF) return '';
    return String.fromCharCode(valor);
  }

  /// Solo páginas web, sin usuario ni clave en la dirección.
  static String? urlWeb(String valor) {
    final uri = Uri.tryParse(valor.trim());
    if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) return null;
    if (uri.host.isEmpty || uri.userInfo.isNotEmpty) return null;
    return uri.toString();
  }

  /// Arma el archivo con los favoritos ({título, dirección}).
  static String exportar(Iterable<({String titulo, String url})> favoritos) {
    final filas = <String>[];
    for (final favorito in favoritos) {
      final url = urlWeb(favorito.url);
      if (url == null) continue;
      final titulo = favorito.titulo.trim().isEmpty
          ? Uri.parse(url).host
          : favorito.titulo.trim();
      filas.add('    <DT><A HREF="${_escapar(url)}">${_escapar(titulo)}</A>');
    }
    return [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- Favoritos de Patagonia Browser. Se pueden importar en Patagonia (PC o celular) o en otro navegador. -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Favoritos de Patagonia</TITLE>',
      '<H1>Favoritos de Patagonia</H1>',
      '<DL><p>',
      ...filas,
      '</DL><p>',
      '',
    ].join('\n');
  }

  /// Lee un archivo de favoritos: páginas web válidas, sin repetidas.
  static List<({String titulo, String url})> leer(String texto) {
    final patron = RegExp(
      r'''<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)</a>''',
      caseSensitive: false,
    );
    final vistos = <String>{};
    final resultado = <({String titulo, String url})>[];
    for (final m in patron.allMatches(texto)) {
      final url = urlWeb(_desescapar(m[1] ?? m[2] ?? ''));
      if (url == null || !vistos.add(url)) continue;
      var titulo = _desescapar(m[3]!.replaceAll(RegExp(r'<[^>]*>'), ''))
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      if (titulo.length > 300) titulo = titulo.substring(0, 300);
      resultado.add((titulo: titulo.isEmpty ? Uri.parse(url).host : titulo, url: url));
      if (resultado.length >= maximo) break;
    }
    return resultado;
  }
}
