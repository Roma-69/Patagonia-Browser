package com.patagoniabrowser.patagonia_browser

/**
 * Fotos limpias (igual que la PC, src/main/fotosLimpias.js): borra los datos escondidos de las fotos
 * (ubicación GPS, modelo del celular, fecha, la marca oculta "FBMD" que Meta mete en las fotos de
 * Facebook e Instagram, comentarios, XMP, IPTC...). Deja la orientación y el perfil de color para
 * que la foto se vea igual. Kotlin puro (sin Android) para poder probarlo aparte.
 */
object FotosLimpias {
    const val LIMITE_BYTES = 60 * 1024 * 1024

    fun tipo(b: ByteArray): String {
        if (b.size < 12) return ""
        if (u(b, 0) == 0xFF && u(b, 1) == 0xD8 && u(b, 2) == 0xFF) return "jpeg"
        if (u(b, 0) == 0x89 && empieza(b, 1, "PNG\r\n\u001a\n")) return "png"
        if (empieza(b, 0, "RIFF") && empieza(b, 8, "WEBP")) return "webp"
        return ""
    }

    /** La foto limpia, o null si no es una foto que sepamos limpiar o ya estaba limpia. */
    fun limpiar(b: ByteArray): ByteArray? {
        if (b.size > LIMITE_BYTES) return null
        return try {
            val limpia = when (tipo(b)) {
                "jpeg" -> jpeg(b)
                "png" -> png(b)
                "webp" -> webp(b)
                else -> null
            }
            if (limpia == null || limpia.contentEquals(b)) null else limpia
        } catch (_: Exception) {
            null
        }
    }

    private fun u(b: ByteArray, i: Int) = b[i].toInt() and 0xFF

    private fun empieza(b: ByteArray, desde: Int, texto: String): Boolean {
        if (desde + texto.length > b.size) return false
        for (i in texto.indices) if (u(b, desde + i) != texto[i].code) return false
        return true
    }

    private fun orientacionExif(b: ByteArray, inicio: Int, fin: Int): Int {
        val t = inicio + 6
        if (t + 8 > fin) return 1
        val little = u(b, t) == 0x49 && u(b, t + 1) == 0x49
        if (!little && !(u(b, t) == 0x4D && u(b, t + 1) == 0x4D)) return 1
        fun u16(p: Int) = if (little) u(b, p) or (u(b, p + 1) shl 8) else (u(b, p) shl 8) or u(b, p + 1)
        fun u32(p: Int): Long = if (little) {
            (u(b, p).toLong() or (u(b, p + 1).toLong() shl 8) or (u(b, p + 2).toLong() shl 16) or (u(b, p + 3).toLong() shl 24))
        } else {
            ((u(b, p).toLong() shl 24) or (u(b, p + 1).toLong() shl 16) or (u(b, p + 2).toLong() shl 8) or u(b, p + 3).toLong())
        }
        val desplazamiento = u32(t + 4)
        if (desplazamiento > fin) return 1
        val ifd = t + desplazamiento.toInt()
        if (ifd + 2 > fin) return 1
        val cantidad = u16(ifd)
        for (i in 0 until cantidad) {
            val e = ifd + 2 + i * 12
            if (e + 12 > fin) break
            if (u16(e) == 0x0112) {
                val valor = u16(e + 8)
                return if (valor in 1..8) valor else 1
            }
        }
        return 1
    }

    private fun exifSoloOrientacion(o: Int): ByteArray = byteArrayOf(
        0xFF.toByte(), 0xE1.toByte(), 0x00, 0x22,
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
        0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,
        0x00, 0x01,
        0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
        0x00, o.toByte(), 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
    )

    private fun jpeg(b: ByteArray): ByteArray? {
        val partes = ArrayList<ByteArray>()
        partes.add(b.copyOfRange(0, 2))
        var pos = 2
        var orientacion = 1
        var quitado = false
        var posicionExif = -1
        var llego = false
        while (pos + 4 <= b.size) {
            if (u(b, pos) != 0xFF) return null
            val marca = u(b, pos + 1)
            if (marca == 0xFF) { pos++; continue }
            if (marca == 0xD8 || marca == 0x01 || marca in 0xD0..0xD7) {
                partes.add(b.copyOfRange(pos, pos + 2)); pos += 2; continue
            }
            if (marca == 0xD9) break
            val largo = (u(b, pos + 2) shl 8) or u(b, pos + 3)
            val fin = pos + 2 + largo
            if (largo < 2 || fin > b.size) return null
            if (marca == 0xDA) {
                var corte = b.size
                var f = fin
                while (f + 1 < b.size) {
                    if (u(b, f) == 0xFF && u(b, f + 1) == 0xD9) { corte = f + 2; break }
                    f++
                }
                if (corte < b.size) quitado = true
                partes.add(b.copyOfRange(pos, corte))
                llego = true
                break
            }
            val datos = pos + 4
            val conservar = when {
                marca == 0xE1 -> {
                    if (empieza(b, datos, "Exif\u0000")) orientacion = orientacionExif(b, datos, fin)
                    if (posicionExif < 0) posicionExif = partes.size
                    false
                }
                marca == 0xE2 -> empieza(b, datos, "ICC_PROFILE\u0000")
                marca == 0xE0 -> empieza(b, datos, "JFIF\u0000") || empieza(b, datos, "JFXX\u0000")
                marca == 0xEE -> empieza(b, datos, "Adobe")
                marca in 0xE3..0xEF || marca == 0xFE -> false
                else -> true
            }
            if (conservar) partes.add(b.copyOfRange(pos, fin)) else quitado = true
            pos = fin
        }
        if (!llego || !quitado) return null
        if (orientacion != 1) partes.add(if (posicionExif > 0) posicionExif else 1, exifSoloOrientacion(orientacion))
        return unir(partes)
    }

    private val CHUNKS_PNG_QUITAR = setOf("tEXt", "zTXt", "iTXt", "eXIf", "tIME")

    private fun png(b: ByteArray): ByteArray? {
        val partes = ArrayList<ByteArray>()
        partes.add(b.copyOfRange(0, 8))
        var pos = 8
        var quitado = false
        while (pos + 12 <= b.size) {
            val largo = (u(b, pos).toLong() shl 24) or (u(b, pos + 1).toLong() shl 16) or
                (u(b, pos + 2).toLong() shl 8) or u(b, pos + 3).toLong()
            if (pos + 12 + largo > b.size) return null
            val fin = pos + 12 + largo.toInt()
            val tipo = String(b, pos + 4, 4, Charsets.ISO_8859_1)
            if (tipo in CHUNKS_PNG_QUITAR) quitado = true else partes.add(b.copyOfRange(pos, fin))
            pos = fin
            if (tipo == "IEND") break
        }
        return if (quitado) unir(partes) else null
    }

    private fun webp(b: ByteArray): ByteArray? {
        val partes = ArrayList<ByteArray>()
        var pos = 12
        var quitado = false
        var vp8x = -1
        while (pos + 8 <= b.size) {
            val tipo = String(b, pos, 4, Charsets.ISO_8859_1)
            val largo = u(b, pos + 4).toLong() or (u(b, pos + 5).toLong() shl 8) or
                (u(b, pos + 6).toLong() shl 16) or (u(b, pos + 7).toLong() shl 24)
            if (pos + 8 + largo > b.size) return null
            val fin = pos + 8 + largo.toInt() + (largo.toInt() and 1)
            if (tipo == "EXIF" || tipo == "XMP ") {
                quitado = true
            } else {
                if (tipo == "VP8X") vp8x = partes.size
                partes.add(b.copyOfRange(pos, minOf(fin, b.size)))
            }
            pos = fin
        }
        if (!quitado) return null
        if (vp8x >= 0) {
            val copia = partes[vp8x].copyOf()
            copia[8] = (copia[8].toInt() and 0x0C.inv()).toByte()
            partes[vp8x] = copia
        }
        val cabecera = b.copyOfRange(0, 12)
        val tamano = 4 + partes.sumOf { it.size }
        cabecera[4] = (tamano and 0xFF).toByte()
        cabecera[5] = ((tamano shr 8) and 0xFF).toByte()
        cabecera[6] = ((tamano shr 16) and 0xFF).toByte()
        cabecera[7] = ((tamano ushr 24) and 0xFF).toByte()
        partes.add(0, cabecera)
        return unir(partes)
    }

    private fun unir(partes: List<ByteArray>): ByteArray {
        val salida = ByteArray(partes.sumOf { it.size })
        var pos = 0
        for (p in partes) { p.copyInto(salida, pos); pos += p.size }
        return salida
    }
}
