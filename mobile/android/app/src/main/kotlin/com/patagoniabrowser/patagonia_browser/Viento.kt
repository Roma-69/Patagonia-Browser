package com.patagoniabrowser.patagonia_browser

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool

/**
 * Sonido de viento al buscar (Configuración → "Sonido de viento al buscar").
 * Es el mismo archivo que en la PC (assets/sonidos/viento.ogg).
 */
object Viento {
    private const val VOLUMEN = 0.6f
    private var pool: SoundPool? = null
    private var id = 0
    private var listo = false
    private var pendiente = false

    fun sonar(context: Context) {
        val actual = pool ?: crear(context.applicationContext)
        if (listo) actual.play(id, VOLUMEN, VOLUMEN, 1, 0, 1f) else pendiente = true
    }

    private fun crear(context: Context): SoundPool {
        val atributos = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val nuevo = SoundPool.Builder().setMaxStreams(1).setAudioAttributes(atributos).build()
        nuevo.setOnLoadCompleteListener { sp, cargado, estado ->
            if (estado != 0) return@setOnLoadCompleteListener
            listo = true
            if (pendiente) {
                pendiente = false
                sp.play(cargado, VOLUMEN, VOLUMEN, 1, 0, 1f)
            }
        }
        id = nuevo.load(context, R.raw.viento, 1)
        pool = nuevo
        return nuevo
    }
}
