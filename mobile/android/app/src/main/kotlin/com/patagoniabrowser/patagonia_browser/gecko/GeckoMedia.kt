package com.patagoniabrowser.patagonia_browser.gecko

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.util.Log
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.MediaSession
import java.lang.ref.WeakReference
import android.media.session.MediaSession as AndroidMediaSession

/**
 * Música y videos en segundo plano. Android congela las apps que no se ven, salvo que tengan un
 * "servicio de reproducción" con su notificación. Cuando una página empieza a sonar, Patagonia
 * prende ese servicio (notificación con Pausar / Reproducir / Cerrar) y el audio sigue al
 * minimizar el navegador, abrir otra app o apagar la pantalla.
 */
object GeckoMedia {
    private const val TAG = "PatagoniaGecko"

    private var owner = WeakReference<GeckoSession>(null)
    private var media: MediaSession? = null

    var title: String = ""
        private set
    var artist: String = ""
        private set
    var playing = false
        private set

    /** Imagen de lo que suena (miniatura del video, tapa del disco). null si la página no da una. */
    var artwork: Bitmap? = null
        private set
    private var artworkRequest = 0
    private const val ARTWORK_SIZE = 512

    /** Esta pestaña es la que está sonando: no se duerme aunque cambies a otra pestaña. */
    fun isPlaying(session: GeckoSession): Boolean = playing && owner.get() === session

    /** Hay algo sonando o en pausa que la notificación puede manejar. */
    val active: Boolean get() = media != null

    fun delegate(context: Context, pageTitle: () -> String): MediaSession.Delegate {
        val app = context.applicationContext
        return object : MediaSession.Delegate {
            override fun onMetadata(
                session: GeckoSession,
                mediaSession: MediaSession,
                meta: MediaSession.Metadata,
            ) {
                if (media !== mediaSession) return
                title = meta.title?.takeIf { it.isNotBlank() } ?: pageTitle()
                artist = meta.artist.orEmpty()
                refresh(app)
                loadArtwork(app, mediaSession, meta)
            }

            override fun onPlay(session: GeckoSession, mediaSession: MediaSession) {
                // Si empieza a sonar otra pestaña, la notificación pasa a manejar esa.
                if (media !== mediaSession) {
                    title = pageTitle()
                    artist = ""
                    artwork = null
                    artworkRequest++
                }
                owner = WeakReference(session)
                media = mediaSession
                playing = true
                start(app)
            }

            override fun onPause(session: GeckoSession, mediaSession: MediaSession) {
                if (media !== mediaSession) return
                playing = false
                refresh(app)
                GeckoEngine.sleepIfHidden(session)
            }

            override fun onStop(session: GeckoSession, mediaSession: MediaSession) {
                release(app, mediaSession)
                GeckoEngine.sleepIfHidden(session)
            }

            override fun onDeactivated(session: GeckoSession, mediaSession: MediaSession) {
                release(app, mediaSession)
                GeckoEngine.sleepIfHidden(session)
            }
        }
    }

    /** Pide la imagen a Gecko y, cuando llega, la pone en la notificación. */
    private fun loadArtwork(context: Context, mediaSession: MediaSession, meta: MediaSession.Metadata) {
        val request = ++artworkRequest
        val image = meta.artwork
        if (image == null) {
            if (artwork != null) {
                artwork = null
                refresh(context)
            }
            return
        }
        try {
            image.getBitmap(ARTWORK_SIZE).accept({ bitmap ->
                if (request == artworkRequest && media === mediaSession && bitmap != null) {
                    artwork = bitmap
                    refresh(context)
                }
            }, { })
        } catch (error: RuntimeException) {
            Log.w(TAG, "No se pudo leer la imagen de lo que suena", error)
        }
    }

    /** La pestaña se cerró. */
    fun forget(context: Context, session: GeckoSession) {
        if (owner.get() === session) stop(context.applicationContext)
    }

    fun play() {
        media?.play()
    }

    fun pause() {
        media?.pause()
    }

    /** Botón Cerrar de la notificación: pausa y saca la notificación. */
    fun close(context: Context) {
        media?.pause()
        stop(context.applicationContext)
    }

    private fun release(context: Context, mediaSession: MediaSession) {
        if (media === mediaSession) stop(context)
    }

    private fun stop(context: Context) {
        media = null
        owner = WeakReference(null)
        playing = false
        artwork = null
        artworkRequest++
        context.stopService(Intent(context, PatagoniaMediaService::class.java))
    }

    private fun start(context: Context) {
        try {
            context.startForegroundService(Intent(context, PatagoniaMediaService::class.java))
        } catch (error: RuntimeException) {
            // Android no deja prender el servicio si la app no está a la vista. No pasa nada:
            // la página sigue sonando como antes mientras Patagonia esté abierto.
            Log.w(TAG, "No se pudo prender la reproducción en segundo plano", error)
        }
    }

    private fun refresh(context: Context) {
        if (PatagoniaMediaService.running) start(context)
    }
}

/** Servicio en primer plano con la notificación de reproducción. */
class PatagoniaMediaService : Service() {
    private var session: AndroidMediaSession? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        session = AndroidMediaSession(this, "Patagonia").apply {
            setCallback(object : AndroidMediaSession.Callback() {
                override fun onPlay() = GeckoMedia.play()
                override fun onPause() = GeckoMedia.pause()
                override fun onStop() = GeckoMedia.close(this@PatagoniaMediaService)
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> GeckoMedia.play()
            ACTION_PAUSE -> GeckoMedia.pause()
            ACTION_CLOSE -> GeckoMedia.close(this)
        }
        // Siempre hay que mostrar la notificación enseguida después de startForegroundService.
        show()
        if (!GeckoMedia.active) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun show() {
        val title = GeckoMedia.title.ifBlank { "Patagonia Browser" }
        val playing = GeckoMedia.playing
        val artwork = GeckoMedia.artwork
        session?.apply {
            setMetadata(
                MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, GeckoMedia.artist)
                    .apply {
                        if (artwork != null) {
                            putBitmap(MediaMetadata.METADATA_KEY_ART, artwork)
                            putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork)
                        }
                    }
                    .build(),
            )
            setPlaybackState(
                PlaybackState.Builder()
                    .setActions(
                        PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
                            PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP,
                    )
                    .setState(
                        if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                        if (playing) 1f else 0f,
                    )
                    .build(),
            )
        }

        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Reproducción", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Música y videos que siguen sonando con Patagonia minimizado."
                    setShowBadge(false)
                },
            )
        }

        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        val toggle = if (playing) {
            action(android.R.drawable.ic_media_pause, "Pausar", ACTION_PAUSE, 1)
        } else {
            action(android.R.drawable.ic_media_play, "Reproducir", ACTION_PLAY, 2)
        }
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(GeckoMedia.artist.ifBlank { "Patagonia Browser" })
            .setContentIntent(open)
            .setLargeIcon(artwork)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(toggle)
            .addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Cerrar", ACTION_CLOSE, 3))
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session?.sessionToken)
                    .setShowActionsInCompactView(0, 1),
            )
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun action(icon: Int, label: String, action: String, request: Int): Notification.Action {
        val intent = Intent(this, PatagoniaMediaService::class.java).setAction(action)
        val pending = PendingIntent.getService(this, request, intent, PendingIntent.FLAG_IMMUTABLE)
        return Notification.Action.Builder(Icon.createWithResource(this, icon), label, pending).build()
    }

    /** La persona cerró Patagonia desde las apps recientes: se corta la música. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        GeckoMedia.close(this)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        running = false
        session?.apply {
            isActive = false
            release()
        }
        session = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "reproduccion"
        private const val NOTIFICATION_ID = 4108
        private const val ACTION_PLAY = "com.patagoniabrowser.media.PLAY"
        private const val ACTION_PAUSE = "com.patagoniabrowser.media.PAUSE"
        private const val ACTION_CLOSE = "com.patagoniabrowser.media.CLOSE"

        @Volatile
        var running = false
            private set
    }
}
