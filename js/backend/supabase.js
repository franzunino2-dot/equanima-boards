/* ==========================================================================
   supabase.js — backend real (Postgres + Auth + Realtime + Storage)
   ========================================================================== */

import { CFG, uuid, initials } from '../util.js';

// Versión fijada a propósito. Ojo: NO bajar de 2.116 — las builds viejas
// (probado con 2.45.4) son anteriores a los canales privados de Realtime y la
// presencia se une y se cierra al instante, sin error visible.
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const REALTIME_TABLES = [
  'lists', 'cards', 'labels', 'card_labels', 'card_members', 'card_watchers',
  'checklists', 'checklist_items', 'comments', 'attachments', 'activity',
  'boards', 'board_members',
];

export async function makeSupabaseBackend() {
  const { createClient } = await import(/* @vite-ignore */ CDN);

  const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  const dominio = (CFG.ALLOWED_EMAIL_DOMAIN || '').toLowerCase();
  const bucket = CFG.STORAGE_BUCKET || 'attachments';
  const urlCache = new Map();
  const publico = CFG.ACCESS_MODE === 'publico';

  const emailOk = (email) => !dominio || String(email || '').toLowerCase().endsWith('@' + dominio);

  /** Lanza el error de Supabase con un mensaje legible. */
  function chk({ data, error }, ctx) {
    if (error) {
      console.error(`[supabase:${ctx}]`, error);
      const e = new Error(error.message || 'Error de base de datos');
      e.code = error.code;
      e.ctx = ctx;
      throw e;
    }
    return data;
  }

  return {
    mode: 'supabase',
    acceso: publico ? 'publico' : 'dominio',
    client: sb,

    auth: {
      async init() {
        const { data } = await sb.auth.getSession();
        let user = data?.session?.user || null;

        // Limpia el hash que deja el redirect de OAuth
        if (location.hash.includes('access_token')) {
          history.replaceState(null, '', location.pathname + location.search);
        }

        // --- Modo público: sesión de invitado automática ---
        if (publico) {
          if (!user) {
            const { data: d2, error } = await sb.auth.signInAnonymously();
            if (error) {
              console.error('[supabase:anon]', error);
              const e = new Error(
                'No se pudo crear la sesión de invitado. En Supabase: ' +
                'Authentication → Sign In / Providers → activá ' +
                '"Allow anonymous sign-ins".');
              e.code = 'ANON_OFF';
              throw e;
            }
            user = d2.user;
          }
          return { user, esInvitado: !user.email };
        }

        // --- Modo dominio: solo mails autorizados ---
        if (user && !emailOk(user.email)) {
          await sb.auth.signOut();
          const e = new Error(
            `La cuenta ${user.email} no pertenece a @${dominio}. ` +
            'Entrá con tu mail de Equanima.');
          e.code = 'DOMINIO';
          throw e;
        }
        return { user };
      },

      async signInGoogle() {
        const redirectTo = location.origin + location.pathname;
        return chk(await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: {
              hd: dominio,              // sugiere el dominio en el selector de Google
              prompt: 'select_account',
            },
          },
        }), 'signInGoogle');
      },

      async signOut() {
        await sb.auth.signOut();
        location.hash = '';
        location.reload();
      },

      onAuthChange(cb) {
        const { data } = sb.auth.onAuthStateChange((evt, session) => cb(evt, session));
        return () => data?.subscription?.unsubscribe();
      },
    },

    /* ------------------------------ perfil ------------------------------ */

    async me() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('Sin sesión');

      const row = chk(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle(), 'me');
      if (row) return row;

      // Red de seguridad: si el trigger no llegó a crear el perfil, lo crea acá.
      const nombre = user.user_metadata?.full_name || user.user_metadata?.name
                   || user.email.split('@')[0];
      return chk(await sb.from('profiles').upsert({
        id: user.id,
        email: user.email.toLowerCase(),
        full_name: nombre,
        avatar_url: user.user_metadata?.avatar_url || null,
        initials: initials(nombre, user.email),
      }).select().single(), 'me:upsert');
    },

    async profiles() {
      return chk(await sb.from('profiles').select('*').order('full_name'), 'profiles') || [];
    },

    /** Cambia el nombre visible (apodo de invitado o nombre propio). */
    async setNombre(nombre) {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('Sin sesión');
      const ini = initials(nombre, user.email || '');
      await sb.auth.updateUser({ data: { full_name: nombre, apodo: nombre } });
      return chk(await sb.from('profiles')
        .update({ full_name: nombre, initials: ini })
        .eq('id', user.id).select().single(), 'setNombre');
    },

    /* ------------------------------ tableros ---------------------------- */

    async boardsOverview() {
      return chk(await sb.rpc('boards_overview'), 'boardsOverview') || [];
    },

    async boardBundle(id) {
      return chk(await sb.rpc('board_bundle', { p_board: id }), 'boardBundle');
    },

    /* ------------------------------ CRUD -------------------------------- */

    async insert(table, row) {
      return chk(await sb.from(table).insert(row).select().single(), 'insert:' + table);
    },

    async update(table, match, patch) {
      return chk(await sb.from(table).update(patch).match(match).select(), 'update:' + table)?.[0] || null;
    },

    async removeWhere(table, match) {
      chk(await sb.from(table).delete().match(match), 'delete:' + table);
      return 1;
    },

    /* ----------------------------- realtime ----------------------------- */

    subscribe(boardId, cb) {
      const ch = sb.channel('board:' + boardId);
      for (const table of REALTIME_TABLES) {
        ch.on('postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
            if (!row) return;
            // Filtra acá: las tablas mandan todo el schema, no solo este tablero.
            const bid = row.board_id || (table === 'boards' ? row.id : null);
            if (bid && bid !== boardId) return;
            cb({ table, event: payload.eventType || payload.event, row });
          });
      }
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },

    /**
     * Presencia: avisa quién está mirando el tablero ahora mismo.
     * @param {string} boardId
     * @param {object} perfil  { id, full_name, initials, avatar_url }
     * @param {(gente:object[])=>void} onChange
     * @returns {Function} para desuscribirse
     */
    presencia(boardId, perfil, onChange) {
      // La presencia necesita DOS cosas, y sin cualquiera de las dos falla en
      // silencio (el canal reporta SUBSCRIBED y enseguida CLOSED, track()
      // devuelve 'ok' y presenceState() queda vacío, sin ningún error):
      //   1. las políticas de realtime.messages (sección 5 de
      //      schema_acceso_publico.sql)
      //   2. un cliente >= 2.116, posterior a los canales privados de Realtime
      // Si al depurar esto parece no andar en local, revisar primero que el
      // browser no tenga cacheado un supabase-js viejo: pasó, y mandó la
      // investigación media hora para el lado equivocado.
      const ch = sb.channel('presencia:' + boardId, {
        config: { presence: { key: perfil.id } },
      });

      const sync = () => {
        const estado = ch.presenceState();
        // Una persona puede tener varias pestañas: se deduplica por id
        const porId = new Map();
        Object.values(estado).flat().forEach((p) => porId.set(p.user_id, p));
        onChange([...porId.values()]);
      };

      ch.on('presence', { event: 'sync' }, sync);
      ch.on('presence', { event: 'join' }, sync);
      ch.on('presence', { event: 'leave' }, sync);

      ch.subscribe(async (estado) => {
        if (estado !== 'SUBSCRIBED') return;
        await ch.track({
          user_id: perfil.id,
          full_name: perfil.full_name,
          initials: perfil.initials,
          avatar_url: perfil.avatar_url,
          desde: new Date().toISOString(),
        });
      });

      return () => sb.removeChannel(ch);
    },

    /* ------------------------------ storage ----------------------------- */

    async uploadAttachment(file, boardId, cardId) {
      const max = (CFG.MAX_ATTACHMENT_MB || 25) * 1024 * 1024;
      if (file.size > max) {
        throw new Error(`El archivo supera los ${CFG.MAX_ATTACHMENT_MB} MB`);
      }
      const limpio = file.name.replace(/[^\w.\- ]+/g, '_').slice(-80);
      const path = `${boardId}/${cardId}/${uuid()}-${limpio}`;
      chk(await sb.storage.from(bucket).upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type || undefined,
      }), 'upload');
      return {
        url: null, storage_path: path, mime: file.type,
        size_bytes: file.size, name: file.name,
      };
    },

    /** URL firmada (1 h) con caché en memoria. */
    async signedUrl(path, fallback) {
      if (!path) return fallback || null;
      const hit = urlCache.get(path);
      if (hit && hit.exp > Date.now()) return hit.url;
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) { console.warn('signedUrl', error); return fallback || null; }
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300e3 });
      return data.signedUrl;
    },

    async deleteStoragePath(path) {
      if (!path) return;
      urlCache.delete(path);
      await sb.storage.from(bucket).remove([path]);
    },

    /* ------------------------------ búsqueda ---------------------------- */

    async searchCards(q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const rows = chk(await sb
        .from('cards')
        .select('*, boards(title), lists(title)')
        .eq('is_archived', false)
        .or(`title.ilike.${like},description.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .limit(40), 'searchCards') || [];
      return rows.map((r) => ({
        ...r,
        board_title: r.boards?.title || '',
        list_title: r.lists?.title || '',
      }));
    },
  };
}
