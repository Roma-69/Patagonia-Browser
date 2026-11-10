package com.patagoniabrowser.patagonia_browser.gecko

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import io.flutter.plugin.common.MethodChannel
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebExtensionController
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/**
 * Un solo motor Gecko por proceso (GeckoView no permite más de uno), con:
 * - uBlock Origin instalado tal cual, desde el .xpi oficial firmado por Mozilla que viene en el APK.
 * - "Patagonia Lector", una extensión chiquita propia que le pasa el texto de la página al asistente.
 * - Un registro de sesiones "en espera" (ventanas nuevas, pestañas que abre uBO y su panel) que
 *   todavía no tienen una vista de Flutter donde mostrarse.
 */
object GeckoEngine {
    private const val TAG = "PatagoniaGecko"
    const val UBO_ID = "uBlock0@raymondhill.net"
    const val UBO_VERSION = "1.75.0"
    private const val UBO_XPI = "resource://android/assets/ublock_origin-$UBO_VERSION.xpi"
    const val LECTOR_ID = "lector@patagoniabrowser.com"
    private const val LECTOR_PATH = "resource://android/assets/patagonia_lector/"
    const val CHICOS_ID = "chicos@patagoniabrowser.com"
    private const val CHICOS_PATH = "resource://android/assets/patagonia_chicos/"

    /** DNS familiar de Cloudflare (1.1.1.3): bloquea sitios para adultos y de malware. */
    const val DNS_FAMILIAR = "https://family.cloudflare-dns.com/dns-query"

    /** Letra grande: igual que la PC, las páginas al 125 %. */
    const val LETRA_GRANDE = 1.25f

    // Las preferencias que guarda Flutter (shared_preferences) se leen al crear el motor, así
    // el modo chicos y la letra grande valen desde la primera página, antes de que arranque Dart.
    private const val FLUTTER_PREFS = "FlutterSharedPreferences"
    private const val PREF_CHICOS = "flutter.kidsMode"
    private const val PREF_LETRA = "flutter.largeText"

    private var chicos: GeckoResult<WebExtension>? = null
    private val chicosPorts = mutableListOf<WebExtension.Port>()
    var kidsMode = false
        private set
    var largeText = false
        private set

    private var runtime: GeckoRuntime? = null
    private var uboReady: GeckoResult<String>? = null
    private var lector: GeckoResult<WebExtension>? = null
    private var activityRef = WeakReference<Activity>(null)

    /** Canal general para avisarle a Dart cosas que no son de una pestaña (panel de uBO, pestañas de uBO). */
    var channel: MethodChannel? = null

    private var nextPendingId = 1
    private val pending = HashMap<Int, GeckoSession>()

    private val uboActions = WeakHashMap<GeckoSession, WebExtension.Action>()
    private var uboDefaultAction: WebExtension.Action? = null
    private var activeSession = WeakReference<GeckoSession>(null)

    var activity: Activity?
        get() = activityRef.get()
        set(value) {
            activityRef = WeakReference(value)
        }

    fun runtime(context: Context): GeckoRuntime = runtime ?: createRuntime(context)

    private fun createRuntime(context: Context): GeckoRuntime {
        val prefs = flutterPrefs(context)
        kidsMode = prefs.getBoolean(PREF_CHICOS, false)
        largeText = prefs.getBoolean(PREF_LETRA, false)
        val settings = GeckoRuntimeSettings.Builder()
            .consoleOutput(false)
            .aboutConfigEnabled(false)
            .remoteDebuggingEnabled(false)
            .build()
        applyKidsDns(settings)
        applyFontSize(settings)
        return GeckoRuntime.create(context.applicationContext, settings).also {
            runtime = it
            // El modo chicos tiene que estar listo antes de la primera página.
            chicos(context)
        }
    }

    private fun flutterPrefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(FLUTTER_PREFS, Context.MODE_PRIVATE)

    private fun applyKidsDns(settings: GeckoRuntimeSettings) {
        if (kidsMode) {
            settings.setTrustedRecursiveResolverUri(DNS_FAMILIAR)
            settings.setTrustedRecursiveResolverMode(GeckoRuntimeSettings.TRR_MODE_ONLY)
        } else {
            settings.setTrustedRecursiveResolverMode(GeckoRuntimeSettings.TRR_MODE_OFF)
        }
    }

    private fun applyFontSize(settings: GeckoRuntimeSettings) {
        if (largeText) settings.setAutomaticFontSizeAdjustment(false)
        settings.setFontSizeFactor(if (largeText) LETRA_GRANDE else 1f)
    }

    /** Modo chicos: DNS familiar + búsqueda segura y YouTube restringido (extensión patagonia_chicos). */
    fun setKidsMode(context: Context, enabled: Boolean) {
        kidsMode = enabled
        flutterPrefs(context).edit().putBoolean(PREF_CHICOS, enabled).apply()
        applyKidsDns(runtime(context).settings)
        val message = JSONObject().put("chicos", enabled)
        chicosPorts.toList().forEach { it.postMessage(message) }
    }

    /** Letra grande en todas las páginas abiertas. */
    fun setLargeText(context: Context, enabled: Boolean) {
        largeText = enabled
        flutterPrefs(context).edit().putBoolean(PREF_LETRA, enabled).apply()
        applyFontSize(runtime(context).settings)
    }

    /** Extensión propia del modo chicos. Siempre instalada; solo actúa con el modo prendido. */
    fun chicos(context: Context): GeckoResult<WebExtension> {
        chicos?.let { return it }
        val result = runtime(context).webExtensionController.ensureBuiltIn(CHICOS_PATH, CHICOS_ID)
        result.accept({ extension ->
            extension?.setMessageDelegate(chicosDelegate, "patagonia")
        }, { error ->
            Log.e(TAG, "No se pudo preparar el modo chicos", error)
            chicos = null
        })
        chicos = result
        return result
    }

    private val chicosDelegate = object : WebExtension.MessageDelegate {
        override fun onConnect(port: WebExtension.Port) {
            chicosPorts.add(port)
            port.setDelegate(object : WebExtension.PortDelegate {
                override fun onPortMessage(message: Any, port: WebExtension.Port) {}

                override fun onDisconnect(port: WebExtension.Port) {
                    chicosPorts.remove(port)
                }
            })
            port.postMessage(JSONObject().put("chicos", kidsMode))
        }
    }

    fun newSession(desktop: Boolean): GeckoSession {
        val settings = GeckoSessionSettings.Builder()
            .userAgentMode(
                if (desktop) GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
                else GeckoSessionSettings.USER_AGENT_MODE_MOBILE,
            )
            .viewportMode(
                if (desktop) GeckoSessionSettings.VIEWPORT_MODE_DESKTOP
                else GeckoSessionSettings.VIEWPORT_MODE_MOBILE,
            )
            .build()
        return GeckoSession(settings)
    }

    fun putPending(session: GeckoSession): Int {
        val id = nextPendingId++
        pending[id] = session
        return id
    }

    fun takePending(id: Int): GeckoSession? = pending.remove(id)

    fun dropPending(id: Int) {
        pending.remove(id)?.let { if (it.isOpen) it.close() }
    }

    /** La pestaña que se ve. uBO usa esto para saber de qué sitio mostrar el panel. */
    fun setActive(context: Context, session: GeckoSession, active: Boolean) {
        session.setActive(active)
        session.setFocused(active)
        runtime(context).webExtensionController.setTabActive(session, active)
        if (active) activeSession = WeakReference(session)
        else if (activeSession.get() === session) activeSession = WeakReference(null)
    }

    fun forget(session: GeckoSession) {
        uboActions.remove(session)
        if (activeSession.get() === session) activeSession = WeakReference(null)
    }

    /** Toca el botón de uBO de la pestaña activa: uBO responde abriendo su panel (onTogglePopup). */
    fun openUBlockPanel(): Boolean {
        val session = activeSession.get()
        val action = session?.let { uboActions[it] } ?: uboDefaultAction ?: return false
        action.click()
        return true
    }

    /** Devuelve la versión de uBO activa. Se calcula una sola vez por proceso. */
    fun ensureUBlock(context: Context): GeckoResult<String> {
        uboReady?.let { return it }
        val controller = runtime(context).webExtensionController
        // Sin este delegate Gecko rechaza la instalación. Se acepta solo uBO.
        controller.promptDelegate = object : WebExtensionController.PromptDelegate {
            override fun onInstallPromptRequest(
                extension: WebExtension,
                permissions: Array<String>,
                origins: Array<String>,
                dataCollectionPermissions: Array<String>,
            ): GeckoResult<WebExtension.PermissionPromptResponse> {
                val ok = extension.id == UBO_ID
                return GeckoResult.fromValue(WebExtension.PermissionPromptResponse(ok, ok, false))
            }
        }

        val result = controller.list().then { list ->
            val existing = list?.firstOrNull { it.id == UBO_ID }
            when {
                existing == null || existing.metaData.version != UBO_VERSION -> {
                    Log.i(TAG, "Instalando uBlock Origin $UBO_VERSION")
                    controller.install(UBO_XPI)
                }
                !existing.metaData.enabled ->
                    controller.enable(existing, WebExtensionController.EnableSource.USER)
                else -> GeckoResult.fromValue(existing)
            }
        }.map { extension ->
            extension?.let { attachUBlock(context, it) }
            extension?.metaData?.version ?: UBO_VERSION
        }
        // Si falla, la próxima pestaña lo vuelve a intentar.
        result.exceptionally<String> { error ->
            Log.e(TAG, "No se pudo preparar uBlock Origin", error)
            uboReady = null
            GeckoResult.fromException(error)
        }
        uboReady = result
        return result
    }

    private fun attachUBlock(context: Context, extension: WebExtension) {
        extension.setActionDelegate(object : WebExtension.ActionDelegate {
            override fun onBrowserAction(
                extension: WebExtension,
                session: GeckoSession?,
                action: WebExtension.Action,
            ) {
                if (session == null) uboDefaultAction = action
                else uboActions[session] = uboDefaultAction?.let { action.withDefault(it) } ?: action
            }

            override fun onTogglePopup(
                extension: WebExtension,
                action: WebExtension.Action,
            ): GeckoResult<GeckoSession> = showPopup(context)

            override fun onOpenPopup(
                extension: WebExtension,
                action: WebExtension.Action,
            ): GeckoResult<GeckoSession> = showPopup(context)
        })
        // uBO abre su configuración o el registro de pedidos en una pestaña nueva.
        extension.tabDelegate = object : WebExtension.TabDelegate {
            override fun onNewTab(
                extension: WebExtension,
                createDetails: WebExtension.CreateTabDetails,
            ): GeckoResult<GeckoSession> {
                val session = newSession(false)
                val id = putPending(session)
                val result = GeckoResult<GeckoSession>()
                val channel = channel
                if (channel == null) {
                    dropPending(id)
                    result.complete(null)
                    return result
                }
                channel.invokeMethod(
                    "extensionTab",
                    mapOf("id" to id, "url" to (createDetails.url ?: "")),
                    acceptOrDrop(id, session, result),
                )
                return result
            }
        }
    }

    /** El panel de uBO se muestra en una sesión abierta, dentro de una hoja de Flutter. */
    private fun showPopup(context: Context): GeckoResult<GeckoSession> {
        val channel = channel ?: return GeckoResult.fromValue(null)
        val session = GeckoSession(GeckoSessionSettings.Builder().build())
        session.open(runtime(context))
        val id = putPending(session)
        channel.invokeMethod("uboPanel", id)
        return GeckoResult.fromValue(session)
    }

    /** Respuesta de Dart a "¿abro esta ventana/pestaña?": true la muestra, otra cosa la cancela. */
    fun acceptOrDrop(
        id: Int,
        session: GeckoSession,
        result: GeckoResult<GeckoSession>,
    ): MethodChannel.Result = object : MethodChannel.Result {
        override fun success(value: Any?) {
            if (value == true) {
                result.complete(session)
            } else {
                dropPending(id)
                result.complete(null)
            }
        }

        override fun error(code: String, message: String?, details: Any?) = success(false)
        override fun notImplemented() = success(false)
    }

    /** Extensión propia (assets/patagonia_lector) para que el asistente lea el texto de la página. */
    fun lector(context: Context): GeckoResult<WebExtension> {
        lector?.let { return it }
        val result = runtime(context).webExtensionController.ensureBuiltIn(LECTOR_PATH, LECTOR_ID)
        result.exceptionally<WebExtension> { error ->
            Log.e(TAG, "No se pudo preparar el lector de páginas", error)
            lector = null
            GeckoResult.fromException(error)
        }
        lector = result
        return result
    }
}
