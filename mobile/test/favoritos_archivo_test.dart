import 'package:flutter_test/flutter_test.dart';
import 'package:patagonia_browser/src/favoritos_archivo.dart';

void main() {
  test('el archivo del celular se lee igual que el de la PC', () {
    final html = FavoritosArchivo.exportar([
      (titulo: 'Windguru <Sarmiento> & "más"', url: 'https://www.windguru.cz/123'),
      (titulo: 'malo', url: 'javascript:alert(1)'),
    ]);
    expect(html, contains('NETSCAPE-Bookmark-file-1'));
    final leidos = FavoritosArchivo.leer(html);
    expect(leidos, hasLength(1));
    expect(leidos.single.titulo, 'Windguru <Sarmiento> & "más"');
    expect(leidos.single.url, 'https://www.windguru.cz/123');
  });

  test('lee favoritos de la PC y de otros navegadores sin repetir', () {
    const pc = '''<DL><p>
    <DT><A HREF="https://duckduckgo.com/">Duck&amp;Go</A>
    <DT><A HREF='https://duckduckgo.com/'>repetido</A>
    <DT><H3>Carpeta</H3><DL><DT><A HREF="https://www.windguru.cz/" ADD_DATE="1">Windguru</A></DL>
    <DT><A HREF="https://user:pw@x.com/">no</A>
    <DT><A HREF="file:///sdcard/x">no</A>
</DL>''';
    final leidos = FavoritosArchivo.leer(pc);
    expect(leidos.map((f) => f.url), ['https://duckduckgo.com/', 'https://www.windguru.cz/']);
    expect(leidos.first.titulo, 'Duck&Go');
  });
}
