# Patagonia Browser en Microsoft Store (MSIX)

## Identidad en Partner Center

| Campo | Valor |
|---|---|
| Package/Identity/Name | `Roma.69.PatagoniaBrowser` |
| Package/Identity/Publisher | `CN=75A3DDC1-A591-4D68-AB64-9F4514E0CA10` |
| Package/Properties/PublisherDisplayName | `Roma.69` |
| Id. de Store | `9NWL1WDZFJMD` |

Están en `config/microsoft-store-identity.json`. Son datos públicos del paquete, no contraseñas.
Si Partner Center cambia alguno, actualizar ese archivo **exactamente** antes de compilar.

## Generar el paquete

1. GitHub → **Actions** → **Windows - paquete para Microsoft Store (MSIX)** → **Run workflow**.
2. Al terminar, en **Releases** aparece el borrador **"Microsoft Store X.Y.Z (MSIX para Partner Center)"**
   con `Patagonia-Browser-X.Y.Z-Windows-x64-STORE-UNSIGNED.msix`. **No publicar ese borrador**:
   solo sirve para bajar el archivo.
3. El `.msix` va **sin firma**: Microsoft lo firma cuando aprueba el envío. No se puede instalar con doble clic.

Local (Windows con Windows SDK): `npm ci`, `npm test`, `npm run make:msix`.

## Requisitos de Microsoft que afectan a Patagonia

- **Política 10.2.1 (navegadores):** motor Chromium o Gecko, **como mucho 2 versiones mayores atrás** del último
  Chromium. Patagonia 1.0.9 usa Electron 45 = Chromium 156. Cuando Chrome avance, hay que actualizar Electron
  y mandar una versión nueva a la Store.
- **runFullTrust:** capacidad restringida que necesitan todas las apps de escritorio (Electron). Partner Center
  pide justificarla (texto abajo).
- **Versiones:** cada envío necesita una versión mayor que la anterior (`package.json` → `X.Y.Z.0`).

## Diferencias de la versión Store

- No corre Squirrel ni la actualización automática desde GitHub: actualiza Windows desde la Store.
- Se registra como navegador desde el manifiesto (http, https, .htm, .html).
- Alias `patagonia.exe`, que usan los accesos directos de "Crear app de esta página".
- Los datos (favoritos, historial) quedan dentro del paquete: no se comparten con la versión `.exe`.

## Envío en Partner Center (paso a paso)

1. https://partner.microsoft.com/dashboard → **Apps y juegos** → **Patagonia Browser** → **Iniciar envío**.
2. **Precios y disponibilidad:** Gratis, todos los mercados.
3. **Propiedades:** categoría **Productividad** (subcategoría Navegadores si aparece). URL de privacidad:
   `https://github.com/Roma-69/Patagonia-Browser/blob/main/PRIVACY_WINDOWS.md`
4. **Clasificación por edad:** completar el cuestionario. Respuesta clave: la app permite acceso **sin
   restricciones a internet** (es un navegador).
5. **Paquetes:** subir el `.msix` del borrador.
6. **Descripción de la Store (español):** textos de abajo y capturas de `docs/store/`.
7. **Opciones de envío → Notas para certificación:** pegar la justificación de abajo.
8. **Enviar a la Store.** La certificación suele tardar de unas horas a unos días.

### Descripción

**Descripción breve:** Navegador privado con bloqueo de anuncios y traductor que funciona en tu equipo.

**Descripción:**

Patagonia Browser es un navegador rápido y privado, hecho en la Patagonia argentina.

• Bloquea anuncios y rastreadores en todas las páginas, con excepciones por sitio.
• Traduce páginas del inglés al español en tu propia computadora, sin mandar el texto a internet.
• Convierte cualquier sitio en una app con su acceso directo (por ejemplo, el correo o el panel del router).
• Pestañas, favoritos, historial y descargas guardados solo en tu equipo.
• Zoom, impresión, búsqueda en la página y restauración de pestañas.

Basado en Chromium. Código abierto (MIT): https://github.com/Roma-69/Patagonia-Browser

**Características (una por línea):**
Bloqueo de anuncios y rastreadores
Traductor inglés → español privado, en el equipo
Crear apps de cualquier sitio
Favoritos, historial y pestañas guardados en tu equipo
Basado en Chromium 156

**Palabras clave:** navegador, privacidad, bloqueador de anuncios, traductor, chromium

### Notas para certificación (justificación de runFullTrust)

Patagonia Browser is a desktop web browser built with Electron (Chromium 156, within 2 major versions of the
latest Chromium, per policy 10.2.1). runFullTrust is required because it is a Win32 desktop application packaged
as MSIX. It does not install drivers or services, does not modify system settings, and does not update itself:
updates are delivered only through the Microsoft Store. Page translation runs locally with Mozilla's open-source
Bergamot engine (MPL-2.0). No account is needed to test: open the app and browse any website.

## Antes de mandar

- Probar el paquete instalándolo con firma de desarrollo **solo en una máquina de prueba**, o directamente
  mandarlo a certificación (Microsoft lo prueba).
- Opcional: Windows App Certification Kit sobre el `.msix`.
