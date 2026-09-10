# Equanima Boards

Tableros kanban internos de Equanima Securities. Reemplazo propio de Trello:
mismas funcionalidades, datos en nuestra infraestructura, costo cero.

- **Frontend**: vanilla JS con módulos ES, sin build step, servido por GitHub Pages
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage)
- **Acceso**: configurable en una línea — abierto a cualquiera con el link, o
  restringido a `@equanimasecurities.com`

Para ponerlo en producción: **[supabase/SETUP.md](supabase/SETUP.md)** (15-25 min
según el modo).

## Modos de acceso

`ACCESS_MODE` en [`config.js`](config.js):

| Modo | Quién entra | SQL a correr |
|---|---|---|
| `publico` | Cualquiera con el link, eligiendo un apodo | `schema_acceso_publico.sql` |
| `dominio` | Solo mails del dominio, login con Google | `schema_acceso_dominio.sql` |

**Cambiar `ACCESS_MODE` solo no alcanza.** Esa línea es cosmética: define qué
pantalla de entrada se muestra. El candado real son las políticas RLS, y todas
llaman a una única función `is_workspace_member()` que los dos `.sql` reemplazan.
Por eso cambiar de modo es correr un archivo, no una migración.

> En modo `publico` cualquiera con la URL puede leer, editar y borrar tarjetas y
> listas. Lo único reservado al creador es eliminar un tablero completo. No
> pongas datos de clientes ahí.

## El equipo

En modo `publico` no hay login: al entrar, cada uno **elige quién es** de una
lista fija definida en `EQUIPO`, dentro de [`config.js`](config.js). Sirve para
que los nombres queden consistentes (nadie se escribe "Fran", "fran" y
"Francisco" en tarjetas distintas).

Para dar de alta o de baja a alguien se edita solo esa lista. Quien no esté
puede entrar igual con **"No estoy en la lista"**, que habilita un campo libre.

Cada nombre tiene **color e iniciales estables derivados del texto**, así la
misma persona se ve igual en todos los dispositivos —  en modo público cada
navegador es una sesión anónima distinta, así que derivarlos del id haría que
alguien cambiara de color según desde dónde entre.

Las iniciales se **desambiguan entre sí**: `Rena` y `Regi` darían las dos "RE",
que en los avatares chicos de las tarjetas se lee igual, así que quedan `RE` y
`RG`. La desambiguación respeta el orden de la lista, de modo que agregar
alguien al final no le cambia las iniciales a los que ya estaban.

Se puede cambiar de identidad después desde el avatar → **Cambiar quién soy**.
Lo ya hecho queda a nombre del anterior.

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
**Completar**: el círculo del frente de la tarjeta la marca como hecha, tenga
fecha de vencimiento o no. Es el mismo control que el círculo de "Marcar como
completada" de Trello, y aparece también al lado del título en el detalle.
En la base es la columna `cards.is_complete` — antes se llamaba `due_complete`
y solo servía si la tarjeta tenía fecha; ver
[`migracion_01_completar_tarjetas.sql`](supabase/migracion_01_completar_tarjetas.sql).

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

### Colaboración en vivo
Sincronización en tiempo real entre usuarios: si alguien mueve una tarjeta, la
ves moverse. Verificado en producción con dos sesiones en paralelo.

**Presencia**: avatares con un punto verde en el encabezado que muestran quién
tiene el tablero abierto en este momento, deduplicado por persona aunque tenga
varias pestañas.

Depende de dos cosas y sin cualquiera de las dos falla **en silencio** (el canal
reporta `SUBSCRIBED` y enseguida `CLOSED`, `track()` devuelve `ok` y
`presenceState()` queda vacío, sin ningún error):

1. las políticas de `realtime.messages` — sección 5 de `schema_acceso_publico.sql`
2. `supabase-js` >= 2.116, posterior a los canales privados de Realtime

Si parece no andar en local, revisá primero que el browser no tenga cacheado un
`supabase-js` viejo antes de buscar el problema en la base.

### Otros
Tema claro/oscuro, novedades de tus tarjetas, "mis tarjetas", archivo con
restauración, cambio de nombre propio, atajos de teclado (`?` para verlos) y
diseño responsive.

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
  schema.sql                  tablas, RLS, triggers, realtime, storage
  schema_acceso_publico.sql   abre el acceso a cualquiera con el link
  schema_acceso_dominio.sql   lo cierra al dominio autorizado
  SETUP.md                    guía de instalación paso a paso
.github/workflows/
  pages.yml           deploy a Pages generando config.js desde secrets
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

**Las claves están en `config.js` y eso es correcto acá.** La clave es una
`sb_publishable_...`, que Supabase declara explícitamente segura para publicar:
identifica al proyecto, no autoriza nada por sí sola. Lo que autoriza es la
sesión, y lo que filtra las filas es RLS. En modo `publico` cualquiera puede
crear una sesión de invitado igual, así que ocultar la clave no protegería nada.

Si algún día pasás a modo `dominio` y querés la clave fuera del repo, el
workflow de Pages ya sabe regenerar `config.js` desde los secrets
`SUPABASE_URL` y `SUPABASE_ANON_KEY`; si no están cargados, usa el `config.js`
commiteado tal cual.

Lo que **nunca** va acá es la `sb_secret_...`: esa saltea todas las políticas.

## Licencia

Uso interno de Equanima Securities.
