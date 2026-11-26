import 'package:flutter_test/flutter_test.dart';
import 'package:patagonia_browser/src/tu_ia.dart';

void main() {
  test('Tu IA: solo IA de la lista o direcciones web propias', () {
    expect(TuIA.destino('claude'), Uri.parse('https://claude.ai/'));
    expect(TuIA.destino(''), isNull);
    expect(TuIA.destino(null), isNull);
    expect(TuIA.direccionPropia('compu-colo.example.ts.net'), 'https://compu-colo.example.ts.net');
    expect(TuIA.normalizar('javascript:alert(1)'), '');
    expect(TuIA.normalizar('file:///sdcard/x'), '');
    expect(TuIA.normalizar('https://usuario:clave@ejemplo.com/'), '');
    expect(TuIA.nombre('gemini'), 'Gemini');
    expect(TuIA.nombre(''), 'Sin elegir');
  });

  test('Tu IA: misma lista que la PC', () {
    expect(TuIA.lista.keys, ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'lechat']);
  });
}
