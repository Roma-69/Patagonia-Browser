package com.patagoniabrowser.patagonia_browser

import java.net.URI

/**
 * Aviso en descargas peligrosas (igual que la PC, src/shared/descargasPeligrosas.js): programas
 * (.apk, .exe...) que vienen de sitios que Patagonia no conoce. Las listas son las mismas que en la
 * PC; una prueba (tests/descargasPeligrosas.test.cjs) controla que no se desparejen.
 */
object DescargasPeligrosas {
    val EXTENSIONES = listOf(
        "exe", "msi", "msix", "msixbundle", "appx", "appxbundle", "bat", "cmd", "com", "scr", "pif", "ps1",
        "vbs", "vbe", "js", "jse", "wsf", "hta", "jar", "lnk", "reg", "cpl", "dll", "apk", "xapk", "apks",
    )

    val SITIOS_CONFIABLES = listOf(
        "microsoft.com", "windowsupdate.com", "github.com", "githubusercontent.com", "google.com", "mozilla.org",
        "mozilla.net", "brave.com", "videolan.org", "7-zip.org", "rarlab.com", "notepad-plus-plus.org",
        "libreoffice.org", "documentfoundation.org", "python.org", "nodejs.org", "java.com", "oracle.com",
        "nvidia.com", "amd.com", "intel.com", "asus.com", "lenovo.com", "dell.com", "hp.com", "epson.com",
        "tp-link.com", "motorola.com", "samsung.com", "steampowered.com", "epicgames.com", "ea.com",
        "battle.net", "ubisoft.com", "spotify.com", "zoom.us", "whatsapp.com", "whatsapp.net", "telegram.org",
        "discord.com", "adobe.com", "apple.com", "anydesk.com", "teamviewer.com", "bitwarden.com",
        "malwarebytes.com", "f-droid.org",
    )

    private val SEGUNDO_NIVEL = setOf(
        "com", "gob", "gov", "org", "net", "edu", "mil", "int", "tur", "co", "ac", "or", "ne", "nom", "coop", "info",
    )

    data class Aviso(val extension: String, val sitio: String)

    fun sitioDe(host: String): String {
        val limpio = host.lowercase().trimEnd('.')
        if (Regex("^\\d+\\.\\d+\\.\\d+\\.\\d+$").matches(limpio) || limpio.contains(':')) return limpio
        val partes = limpio.split('.').filter { it.isNotEmpty() }
        val n = partes.size
        if (n <= 2) return partes.joinToString(".")
        if (partes[n - 1].length == 2 && partes[n - 2] in SEGUNDO_NIVEL) return partes.takeLast(3).joinToString(".")
        return partes.takeLast(2).joinToString(".")
    }

    fun extensionPeligrosa(nombre: String): String {
        val ext = Regex("\\.([a-z0-9]+)$", RegexOption.IGNORE_CASE).find(nombre.trim())?.groupValues?.get(1)?.lowercase()
        return if (ext != null && ext in EXTENSIONES) ext else ""
    }

    private fun hostDe(direccion: String?): String = try {
        val uri = URI(direccion ?: "")
        if (uri.scheme?.lowercase() in setOf("http", "https")) uri.host?.lowercase().orEmpty() else ""
    } catch (_: Exception) {
        ""
    }

    fun sitioConfiable(host: String): Boolean {
        if (host.isEmpty()) return false
        val sitio = sitioDe(host)
        return sitio in SITIOS_CONFIABLES || sitio.endsWith(".gob.ar")
    }

    /** null si se puede bajar sin preguntar. */
    fun revisar(nombre: String, url: String?, pagina: String?): Aviso? {
        val extension = extensionPeligrosa(nombre)
        if (extension.isEmpty()) return null
        val hosts = listOf(hostDe(url), hostDe(pagina)).filter { it.isNotEmpty() }
        if (hosts.any { sitioConfiable(it) }) return null
        return Aviso(extension, if (hosts.isEmpty()) "una página sin dirección" else sitioDe(hosts.last()))
    }

    fun texto(nombre: String, aviso: Aviso) =
        "\"$nombre\" es un programa (.${aviso.extension}) y viene de ${aviso.sitio}, un sitio que Patagonia no conoce.\n\n" +
            "Los programas de páginas desconocidas son la forma más común de que entre un virus. " +
            "Bajalo solo si sabés qué es y confiás en quién te lo pasó."
}
