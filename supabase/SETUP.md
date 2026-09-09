# Puesta en marcha — Equanima Boards

Tiempo estimado: **20 minutos**. Todo lo que se usa está en el plan gratuito.

Al final vas a tener:

- La app publicada en `https://<tu-usuario>.github.io/equanima-boards`
- Login con Google restringido a `@equanimasecurities.com`
- Base de datos Postgres con sincronización en vivo entre usuarios

---

## 1. Crear el proyecto en Supabase

1. Entrá a <https://supabase.com> y creá una cuenta (podés usar tu mail de Equanima).
2. **New project**:
   - **Name**: `equanima-boards`
   - **Database password**: generá una y guardala en el gestor de contraseñas.
     No la vas a necesitar para la app, pero sí si algún día conectás por SQL directo.
   - **Region**: `South America (São Paulo)` — es la más cercana a Buenos Aires.
3. Esperá 2-3 minutos a que termine de provisionar.

## 2. Crear las tablas

1. En el menú izquierdo: **SQL Editor** → **New query**.
2. Abrí [`schema.sql`](schema.sql), copiá **todo** el contenido y pegalo.
3. **Run**. Tiene que decir *Success*.

> El script es idempotente: si más adelante lo modificás, lo podés volver a correr completo.

**Si tu dominio no es `equanimasecurities.com`**, cambialo antes de correr el script:
buscá la función `allowed_domain()` (arriba del archivo) y editá esa única línea.

## 3. Habilitar el login con Google

Google necesita saber quién le está pidiendo el login, así que hay que crear
credenciales OAuth. Son dos pantallas.

### 3.1 En Supabase, copiá la URL de callback

**Authentication** → **Providers** → **Google**. Activá el switch y copiá el valor de
**Callback URL (for OAuth)**. Se ve así:

```
https://<id-del-proyecto>.supabase.co/auth/v1/callback
```

Dejá esa pestaña abierta.

### 3.2 En Google Cloud, creá el cliente OAuth

1. Entrá a <https://console.cloud.google.com>.
2. Creá un proyecto (o usá uno existente de Equanima).
3. **APIs y servicios** → **Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Interno** si Equanima tiene Google Workspace
     (esto ya limita el acceso al dominio por sí solo), o **Externo** si no.
   - Nombre de la app: `Equanima Boards`
   - Mail de soporte: el tuyo
4. **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**:
   - Tipo: **Aplicación web**
   - Nombre: `Equanima Boards`
   - **URI de redireccionamiento autorizados**: pegá la Callback URL del paso 3.1
   - **Orígenes autorizados de JavaScript**: agregá
     - `https://<tu-usuario>.github.io`
     - `http://localhost:5502` (para probar local)
5. Guardá y copiá el **ID de cliente** y el **Secreto de cliente**.

### 3.3 Volvé a Supabase

Pegá el **Client ID** y el **Client Secret** en el provider de Google y guardá.

## 4. Configurar las URLs de la app

**Authentication** → **URL Configuration**:

- **Site URL**: `https://<tu-usuario>.github.io/equanima-boards`
- **Redirect URLs**: agregá una por línea
  - `https://<tu-usuario>.github.io/equanima-boards`
  - `http://localhost:5502`

Sin esto, después del login Google te devuelve a un lugar equivocado.

## 5. Pegar las claves en `config.js`

**Project Settings** → **API Keys** (o **Data API**). Necesitás dos cosas:

| Dónde va en `config.js` | Qué copiar de Supabase |
|---|---|
| `SUPABASE_URL` | **Project URL** (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | La clave **anon** / **public** |

```js
window.EQ_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  ALLOWED_EMAIL_DOMAIN: 'equanimasecurities.com',
  // ...
};
```

> **La clave `anon` es pública a propósito** y va a quedar visible en el repo.
> No es un problema: no da acceso a nada por sí sola, porque cada tabla tiene
> Row Level Security que exige un usuario logueado del dominio autorizado.
>
> **Lo que NUNCA hay que poner acá es la `service_role` key** — esa sí saltea
> todas las políticas de seguridad.

## 6. Publicar en GitHub Pages

```bash
cd Documents/GitHub/equanima-boards
git add -A
git commit -m "Equanima Boards"
git remote add origin https://github.com/<tu-usuario>/equanima-boards.git
git push -u origin main
```

En GitHub: **Settings** → **Pages** → Source: **Deploy from a branch** →
Branch `main` / carpeta `/ (root)` → **Save**.

En 1-2 minutos queda arriba.

## 7. Primer login y tablero inicial

1. Abrí la app y entrá con Google.
2. Ya podés crear tableros desde el botón **Crear**.

Si querés arrancar con un tablero de ejemplo cargado, en el **SQL Editor** corré:

```sql
select public.crear_tablero_demo();
```

(Lo tenés que correr logueado con tu usuario para que quede como creador; si lo corrés
desde el SQL Editor queda sin creador y aparece igual porque es visible para todo
Equanima.)

---

## Cómo funciona la seguridad

Tres capas independientes, todas apuntando al mismo dominio:

1. **Google**: el parámetro `hd` sugiere el dominio en el selector de cuentas.
   Si la pantalla de consentimiento es **Interna**, Google directamente no deja
   entrar a nadie de afuera.
2. **Trigger en `auth.users`**: si un mail de otro dominio llega a intentar
   registrarse, Postgres aborta el alta con un error explícito.
3. **Row Level Security**: cada `select`/`insert`/`update`/`delete` de cada tabla
   pasa por `is_workspace_member()`, que compara el mail del JWT contra
   `allowed_domain()`. Incluso con un token válido de otro dominio, no ve una fila.

Los tableros tienen además dos niveles:

- `workspace` — los ve y edita todo Equanima (el default, como un tablero de
  espacio de trabajo en Trello)
- `private` — solo los miembros que agregues explícitamente

## Costos y límites del plan gratuito

| Recurso | Límite free | Qué significa para el equipo |
|---|---|---|
| Base de datos | 500 MB | Decenas de miles de tarjetas |
| Storage (adjuntos) | 1 GB | ~40 adjuntos de 25 MB |
| Usuarios activos | 50.000 / mes | De sobra |
| Realtime | 200 conexiones simultáneas | De sobra |
| GitHub Pages | 1 GB / 100 GB de tráfico | De sobra |

El proyecto free de Supabase **se pausa después de 7 días sin actividad**. Con el
equipo usándolo a diario eso no pasa; si el tablero queda quieto una semana, se
reactiva desde el dashboard con un click.

## Problemas frecuentes

**"Acceso restringido: solo cuentas @equanimasecurities.com"**
El mail con el que entraste no es del dominio. Cerrá sesión de Google y elegí el
mail de Equanima.

**Después del login vuelve al login**
Falta la URL en **Authentication → URL Configuration → Redirect URLs**, o no
coincide exactamente (ojo con la barra final y con http vs https).

**"redirect_uri_mismatch" de Google**
La Callback URL de Supabase no está en **URI de redireccionamiento autorizados**
del cliente OAuth de Google Cloud.

**Los cambios de otro no aparecen solos**
Verificá que la sección 8 del `schema.sql` corrió bien (la que hace
`alter publication supabase_realtime add table ...`). Podés volver a correr solo
ese bloque.

**Un adjunto no abre**
El bucket es privado y las URLs se firman por 1 hora. Si la pestaña quedó abierta
mucho tiempo, recargá.
