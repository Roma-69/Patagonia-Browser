package com.patagoniabrowser.patagonia_browser.gecko

import android.app.AlertDialog
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import com.patagoniabrowser.patagonia_browser.FotosLimpias
import com.patagoniabrowser.patagonia_browser.DescargasPeligrosas
import org.mozilla.geckoview.WebResponse
import java.io.File
import java.io.OutputStream
import kotlin.concurrent.thread

/**
 * Descargas: Gecko entrega el archivo ya pedido (con la sesión iniciada de la persona) y Patagonia
 * lo guarda en la carpeta Descargas del teléfono.
 */
object GeckoDownloads {
    private const val TAG = "PatagoniaGecko"

    /**
     * [notify] recibe ("start" | "done" | "error" | "cancel", nombre del archivo, número de descarga).
     * [pagina] es la dirección de la página desde donde se bajó (para el aviso de descargas peligrosas).
     * [privada]: se bajó desde una pestaña de incógnito (no queda en la lista al cerrar Patagonia).
     */
    fun save(
        context: Context,
        response: WebResponse,
        pagina: String? = null,
        privada: Boolean = false,
        notify: (String, String, Int) -> Unit,
    ) {
        val body = response.body
        val disposition = response.headers["Content-Disposition"] ?: response.headers["content-disposition"]
        val mime = (response.headers["Content-Type"] ?: response.headers["content-type"])
            ?.substringBefore(';')?.trim()
        val name = URLUtil.guessFileName(response.uri, disposition, mime)
            .replace(Regex("[\\\\/:*?\"<>|]"), "_")
        if (body == null) {
            notify("error", name, 0)
            return
        }
        // Aviso en descargas peligrosas: un programa de un sitio desconocido se pregunta antes de bajarlo.
        val aviso = DescargasPeligrosas.revisar(name, response.uri, pagina)
        if (aviso != null) {
            Handler(Looper.getMainLooper()).post {
                val activity = GeckoEngine.activity
                if (activity == null || activity.isFinishing) {
                    try { body.close() } catch (_: Exception) {}
                    return@post
                }
                AlertDialog.Builder(activity)
                    .setTitle("¿Bajar este programa?")
                    .setMessage(DescargasPeligrosas.texto(name, aviso))
                    .setNegativeButton("Bajar igual") { _, _ -> guardar(context, body, name, mime, response, privada, notify) }
                    .setPositiveButton("No bajar") { _, _ -> try { body.close() } catch (_: Exception) {} }
                    .setOnCancelListener { try { body.close() } catch (_: Exception) {} }
                    .show()
            }
            return
        }
        guardar(context, body, name, mime, response, privada, notify)
    }

    private fun guardar(
        context: Context,
        body: java.io.InputStream,
        name: String,
        mime: String?,
        response: WebResponse,
        privada: Boolean,
        notify: (String, String, Int) -> Unit,
    ) {
        val largo = (response.headers["Content-Length"] ?: response.headers["content-length"])?.toLongOrNull() ?: -1L
        val item = Descargas.empezar(context, name, mime, largo, privada)
        notify("start", name, item.id)
        thread(name = "patagonia-descarga") {
            var destino: Destino? = null
            try {
                destino = open(context, name, mime)
                val salida = destino.output
                if (esFoto(name, mime, response)) {
                    // Fotos limpias: se guardan sin los datos escondidos (ubicación, FBMD de Meta...).
                    val bytes = body.use { copiar(context, item, it, null) }
                    if (item.cancelar) throw Cancelada()
                    salida.use { it.write(FotosLimpias.limpiar(bytes) ?: bytes) }
                } else {
                    body.use { input -> salida.use { copiar(context, item, input, it) } }
                    if (item.cancelar) throw Cancelada()
                }
                destino.uri?.let { finish(context, it) }
                Descargas.terminar(context, item, Descargas.COMPLETADA, destino.uri, destino.archivo)
                notify("done", name, item.id)
            } catch (error: Exception) {
                try { body.close() } catch (_: Exception) {}
                try { destino?.output?.close() } catch (_: Exception) {}
                borrar(context, destino)
                if (error is Cancelada || item.cancelar) {
                    Descargas.terminar(context, item, Descargas.CANCELADA, null, null)
                    notify("cancel", name, item.id)
                } else {
                    Log.e(TAG, "No se pudo guardar la descarga", error)
                    Descargas.terminar(context, item, Descargas.FALLIDA, null, null)
                    notify("error", name, item.id)
                }
            }
        }
    }

    private class Cancelada : Exception()

    private class Destino(val output: OutputStream, val uri: Uri?, val archivo: File?)

    /**
     * Copia de a pedacitos para ir mostrando el progreso. Si [salida] es null junta todo en memoria
     * (fotos, que se limpian antes de guardarlas) y lo devuelve.
     */
    private fun copiar(
        context: Context,
        item: Descargas.Item,
        entrada: java.io.InputStream,
        salida: OutputStream?,
    ): ByteArray {
        val memoria = if (salida == null) java.io.ByteArrayOutputStream() else null
        val buffer = ByteArray(64 * 1024)
        var total = 0L
        while (!item.cancelar) {
            val leidos = entrada.read(buffer)
            if (leidos < 0) break
            (salida ?: memoria!!).write(buffer, 0, leidos)
            total += leidos
            Descargas.progreso(context, item, total)
        }
        return memoria?.toByteArray() ?: ByteArray(0)
    }

    /** Si se canceló o falló, no queda un archivo a medias en Descargas. */
    private fun borrar(context: Context, destino: Destino?) {
        try {
            destino?.uri?.let { context.contentResolver.delete(it, null, null) }
            destino?.archivo?.delete()
        } catch (_: Exception) {}
    }

    private fun esFoto(name: String, mime: String?, response: WebResponse): Boolean {
        val largo = (response.headers["Content-Length"] ?: response.headers["content-length"])?.toLongOrNull()
        if (largo != null && largo > FotosLimpias.LIMITE_BYTES) return false
        return mime?.matches(Regex("image/(jpeg|png|webp)")) == true ||
            name.contains(Regex("\\.(jpe?g|png|webp)$", RegexOption.IGNORE_CASE))
    }

    private fun open(context: Context, name: String, mime: String?): Destino {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(
                    MediaStore.Downloads.MIME_TYPE,
                    mime ?: MimeTypeMap.getSingleton()
                        .getMimeTypeFromExtension(name.substringAfterLast('.', "")) ?: "application/octet-stream",
                )
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("No se pudo crear el archivo")
            val stream = context.contentResolver.openOutputStream(uri) ?: error("No se pudo abrir el archivo")
            return Destino(stream, uri, null)
        }
        // Android 8 y 9: carpeta de descargas propia de la app (no pide permisos).
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        val archivo = File(dir, name)
        return Destino(archivo.outputStream(), null, archivo)
    }

    private fun finish(context: Context, uri: Uri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        context.contentResolver.update(
            uri,
            ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) },
            null,
            null,
        )
    }
}
