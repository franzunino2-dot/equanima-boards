/* ==========================================================================
   Equanima Boards — configuración
   --------------------------------------------------------------------------
   Este es el ÚNICO archivo que hay que editar para poner la app en producción.
   Se sirve tal cual al browser, así que acá va SOLO la clave pública (anon).
   La anon key es pública por diseño: la seguridad real la da RLS en Postgres.
   NUNCA pegar acá la service_role key.
   ========================================================================== */

window.EQ_CONFIG = {
  /* --- Supabase ------------------------------------------------------------
     Sacar de: Supabase → Project Settings → Data API / API Keys
     Dejar ambos en '' para correr en MODO DEMO (datos locales en el browser).
  ------------------------------------------------------------------------- */
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  /* --- Modo de acceso ------------------------------------------------------
     'publico'  → entra cualquiera con el link, se elige un apodo y edita.
                  Requiere: Authentication → Sign In / Providers →
                  "Allow anonymous sign-ins" ACTIVADO, y haber corrido
                  supabase/schema_acceso_publico.sql
     'dominio'  → solo mails de ALLOWED_EMAIL_DOMAIN, login con Google.
                  Requiere haber corrido supabase/schema_acceso_dominio.sql

     Para cambiar de modo: editar esta línea Y correr el .sql que corresponde.
     Cambiar solo esta línea NO alcanza: el candado real está en la base.
  ------------------------------------------------------------------------- */
  ACCESS_MODE: 'publico',

  /* --- Dominio autorizado (solo se usa en ACCESS_MODE 'dominio') -----------
     Se valida en tres capas:
       1) acá (front, feedback inmediato al usuario)
       2) trigger en auth.users        (schema_acceso_dominio.sql)
       3) políticas RLS de cada tabla  (schema.sql)
     Si cambia el dominio, actualizar también allowed_domain() en schema.sql.
  ------------------------------------------------------------------------- */
  ALLOWED_EMAIL_DOMAIN: 'equanimasecurities.com',

  /* Nombre del espacio de trabajo (aparece en la barra superior) */
  WORKSPACE_NAME: 'Equanima',

  /* Zona horaria usada para fechas de vencimiento y calendario */
  TIMEZONE: 'America/Argentina/Buenos_Aires',

  /* Bucket de Supabase Storage para adjuntos */
  STORAGE_BUCKET: 'attachments',

  /* Tamaño máximo de adjunto (MB) */
  MAX_ATTACHMENT_MB: 25,
};
