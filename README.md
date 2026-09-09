# Equanima Boards

Tableros kanban internos de Equanima Securities. Reemplazo propio de Trello:
mismas funcionalidades, datos en nuestra infraestructura, costo cero.

- **Frontend**: vanilla JS con módulos ES, sin build step, servido por GitHub Pages
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage)
- **Acceso**: solo cuentas `@equanimasecurities.com`

Para ponerlo en producción: **[supabase/SETUP.md](supabase/SETUP.md)** (20 minutos).

## Probarlo ya mismo

Con `config.js` sin claves, la app arranca en **modo demo**: backend falso sobre
`localStorage`, con un tablero de ejemplo cargado. Sirve para recorrer todo sin
configurar nada.

```bash
npx serve -l 5502 .
```

y abrí <http://localhost:5502>. Los datos del demo quedan solo en ese browser y se
sincronizan entre pestañas (así se puede ver cómo se comporta con varias personas).

## Funcionalidades

### Tableros
Fondos de color, destacados (estrella), visibilidad **Equanima** (todo el equipo) o
**privada** (solo miembros), descripción, roles por miembro (admin / miembro /
observador), cerrar y eliminar, link directo copiable.

### Listas
Crear, renombrar, reordenar arrastrando el encabezado, colapsar, copiar,
mover a izquierda/derecha, ordenar tarjetas (fecha de creación, vencimiento,
alfabético), límite de tarjetas por lista (WIP) con aviso visual al pasarse,
archivar todas las tarjetas, mover todas a otra lista, archivar y eliminar.

### Tarjetas
Numeración incremental por tablero (`#12`), título y descripción en Markdown,
etiquetas de colores con nombre, miembros asignados, fechas de inicio y
vencimiento con marca de cumplido, portada de color o imagen, checklists
múltiples con barra de progreso, adjuntos (archivo o link) con vista previa de
imágenes, comentarios con edición y borrado, seguimiento (campana), registro de
actividad por tarjeta, copiar (con checklists/etiquetas/miembros), mover,
archivar, eliminar.

Los badges de la tarjeta replican los de Trello: descripción, cantidad de
comentarios, adjuntos, progreso del checklist, vencimiento con color según
estado (vencido en rojo, próximo en amarillo, cumplido en verde) y avatares.

### Arrastrar y soltar
Implementación propia sobre Pointer Events: funciona con mouse y con touch
(toque sostenido para no romper el scroll en celular), con hueco de destino en
vivo, autoscroll al acercarse a los bordes y posiciones fraccionarias para no
tener que reescribir el orden de toda la lista en cada movimiento.

### Vistas
- **Tablero** — kanban clásico
- **Tabla** — todas las tarjetas en grilla, ordenable por cualquier columna
- **Calendario** — mes por vencimiento
- **Resumen** — vencidas, próximas, carga por persona, tarjetas por lista y por
  etiqueta, próximos vencimientos

### Filtros y búsqueda
Filtro por texto, miembro (incluido "sin miembro"), etiqueta (incluido "sin
etiqueta") y vencimiento, con barra de filtros activos y contador. Búsqueda
global de tarjetas en todos los tableros desde la barra superior.

### Otros
Sincronización en vivo entre usuarios (si alguien mueve una tarjeta, la ves
moverse), tema claro/oscuro, novedades de tus tarjetas, "mis tarjetas",
archivo con restauración, atajos de teclado (`?` para verlos) y diseño
responsive.

### Fuera de alcance por ahora
Automatizaciones tipo Butler, power-ups, tarjetas plantilla, adjuntos desde
Google Drive/Dropbox y notificaciones por mail. Nada de eso es bloqueante para
el uso diario del equipo; se pueden agregar después.

## Estructura

```
index.html            shell de la app
config.js             ÚNICO archivo a editar (claves y dominio)
css/
  base.css            tokens, reset, botones, popovers, modales, markdown
  layout.css          barra superior, home, tabla, calendario, resumen
  board.css           encabezado del tablero, listas, tarjetas, drag & drop
  card.css            modal de detalle de tarjeta
js/
  app.js              arranque, login, router por hash, atajos
  api.js              elige backend (Supabase o demo)
  store.js            estado, selectores, mutaciones optimistas, realtime
  dnd.js              arrastrar y soltar
  util.js             DOM, fechas, posiciones fraccionarias, markdown
  backend/
    supabase.js       backend real
    demo.js           backend de prueba sobre localStorage
  ui/
    home.js           listado de tableros
    board.js          vista kanban, menús, filtros, panel lateral
    card.js           detalle de tarjeta
    views.js          tabla, calendario, resumen
    search.js         resultados de búsqueda
    kit.js            popovers, modales, toasts, selector de fecha
    icons.js          íconos SVG
    activity.js       textos del registro de actividad
supabase/
  schema.sql          tablas, RLS, triggers, realtime, storage
  SETUP.md            guía de instalación paso a paso
```

## Notas de implementación

**Escrituras optimistas.** Cada acción se aplica primero en memoria y se dibuja al
instante; después se manda a Postgres. Si falla, aparece un toast y se recarga el
tablero desde la base. Los ids se generan en el cliente, así el eco de realtime de
nuestra propia escritura es idempotente y no duplica nada.

**Posiciones fraccionarias.** El orden se guarda en un `double precision`. Insertar
entre dos vecinos es el promedio de sus posiciones, así mover una tarjeta escribe
una sola fila. Cuando dos posiciones quedan demasiado juntas por divisiones
sucesivas, se renumera la lista en background.

**Carga en un round trip.** `board_bundle(uuid)` devuelve el tablero completo
(listas, tarjetas, etiquetas, miembros, checklists, comentarios, adjuntos y
actividad) en un solo JSON, en lugar de una decena de queries.

**El dominio se define en dos lugares.** `ALLOWED_EMAIL_DOMAIN` en `config.js` para
el mensaje al usuario, y `allowed_domain()` en `schema.sql` para el candado real.
Si cambia, hay que actualizar los dos.

## Licencia

Uso interno de Equanima Securities.
