# Mi Súper

Controla tus gastos de supermercado con un presupuesto: agregas productos y ves en vivo cuánto llevas y cuánto te queda.

## Menú (botón de arriba a la derecha)
1. **Mi lista:** tu compra actual, con el presupuesto de la compra. "Terminar compra" la guarda en tus gastos.
2. **Gastos:** lo que llevas gastado esta semana y este mes, con tu presupuesto semanal y mensual (se fijan tocando cada tarjeta), y el historial de compras.
3. **Mis productos:** todos los productos con precio que has registrado, para reescribirlos u olvidarlos. Al final puedes agregar productos nuevos (por ejemplo, auyama) con su precio.
4. **Guía para ahorrar:** consejos simples para gastar menos en el súper.
5. **Ajustes:** idioma (español / English), departamento, pueblo o lugar, moneda y borrado de datos.

## Cómo funcionan los precios
- La app **no inventa precios**. La primera vez que agregas un producto escribes cuánto cuesta; la siguiente vez ya lo recuerda.
- Si el precio cambió, lo corriges tocando el producto en tu lista o en **Mis productos**.
- Los precios se guardan **por departamento**, porque cambian de un lugar a otro.
- Todo se guarda en tu teléfono; no hay servidor ni cuenta.

## Publicación
- **Web:** se publica sola en GitHub Pages con cada cambio en `main` (`.github/workflows/pages.yml`).
- **APK:** se compila en GitHub Actions con Capacitor (`.github/workflows/apk.yml`). Descárgalo en la pestaña *Actions* → última ejecución → *Artifacts* → `mi-super-apk`.
