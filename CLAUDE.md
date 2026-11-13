# Patagonia Browser — reglas del proyecto

Proyecto serio: la imagen de Patagonia es de compromiso y lealtad con quien lo usa. Todo prolijo.

- **PC y Android son un solo producto.** Leé `PARIDAD.md` antes de tocar cualquier cosa.
  - Toda falla reportada en una versión se revisa en la otra. Decí siempre si afecta a una o a las dos.
  - Toda función nueva va en las dos, o se anota en la tabla de `PARIDAD.md` por qué no aplica.
  - Igual es lo que el usuario puede hacer, no los botones.
- **Mismo número de versión** en `package.json` y `mobile/pubspec.yaml`. Etiquetas: `vX.Y.Z` (Windows) y `movil-vX.Y.Z` (Android).
- Cada cambio deja una entrada en `CHANGELOG.md`, en español simple, pensado para el usuario.
- **Microsoft Store**: cada versión pasa por certificación. Agrupar cambios; solo versión suelta si es una falla grave.
- Nada se publica sin probar en la PC y en el celular (lista de prueba en `PARIDAD.md`).
- El dueño trabaja con PRs: rama → PR → él prueba el EXE/APK de prueba que arma GitHub Actions → merge.
  Explicale los pasos de GitHub uno por uno, sin dar nada por sabido.
- Autoría y copyright: "Roma.69". No escribir el nombre real del dueño en ningún archivo.
- Pruebas: `npm test` (escritorio) y `flutter analyze` + `flutter test` en `mobile/` (las corre GitHub en cada PR).
