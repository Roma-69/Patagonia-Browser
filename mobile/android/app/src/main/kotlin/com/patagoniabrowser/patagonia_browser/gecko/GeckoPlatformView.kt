package com.patagoniabrowser.patagonia_browser.gecko

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.MenuItem
import android.view.View
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.BasicSelectionActionDelegate
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.PermissionDelegate
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.GeckoWebExecutor
import org.mozilla.geckoview.TranslationsController
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebRequest
import org.mozilla.geckoview.WebRequestError
import org.mozilla.geckoview.WebResponse

/** Crea una vista GeckoView cada vez que Flutter pide un "patagonia/gecko_view". */
class GeckoViewFactory(private val messenger: BinaryMessenger) :
    PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    override fun create(context: Context, viewId: Int, args: Any?): PlatformView =
        GeckoPlatformView(context, messenger, viewId, args as? Map<*, *> ?: emptyMap<Any, Any>())

    companion object {
        const val VIEW_TYPE = "patagonia/gecko_view"
    }
}

/**
 * Una pestaña de Patagonia con el motor Gecko, mostrada adentro de Flutter. Habla con Dart por el
 * canal "patagonia/gecko_view_<id>": recibe órdenes (cargar, atrás, modo escritorio...) y avisa
 * cambios (dirección, título, progreso, ventanas nuevas, permisos, descargas, pantalla completa).
 */
class GeckoPlatformView(
    context: Context,
    messenger: BinaryMessenger,
    id: Int,
    params: Map<*, *>,
) : PlatformView, MethodChannel.MethodCallHandler {

    private val appContext = context.applicationContext
    private val channel = MethodChannel(messenger, "patagonia/gecko_view_$id")
    private val geckoView = GeckoView(context)
    private val session: GeckoSession
    private val main = Handler(Looper.getMainLooper())
    private var closed = false
    private var desktop = params["desktop"] == true
    private val popup = params["popup"] == true

    // Lector de texto para el asistente (extensión patagonia_lector).
    private var lectorPort: WebExtension.Port? = null
    private var nextReadId = 1
    private val reads = HashMap<Int, MethodChannel.Result>()
    private val readerReads = HashSet<Int>()
    private var pageTitle = ""

    init {
        // TextureView: es el modo que anduvo bien en la prueba de fuego del Motorola.
        geckoView.setViewBackend(GeckoView.BACKEND_TEXTURE_VIEW)
        // Lector de pantalla (TalkBack): la página tiene que poder recibir el foco de accesibilidad.
        geckoView.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        geckoView.isFocusable = true
        geckoView.isFocusableInTouchMode = true
        channel.setMethodCallHandler(this)

        val runtime = GeckoEngine.runtime(context)
        val windowId = (params["windowId"] as? Number)?.toInt()
        val adopted = windowId?.let { GeckoEngine.takePending(it) }
        session = adopted ?: GeckoEngine.newSession(desktop)
        installDelegates()
        // Las ventanas nuevas las abre Gecko solo, apenas Patagonia acepta: se espera a que estén listas.
        if (adopted == null) session.open(runtime)
        attachWhenOpen(params["active"] != false, 0)

        if (!popup) GeckoEngine.lector(context).accept({ extension ->
            if (!closed && extension != null) {
                session.webExtensionController.setMessageDelegate(extension, lectorDelegate, "patagonia")
            }
        }, { })

        // Se espera a uBO antes de la primera carga, así ya sale filtrada.
        val initialUrl = params["url"] as? String
        if (adopted == null && !initialUrl.isNullOrEmpty()) {
            GeckoEngine.ensureUBlock(context).accept(
                { if (!closed) session.loadUri(initialUrl) },
                { if (!closed) session.loadUri(initialUrl) },
            )
        }
    }

    private fun attachWhenOpen(active: Boolean, attempt: Int) {
        if (closed) return
        if (!session.isOpen) {
            if (attempt < 40) main.postDelayed({ attachWhenOpen(active, attempt + 1) }, 50)
            else send("crash", null)
            return
        }
        geckoView.setSession(session)
        // El panel de uBO se ve, pero no es una pestaña: uBO tiene que seguir mirando el sitio.
        if (popup) session.setActive(true)
        else GeckoEngine.setActive(appContext, session, active)
    }

    private fun send(method: String, value: Any?) {
        if (!closed) channel.invokeMethod(method, value)
    }

    private fun installDelegates() {
        // Al seleccionar texto, además de Copiar y Seleccionar todo aparece "Buscar" (con el buscador elegido).
        GeckoEngine.activity?.let { activity ->
            session.selectionActionDelegate = PatagoniaSelection(activity) { text -> send("searchText", text) }
        }
        session.setTranslationsSessionDelegate(translationsDelegate)
        // Música y videos siguen sonando con Patagonia minimizado (ver GeckoMedia.kt).
        if (!popup) session.mediaSessionDelegate = GeckoMedia.delegate(appContext) { pageTitle }
        session.promptDelegate = GeckoPrompts()

        session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean,
            ) = send("location", url)

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) =
                send("canGoBack", canGoBack)

            override fun onCanGoForward(session: GeckoSession, canGoForward: Boolean) =
                send("canGoForward", canGoForward)

            override fun onLoadRequest(
                session: GeckoSession,
                request: GeckoSession.NavigationDelegate.LoadRequest,
            ): GeckoResult<AllowOrDeny> {
                val uri = Uri.parse(request.uri)
                return when (uri.scheme?.lowercase()) {
                    "http", "https", "about", "data", "blob", "moz-extension", "resource", null ->
                        GeckoResult.allow()
                    else -> {
                        // Enlaces de teléfono, correo, WhatsApp, mapas: se abren con la app que corresponde.
                        if (request.hasUserGesture) openExternal(uri)
                        GeckoResult.deny()
                    }
                }
            }

            override fun onNewSession(
                session: GeckoSession,
                uri: String,
            ): GeckoResult<GeckoSession> {
                val newSession = GeckoEngine.newSession(desktop)
                val pendingId = GeckoEngine.putPending(newSession)
                val result = GeckoResult<GeckoSession>()
                if (closed) {
                    GeckoEngine.dropPending(pendingId)
                    result.complete(null)
                } else {
                    channel.invokeMethod(
                        "newWindow",
                        mapOf("id" to pendingId, "url" to uri),
                        GeckoEngine.acceptOrDrop(pendingId, newSession, result),
                    )
                }
                return result
            }

            override fun onLoadError(
                session: GeckoSession,
                uri: String?,
                error: WebRequestError,
            ): GeckoResult<String>? {
                send("loadError", uri)
                // La página de error la dibuja Patagonia en Flutter.
                return GeckoResult.fromValue("about:blank")
            }
        }

        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) = send("pageStart", url)
            override fun onPageStop(session: GeckoSession, success: Boolean) = send("pageStop", success)
            override fun onProgressChange(session: GeckoSession, progress: Int) =
                send("progress", progress)
        }

        session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onTitleChange(session: GeckoSession, title: String?) {
                pageTitle = title.orEmpty()
                send("title", title)
            }
            override fun onFullScreen(session: GeckoSession, fullScreen: Boolean) =
                send("fullScreen", fullScreen)
            override fun onCloseRequest(session: GeckoSession) = send("closeRequest", null)

            // Mantener apretado un enlace o una imagen: Patagonia muestra su menú.
            override fun onContextMenu(
                session: GeckoSession,
                screenX: Int,
                screenY: Int,
                element: GeckoSession.ContentDelegate.ContextElement,
            ) {
                val type = when (element.type) {
                    GeckoSession.ContentDelegate.ContextElement.TYPE_IMAGE -> "image"
                    GeckoSession.ContentDelegate.ContextElement.TYPE_VIDEO -> "video"
                    GeckoSession.ContentDelegate.ContextElement.TYPE_AUDIO -> "audio"
                    else -> "none"
                }
                send(
                    "contextMenu",
                    mapOf(
                        "type" to type,
                        "link" to element.linkUri,
                        "src" to element.srcUri,
                        "title" to element.title,
                        "alt" to element.altText,
                    ),
                )
            }
            override fun onCrash(session: GeckoSession) = send("crash", null)
            override fun onKill(session: GeckoSession) = send("crash", null)
            override fun onExternalResponse(session: GeckoSession, response: WebResponse) {
                GeckoDownloads.save(appContext, response) { status, name ->
                    main.post { send("download", mapOf("status" to status, "name" to name)) }
                }
            }
        }

        session.permissionDelegate = object : PermissionDelegate {
            override fun onAndroidPermissionsRequest(
                session: GeckoSession,
                permissions: Array<out String>?,
                callback: PermissionDelegate.Callback,
            ) {
                val needed = permissions?.toList().orEmpty()
                val activity = GeckoEngine.activity as? AndroidPermissionRequester
                if (needed.isEmpty() || granted(needed)) return callback.grant()
                if (activity == null) return callback.reject()
                activity.requestAndroidPermissions(needed) { ok ->
                    if (ok) callback.grant() else callback.reject()
                }
            }

            override fun onContentPermissionRequest(
                session: GeckoSession,
                perm: PermissionDelegate.ContentPermission,
            ): GeckoResult<Int> = when (perm.permission) {
                PermissionDelegate.PERMISSION_GEOLOCATION ->
                    askDart(perm.uri, listOf("location")).map {
                        if (it == true) PermissionDelegate.ContentPermission.VALUE_ALLOW
                        else PermissionDelegate.ContentPermission.VALUE_DENY
                    }
                // Videos sin sonido pueden arrancar solos; con sonido, solo si la persona toca play.
                PermissionDelegate.PERMISSION_AUTOPLAY_INAUDIBLE ->
                    GeckoResult.fromValue(PermissionDelegate.ContentPermission.VALUE_ALLOW)
                else -> GeckoResult.fromValue(PermissionDelegate.ContentPermission.VALUE_DENY)
            }

            override fun onMediaPermissionRequest(
                session: GeckoSession,
                uri: String,
                video: Array<out PermissionDelegate.MediaSource>?,
                audio: Array<out PermissionDelegate.MediaSource>?,
                callback: PermissionDelegate.MediaCallback,
            ) {
                val camera = video?.firstOrNull {
                    it.source == PermissionDelegate.MediaSource.SOURCE_CAMERA
                }
                val microphone = audio?.firstOrNull {
                    it.source == PermissionDelegate.MediaSource.SOURCE_MICROPHONE
                }
                if (camera == null && microphone == null) return callback.reject()
                val kinds = listOfNotNull(camera?.let { "camera" }, microphone?.let { "microphone" })
                askDart(uri, kinds).accept({ ok ->
                    if (ok == true) callback.grant(camera, microphone) else callback.reject()
                }, { callback.reject() })
            }
        }
    }

    /** Patagonia pregunta en Flutter ("¿Permitir cámara?") y, si dice que sí, Android pide el suyo. */
    private fun askDart(uri: String, kinds: List<String>): GeckoResult<Boolean> {
        val result = GeckoResult<Boolean>()
        if (closed) {
            result.complete(false)
            return result
        }
        channel.invokeMethod(
            "permission",
            mapOf("origin" to uri, "kinds" to kinds),
            object : MethodChannel.Result {
                override fun success(value: Any?) = result.complete(value == true)
                override fun error(code: String, message: String?, details: Any?) =
                    result.complete(false)
                override fun notImplemented() = result.complete(false)
            },
        )
        return result
    }

    private fun granted(permissions: List<String>) = permissions.all {
        if (it == Manifest.permission.ACCESS_FINE_LOCATION) {
            appContext.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        } else appContext.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

    private fun openExternal(uri: Uri) {
        val scheme = uri.scheme?.lowercase() ?: return
        if (scheme !in setOf("tel", "mailto", "sms", "smsto", "geo", "whatsapp", "market")) return
        val activity = GeckoEngine.activity ?: return
        try {
            activity.startActivity(
                Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE),
            )
        } catch (_: ActivityNotFoundException) {
            send("externalFailed", uri.toString())
        }
    }

    private val lectorDelegate = object : WebExtension.MessageDelegate {
        override fun onConnect(port: WebExtension.Port) {
            lectorPort = port
            port.setDelegate(object : WebExtension.PortDelegate {
                override fun onPortMessage(message: Any, port: WebExtension.Port) {
                    val json = message as? JSONObject ?: return
                    val id = json.optInt("id")
                    val pending = reads.remove(id) ?: return
                    if (readerReads.remove(id)) {
                        pending.success(json.optString("article").ifEmpty { null })
                        return
                    }
                    pending.success(
                        mapOf(
                            "title" to json.optString("title"),
                            "url" to json.optString("url"),
                            "text" to json.optString("text"),
                        ),
                    )
                }

                override fun onDisconnect(port: WebExtension.Port) {
                    if (lectorPort === port) lectorPort = null
                }
            })
        }
    }

    private fun readPage(result: MethodChannel.Result) {
        val port = lectorPort ?: return result.success(null)
        val readId = nextReadId++
        reads[readId] = result
        port.postMessage(JSONObject().put("type", "read").put("id", readId))
        // Si la página no contesta en 3 segundos, el asistente sigue con el título y la dirección.
        main.postDelayed({ reads.remove(readId)?.success(null) }, 3000)
    }

    /** Modo lectura: la extensión arma la nota con Readability y la devuelve como JSON. */
    private fun readArticle(result: MethodChannel.Result) {
        val port = lectorPort ?: return result.success(null)
        val readId = nextReadId++
        reads[readId] = result
        readerReads.add(readId)
        port.postMessage(JSONObject().put("type", "reader").put("id", readId))
        main.postDelayed({
            readerReads.remove(readId)
            reads.remove(readId)?.success(null)
        }, 6000)
    }

    /** Guardar imagen (o enlace): se pide con el motor y va a Descargas como cualquier descarga. */
    private fun saveUrl(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme?.lowercase() !in setOf("http", "https")) {
            send("download", mapOf("status" to "error", "name" to (uri.lastPathSegment ?: "archivo")))
            return
        }
        GeckoWebExecutor(GeckoEngine.runtime(appContext)).fetch(WebRequest(url)).accept({ response ->
            if (response == null) return@accept
            GeckoDownloads.save(appContext, response) { status, name ->
                main.post { send("download", mapOf("status" to status, "name" to name)) }
            }
        }, {
            main.post {
                send("download", mapOf("status" to "error", "name" to (uri.lastPathSegment ?: "archivo")))
            }
        })
    }

    // Traductor: el mismo de Firefox (Bergamot). Traduce en el teléfono; solo baja el idioma una vez.
    private val translationsDelegate = object : TranslationsController.SessionTranslation.Delegate {
        override fun onTranslationStateChange(
            session: GeckoSession,
            translationState: TranslationsController.SessionTranslation.TranslationState?,
        ) {
            val state = translationState ?: return
            val detected = state.detectedLanguages
            main.post {
                send(
                    "translation",
                    mapOf(
                        "docLang" to detected?.docLangTag,
                        "userLang" to detected?.userLangTag,
                        "supported" to (detected?.isDocLangTagSupported == true),
                        "from" to state.requestedTranslationPair?.fromLanguage,
                        "to" to state.requestedTranslationPair?.toLanguage,
                        "error" to state.error,
                        "ready" to (state.isEngineReady == true),
                    ),
                )
            }
        }
    }

    private fun translate(from: String, to: String) {
        val translation = session.sessionTranslation ?: return send("translationError", null)
        val options = TranslationsController.SessionTranslation.TranslationOptions.Builder()
            .downloadModel(true)
            .build()
        translation.translate(from, to, options).accept({ }, {
            main.post { send("translationError", it?.message) }
        })
    }

    private fun restoreTranslation() {
        session.sessionTranslation?.restoreOriginalPage()?.accept({ }, {
            main.post { send("translationError", it?.message) }
        })
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (closed) return result.success(null)
        when (call.method) {
            "load" -> session.loadUri(call.arguments as String)
            "back" -> session.goBack()
            "forward" -> session.goForward()
            "reload" -> session.reload()
            "stop" -> session.stop()
            "exitFullScreen" -> session.exitFullScreen()
            "setActive" -> if (!popup && session.isOpen) {
                GeckoEngine.setActive(appContext, session, call.arguments == true)
            }
            "readPage" -> return readPage(result)
            "readArticle" -> return readArticle(result)
            "saveUrl" -> (call.arguments as? String)?.let { saveUrl(it) }
            "translate" -> {
                val args = call.arguments as? Map<*, *>
                val from = args?.get("from") as? String
                if (from.isNullOrEmpty()) return result.success(null)
                translate(from, (args["to"] as? String) ?: "es")
            }
            "restoreTranslation" -> restoreTranslation()
            "setDesktop" -> {
                desktop = call.arguments == true
                session.settings.userAgentMode =
                    if (desktop) GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
                    else GeckoSessionSettings.USER_AGENT_MODE_MOBILE
                session.settings.viewportMode =
                    if (desktop) GeckoSessionSettings.VIEWPORT_MODE_DESKTOP
                    else GeckoSessionSettings.VIEWPORT_MODE_MOBILE
                session.reload()
            }
            else -> return result.notImplemented()
        }
        result.success(null)
    }

    override fun getView(): View = geckoView

    override fun dispose() {
        closed = true
        channel.setMethodCallHandler(null)
        reads.values.forEach { it.success(null) }
        reads.clear()
        readerReads.clear()
        session.setTranslationsSessionDelegate(null)
        session.mediaSessionDelegate = null
        GeckoMedia.forget(appContext, session)
        main.removeCallbacksAndMessages(null)
        GeckoEngine.forget(session)
        geckoView.releaseSession()
        if (session.isOpen) session.close()
    }
}

/** MainActivity sabe pedir permisos de Android y avisar el resultado. */
interface AndroidPermissionRequester {
    fun requestAndroidPermissions(permissions: List<String>, done: (Boolean) -> Unit)
}

/**
 * El menú de texto seleccionado de Gecko (Copiar, Seleccionar todo, apps de Android) más un
 * "Buscar" que abre la búsqueda (Brave o DuckDuckGo) en una pestaña nueva, como el clic derecho de la PC.
 */
private class PatagoniaSelection(
    activity: Activity,
    private val onSearch: (String) -> Unit,
) : BasicSelectionActionDelegate(activity) {

    override fun getAllActions(): Array<String> = super.getAllActions() + ACTION_SEARCH

    override fun isActionAvailable(id: String): Boolean {
        if (id != ACTION_SEARCH) return super.isActionAvailable(id)
        return !mSelection?.text.isNullOrBlank()
    }

    override fun prepareAction(id: String, item: MenuItem) {
        if (id != ACTION_SEARCH) return super.prepareAction(id, item)
        item.title = "Buscar"
    }

    override fun performAction(id: String, item: MenuItem): Boolean {
        if (id != ACTION_SEARCH) return super.performAction(id, item)
        val text = mSelection?.text?.trim().orEmpty()
        if (text.isEmpty()) return false
        onSearch(text.take(500))
        mSelection?.unselect()
        return true
    }

    companion object {
        const val ACTION_SEARCH = "com.patagoniabrowser.BUSCAR"
    }
}
