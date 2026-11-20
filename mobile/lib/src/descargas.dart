/// Lista de descargas del celular (Menú → Descargas). Los datos los lleva Android
/// (gecko/Descargas.kt); acá solo se leen y se arman los textos que ve la persona.
class Descarga {
  const Descarga({
    required this.id,
    required this.nombre,
    required this.estado,
    this.recibidos = 0,
    this.total = -1,
  });

  final int id;
  final String nombre;

  /// 'descargando' | 'completada' | 'fallida' | 'cancelada'.
  final String estado;
  final int recibidos;

  /// -1 si la página no dijo cuánto pesa.
  final int total;

  bool get bajando => estado == 'descargando';
  bool get lista => estado == 'completada';

  /// 0 a 1, o null si no se sabe el total (barra que va y viene).
  double? get avance {
    if (lista) return 1;
    if (total <= 0) return null;
    return (recibidos / total).clamp(0, 1).toDouble();
  }

  String get detalle => switch (estado) {
    'descargando' =>
      total > 0
          ? 'Descargando… ${(avance! * 100).floor()} % · ${tamanio(recibidos)} de ${tamanio(total)}'
          : 'Descargando… ${tamanio(recibidos)}',
    'completada' => total > 0 ? 'Lista · ${tamanio(total)}' : 'Lista',
    'cancelada' => 'Cancelada',
    _ => 'No se pudo completar. Probá de nuevo desde la página.',
  };

  static Descarga? desdeMapa(Object? valor) {
    if (valor is! Map) return null;
    final id = valor['id'];
    final nombre = valor['nombre'];
    if (id is! int || nombre is! String) return null;
    final estado = valor['estado'];
    final recibidos = valor['recibidos'];
    final total = valor['total'];
    return Descarga(
      id: id,
      nombre: nombre,
      estado: estado is String ? estado : 'fallida',
      recibidos: recibidos is int ? recibidos : 0,
      total: total is int ? total : -1,
    );
  }

  static List<Descarga> desdeLista(Object? valor) => valor is List
      ? valor.map(desdeMapa).whereType<Descarga>().toList()
      : const [];
}

/// 1536 → "1,5 KB" (con coma, como se escribe acá).
String tamanio(int bytes) {
  if (bytes < 1024) return '$bytes B';
  final kb = bytes / 1024;
  if (kb < 1024) return '${kb.toStringAsFixed(1).replaceAll('.', ',')} KB';
  return '${(kb / 1024).toStringAsFixed(1).replaceAll('.', ',')} MB';
}
