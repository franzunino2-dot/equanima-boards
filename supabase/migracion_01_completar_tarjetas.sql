-- ============================================================================
-- Migración 01 — marcar tarjetas como completadas
-- ----------------------------------------------------------------------------
-- Correr una vez en Supabase → SQL Editor, en bases creadas antes del
-- 2026-09-10. En instalaciones nuevas no hace falta: schema.sql ya define la
-- columna con el nombre nuevo.
--
-- POR QUÉ
--   La columna se llamaba `due_complete` y solo tenía sentido si la tarjeta
--   tenía fecha de vencimiento: sin fecha no había forma de darla por hecha.
--   Ahora es `is_complete` y aplica a cualquier tarjeta, tenga fecha o no,
--   igual que el círculo de "Marcar como completada" de Trello.
--
-- Es un rename, así que NO se pierde nada: las tarjetas que ya estaban
-- marcadas como cumplidas siguen marcadas.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
-- ============================================================================

do $blk$
declare
  tiene_viejo boolean;
  tiene_nuevo boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cards'
       and column_name = 'due_complete'
  ) into tiene_viejo;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'cards'
       and column_name = 'is_complete'
  ) into tiene_nuevo;

  if tiene_viejo and not tiene_nuevo then
    alter table public.cards rename column due_complete to is_complete;
    raise notice 'due_complete renombrada a is_complete';
  elsif tiene_nuevo then
    raise notice 'is_complete ya existía, no se hizo nada';
  end if;
end $blk$;

-- Red de seguridad: si la base era muy vieja y no tenía ninguna de las dos
alter table public.cards
  add column if not exists is_complete boolean not null default false;

-- ----------------------------------------------------------------------------
-- Verificación — debe devolver is_complete = true, due_complete = false
-- ----------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='cards'
             and column_name='is_complete')  as is_complete,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='cards'
             and column_name='due_complete') as due_complete,
  (select count(*) from public.cards where is_complete) as ya_completadas;
