import 'package:flutter_test/flutter_test.dart';
import 'package:patagonia_browser/src/descargas.dart';

void main() {
  test('tamaños con coma, como se escriben acá', () {
    expect(tamanio(800), '800 B');
    expect(tamanio(1536), '1,5 KB');
    expect(tamanio(5 * 1024 * 1024), '5,0 MB');
  });

  test('textos de cada estado', () {
    const bajando = Descarga(id: 1, nombre: 'a.pdf', estado: 'descargando', recibidos: 256, total: 1024);
    expect(bajando.avance, .25);
    expect(bajando.detalle, 'Descargando… 25 % · 256 B de 1,0 KB');
    const sinTotal = Descarga(id: 2, nombre: 'b.zip', estado: 'descargando', recibidos: 2048);
    expect(sinTotal.avance, isNull);
    expect(sinTotal.detalle, 'Descargando… 2,0 KB');
    expect(const Descarga(id: 3, nombre: 'c', estado: 'cancelada').detalle, 'Cancelada');
    expect(const Descarga(id: 4, nombre: 'd', estado: 'fallida').detalle, startsWith('No se pudo'));
  });

  test('lee la lista que manda Android y descarta lo que no sirve', () {
    final lista = Descarga.desdeLista([
      {'id': 1, 'nombre': 'a.pdf', 'estado': 'completada', 'recibidos': 10, 'total': 10},
      {'nombre': 'sin id'},
      'basura',
    ]);
    expect(lista, hasLength(1));
    expect(lista.single.lista, isTrue);
    expect(Descarga.desdeLista(null), isEmpty);
  });
}
