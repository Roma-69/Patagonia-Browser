package com.patagoniabrowser.patagonia_browser.gecko

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import java.io.FileOutputStream

/**
 * Imprimir o guardar como PDF (lo mismo que Ctrl+P en la PC). Gecko arma el PDF de la página y
 * se lo pasamos al diálogo de impresión de Android, que ya trae "Guardar como PDF".
 */
object GeckoPrint {
    fun print(activity: Activity, pdf: ByteArray, title: String?): Boolean {
        if (pdf.isEmpty()) return false
        val manager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return false
        val name = (title ?: "")
            .replace(Regex("[^\\p{L}\\p{N} ._-]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(60)
            .ifBlank { "Pagina" }
        return try {
            manager.print(name, PdfAdapter(pdf, name), PrintAttributes.Builder().build())
            true
        } catch (_: RuntimeException) {
            false
        }
    }

    private class PdfAdapter(private val pdf: ByteArray, private val name: String) :
        PrintDocumentAdapter() {
        override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes,
            cancellationSignal: CancellationSignal?,
            callback: LayoutResultCallback,
            extras: Bundle?,
        ) {
            if (cancellationSignal?.isCanceled == true) {
                callback.onLayoutCancelled()
                return
            }
            val info = PrintDocumentInfo.Builder("$name.pdf")
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .build()
            callback.onLayoutFinished(info, oldAttributes != newAttributes)
        }

        override fun onWrite(
            pages: Array<out PageRange>,
            destination: ParcelFileDescriptor,
            cancellationSignal: CancellationSignal?,
            callback: WriteResultCallback,
        ) {
            try {
                FileOutputStream(destination.fileDescriptor).use { it.write(pdf) }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (error: Exception) {
                callback.onWriteFailed(error.message)
            }
        }
    }
}
