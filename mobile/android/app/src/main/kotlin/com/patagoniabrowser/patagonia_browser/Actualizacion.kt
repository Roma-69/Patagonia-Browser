package com.patagoniabrowser.patagonia_browser

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Baja el APK de la versión nueva desde los releases de GitHub y abre el instalador de
 * Android. Así nadie tiene que entrar a GitHub: tocás el aviso y listo.
 *
 * Solo acepta APKs de los releases de celular de Patagonia (movil-v…). Android además
 * comprueba que el APK esté firmado con la misma clave: si no, no lo instala encima.
 */
object Actualizacion {
    private const val ORIGEN = "https://github.com/Roma-69/Patagonia-Browser/releases/download/movil-v"
    private val principal = Handler(Looper.getMainLooper())
    @Volatile private var bajando = false

    fun esValida(url: String?): Boolean =
        url != null && url.startsWith(ORIGEN) && url.endsWith(".apk") && !url.contains("..")

    /** Respuestas: "instalando", "permiso" (falta permitir instalar apps), "ocupado" o "error". */
    fun instalar(activity: Activity, url: String?, listo: (String) -> Unit) {
        if (!esValida(url)) return listo("error")
        if (bajando) return listo("ocupado")
        bajando = true
        Thread {
            val resultado = try {
                val apk = bajar(activity, url!!)
                abrirInstalador(activity, apk)
            } catch (_: Exception) {
                "error"
            } finally {
                bajando = false
            }
            principal.post { listo(resultado) }
        }.start()
    }

    private fun bajar(activity: Activity, url: String): File {
        val carpeta = File(activity.cacheDir, "actualizacion").apply { mkdirs() }
        val nombre = url.substringAfter(ORIGEN).replace('/', '-')
        val destino = File(carpeta, "movil-v$nombre")
        if (destino.isFile && destino.length() > 0) return destino
        // Sacamos versiones viejas que hayan quedado bajadas.
        carpeta.listFiles()?.forEach { it.delete() }
        val parcial = File(carpeta, "${destino.name}.part")
        val conexion = (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("User-Agent", "Patagonia-Browser-Android")
        }
        try {
            if (conexion.responseCode != HttpURLConnection.HTTP_OK) error("HTTP ${conexion.responseCode}")
            conexion.inputStream.use { entrada ->
                parcial.outputStream().use { salida -> entrada.copyTo(salida) }
            }
        } finally {
            conexion.disconnect()
        }
        if (!parcial.renameTo(destino)) error("no se pudo guardar")
        return destino
    }

    private fun abrirInstalador(activity: Activity, apk: File): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()) {
            // Android pide una sola vez permitir que Patagonia instale su propia actualización.
            val ajustes = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}"),
            )
            return try {
                activity.startActivity(ajustes)
                "permiso"
            } catch (_: ActivityNotFoundException) {
                "error"
            }
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.actualizacion", apk)
        val instalar = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            activity.startActivity(instalar)
            "instalando"
        } catch (_: ActivityNotFoundException) {
            "error"
        }
    }
}
