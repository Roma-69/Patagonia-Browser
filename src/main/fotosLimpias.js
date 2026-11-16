// Fotos limpias: borra los datos escondidos de las fotos (ubicación GPS, modelo
// del celular, fecha, la marca oculta "FBMD" que Meta mete en las fotos de
// Facebook e Instagram, comentarios, XMP, IPTC...). Deja lo que hace falta para
// que la foto se vea igual: la orientación y el perfil de color.
//
// Este archivo se usa en dos lados:
// - En el proceso principal (Node), para limpiar las fotos que se bajan.
// - Como preload de las páginas (sandbox, sin require), para limpiar las fotos
//   que se suben. Por eso no usa require ni nada de Node: solo Uint8Array.
(function (raiz) {
    "use strict";

    const LIMITE_BYTES = 60 * 1024 * 1024;

    function tipoDeImagen(b) {
        if (!b || b.length < 12) return "";
        if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "jpeg";
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
            b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return "png";
        if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
            b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
        return "";
    }

    function empiezaCon(b, desde, texto) {
        if (desde + texto.length > b.length) return false;
        for (let i = 0; i < texto.length; i++) if (b[desde + i] !== texto.charCodeAt(i)) return false;
        return true;
    }

    function unir(partes, total) {
        const salida = new Uint8Array(total);
        let pos = 0;
        for (const parte of partes) { salida.set(parte, pos); pos += parte.length; }
        return salida;
    }

    // Orientación (etiqueta 0x0112) dentro de un bloque EXIF. 1 = normal.
    function orientacionExif(b, inicio, fin) {
        const t = inicio + 6; // después de "Exif\0\0"
        if (t + 8 > fin) return 1;
        const little = b[t] === 0x49 && b[t + 1] === 0x49;
        if (!little && !(b[t] === 0x4D && b[t + 1] === 0x4D)) return 1;
        const u16 = p => little ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1];
        const u32 = p => little
            ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
            : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
        const ifd = t + u32(t + 4);
        if (ifd + 2 > fin) return 1;
        const cantidad = u16(ifd);
        for (let i = 0; i < cantidad; i++) {
            const e = ifd + 2 + i * 12;
            if (e + 12 > fin) break;
            if (u16(e) === 0x0112) {
                const valor = u16(e + 8);
                return valor >= 1 && valor <= 8 ? valor : 1;
            }
        }
        return 1;
    }

    // Un EXIF mínimo con solo la orientación, para que la foto no quede girada.
    function exifSoloOrientacion(orientacion) {
        return new Uint8Array([
            0xFF, 0xE1, 0x00, 0x22,
            0x45, 0x78, 0x69, 0x66, 0x00, 0x00,             // "Exif\0\0"
            0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // TIFF big endian, IFD0 en 8
            0x00, 0x01,                                     // una etiqueta
            0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, 1 valor
            0x00, orientacion, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00                          // no hay más IFD
        ]);
    }

    function limpiarJPEG(b) {
        const partes = [b.subarray(0, 2)];
        let total = 2;
        let pos = 2;
        let orientacion = 1;
        let quitado = false;
        let posicionExif = -1;
        while (pos + 4 <= b.length) {
            if (b[pos] !== 0xFF) return null; // no es un JPEG que entendamos: no se toca
            let marca = b[pos + 1];
            if (marca === 0xFF) { pos++; continue; } // relleno
            if (marca === 0xD8 || marca === 0x01 || (marca >= 0xD0 && marca <= 0xD7)) {
                partes.push(b.subarray(pos, pos + 2)); total += 2; pos += 2; continue;
            }
            if (marca === 0xD9) break;
            const largo = (b[pos + 2] << 8) | b[pos + 3];
            const fin = pos + 2 + largo;
            if (largo < 2 || fin > b.length) return null;
            if (marca === 0xDA) {
                // Empieza la imagen: se copia hasta el final (EOI) y se descarta lo que
                // venga después (fotos en movimiento, imágenes extra con sus propios datos).
                let corte = b.length;
                for (let f = fin; f + 1 < b.length; f++) {
                    if (b[f] === 0xFF && b[f + 1] === 0xD9) { corte = f + 2; break; }
                }
                if (corte < b.length) quitado = true;
                partes.push(b.subarray(pos, corte)); total += corte - pos;
                pos = -1;
                break;
            }
            const datos = pos + 4;
            let conservar = true;
            if (marca === 0xE1) {
                if (empiezaCon(b, datos, "Exif\0")) orientacion = orientacionExif(b, datos, fin);
                if (posicionExif < 0) posicionExif = partes.length;
                conservar = false;
            } else if (marca === 0xE2) {
                conservar = empiezaCon(b, datos, "ICC_PROFILE\0");
            } else if (marca === 0xE0) {
                conservar = empiezaCon(b, datos, "JFIF\0") || empiezaCon(b, datos, "JFXX\0");
            } else if (marca === 0xEE) {
                conservar = empiezaCon(b, datos, "Adobe");
            } else if ((marca >= 0xE3 && marca <= 0xEF) || marca === 0xFE) {
                conservar = false; // IPTC/Photoshop (acá va FBMD), Ducky, comentarios...
            }
            if (conservar) { partes.push(b.subarray(pos, fin)); total += fin - pos; }
            else quitado = true;
            pos = fin;
        }
        if (pos !== -1) return null; // no llegó a la imagen: archivo raro, no se toca
        if (!quitado) return null;
        if (orientacion !== 1) {
            const exif = exifSoloOrientacion(orientacion);
            partes.splice(posicionExif > 0 ? posicionExif : 1, 0, exif);
            total += exif.length;
        }
        return unir(partes, total);
    }

    const CHUNKS_PNG_QUITAR = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

    function limpiarPNG(b) {
        const partes = [b.subarray(0, 8)];
        let total = 8;
        let pos = 8;
        let quitado = false;
        while (pos + 12 <= b.length) {
            const largo = ((b[pos] << 24) | (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]) >>> 0;
            const fin = pos + 12 + largo;
            if (fin > b.length) return null;
            const tipo = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
            if (CHUNKS_PNG_QUITAR.has(tipo)) quitado = true;
            else { partes.push(b.subarray(pos, fin)); total += fin - pos; }
            pos = fin;
            if (tipo === "IEND") break;
        }
        return quitado ? unir(partes, total) : null;
    }

    function limpiarWebP(b) {
        const partes = [];
        let total = 12;
        let pos = 12;
        let quitado = false;
        let vp8x = -1;
        while (pos + 8 <= b.length) {
            const tipo = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
            const largo = (b[pos + 4] | (b[pos + 5] << 8) | (b[pos + 6] << 16) | (b[pos + 7] << 24)) >>> 0;
            const fin = pos + 8 + largo + (largo & 1);
            if (pos + 8 + largo > b.length) return null;
            const trozo = b.subarray(pos, Math.min(fin, b.length));
            if (tipo === "EXIF" || tipo === "XMP ") quitado = true;
            else {
                if (tipo === "VP8X") vp8x = partes.length;
                partes.push(trozo); total += trozo.length;
            }
            pos = fin;
        }
        if (!quitado) return null;
        if (vp8x >= 0) {
            const copia = new Uint8Array(partes[vp8x]);
            copia[8] &= ~0x0C; // sin banderas de EXIF (0x08) ni XMP (0x04)
            partes[vp8x] = copia;
        }
        const cabecera = new Uint8Array(b.subarray(0, 12));
        const tamano = total - 8;
        cabecera[4] = tamano & 0xFF; cabecera[5] = (tamano >> 8) & 0xFF;
        cabecera[6] = (tamano >> 16) & 0xFF; cabecera[7] = (tamano >>> 24) & 0xFF;
        return unir([cabecera, ...partes], total);
    }

    // Devuelve la foto limpia, o null si no es una foto que sepamos limpiar o ya estaba limpia.
    function iguales(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    function limpiarFoto(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (b.length > LIMITE_BYTES) return null;
        try {
            let limpia = null;
            switch (tipoDeImagen(b)) {
                case "jpeg": limpia = limpiarJPEG(b); break;
                case "png": limpia = limpiarPNG(b); break;
                case "webp": limpia = limpiarWebP(b); break;
            }
            // Una foto que ya estaba limpia (por ejemplo, solo con la orientación) no se toca.
            return limpia && !iguales(limpia, b) ? limpia : null;
        } catch {
            return null;
        }
    }

    // ---- En las páginas: limpiar las fotos antes de que la página las vea ----
    function instalarEnPagina(ventana) {
        const documento = ventana.document;
        const reenviados = new WeakSet();
        const pendientes = new WeakMap();

        async function limpiarArchivos(lista) {
            const archivos = Array.from(lista || []);
            let cambio = false;
            const nuevos = await Promise.all(archivos.map(async archivo => {
                try {
                    if (archivo.size > LIMITE_BYTES || archivo.size < 12) return archivo;
                    const limpio = limpiarFoto(new Uint8Array(await archivo.arrayBuffer()));
                    if (!limpio) return archivo;
                    cambio = true;
                    return new ventana.File([limpio], archivo.name, { type: archivo.type, lastModified: archivo.lastModified });
                } catch {
                    return archivo;
                }
            }));
            if (!cambio) return null;
            const dt = new ventana.DataTransfer();
            for (const archivo of nuevos) dt.items.add(archivo);
            return dt;
        }

        function tieneImagenes(lista) {
            return Array.from(lista || []).some(a => /^image\/(jpe?g|png|webp)$/i.test(a.type) || /\.(jpe?g|png|webp)$/i.test(a.name || ""));
        }

        function esInputArchivo(objetivo) {
            return objetivo instanceof ventana.HTMLInputElement && objetivo.type === "file";
        }

        // Al elegir archivos el navegador manda "input" y después "change". Se frenan los
        // dos, se limpian las fotos y se vuelven a mandar con las fotos limpias.
        function alElegir(evento) {
            const input = evento.target;
            if (!esInputArchivo(input) || reenviados.has(evento) || !tieneImagenes(input.files)) return;
            evento.stopImmediatePropagation();
            let estado = pendientes.get(input);
            if (!estado || estado.archivos !== input.files) {
                estado = { archivos: input.files, tipos: new Set(), trabajo: null };
                estado.trabajo = limpiarArchivos(input.files).catch(() => null);
                pendientes.set(input, estado);
                estado.trabajo.then(dt => {
                    if (pendientes.get(input) !== estado) return;
                    pendientes.delete(input);
                    if (dt) {
                        try { input.files = dt.files; } catch { /* la página cambió el input */ }
                    }
                    for (const tipo of ["input", "change"]) {
                        if (!estado.tipos.has(tipo)) continue;
                        const nuevo = new ventana.Event(tipo, { bubbles: true });
                        reenviados.add(nuevo);
                        input.dispatchEvent(nuevo);
                    }
                });
            }
            estado.tipos.add(evento.type);
        }

        function copiarDatosRaton(evento) {
            return {
                bubbles: true, cancelable: true, composed: true,
                clientX: evento.clientX, clientY: evento.clientY, screenX: evento.screenX, screenY: evento.screenY,
                ctrlKey: evento.ctrlKey, shiftKey: evento.shiftKey, altKey: evento.altKey, metaKey: evento.metaKey
            };
        }

        // Arrastrar fotos a la página o pegarlas con Ctrl+V.
        function alSoltarOPegar(evento) {
            if (reenviados.has(evento)) return;
            const datos = evento.type === "drop" ? evento.dataTransfer : evento.clipboardData;
            if (!datos || !tieneImagenes(datos.files)) return;
            const objetivo = evento.target;
            evento.stopImmediatePropagation();
            evento.preventDefault();
            const texto = evento.type === "paste" ? datos.getData("text/plain") : "";
            limpiarArchivos(datos.files).catch(() => null).then(dt => {
                const final = dt || datos;
                if (dt && texto) dt.setData("text/plain", texto);
                const nuevo = evento.type === "drop"
                    ? new ventana.DragEvent("drop", { ...copiarDatosRaton(evento), dataTransfer: final })
                    : new ventana.ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: final });
                reenviados.add(nuevo);
                (objetivo && objetivo.isConnected ? objetivo : documento).dispatchEvent(nuevo);
            });
        }

        ventana.addEventListener("input", alElegir, true);
        ventana.addEventListener("change", alElegir, true);
        ventana.addEventListener("drop", alSoltarOPegar, true);
        ventana.addEventListener("paste", alSoltarOPegar, true);
    }

    const api = { limpiarFoto, tipoDeImagen, instalarEnPagina, LIMITE_BYTES };
    if (typeof module !== "undefined" && module && module.exports) module.exports = api;
    // Como preload de una página: hay window y document, y no estamos en el proceso principal.
    if (typeof raiz.window !== "undefined" && raiz.window === raiz && raiz.document &&
        /^https?:$/.test(raiz.location.protocol)) {
        instalarEnPagina(raiz);
    }
})(typeof window !== "undefined" ? window : globalThis);
