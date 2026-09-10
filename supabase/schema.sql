-- ============================================================================
-- Equanima Boards — schema completo
-- ----------------------------------------------------------------------------
-- Pegar TODO este archivo en Supabase -> SQL Editor -> Run.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Modelo de seguridad
--   * Solo entran mails del dominio autorizado (funcion allowed_domain()).
--   * Se valida en el trigger de auth.users (bloquea el alta) y en TODAS las
--     politicas RLS (bloquea el acceso a datos incluso con un token valido).
--   * Un tablero es visible si es 'workspace' (todo Equanima) o si el usuario
--     es miembro / creador cuando es 'private'.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. HELPERS DE SEGURIDAD
-- ============================================================================

-- >>> UNICO LUGAR donde se define el dominio autorizado en la base <<<
create or replace function public.allowed_domain()
returns text language sql immutable as $fn$
  select 'equanimasecurities.com'::text
$fn$;

-- Email del usuario actual, leido del JWT
create or replace function public.jwt_email()
returns text language sql stable as $fn$
  select lower(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    ''
  ))
$fn$;

-- El usuario actual pertenece al espacio de trabajo de Equanima?
create or replace function public.is_workspace_member()
returns boolean language sql stable as $fn$
  select auth.uid() is not null
     and public.jwt_email() like ('%@' || public.allowed_domain())
$fn$;

-- ============================================================================
-- 2. TABLAS
-- ============================================================================

-- Perfiles (espejo de auth.users, para mostrar nombre y avatar)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  avatar_url  text,
  initials    text,
  color       text not null default 'slate',
  created_at  timestamptz not null default now()
);

-- Tableros
create table if not exists public.boards (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  description  text not null default '',
  background   text not null default 'azul',
  visibility   text not null default 'workspace'
               check (visibility in ('workspace', 'private')),
  is_closed    boolean not null default false,
  card_counter integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Miembros del tablero
create table if not exists public.board_members (
  board_id  uuid not null references public.boards(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'miembro'
            check (role in ('admin', 'miembro', 'observador')),
  added_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);

-- Tableros destacados (una estrella por usuario)
create table if not exists public.board_stars (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  position double precision not null default 1000,
  primary key (board_id, user_id)
);

-- Listas (columnas)
create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards(id) on delete cascade,
  title       text not null default 'Nueva lista',
  position    double precision not null default 1000,
  is_archived boolean not null default false,
  wip_limit   integer,
  created_at  timestamptz not null default now()
);

-- Etiquetas (por tablero, como en Trello)
create table if not exists public.labels (
  id       uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name     text not null default '',
  color    text not null default 'verde',
  position double precision not null default 1000
);

-- Tarjetas
create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.boards(id) on delete cascade,
  list_id       uuid not null references public.lists(id) on delete cascade,
  number        integer not null default 0,
  title         text not null default '',
  description   text not null default '',
  position      double precision not null default 1000,
  start_at      timestamptz,
  due_at        timestamptz,
  -- Completada: aplica con o sin fecha de vencimiento (el circulito de la
  -- tarjeta). Antes se llamaba due_complete; ver migracion_01.
  is_complete   boolean not null default false,
  cover         jsonb not null default '{}'::jsonb,
  is_archived   boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Etiquetas aplicadas a tarjetas
create table if not exists public.card_labels (
  card_id  uuid not null references public.cards(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  primary key (card_id, label_id)
);

-- Personas asignadas a tarjetas
create table if not exists public.card_members (
  card_id  uuid not null references public.cards(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  primary key (card_id, user_id)
);

-- Seguidores de tarjeta (la campana de Trello)
create table if not exists public.card_watchers (
  card_id  uuid not null references public.cards(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  primary key (card_id, user_id)
);

-- Checklists
create table if not exists public.checklists (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards(id) on delete cascade,
  board_id   uuid not null references public.boards(id) on delete cascade,
  title      text not null default 'Checklist',
  position   double precision not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  board_id     uuid not null references public.boards(id) on delete cascade,
  text         text not null default '',
  is_done      boolean not null default false,
  position     double precision not null default 1000,
  due_at       timestamptz,
  assignee_id  uuid references public.profiles(id) on delete set null
);

-- Comentarios
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards(id) on delete cascade,
  board_id   uuid not null references public.boards(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adjuntos (archivo en Storage o link externo)
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards(id) on delete cascade,
  board_id     uuid not null references public.boards(id) on delete cascade,
  kind         text not null default 'file' check (kind in ('file', 'link')),
  name         text not null default '',
  url          text,
  storage_path text,
  mime         text,
  size_bytes   bigint,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Registro de actividad
create table if not exists public.activity (
  id         bigserial primary key,
  board_id   uuid not null references public.boards(id) on delete cascade,
  card_id    uuid references public.cards(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  type       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 3. INDICES
-- ============================================================================
create index if not exists idx_lists_board       on public.lists(board_id, position);
create index if not exists idx_cards_list        on public.cards(list_id, position);
create index if not exists idx_cards_board       on public.cards(board_id);
create index if not exists idx_cards_due         on public.cards(board_id, due_at);
create index if not exists idx_labels_board      on public.labels(board_id, position);
create index if not exists idx_card_labels_card  on public.card_labels(card_id);
create index if not exists idx_card_members_card on public.card_members(card_id);
create index if not exists idx_card_members_user on public.card_members(user_id);
create index if not exists idx_checklists_card   on public.checklists(card_id, position);
create index if not exists idx_items_checklist   on public.checklist_items(checklist_id, position);
create index if not exists idx_comments_card     on public.comments(card_id, created_at desc);
create index if not exists idx_attachments_card  on public.attachments(card_id, created_at desc);
create index if not exists idx_activity_board    on public.activity(board_id, created_at desc);
create index if not exists idx_activity_card     on public.activity(card_id, created_at desc);
create index if not exists idx_board_members_u   on public.board_members(user_id);
create index if not exists idx_cards_title_fts
  on public.cards using gin (to_tsvector('spanish', title));

-- ============================================================================
-- 4. VISIBILIDAD DE TABLEROS
--    security definer para que la politica de 'boards' no se llame a si misma.
-- ============================================================================
create or replace function public.can_access_board(b uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select public.is_workspace_member() and exists (
    select 1 from public.boards bo
     where bo.id = b
       and (
         bo.visibility = 'workspace'
         or bo.created_by = auth.uid()
         or exists (
           select 1 from public.board_members m
            where m.board_id = b and m.user_id = auth.uid()
         )
       )
  )
$fn$;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- 5.1 Bloquear el alta de usuarios de otros dominios
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

-- 5.2 Crear / refrescar el perfil en cada login
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_name text;
  v_ini  text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
  v_ini := upper(
    substr(split_part(v_name, ' ', 1), 1, 1) ||
    coalesce(nullif(substr(split_part(v_name, ' ', 2), 1, 1), ''), '')
  );

  insert into public.profiles (id, email, full_name, avatar_url, initials)
  values (
    new.id,
    lower(new.email),
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    v_ini
  )
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

-- 5.3 updated_at automatico
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_touch_cards on public.cards;
create trigger trg_touch_cards before update on public.cards
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_boards on public.boards;
create trigger trg_touch_boards before update on public.boards
  for each row execute function public.touch_updated_at();

-- 5.4 Numerito incremental por tablero (el "#12" de Trello)
create or replace function public.assign_card_number()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.number is null or new.number = 0 then
    update public.boards
       set card_counter = card_counter + 1
     where id = new.board_id
    returning card_counter into new.number;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_assign_card_number on public.cards;
create trigger trg_assign_card_number before insert on public.cards
  for each row execute function public.assign_card_number();

-- 5.5 El creador del tablero queda admin automaticamente
create or replace function public.add_creator_as_admin()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.created_by is not null then
    insert into public.board_members (board_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_add_creator_admin on public.boards;
create trigger trg_add_creator_admin after insert on public.boards
  for each row execute function public.add_creator_as_admin();

-- 5.6 Derivar board_id cuando el cliente no lo manda
create or replace function public.fill_board_id_from_card()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.board_id is null then
    select board_id into new.board_id from public.cards where id = new.card_id;
  end if;
  return new;
end;
$fn$;

do $blk$
declare t text;
begin
  foreach t in array array['card_labels','card_members','card_watchers',
                           'checklists','comments','attachments']
  loop
    execute format(
      'drop trigger if exists trg_fill_board_id on public.%I;', t);
    execute format(
      'create trigger trg_fill_board_id before insert on public.%I '
      'for each row execute function public.fill_board_id_from_card();', t);
  end loop;
end $blk$;

create or replace function public.fill_board_id_from_checklist()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.board_id is null then
    select board_id into new.board_id
      from public.checklists where id = new.checklist_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_fill_board_id on public.checklist_items;
create trigger trg_fill_board_id before insert on public.checklist_items
  for each row execute function public.fill_board_id_from_checklist();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================
do $blk$
declare t text;
begin
  foreach t in array array['profiles','boards','board_members','board_stars',
                           'lists','labels','cards','card_labels','card_members',
                           'card_watchers','checklists','checklist_items',
                           'comments','attachments','activity']
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $blk$;

-- profiles: todo Equanima se ve entre si; cada uno edita solo su perfil
drop policy if exists p_profiles_read   on public.profiles;
drop policy if exists p_profiles_write  on public.profiles;
drop policy if exists p_profiles_insert on public.profiles;
create policy p_profiles_read on public.profiles
  for select using (public.is_workspace_member());
create policy p_profiles_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy p_profiles_insert on public.profiles
  for insert with check (id = auth.uid() and public.is_workspace_member());

-- boards
drop policy if exists p_boards_read   on public.boards;
drop policy if exists p_boards_insert on public.boards;
drop policy if exists p_boards_update on public.boards;
drop policy if exists p_boards_delete on public.boards;
create policy p_boards_read on public.boards
  for select using (
    public.is_workspace_member() and (
      visibility = 'workspace'
      or created_by = auth.uid()
      or exists (select 1 from public.board_members m
                  where m.board_id = boards.id and m.user_id = auth.uid())
    )
  );
create policy p_boards_insert on public.boards
  for insert with check (public.is_workspace_member() and created_by = auth.uid());
create policy p_boards_update on public.boards
  for update using (public.can_access_board(id))
  with check (public.can_access_board(id));
-- Borrar un tablero: solo el creador o un admin del tablero
create policy p_boards_delete on public.boards
  for delete using (
    public.is_workspace_member() and (
      created_by = auth.uid()
      or exists (select 1 from public.board_members m
                  where m.board_id = boards.id
                    and m.user_id = auth.uid() and m.role = 'admin')
    )
  );

-- board_stars: privadas de cada usuario
drop policy if exists p_stars_all on public.board_stars;
create policy p_stars_all on public.board_stars
  for all using (user_id = auth.uid() and public.is_workspace_member())
  with check (user_id = auth.uid() and public.is_workspace_member());

-- board_members
drop policy if exists p_members_read  on public.board_members;
drop policy if exists p_members_write on public.board_members;
create policy p_members_read on public.board_members
  for select using (public.can_access_board(board_id) or user_id = auth.uid());
create policy p_members_write on public.board_members
  for all using (public.can_access_board(board_id))
  with check (public.can_access_board(board_id));

-- Tablas con board_id: mismo criterio para todas
do $blk$
declare t text;
begin
  foreach t in array array['lists','labels','cards','card_labels','card_members',
                           'card_watchers','checklists','checklist_items',
                           'attachments','activity']
  loop
    execute format('drop policy if exists p_%s_all on public.%I;', t, t);
    execute format(
      'create policy p_%s_all on public.%I for all '
      'using (public.can_access_board(board_id)) '
      'with check (public.can_access_board(board_id));', t, t);
  end loop;
end $blk$;

-- comments: se leen todos, pero cada uno edita los propios
drop policy if exists p_comments_all    on public.comments;
drop policy if exists p_comments_read   on public.comments;
drop policy if exists p_comments_insert on public.comments;
drop policy if exists p_comments_update on public.comments;
drop policy if exists p_comments_delete on public.comments;
create policy p_comments_read on public.comments
  for select using (public.can_access_board(board_id));
create policy p_comments_insert on public.comments
  for insert with check (public.can_access_board(board_id) and user_id = auth.uid());
create policy p_comments_update on public.comments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy p_comments_delete on public.comments
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.board_members m
                where m.board_id = comments.board_id
                  and m.user_id = auth.uid() and m.role = 'admin')
  );

-- ============================================================================
-- 7. CARGA DE UN TABLERO EN UN SOLO ROUND TRIP
-- ============================================================================
create or replace function public.board_bundle(p_board uuid)
returns jsonb
language sql stable security invoker as $fn$
  select jsonb_build_object(
    'board',      (select to_jsonb(b) from public.boards b where b.id = p_board),
    'lists',      coalesce((select jsonb_agg(to_jsonb(l) order by l.position)
                              from public.lists l where l.board_id = p_board), '[]'::jsonb),
    'cards',      coalesce((select jsonb_agg(to_jsonb(c) order by c.position)
                              from public.cards c where c.board_id = p_board), '[]'::jsonb),
    'labels',     coalesce((select jsonb_agg(to_jsonb(x) order by x.position)
                              from public.labels x where x.board_id = p_board), '[]'::jsonb),
    'members',    coalesce((select jsonb_agg(jsonb_build_object(
                              'user_id', m.user_id, 'role', m.role,
                              'email', p.email, 'full_name', p.full_name,
                              'avatar_url', p.avatar_url, 'initials', p.initials))
                              from public.board_members m
                              join public.profiles p on p.id = m.user_id
                             where m.board_id = p_board), '[]'::jsonb),
    'cardLabels', coalesce((select jsonb_agg(to_jsonb(x))
                              from public.card_labels x where x.board_id = p_board), '[]'::jsonb),
    'cardMembers',coalesce((select jsonb_agg(to_jsonb(x))
                              from public.card_members x where x.board_id = p_board), '[]'::jsonb),
    'watchers',   coalesce((select jsonb_agg(to_jsonb(x))
                              from public.card_watchers x where x.board_id = p_board), '[]'::jsonb),
    'checklists', coalesce((select jsonb_agg(to_jsonb(x) order by x.position)
                              from public.checklists x where x.board_id = p_board), '[]'::jsonb),
    'items',      coalesce((select jsonb_agg(to_jsonb(x) order by x.position)
                              from public.checklist_items x where x.board_id = p_board), '[]'::jsonb),
    'comments',   coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                              from public.comments x where x.board_id = p_board), '[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                              from public.attachments x where x.board_id = p_board), '[]'::jsonb),
    'activity',   coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc)
                              from (select * from public.activity
                                     where board_id = p_board
                                     order by created_at desc limit 200) a), '[]'::jsonb)
  )
$fn$;

-- Listado del home con contadores
create or replace function public.boards_overview()
returns jsonb
language sql stable security invoker as $fn$
  select coalesce(jsonb_agg(x order by x.updated_at desc), '[]'::jsonb) from (
    select b.id, b.title, b.background, b.visibility, b.is_closed,
           b.created_by, b.created_at, b.updated_at,
           (select count(*) from public.cards c
             where c.board_id = b.id and not c.is_archived)      as card_count,
           (select count(*) from public.lists l
             where l.board_id = b.id and not l.is_archived)      as list_count,
           exists (select 1 from public.board_stars s
                    where s.board_id = b.id and s.user_id = auth.uid()) as starred,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'user_id', m.user_id, 'initials', p.initials,
                       'avatar_url', p.avatar_url, 'full_name', p.full_name))
                      from public.board_members m
                      join public.profiles p on p.id = m.user_id
                     where m.board_id = b.id), '[]'::jsonb)      as members
      from public.boards b
  ) x
$fn$;

-- ============================================================================
-- 8. REALTIME
-- ============================================================================
do $blk$
declare t text;
begin
  foreach t in array array['boards','lists','cards','labels','card_labels',
                           'card_members','card_watchers','checklists',
                           'checklist_items','comments','attachments',
                           'activity','board_members']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $blk$;

-- Realtime necesita la fila completa para los DELETE
do $blk$
declare t text;
begin
  foreach t in array array['lists','cards','card_labels','card_members',
                           'card_watchers','checklists','checklist_items',
                           'comments','attachments']
  loop
    execute format('alter table public.%I replica identity full;', t);
  end loop;
end $blk$;

-- ============================================================================
-- 9. STORAGE (adjuntos)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

drop policy if exists p_att_read   on storage.objects;
drop policy if exists p_att_write  on storage.objects;
drop policy if exists p_att_delete on storage.objects;
create policy p_att_read on storage.objects
  for select using (bucket_id = 'attachments' and public.is_workspace_member());
create policy p_att_write on storage.objects
  for insert with check (bucket_id = 'attachments' and public.is_workspace_member());
create policy p_att_delete on storage.objects
  for delete using (bucket_id = 'attachments' and public.is_workspace_member());

-- ============================================================================
-- 10. TABLERO DE EJEMPLO (opcional: correr select public.crear_tablero_demo();)
-- ============================================================================
create or replace function public.crear_tablero_demo()
returns uuid language plpgsql security invoker as $fn$
declare
  b uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; me uuid := auth.uid();
begin
  insert into public.boards (title, background, created_by, description)
  values ('Mesa de Dinero', 'azul', me, 'Tablero de arranque del equipo')
  returning id into b;

  insert into public.labels (board_id, name, color, position) values
    (b, 'Urgente',     'rojo',     1000),
    (b, 'Cliente',     'verde',    2000),
    (b, 'Operaciones', 'azul',     3000),
    (b, 'Compliance',  'amarillo', 4000),
    (b, 'Tecnologia',  'violeta',  5000),
    (b, 'Idea',        'celeste',  6000);

  insert into public.lists (board_id, title, position) values (b, 'Pendientes', 1000) returning id into l1;
  insert into public.lists (board_id, title, position) values (b, 'En curso',   2000) returning id into l2;
  insert into public.lists (board_id, title, position) values (b, 'Revision',   3000) returning id into l3;
  insert into public.lists (board_id, title, position) values (b, 'Listo',      4000) returning id into l4;

  insert into public.cards (board_id, list_id, title, position, created_by) values
    (b, l1, 'Conciliar cauciones del dia',        1000, me),
    (b, l1, 'Actualizar padron de comitentes',    2000, me),
    (b, l2, 'Integrar TXT de Gallo al blotter',   1000, me),
    (b, l3, 'Revisar comisiones de productores',  1000, me),
    (b, l4, 'Migrar de Trello a Equanima Boards', 1000, me);
  return b;
end;
$fn$;

-- ============================================================================
-- LISTO. Siguiente paso: habilitar Google en Authentication -> Providers.
-- ============================================================================
