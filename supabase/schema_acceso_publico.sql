-- ============================================================================
-- Equanima Boards — ACCESO PÚBLICO
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de schema.sql, en Supabase → SQL Editor.
--
-- Deja el tablero abierto: cualquiera que abra el link entra como invitado
-- (usuario anónimo de Supabase), elige un apodo y puede leer y editar todo.
--
-- REQUISITO EN EL DASHBOARD
--   Authentication → Sign In / Providers → "Allow anonymous sign-ins": ON
--   Sin eso, la app no puede crear la sesión de invitado y no entra nadie.
--
-- QUÉ CAMBIA RESPECTO DE schema.sql
--   * is_workspace_member() pasa a aceptar a cualquier sesión (incluida anónima)
--   * se saca el trigger que bloqueaba mails de otros dominios
--   * handle_new_user() aprende a crear perfiles sin mail (los invitados no tienen)
--   * eliminar un tablero sigue reservado al creador: borrar todo de un click
--     es la única acción que no se considera "editar"
--
-- Para volver atrás: correr schema_acceso_dominio.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cualquier sesión autenticada es parte del espacio de trabajo
--    Las políticas RLS de schema.sql llaman a esta función, así que
--    reemplazarla acá abre el acceso en todas las tablas de una vez.
-- ----------------------------------------------------------------------------
create or replace function public.is_workspace_member()
returns boolean language sql stable as $fn$
  select auth.uid() is not null
$fn$;

-- ----------------------------------------------------------------------------
-- 2. Sacar el candado de dominio del alta de usuarios
--    Los invitados anónimos no tienen mail, así que este trigger los rechazaba.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_enforce_email_domain on auth.users;

-- ----------------------------------------------------------------------------
-- 3. Perfiles de invitados (sin mail)
--    profiles.email es NOT NULL UNIQUE, así que se genera uno sintético
--    derivado del id: mantiene la restricción sin inventar datos reales.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_email text;
  v_name  text;
  v_ini   text;
  v_anon  boolean;
begin
  v_anon := (new.email is null or new.email = '');

  v_email := coalesce(
    nullif(lower(new.email), ''),
    'invitado-' || substr(new.id::text, 1, 8) || '@invitado.local'
  );

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'apodo', ''),
    case when v_anon
      then 'Invitado ' || upper(substr(new.id::text, 1, 4))
      else split_part(new.email, '@', 1)
    end
  );

  v_ini := upper(
    substr(split_part(v_name, ' ', 1), 1, 1) ||
    coalesce(nullif(substr(split_part(v_name, ' ', 2), 1, 1), ''), '')
  );

  insert into public.profiles (id, email, full_name, avatar_url, initials)
  values (new.id, v_email, v_name, new.raw_user_meta_data ->> 'avatar_url', v_ini)
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        initials   = excluded.initials;
  return new;
end;
$fn$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert or update of raw_user_meta_data, email on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. Un invitado puede cambiar su propio apodo, y ver a los demás
--    (mismas políticas que schema.sql; se repiten para que este archivo
--     se pueda correr solo, sin depender del orden)
-- ----------------------------------------------------------------------------
drop policy if exists p_profiles_read   on public.profiles;
drop policy if exists p_profiles_write  on public.profiles;
drop policy if exists p_profiles_insert on public.profiles;
create policy p_profiles_read on public.profiles
  for select using (public.is_workspace_member());
create policy p_profiles_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy p_profiles_insert on public.profiles
  for insert with check (id = auth.uid() and public.is_workspace_member());

-- ----------------------------------------------------------------------------
-- 5. Verificación
--    Debe devolver: modo = 'PUBLICO', candado_dominio = false
-- ----------------------------------------------------------------------------
select
  case when public.is_workspace_member() is not null then 'PUBLICO' end as modo,
  exists (
    select 1 from pg_trigger
     where tgname = 'trg_enforce_email_domain' and not tgisinternal
  ) as candado_dominio;

-- ============================================================================
-- LISTO. Falta activar "Allow anonymous sign-ins" en el dashboard.
-- ============================================================================
