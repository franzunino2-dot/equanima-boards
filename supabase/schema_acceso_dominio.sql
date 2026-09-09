-- ============================================================================
-- Equanima Boards — ACCESO RESTRINGIDO AL DOMINIO
-- ----------------------------------------------------------------------------
-- Correr en Supabase → SQL Editor para CERRAR un tablero que estaba público.
--
-- Vuelve a exigir mail del dominio autorizado en todas las tablas y bloquea
-- el alta de usuarios de afuera. Es el estado original de schema.sql.
--
-- IMPORTANTE — hacer los tres pasos, en este orden:
--   1. Correr este archivo
--   2. En config.js poner  ACCESS_MODE: 'dominio'
--   3. En el dashboard: Authentication → Sign In / Providers →
--      "Allow anonymous sign-ins": OFF
--      (si queda ON, nadie nuevo puede entrar igual porque RLS lo bloquea,
--       pero conviene apagarlo para no dejar la puerta abierta)
--
-- Los invitados que habían entrado quedan en auth.users pero sin acceso a
-- ninguna fila. Para borrarlos, ver el bloque comentado al final.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Volver a exigir el dominio en todas las políticas RLS
-- ----------------------------------------------------------------------------
create or replace function public.is_workspace_member()
returns boolean language sql stable as $fn$
  select auth.uid() is not null
     and public.jwt_email() like ('%@' || public.allowed_domain())
$fn$;

-- ----------------------------------------------------------------------------
-- 2. Volver a bloquear el alta de usuarios de otros dominios
-- ----------------------------------------------------------------------------
create or replace function public.enforce_email_domain()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if lower(coalesce(new.email, '')) not like ('%@' || public.allowed_domain()) then
    raise exception
      'Acceso restringido: solo cuentas @% pueden usar Equanima Boards',
      public.allowed_domain();
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_enforce_email_domain on auth.users;
create trigger trg_enforce_email_domain
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- ----------------------------------------------------------------------------
-- 3. Verificación
--    Debe devolver: dominio = 'equanimasecurities.com', candado_dominio = true
-- ----------------------------------------------------------------------------
select
  public.allowed_domain() as dominio,
  exists (
    select 1 from pg_trigger
     where tgname = 'trg_enforce_email_domain' and not tgisinternal
  ) as candado_dominio;

-- ----------------------------------------------------------------------------
-- 4. OPCIONAL — limpiar los invitados anónimos que quedaron
--    Descomentar y correr solo si ya no los necesitás. Las tarjetas que
--    hayan creado NO se borran: created_by queda en null (on delete set null).
--    Los comentarios SÍ se borran, porque comments.user_id es on delete cascade.
-- ----------------------------------------------------------------------------
-- delete from auth.users
--  where email like '%@invitado.local' or email is null;

-- ============================================================================
-- LISTO. Acordate del paso 2 (config.js) y del paso 3 (dashboard).
-- ============================================================================
