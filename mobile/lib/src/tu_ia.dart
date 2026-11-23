/// "Tu IA": accesos a las IA que usa cada persona. Patagonia no tiene IA propia:
/// solo abre en una pestaña nueva el sitio que la persona eligió, sin mandarle
/// nada de la página que está viendo. Misma lista que la PC (src/shared/tuIA.js).
class TuIA {
  const TuIA._();

  /// id → (nombre, dirección). El orden es el que se muestra.
  static const Map<String, ({String nombre, String url})> lista = {
    'chatgpt': (nombre: 'ChatGPT', url: 'https://chatgpt.com/'),
    'claude': (nombre: 'Claude', url: 'https://claude.ai/'),
    'gemini': (nombre: 'Gemini', url: 'https://gemini.google.com/'),
    'copilot': (nombre: 'Copilot', url: 'https://copilot.microsoft.com/'),
    'perplexity': (nombre: 'Perplexity', url: 'https://www.perplexity.ai/'),
    'lechat': (nombre: 'Le Chat (Mistral)', url: 'https://chat.mistral.ai/'),
  };

  static const int _maxUrl = 2048;

  /// Dirección propia ("Otra"): solo http/https, sin usuario ni contraseña.
  /// Si falta el "https://", se lo agrega.
  static String direccionPropia(String? valor) {
    var texto = (valor ?? '').trim();
    if (texto.isEmpty || texto.length > _maxUrl) return '';
    if (!RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*:').hasMatch(texto)) texto = 'https://$texto';
    final uri = Uri.tryParse(texto);
    if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http')) return '';
    if (uri.host.isEmpty || uri.userInfo.isNotEmpty) return '';
    return uri.toString();
  }

  /// Valor guardado: '' (sin elegir), un id de la lista o una dirección.
  static String normalizar(String? valor) {
    if (valor == null || valor.isEmpty) return '';
    if (lista.containsKey(valor)) return valor;
    return direccionPropia(valor);
  }

  /// Dirección a abrir, o null si todavía no eligió ninguna.
  static Uri? destino(String? valor) {
    final ia = normalizar(valor);
    if (ia.isEmpty) return null;
    return Uri.parse(lista[ia]?.url ?? ia);
  }

  /// Nombre para mostrar en Configuración.
  static String nombre(String? valor) {
    final ia = normalizar(valor);
    if (ia.isEmpty) return 'Sin elegir';
    return lista[ia]?.nombre ?? (Uri.tryParse(ia)?.host ?? ia);
  }
}
