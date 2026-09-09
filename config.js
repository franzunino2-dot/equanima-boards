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

  /* --- Dominio autorizado --------------------------------------------------
     Solo entran mails de este dominio. Se valida en tres capas:
       1) acá (front, feedback inmediato al usuario)
       2) trigger en auth.users        (supabase/schema.sql)
       3) políticas RLS de cada tabla  (supabase/schema.sql)
     Si cambia el dominio, hay que actualizarlo también en schema.sql.
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
