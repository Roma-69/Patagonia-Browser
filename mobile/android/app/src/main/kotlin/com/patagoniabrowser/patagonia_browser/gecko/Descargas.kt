package com.patagoniabrowser.patagonia_browser.gecko

import android.Manifest
import android.app.DownloadManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Lista de descargas de Patagonia (lo mismo que el panel de descargas de la PC):
 * - Lleva el progreso de cada archivo y se lo pasa a Flutter (Menú → Descargas).
 * - Muestra la notificación de Android con el porcentaje y, al terminar, "tocá para abrir".
 * - Abre el archivo, la carpeta Descargas del teléfono, y cancela lo que se está bajando.
 * Las terminadas se recuerdan entre usos (menos las de incógnito); si la persona borra el archivo
 * desde la galería o el administrador de archivos, desaparece de la lista.
 */
object Descargas {
    const val DESCARGANDO = "descargando"
    const val COMPLETADA = "completada"
    const val FALLIDA = "fallida"
    const val CANCELADA = "cancelada"

    private const val CANAL = "descargas"
    private const val NOTIFICACION_BASE = 5200
    private const val PREFS = "patagonia_descargas"
    private const val PREF_LISTA = "lista"
    private const val PREF_PIDIO_AVISOS = "pidioAvisos"
    private const val MAXIMO = 100
    private const val CADA_MS = 400L

    class Item(
        val id: Int,
        val nombre: String,
        val mime: String?,
        val privada: Boolean,
        val fecha: Long,
    ) {
        @Volatile var estado = DESCARGANDO
        @Volatile var recibidos = 0L
        @Volatile var total = -1L
        @Volatile var cancelar = false
        @Volatile var uri: String? = null
        var ultimoAviso = 0L

        fun aMapa(): Map<String, Any?> = mapOf(
            "id" to id,
            "nombre" to nombre,
            "estado" to estado,
            "recibidos" to recibidos,
            "total" to total,
            "fecha" to fecha,
            "privada" to privada,
        )
    }

    private val main = Handler(Looper.getMainLooper())
    private val items = LinkedHashMap<Int, Item>()
    private var cargadas = false
    private var siguienteId = 1

    // ---- Ciclo de una descarga (lo llama GeckoDownloads) ----

    @Synchronized
    fun empezar(context: Context, nombre: String, mime: String?, total: Long, privada: Boolean): Item {
        cargar(context)
        val item = Item(siguienteId++, nombre, mime, privada, System.currentTimeMillis())
        item.total = total
        items[item.id] = item
        recortar()
        main.post {
            pedirAvisos()
            notificar(context, item)
            avisarFlutter()
        }
        return item
    }

    /** Se llama mientras se copian los bytes; avisa como mucho cada [CADA_MS]. */
    fun progreso(context: Context, item: Item, recibidos: Long) {
        item.recibidos = recibidos
        val ahora = SystemClock.elapsedRealtime()
        if (ahora - item.ultimoAviso < CADA_MS) return
        item.ultimoAviso = ahora
        main.post {
            notificar(context, item)
            avisarFlutter()
        }
    }

    fun terminar(context: Context, item: Item, estado: String, uri: Uri?, archivo: File?) {
        item.estado = estado
        item.uri = when {
            estado != COMPLETADA -> null
            uri != null -> uri.toString()
            archivo != null -> Uri.fromFile(archivo).toString()
            else -> null
        }
        if (estado == COMPLETADA && item.total < 0) item.total = item.recibidos
        guardar(context)
        main.post {
            notificar(context, item)
            avisarFlutter()
        }
    }

    // ---- Lo que pide Flutter ----

    @Synchronized
    fun lista(context: Context): List<Map<String, Any?>> {
        cargar(context)
        // Si la persona borró el archivo por fuera de Patagonia, se saca de la lista.
        val borradas = items.values.filter { it.estado == COMPLETADA && !existe(context, it) }
        if (borradas.isNotEmpty()) {
            borradas.forEach { items.remove(it.id) }
            guardar(context)
        }
        return foto()
    }

    /** Abre el archivo con la app que corresponda. "ok", "sinapp" o "noexiste". */
    fun abrir(context: Context, id: Int): String {
        val item = synchronized(this) { items[id] } ?: return "noexiste"
        val uri = uriParaAbrir(context, item) ?: return "noexiste"
        val mime = item.mime ?: MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(item.nombre.substringAfterLast('.', "").lowercase())
            ?: "*/*"
        val ver = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(ver)
            "ok"
        } catch (_: ActivityNotFoundException) {
            "sinapp"
        } catch (_: SecurityException) {
            "noexiste"
        }
    }

    /** Abre la carpeta Descargas del teléfono (app Archivos). */
    fun abrirCarpeta(context: Context): Boolean {
        val carpeta = Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(carpeta)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }

    fun cancelar(id: Int) {
        synchronized(this) { items[id] }?.cancelar = true
    }

    /** Saca de la lista las que ya terminaron. El archivo queda en Descargas. */
    @Synchronized
    fun limpiar(context: Context) {
        val terminadas = items.values.filter { it.estado != DESCARGANDO }
        terminadas.forEach {
            items.remove(it.id)
            manager(context)?.cancel(NOTIFICACION_BASE + it.id)
        }
        guardar(context)
        main.post { avisarFlutter() }
    }

    /** Al cerrar la última pestaña de incógnito: las descargas privadas salen de la lista. */
    @Synchronized
    fun olvidarPrivadas(context: Context) {
        val privadas = items.values.filter { it.privada && it.estado != DESCARGANDO }
        if (privadas.isEmpty()) return
        privadas.forEach {
            items.remove(it.id)
            manager(context)?.cancel(NOTIFICACION_BASE + it.id)
        }
        main.post { avisarFlutter() }
    }

    // ---- Avisos ----

    @Synchronized
    private fun foto(): List<Map<String, Any?>> = items.values.reversed().map { it.aMapa() }

    private fun avisarFlutter() {
        val canal = GeckoEngine.channel ?: return
        canal.invokeMethod("descargas", foto())
    }

    /** Android 13 en adelante pide permiso para notificaciones: se pregunta una sola vez. */
    private fun pedirAvisos() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val activity = GeckoEngine.activity ?: return
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED) return
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(PREF_PIDIO_AVISOS, false)) return
        prefs.edit().putBoolean(PREF_PIDIO_AVISOS, true).apply()
        (activity as? AndroidPermissionRequester)
            ?.requestAndroidPermissions(listOf(Manifest.permission.POST_NOTIFICATIONS)) { }
    }

    private fun manager(context: Context): NotificationManager? =
        context.getSystemService(NotificationManager::class.java)

    private fun notificar(context: Context, item: Item) {
        val manager = manager(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED) return
        if (manager.getNotificationChannel(CANAL) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CANAL, "Descargas", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Progreso de lo que bajás con Patagonia y aviso cuando termina."
                    setShowBadge(false)
                },
            )
        }
        val numero = NOTIFICACION_BASE + item.id
        if (item.estado == CANCELADA) {
            manager.cancel(numero)
            return
        }
        val builder = Notification.Builder(context, CANAL)
            .setContentTitle(item.nombre)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
        when (item.estado) {
            DESCARGANDO -> {
                val conTotal = item.total > 0
                val porcentaje = if (conTotal) ((item.recibidos * 100) / item.total).toInt().coerceIn(0, 100) else 0
                builder
                    .setSmallIcon(android.R.drawable.stat_sys_download)
                    .setContentText(
                        if (conTotal) "Descargando… $porcentaje % (${tamanio(item.recibidos)} de ${tamanio(item.total)})"
                        else "Descargando… ${tamanio(item.recibidos)}",
                    )
                    .setProgress(100, porcentaje, !conTotal)
                    .setOngoing(true)
                    .setContentIntent(abrirPatagonia(context))
            }
            COMPLETADA -> builder
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentText("Descarga lista. Tocá para abrir.")
                .setAutoCancel(true)
                .setContentIntent(abrirArchivoDesdeAviso(context, item) ?: abrirPatagonia(context))
            else -> builder
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentText("No se pudo descargar. Probá de nuevo desde la página.")
                .setAutoCancel(true)
                .setContentIntent(abrirPatagonia(context))
        }
        try {
            manager.notify(numero, builder.build())
        } catch (_: SecurityException) {
            // Sin permiso de notificaciones: queda la lista dentro de Patagonia.
        }
    }

    private fun abrirPatagonia(context: Context): PendingIntent? =
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }

    private fun abrirArchivoDesdeAviso(context: Context, item: Item): PendingIntent? {
        val uri = uriParaAbrir(context, item) ?: return null
        val mime = item.mime ?: MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(item.nombre.substringAfterLast('.', "").lowercase()) ?: "*/*"
        val ver = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(
            context, NOTIFICACION_BASE + item.id, ver,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    // ---- Archivos ----

    /** content:// que otra app puede leer. En Android 8 y 9 el archivo es de Patagonia: va por FileProvider. */
    private fun uriParaAbrir(context: Context, item: Item): Uri? {
        val guardada = Uri.parse(item.uri ?: return null)
        if (guardada.scheme != "file") return guardada
        val archivo = File(guardada.path ?: return null)
        if (!archivo.exists()) return null
        return try {
            FileProvider.getUriForFile(context, context.packageName + ".actualizacion", archivo)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun existe(context: Context, item: Item): Boolean {
        val uri = Uri.parse(item.uri ?: return false)
        if (uri.scheme == "file") return File(uri.path ?: return false).exists()
        return try {
            context.contentResolver.query(uri, arrayOf("_id"), null, null, null)?.use { it.count > 0 } ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun tamanio(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format(java.util.Locale.forLanguageTag("es-AR"), "%.1f KB", bytes / 1024.0)
        else -> String.format(java.util.Locale.forLanguageTag("es-AR"), "%.1f MB", bytes / (1024.0 * 1024.0))
    }

    // ---- Guardado entre usos ----

    private fun cargar(context: Context) {
        if (cargadas) return
        cargadas = true
        val texto = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_LISTA, null) ?: return
        try {
            val array = JSONArray(texto)
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                val item = Item(
                    o.getInt("id"), o.getString("nombre"),
                    o.optString("mime").ifEmpty { null }, false, o.optLong("fecha"),
                )
                item.estado = o.optString("estado", COMPLETADA)
                item.recibidos = o.optLong("recibidos")
                item.total = o.optLong("total", -1)
                item.uri = o.optString("uri").ifEmpty { null }
                items[item.id] = item
                if (item.id >= siguienteId) siguienteId = item.id + 1
            }
        } catch (_: Exception) {
            items.clear()
        }
    }

    @Synchronized
    private fun guardar(context: Context) {
        val array = JSONArray()
        items.values
            .filter { !it.privada && it.estado == COMPLETADA }
            .forEach {
                array.put(
                    JSONObject()
                        .put("id", it.id)
                        .put("nombre", it.nombre)
                        .put("mime", it.mime ?: "")
                        .put("estado", it.estado)
                        .put("recibidos", it.recibidos)
                        .put("total", it.total)
                        .put("fecha", it.fecha)
                        .put("uri", it.uri ?: ""),
                )
            }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(PREF_LISTA, array.toString()).apply()
    }

    private fun recortar() {
        val terminadas = items.values.filter { it.estado != DESCARGANDO }
        terminadas.take(maxOf(0, items.size - MAXIMO)).forEach { items.remove(it.id) }
    }
}
