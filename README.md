# Mi Súper

Controla tus gastos de supermercado con un presupuesto: agregas productos y ves en vivo cuánto llevas y cuánto te queda.

## Cómo funcionan los precios
- La app **no inventa precios**. La primera vez que agregas un producto (por ejemplo, banano) escribes cuánto cuesta; la siguiente vez ya lo recuerda y no lo vuelve a pedir.
- Si en la tienda el precio cambió, lo corriges tocando el producto en tu lista y la app guarda el nuevo.
- En **Mis precios** (icono de etiqueta) ves todo lo que has registrado, con la fecha de la última actualización, y puedes reescribir o borrar cualquier precio.
- La primera vez que abres la app eliges tu departamento (y, si quieres, tu pueblo). Los precios se guardan por departamento, porque cambian de un lugar a otro.
- Todo se guarda en tu teléfono; no hay servidor ni cuenta.

## Publicación
- **Web:** se publica sola en GitHub Pages con cada cambio en `main` (`.github/workflows/pages.yml`).
- **APK:** se compila en GitHub Actions con Capacitor (`.github/workflows/apk.yml`). Descárgalo en la pestaña *Actions* → última ejecución → *Artifacts* → `mi-super-apk`.
