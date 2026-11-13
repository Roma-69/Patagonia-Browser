package com.patagoniabrowser.patagonia_browser

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Bundle
import com.patagoniabrowser.patagonia_browser.gecko.AndroidPermissionRequester
import com.patagoniabrowser.patagonia_browser.gecko.GeckoEngine
import com.patagoniabrowser.patagonia_browser.gecko.GeckoPrompts
import com.patagoniabrowser.patagonia_browser.gecko.GeckoViewFactory
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity(), AndroidPermissionRequester {
    /** Sitio que hay que abrir al arrancar (acceso directo de la pantalla de inicio). */
    private var launchUrl: String? = null
    private var fileResult: MethodChannel.Result? = null
    private var pendingText: String? = null
    private var pending: ((Boolean) -> Unit)? = null
    private var requested: List<String> = emptyList()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        GeckoEngine.activity = this

        // Motor GeckoView: una vista nativa por pestaña y el canal general (uBlock Origin).
        flutterEngine.platformViewsController.registry.registerViewFactory(
            GeckoViewFactory.VIEW_TYPE, GeckoViewFactory(messenger))
        val engineChannel = MethodChannel(messenger, "patagonia/gecko_engine")
        GeckoEngine.channel = engineChannel
        engineChannel.setMethodCallHandler { call, result ->
            when (call.method) {
                "ensureUBlock" -> GeckoEngine.ensureUBlock(this).accept(
                    { version -> result.success(version) },
                    { error -> result.error("ubo", error?.message ?: "error desconocido", null) },
                )
                "openUBlockPanel" -> result.success(GeckoEngine.openUBlockPanel())
                "dropPending" -> {
                    (call.arguments as? Number)?.toInt()?.let { GeckoEngine.dropPending(it) }
                    result.success(null)
                }
                "setKidsMode" -> {
                    GeckoEngine.setKidsMode(this, call.arguments == true)
                    result.success(null)
                }
                "setLargeText" -> {
                    GeckoEngine.setLargeText(this, call.arguments == true)
                    result.success(null)
                }
                "share" -> {
                    val args = call.arguments as? Map<*, *>
                    result.success(share(args?.get("text") as? String, args?.get("title") as? String))
                }
                "openWhatsApp" -> result.success(openWhatsApp())
                "appVersion" -> result.success(appVersion())
                "addShortcut" -> {
                    val args = call.arguments as? Map<*, *>
                    result.success(addShortcut(args?.get("url") as? String, args?.get("title") as? String))
                }
                "takeLaunchUrl" -> {
                    result.success(launchUrl)
                    launchUrl = null
                }
                "saveTextFile" -> {
                    val args = call.arguments as? Map<*, *>
                    saveTextFile(args?.get("name") as? String, args?.get("text") as? String, result)
                }
                "openTextFile" -> openTextFile(result)
                else -> result.notImplemented()
            }
        }

        MethodChannel(messenger, "com.patagoniabrowser/permissions").setMethodCallHandler { call, result ->
            if (call.method != "request") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val names = call.arguments as? List<*>
            if (names.isNullOrEmpty() ||
                names.any { it !in listOf("camera", "microphone", "location") }) {
                result.success(false)
                return@setMethodCallHandler
            }
            val permissions = names.flatMap {
                when (it) {
                    "camera" -> listOf(Manifest.permission.CAMERA)
                    "microphone" -> listOf(Manifest.permission.RECORD_AUDIO)
                    else -> listOf(Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.ACCESS_FINE_LOCATION)
                }
            }.distinct()
            requestAndroidPermissions(permissions) { result.success(it) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        launchUrl = webUrl(intent)
        super.onCreate(savedInstanceState)
    }

    /** Patagonia ya estaba abierta y se tocó un acceso directo: abrir el sitio en una pestaña. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val url = webUrl(intent) ?: return
        val channel = GeckoEngine.channel
        if (channel == null) launchUrl = url else channel.invokeMethod("openUrl", url)
    }

    /** Solo direcciones web: los accesos directos nunca abren otra cosa. */
    private fun webUrl(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val uri = intent.data ?: return null
        return if (uri.scheme?.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank()) {
            uri.toString()
        } else null
    }

    /**
     * "Agregar a la pantalla de inicio": lo mismo que "Crear app de esta página" en la PC.
     * El ícono es la inicial del sitio en los colores de Patagonia.
     */
    private fun addShortcut(url: String?, title: String?): Boolean {
        val uri = Uri.parse(url ?: return false)
        if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host.isNullOrBlank()) return false
        val manager = getSystemService(ShortcutManager::class.java) ?: return false
        if (!manager.isRequestPinShortcutSupported) return false
        val host = uri.host!!.removePrefix("www.")
        val label = (title?.trim().takeUnless { it.isNullOrEmpty() } ?: host).take(40)
        val open = Intent(Intent.ACTION_VIEW, uri, this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val info = ShortcutInfo.Builder(this, "sitio-" + uri.toString().hashCode())
            .setShortLabel(label.take(25))
            .setLongLabel(label)
            .setIcon(Icon.createWithAdaptiveBitmap(letterIcon(host)))
            .setIntent(open)
            .build()
        return try {
            manager.requestPinShortcut(info, null)
        } catch (_: RuntimeException) {
            false
        }
    }

    private fun letterIcon(host: String): Bitmap {
        val colors = intArrayOf(0xFF1E4E79.toInt(), 0xFFC4572A.toInt(), 0xFF2E7D5B.toInt(),
            0xFF6A4C93.toInt(), 0xFFB5651D.toInt(), 0xFF2B6CB0.toInt())
        val size = 432 // 108 dp × 4: el lanzador recorta el borde (ícono adaptable)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(colors[Math.floorMod(host.hashCode(), colors.size)])
        val letter = host.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "P"
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = size * 0.36f
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val y = size / 2f - (paint.descent() + paint.ascent()) / 2f
        canvas.drawText(letter, size / 2f, y, paint)
        return bitmap
    }

    /** Guardar un archivo de texto donde elija el usuario (favoritos para pasar a la PC). */
    private fun saveTextFile(name: String?, text: String?, result: MethodChannel.Result) {
        if (text == null || fileResult != null) return result.success(false)
        pendingText = text
        fileResult = result
        val create = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("text/html")
            .putExtra(Intent.EXTRA_TITLE, name ?: "favoritos-patagonia.html")
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(create, REQUEST_SAVE_FILE)
        } catch (_: ActivityNotFoundException) {
            finishFile(false)
        }
    }

    /** Abrir un archivo de texto (favoritos que vienen de la PC). Devuelve el texto o null. */
    private fun openTextFile(result: MethodChannel.Result) {
        if (fileResult != null) return result.success(null)
        fileResult = result
        val open = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/html", "text/plain", "application/octet-stream"))
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(open, REQUEST_OPEN_FILE)
        } catch (_: ActivityNotFoundException) {
            finishFile(null)
        }
    }

    private fun finishFile(value: Any?) {
        val result = fileResult
        fileResult = null
        pendingText = null
        result?.success(value)
    }

    private fun onFileResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_SAVE_FILE && requestCode != REQUEST_OPEN_FILE) return false
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) {
            finishFile(if (requestCode == REQUEST_SAVE_FILE) false else null)
            return true
        }
        val text = pendingText
        Thread {
            val value: Any? = try {
                if (requestCode == REQUEST_SAVE_FILE) {
                    contentResolver.openOutputStream(uri, "wt")?.use {
                        it.write((text ?: "").toByteArray(Charsets.UTF_8))
                    } != null
                } else {
                    contentResolver.openInputStream(uri)?.use { input ->
                        val bytes = input.readNBytesCompat(MAX_TEXT_FILE + 1)
                        if (bytes.size > MAX_TEXT_FILE) null else String(bytes, Charsets.UTF_8)
                    }
                }
            } catch (_: Exception) {
                if (requestCode == REQUEST_SAVE_FILE) false else null
            }
            runOnUiThread { finishFile(value) }
        }.start()
        return true
    }

    private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        while (out.size() < limit) {
            val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
            if (read < 0) break
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    /** Compartir con la hoja de Android (WhatsApp, correo, etc.). */
    private fun share(text: String?, title: String?): Boolean {
        if (text.isNullOrBlank()) return false
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text)
        if (!title.isNullOrBlank()) send.putExtra(Intent.EXTRA_SUBJECT, title)
        return try {
            startActivity(Intent.createChooser(send, "Compartir"))
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }

    /** WhatsApp Web no anda en el celular: el acceso rápido abre la app de WhatsApp. */
    private fun openWhatsApp(): Boolean {
        for (name in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            val launch = packageManager.getLaunchIntentForPackage(name) ?: continue
            return try {
                startActivity(launch)
                true
            } catch (_: ActivityNotFoundException) {
                false
            }
        }
        return false
    }

    private fun appVersion(): String? = try {
        packageManager.getPackageInfo(packageName, 0).versionName
    } catch (_: PackageManager.NameNotFoundException) {
        null
    }

    override fun requestAndroidPermissions(permissions: List<String>, done: (Boolean) -> Unit) {
        if (granted(permissions)) return done(true)
        if (pending != null) return done(false)
        pending = done
        requested = permissions
        try {
            requestPermissions(permissions.toTypedArray(), REQUEST_PERMISSIONS)
        } catch (_: RuntimeException) {
            pending = null
            requested = emptyList()
            done(false)
        }
    }

    private fun granted(permissions: List<String>): Boolean = permissions.all {
        if (it == Manifest.permission.ACCESS_FINE_LOCATION) {
            // Approximate location is a valid choice on Android 12+.
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        } else checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>,
        grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_PERMISSIONS) {
            val callback = pending
            val allowed = grantResults.isNotEmpty() && granted(requested)
            pending = null
            requested = emptyList()
            callback?.invoke(allowed)
        }
    }

    @Deprecated("Selector de archivos de las páginas (GeckoPrompts)")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (onFileResult(requestCode, resultCode, data)) return
        if (!GeckoPrompts.onActivityResult(requestCode, resultCode, data)) {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Gecko necesita enterarse cuando se gira el celular o cambia el tamaño de letra.
        GeckoEngine.runtime(this).configurationChanged(newConfig)
    }

    override fun onDestroy() {
        pending?.invoke(false)
        pending = null
        finishFile(null)
        if (GeckoEngine.activity === this) {
            GeckoEngine.activity = null
            GeckoEngine.channel = null
        }
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_PERMISSIONS = 4107
        private const val REQUEST_SAVE_FILE = 4110
        private const val REQUEST_OPEN_FILE = 4111
        private const val MAX_TEXT_FILE = 5 * 1024 * 1024
    }
}
