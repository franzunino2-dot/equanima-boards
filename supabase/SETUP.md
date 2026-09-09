# Puesta en marcha — Equanima Boards

Dos modos de acceso. Elegí uno y seguí solo esa sección.

| Modo | Quién entra | Config |
|---|---|---|
| **Abierto** (el actual) | Cualquiera con el link, eligiendo un apodo | `ACCESS_MODE: 'publico'` |
| **Cerrado** | Solo mails `@equanimasecurities.com`, login con Google | `ACCESS_MODE: 'dominio'` |

Se puede pasar de uno a otro en cualquier momento sin tocar código: son dos
archivos SQL y una línea de `config.js`. Ver **[Cambiar de modo](#cambiar-de-modo)**.

Todo entra en el plan gratuito de Supabase y GitHub Pages.

---

# Modo ABIERTO — 15 minutos

Lo que vas a tener: una URL pública que cualquiera abre, pone su nombre y
empieza a editar. Los cambios se ven en vivo entre todos.

> **Antes de arrancar, tenelo claro:** cualquiera con el link puede leer, editar
> y borrar tarjetas y listas. La identidad es un apodo que cada uno elige, así
> que no hay trazabilidad real. **No pongas comitentes, montos ni nombres de
> clientes mientras esté así.**
>
> Lo único que queda protegido es *eliminar un tablero completo*: solo puede
> hacerlo quien lo creó. Todo lo demás está abierto.

## 1. Crear el proyecto en Supabase

1. <https://supabase.com> → cuenta → **New project**
   - **Name**: `equanima-boards`
   - **Database password**: generala y guardala en el gestor de contraseñas
     (no la necesita la app, sí vos si algún día entrás por SQL directo)
   - **Region**: `South America (São Paulo)`
2. Esperá 2-3 minutos.

## 2. Crear las tablas

**SQL Editor** → **New query** → pegá **todo** [`schema.sql`](schema.sql) → **Run**.
Tiene que decir *Success*.

## 3. Abrir el acceso

En el mismo **SQL Editor**, nueva query: pegá **todo**
[`schema_acceso_publico.sql`](schema_acceso_publico.sql) → **Run**.

Al final devuelve una tabla de verificación. Tiene que decir:

| modo | candado_dominio |
|---|---|
| `PUBLICO` | `false` |

## 4. Activar las sesiones de invitado

**Authentication** → **Sign In / Providers** → buscá **Anonymous sign-ins** y
**activalo**.

Sin este toggle la app no puede crear la sesión de invitado y **no entra nadie**
(te va a mostrar un cartel diciendo exactamente esto).

## 5. Configurar las URLs

**Authentication** → **URL Configuration**:

- **Site URL**: `https://<tu-usuario>.github.io/equanima-boards`
- **Redirect URLs**: agregá `http://localhost:5502` también, para probar local.

## 6. Copiar las claves

**Project Settings** → **API Keys**:

| Va en | Copiar de Supabase |
|---|---|
| `SUPABASE_URL` | **Project URL** (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | la clave **anon** / **public** |

No las pegues en `config.js` si vas a publicar en GitHub: el deploy las inyecta
solo (paso 7). Para probar en tu máquina sí podés pegarlas, pero **no commitees
ese cambio**.

## 7. Publicar en GitHub Pages

```bash
cd Documents/GitHub/equanima-boards
git remote add origin https://github.com/<tu-usuario>/equanima-boards.git
git push -u origin main
```

Después, en GitHub:

1. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - `SUPABASE_URL` → la Project URL
   - `SUPABASE_ANON_KEY` → la clave anon
2. **Settings** → **Pages** → Source: **GitHub Actions**
3. **Actions** → si el deploy no arrancó solo, **Run workflow**

El workflow [`pages.yml`](../.github/workflows/pages.yml) genera `config.js` en
el momento del build a partir de esos secrets, así **las claves nunca quedan en
el código**.

En 1-2 minutos la URL queda arriba:

```
https://<tu-usuario>.github.io/equanima-boards
```

## 8. Primer tablero

Abrí la URL, poné tu nombre y creá el tablero con **Crear**.

Si querés arrancar con uno de ejemplo, en el **SQL Editor**:

```sql
select public.crear_tablero_demo();
```

Mandá el link al equipo y listo: cada uno pone su nombre y ya están todos
editando el mismo tablero.

---

# Modo CERRADO — 25 minutos

Igual que el abierto, pero en lugar de los pasos 3 y 4 va esto, más el alta del
cliente OAuth de Google.

## 3'. Cerrar el acceso al dominio

**SQL Editor** → pegá [`schema_acceso_dominio.sql`](schema_acceso_dominio.sql) → **Run**.

Verificación esperada:

| dominio | candado_dominio |
|---|---|
| `equanimasecurities.com` | `true` |

En `config.js` (o en la variable `ACCESS_MODE` del repo) poné `'dominio'`.

Si tu dominio es otro, editá la función `allowed_domain()` en
[`schema.sql`](schema.sql) — es una sola línea, arriba del archivo.

## 4'. Habilitar el login con Google

### 4'.1 Copiar la URL de callback

**Authentication** → **Providers** → **Google**: activá el switch y copiá la
**Callback URL (for OAuth)**:

```
https://<id-del-proyecto>.supabase.co/auth/v1/callback
```

### 4'.2 Crear el cliente OAuth en Google Cloud

1. <https://console.cloud.google.com> → proyecto nuevo (no hace falta tocar
   nada de lo existente de Equanima)
2. **APIs y servicios** → **Pantalla de consentimiento de OAuth**:
   - **Interno** si Equanima tiene Google Workspace y sos admin — esto ya
     limita al dominio por sí solo
   - **Externo** si no sos admin; el candado del dominio igual lo aplica Postgres
   - Nombre: `Equanima Boards`
3. **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**:
   - Tipo: **Aplicación web**
   - **URI de redireccionamiento autorizados**: la Callback URL del paso anterior
   - **Orígenes autorizados de JavaScript**:
     - `https://<tu-usuario>.github.io`
     - `http://localhost:5502`
4. Copiá **ID de cliente** y **Secreto de cliente**

### 4'.3 Pegarlos en Supabase

En el provider de Google: **Client ID** y **Client Secret** → **Save**.

### 4'.4 Apagar las sesiones de invitado

**Authentication** → **Sign In / Providers** → **Anonymous sign-ins**: **OFF**.

---

# Cambiar de modo

## De abierto a cerrado

1. **SQL Editor**: correr [`schema_acceso_dominio.sql`](schema_acceso_dominio.sql)
2. Dar de alta el cliente OAuth de Google (paso 4' de arriba)
3. `ACCESS_MODE` → `'dominio'` (en `config.js`, o en la variable del repo si
   usás el workflow)
4. **Authentication** → **Anonymous sign-ins**: OFF

Los invitados que ya habían entrado quedan sin acceso a ninguna fila. Sus
tarjetas **no se borran**. Para eliminar esos usuarios hay un bloque comentado
al final de `schema_acceso_dominio.sql`.

## De cerrado a abierto

1. **SQL Editor**: correr [`schema_acceso_publico.sql`](schema_acceso_publico.sql)
2. `ACCESS_MODE` → `'publico'`
3. **Authentication** → **Anonymous sign-ins**: ON

> Cambiar solo `ACCESS_MODE` **no alcanza**: es cosmético. El candado real son
> las políticas RLS de la base, y esas se cambian con el SQL.

---

# Cómo funciona la seguridad

Todas las políticas RLS de todas las tablas llaman a una única función,
`is_workspace_member()`. Los dos archivos de acceso lo que hacen es reemplazar
esa función:

- **abierto**: `auth.uid() is not null` → cualquier sesión, incluidas las anónimas
- **cerrado**: además exige que el mail del JWT termine en `@` + `allowed_domain()`

Por eso el cambio de modo es una sola función y no una migración: no hay que
tocar ninguna política.

Los tableros tienen además dos niveles propios:

- `workspace` — lo ve y edita cualquiera que tenga acceso a la app (el default)
- `private` — solo los miembros que agregues

En modo abierto, `private` limita a los miembros pero cualquiera puede sumarse
como miembro, así que no es una barrera real. Para cerrar de verdad hay que
cambiar de modo.

## Sobre la clave `anon`

Es pública por diseño y no da acceso a nada por sí sola: identifica al proyecto,
no autoriza. Lo que autoriza es la sesión, y lo que filtra las filas es RLS.

Lo que **nunca** va en el frontend ni en el repo es la **`service_role` key**:
esa saltea todas las políticas.

## Límites del plan gratuito

| Recurso | Límite | Qué significa |
|---|---|---|
| Base de datos | 500 MB | decenas de miles de tarjetas |
| Storage (adjuntos) | 1 GB | ~40 adjuntos de 25 MB |
| Usuarios | 50.000 activos / mes | de sobra |
| Realtime | 200 conexiones simultáneas | de sobra |
| Altas de invitado | ~30 por hora por IP | de sobra para un equipo |

El proyecto free **se pausa a los 7 días sin actividad**. Con uso diario no
pasa; si se pausa, se reactiva con un click desde el dashboard.

---

# Problemas frecuentes

**"No se pudo crear la sesión de invitado"**
Falta activar **Anonymous sign-ins** (paso 4).

**"Acceso restringido: solo cuentas @equanimasecurities.com"**
Estás en modo cerrado y entraste con otro mail. Cerrá sesión de Google y elegí
el de Equanima.

**Después del login vuelve al login**
Falta la URL en **Authentication → URL Configuration → Redirect URLs**, o no
coincide exacto (ojo con la barra final y con http vs https).

**"redirect_uri_mismatch" de Google**
La Callback URL de Supabase no está en los URI de redireccionamiento del
cliente OAuth.

**El deploy falla con "Faltan los secrets"**
No están cargados `SUPABASE_URL` / `SUPABASE_ANON_KEY` en
**Settings → Secrets and variables → Actions**.

**Los cambios de otro no aparecen solos**
Revisá que la sección 8 de `schema.sql` haya corrido (la de
`alter publication supabase_realtime add table ...`). Se puede correr sola.

**No veo los avatares de quién está mirando**
La presencia usa Realtime. Si el proyecto estaba pausado, reactivalo y recargá.

**Un adjunto no abre**
El bucket es privado y las URLs se firman por 1 hora. Recargá la página.
