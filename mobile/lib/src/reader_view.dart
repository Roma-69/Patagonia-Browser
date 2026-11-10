import 'dart:convert';

import 'package:flutter/material.dart';

/// Nota armada por el modo lectura (patagonia_lector/lector.js con Readability de Mozilla).
class ReaderArticle {
  const ReaderArticle({
    required this.title,
    required this.byline,
    required this.site,
    required this.url,
    required this.blocks,
  });

  final String title;
  final String byline;
  final String site;
  final String url;
  final List<ReaderBlock> blocks;

  /// null si el JSON no trae una nota con texto.
  static ReaderArticle? fromJson(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      return null;
    }
    if (decoded is! Map) return null;
    String text(Object? value) => value is String ? value.trim() : '';
    final blocks = <ReaderBlock>[];
    final list = decoded['blocks'];
    if (list is List) {
      for (final item in list) {
        if (item is! Map) continue;
        final kind = ReaderBlockKind.fromCode(text(item['t']));
        final value = text(item['x']);
        if (kind == null || value.isEmpty) continue;
        if (kind == ReaderBlockKind.image) {
          final uri = Uri.tryParse(value);
          if (uri == null || !{'http', 'https'}.contains(uri.scheme)) continue;
        }
        blocks.add(ReaderBlock(kind: kind, text: value, alt: text(item['alt'])));
      }
    }
    if (!blocks.any((block) => block.kind == ReaderBlockKind.paragraph)) {
      return null;
    }
    return ReaderArticle(
      title: text(decoded['title']),
      byline: text(decoded['byline']),
      site: text(decoded['site']),
      url: text(decoded['url']),
      blocks: blocks,
    );
  }
}

enum ReaderBlockKind {
  heading('h'),
  paragraph('p'),
  listItem('li'),
  quote('q'),
  code('pre'),
  caption('cap'),
  image('img');

  const ReaderBlockKind(this.code);

  final String code;

  static ReaderBlockKind? fromCode(String code) {
    for (final kind in values) {
      if (kind.code == code) return kind;
    }
    return null;
  }
}

class ReaderBlock {
  const ReaderBlock({required this.kind, required this.text, this.alt = ''});

  final ReaderBlockKind kind;

  /// Texto del bloque, o la dirección de la imagen.
  final String text;
  final String alt;
}

/// Pantalla del modo lectura: la nota sola, sin publicidad ni menús, con letra cómoda.
/// La dibuja Patagonia: no se ejecuta nada de la página.
class ReaderPage extends StatefulWidget {
  const ReaderPage({
    super.key,
    required this.article,
    this.largeText = false,
    this.showImages = true,
  });

  final ReaderArticle article;
  final bool largeText;

  /// Las pruebas no bajan imágenes.
  final bool showImages;

  @override
  State<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  static const _paper = Color(0xFF15120F);
  static const _ink = Color(0xFFEDE6DA);
  static const _soft = Color(0xFFB9AE9E);
  static const _accent = Color(0xFFE9A15A);

  late double _size = widget.largeText ? 22 : 19;

  void _resize(double delta) =>
      setState(() => _size = (_size + delta).clamp(15, 32).toDouble());

  Widget _block(ReaderBlock block) {
    final body = TextStyle(fontSize: _size, height: 1.6, color: _ink);
    switch (block.kind) {
      case ReaderBlockKind.heading:
        return Padding(
          padding: const EdgeInsets.only(top: 18, bottom: 8),
          child: Text(
            block.text,
            style: body.copyWith(
              fontSize: _size * 1.2,
              fontWeight: FontWeight.bold,
              height: 1.3,
            ),
          ),
        );
      case ReaderBlockKind.paragraph:
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Text(block.text, style: body),
        );
      case ReaderBlockKind.listItem:
        return Padding(
          padding: const EdgeInsets.only(bottom: 8, left: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('•  ', style: body.copyWith(color: _accent)),
              Expanded(child: Text(block.text, style: body)),
            ],
          ),
        );
      case ReaderBlockKind.quote:
        return Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.only(left: 14),
          decoration: const BoxDecoration(
            border: Border(left: BorderSide(color: _accent, width: 3)),
          ),
          child: Text(
            block.text,
            style: body.copyWith(fontStyle: FontStyle.italic, color: _soft),
          ),
        );
      case ReaderBlockKind.code:
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF221D18),
            borderRadius: BorderRadius.circular(8),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Text(
              block.text,
              style: body.copyWith(fontFamily: 'monospace', fontSize: _size * .75),
            ),
          ),
        );
      case ReaderBlockKind.caption:
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Text(
            block.text,
            style: body.copyWith(fontSize: _size * .8, color: _soft),
          ),
        );
      case ReaderBlockKind.image:
        if (!widget.showImages) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.network(
              block.text,
              semanticLabel: block.alt.isEmpty ? null : block.alt,
              fit: BoxFit.fitWidth,
              errorBuilder: (context, error, stack) => const SizedBox.shrink(),
            ),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final article = widget.article;
    final details = [
      if (article.site.isNotEmpty) article.site,
      if (article.byline.isNotEmpty) article.byline,
    ].join(' · ');
    return Scaffold(
      backgroundColor: _paper,
      appBar: AppBar(
        backgroundColor: _paper,
        foregroundColor: _ink,
        title: const Text('Modo lectura'),
        actions: [
          IconButton(
            tooltip: 'Letra más chica',
            onPressed: _size > 15 ? () => _resize(-2) : null,
            icon: const Icon(Icons.text_decrease),
          ),
          IconButton(
            tooltip: 'Letra más grande',
            onPressed: _size < 32 ? () => _resize(2) : null,
            icon: const Icon(Icons.text_increase),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
              children: [
                if (article.title.isNotEmpty)
                  Text(
                    article.title,
                    style: TextStyle(
                      fontSize: _size * 1.45,
                      fontWeight: FontWeight.bold,
                      height: 1.25,
                      color: _ink,
                    ),
                  ),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    details,
                    style: TextStyle(fontSize: _size * .75, color: _soft),
                  ),
                ],
                const Divider(height: 32, color: Color(0x33EDE6DA)),
                ...article.blocks.map(_block),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
