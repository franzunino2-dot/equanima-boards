/* ==========================================================================
   demo.js — backend de prueba sobre localStorage
   --------------------------------------------------------------------------
   Implementa la misma interfaz que backend/supabase.js para poder usar la app
   sin configurar nada. Sincroniza entre pestañas del mismo browser vía el
   evento `storage`, así se puede ver el comportamiento multiusuario.
   ========================================================================== */

import { uuid, CFG } from '../util.js';

const KEY = 'eq_boards_demo_v1';
const TABLES = ['profiles', 'boards', 'board_members', 'board_stars', 'lists',
                'labels', 'cards', 'card_labels', 'card_members', 'card_watchers',
                'checklists', 'checklist_items', 'comments', 'attachments', 'activity'];

const ME = {
  id: 'demo-user-0001',
  email: 'demo@' + (CFG.ALLOWED_EMAIL_DOMAIN || 'equanimasecurities.com'),
  full_name: 'Usuario Demo',
  avatar_url: null,
  initials: 'UD',
};

const COMPANEROS = [
  { id: 'demo-user-0002', email: 'mesa@demo', full_name: 'Sofía Mesa', initials: 'SM', avatar_url: null },
  { id: 'demo-user-0003', email: 'ops@demo',  full_name: 'Diego Ops',  initials: 'DO', avatar_url: null },
];

let db = null;
const listeners = new Set();

/* ------------------------------ storage -------------------------------- */

function load() {
  if (db) return db;
  try {
    const s = localStorage.getItem(KEY);
    if (s) { db = JSON.parse(s); TABLES.forEach((t) => db[t] ||= []); return db; }
  } catch { /* datos corruptos: se regenera */ }
  db = seed();
  save();
  return db;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.warn('demo: no se pudo guardar', e); }
}

function emit(table, event, row) {
  const ev = { table, event, row };
  listeners.forEach((cb) => { try { cb(ev); } catch (e) { console.error(e); } });
}

// Sincronización entre pestañas
addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  db = null; load();
  listeners.forEach((cb) => cb({ table: '*', event: 'RELOAD' }));
});

/* ------------------------------- semilla ------------------------------- */

function seed() {
  const d = {}; TABLES.forEach((t) => d[t] = []);
  d.profiles = [ME, ...COMPANEROS];

  const b = {
    id: uuid(), title: 'Mesa de Dinero', description: 'Tablero de arranque del equipo',
    background: 'azul', visibility: 'workspace', is_closed: false, card_counter: 0,
    created_by: ME.id, created_at: iso(-6), updated_at: iso(0),
  };
  d.boards.push(b);
  d.board_members.push(
    { board_id: b.id, user_id: ME.id, role: 'admin', added_at: iso(-6) },
    { board_id: b.id, user_id: COMPANEROS[0].id, role: 'miembro', added_at: iso(-5) },
    { board_id: b.id, user_id: COMPANEROS[1].id, role: 'miembro', added_at: iso(-5) },
  );
  d.board_stars.push({ board_id: b.id, user_id: ME.id, position: 1000 });

  const L = [
    ['Urgente', 'rojo'], ['Cliente', 'verde'], ['Operaciones', 'azul'],
    ['Compliance', 'amarillo'], ['Tecnología', 'violeta'], ['Idea', 'celeste'],
  ].map(([name, color], i) => ({
    id: uuid(), board_id: b.id, name, color, position: (i + 1) * 1000,
  }));
  d.labels.push(...L);

  const listas = ['Pendientes', 'En curso', 'Revisión', 'Listo'].map((title, i) => ({
    id: uuid(), board_id: b.id, title, position: (i + 1) * 1000,
    is_archived: false, wip_limit: null, created_at: iso(-6),
  }));
  d.lists.push(...listas);

  const mk = (li, title, extra = {}) => {
    const c = {
      id: uuid(), board_id: b.id, list_id: listas[li].id,
      number: ++b.card_counter, title, description: '',
      position: (d.cards.filter((x) => x.list_id === listas[li].id).length + 1) * 1000,
      start_at: null, due_at: null, due_complete: false, cover: {},
      is_archived: false, created_by: ME.id, created_at: iso(-4), updated_at: iso(-1),
      ...extra,
    };
    d.cards.push(c);
    return c;
  };

  const c1 = mk(0, 'Conciliar cauciones del día', {
    description: 'Cruzar el detalle de **BYMA** con el blotter interno.\n\n- Verificar tomadores\n- Revisar plazos\n- Confirmar tasas',
    due_at: iso(1),
  });
  const c2 = mk(0, 'Actualizar padrón de comitentes');
  const c3 = mk(1, 'Integrar TXT de Gallo al blotter', {
    description: 'Parsear el export del home broker y mapear las columnas al formato del blotter.',
    due_at: iso(3),
  });
  const c4 = mk(2, 'Revisar comisiones de productores', { due_at: iso(-1) });
  const c5 = mk(3, 'Migrar de Trello a Equanima Boards', { due_complete: true, due_at: iso(-2) });

  d.card_labels.push(
    { card_id: c1.id, label_id: L[2].id, board_id: b.id },
    { card_id: c1.id, label_id: L[0].id, board_id: b.id },
    { card_id: c3.id, label_id: L[4].id, board_id: b.id },
    { card_id: c4.id, label_id: L[3].id, board_id: b.id },
    { card_id: c5.id, label_id: L[4].id, board_id: b.id },
  );
  d.card_members.push(
    { card_id: c1.id, user_id: ME.id, board_id: b.id },
    { card_id: c3.id, user_id: ME.id, board_id: b.id },
    { card_id: c3.id, user_id: COMPANEROS[0].id, board_id: b.id },
    { card_id: c4.id, user_id: COMPANEROS[1].id, board_id: b.id },
  );

  const ck = { id: uuid(), card_id: c3.id, board_id: b.id, title: 'Pasos', position: 1000, created_at: iso(-3) };
  d.checklists.push(ck);
  ['Definir formato del TXT', 'Escribir el parser', 'Validar contra un día real', 'Deploy'].forEach((text, i) => {
    d.checklist_items.push({
      id: uuid(), checklist_id: ck.id, board_id: b.id, text,
      is_done: i < 2, position: (i + 1) * 1000, due_at: null, assignee_id: null,
    });
  });

  d.comments.push({
    id: uuid(), card_id: c3.id, board_id: b.id, user_id: COMPANEROS[0].id,
    body: 'El export de Gallo trae los montos con coma decimal, ojo con el parseo.',
    created_at: iso(-2), updated_at: iso(-2),
  });

  d.activity.push({
    id: 1, board_id: b.id, card_id: null, user_id: ME.id,
    type: 'board_create', data: { title: b.title }, created_at: iso(-6),
  });

  const b2 = {
    id: uuid(), title: 'Compliance y normativa', description: '',
    background: 'grafito', visibility: 'workspace', is_closed: false, card_counter: 0,
    created_by: ME.id, created_at: iso(-10), updated_at: iso(-2),
  };
  d.boards.push(b2);
  d.board_members.push({ board_id: b2.id, user_id: ME.id, role: 'admin', added_at: iso(-10) });
  ['Por revisar', 'En análisis', 'Cerrado'].forEach((title, i) => {
    d.lists.push({
      id: uuid(), board_id: b2.id, title, position: (i + 1) * 1000,
      is_archived: false, wip_limit: null, created_at: iso(-10),
    });
  });

  return d;
}

const iso = (dias) => new Date(Date.now() + dias * 86400000).toISOString();

/* ------------------------------- helpers ------------------------------- */

const matches = (row, m) => Object.keys(m).every((k) => row[k] === m[k]);
const clone = (x) => JSON.parse(JSON.stringify(x));

function tbl(name) {
  const d = load();
  if (!d[name]) throw new Error('tabla desconocida: ' + name);
  return d[name];
}

/* ------------------------------ interfaz ------------------------------- */

export function makeDemoBackend() {
  return {
    mode: 'demo',

    auth: {
      async init() { load(); return { user: ME }; },
      async signInGoogle() { throw new Error('En modo demo no hay login con Google.'); },
      async signOut() { location.hash = ''; location.reload(); },
      onAuthChange() { return () => {}; },
    },

    async me() { return clone(ME); },
    async profiles() { return clone(tbl('profiles')); },

    async boardsOverview() {
      const d = load();
      return d.boards.map((b) => ({
        ...b,
        card_count: d.cards.filter((c) => c.board_id === b.id && !c.is_archived).length,
        list_count: d.lists.filter((l) => l.board_id === b.id && !l.is_archived).length,
        starred: d.board_stars.some((s) => s.board_id === b.id && s.user_id === ME.id),
        members: d.board_members.filter((m) => m.board_id === b.id).map((m) => {
          const p = d.profiles.find((x) => x.id === m.user_id) || {};
          return { user_id: m.user_id, initials: p.initials, avatar_url: p.avatar_url, full_name: p.full_name };
        }),
      })).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    },

    async boardBundle(id) {
      const d = load();
      const board = d.boards.find((b) => b.id === id);
      if (!board) return null;
      const of = (t) => d[t].filter((r) => r.board_id === id);
      const byPos = (a, b) => a.position - b.position;
      return clone({
        board,
        lists: of('lists').sort(byPos),
        cards: of('cards').sort(byPos),
        labels: of('labels').sort(byPos),
        members: d.board_members.filter((m) => m.board_id === id).map((m) => {
          const p = d.profiles.find((x) => x.id === m.user_id) || {};
          return {
            user_id: m.user_id, role: m.role, email: p.email,
            full_name: p.full_name, avatar_url: p.avatar_url, initials: p.initials,
          };
        }),
        cardLabels: of('card_labels'),
        cardMembers: of('card_members'),
        watchers: of('card_watchers'),
        checklists: of('checklists').sort(byPos),
        items: of('checklist_items').sort(byPos),
        comments: of('comments').sort((a, b) => a.created_at.localeCompare(b.created_at)),
        attachments: of('attachments'),
        activity: of('activity').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200),
      });
    },

    async insert(table, row) {
      const t = tbl(table);
      const r = { ...row };
      if (table === 'cards') {
        const b = tbl('boards').find((x) => x.id === r.board_id);
        if (b && !r.number) { b.card_counter = (b.card_counter || 0) + 1; r.number = b.card_counter; }
      }
      if (!r.id && !['card_labels', 'card_members', 'card_watchers', 'board_members', 'board_stars'].includes(table)) {
        r.id = uuid();
      }
      if (table === 'activity') r.id = Date.now() + Math.random();
      r.created_at ||= new Date().toISOString();
      if ('updated_at' in r === false && ['cards', 'boards', 'comments'].includes(table)) {
        r.updated_at = r.created_at;
      }
      t.push(r);
      save(); emit(table, 'INSERT', r);
      return clone(r);
    },

    async update(table, match, patch) {
      const t = tbl(table);
      const hits = t.filter((r) => matches(r, match));
      hits.forEach((r) => {
        Object.assign(r, patch);
        if (['cards', 'boards', 'comments'].includes(table)) r.updated_at = new Date().toISOString();
        emit(table, 'UPDATE', r);
      });
      save();
      return clone(hits[0] || null);
    },

    async removeWhere(table, match) {
      const d = load();
      const gone = d[table].filter((r) => matches(r, match));
      d[table] = d[table].filter((r) => !matches(r, match));

      // Borrado en cascada (lo que en Postgres hace ON DELETE CASCADE)
      for (const g of gone) {
        if (table === 'boards') {
          ['lists', 'cards', 'labels', 'card_labels', 'card_members', 'card_watchers',
           'checklists', 'checklist_items', 'comments', 'attachments', 'activity',
           'board_members', 'board_stars'].forEach((t2) => {
            d[t2] = d[t2].filter((r) => r.board_id !== g.id);
          });
        }
        if (table === 'lists') {
          const cs = d.cards.filter((c) => c.list_id === g.id);
          d.cards = d.cards.filter((c) => c.list_id !== g.id);
          cs.forEach((c) => cascadeCard(d, c.id));
        }
        if (table === 'cards') cascadeCard(d, g.id);
        if (table === 'checklists') {
          d.checklist_items = d.checklist_items.filter((i) => i.checklist_id !== g.id);
        }
        if (table === 'labels') {
          d.card_labels = d.card_labels.filter((r) => r.label_id !== g.id);
        }
        emit(table, 'DELETE', g);
      }
      save();
      return gone.length;
    },

    subscribe(_boardId, cb) { listeners.add(cb); return () => listeners.delete(cb); },

    async uploadAttachment(file) {
      // En demo se guarda como data URL (ojo con el tamaño de localStorage).
      const url = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      return { url, storage_path: null, mime: file.type, size_bytes: file.size, name: file.name };
    },
    async signedUrl(_p, fallback) { return fallback || null; },
    async deleteStoragePath() { /* nada que borrar en demo */ },

    async searchCards(q) {
      const d = load();
      const s = q.toLowerCase();
      return d.cards
        .filter((c) => !c.is_archived &&
          (c.title.toLowerCase().includes(s) || (c.description || '').toLowerCase().includes(s)))
        .slice(0, 40)
        .map((c) => ({
          ...c,
          board_title: d.boards.find((b) => b.id === c.board_id)?.title || '',
          list_title: d.lists.find((l) => l.id === c.list_id)?.title || '',
        }));
    },
  };
}

function cascadeCard(d, cardId) {
  const cks = d.checklists.filter((k) => k.card_id === cardId).map((k) => k.id);
  d.checklists = d.checklists.filter((k) => k.card_id !== cardId);
  d.checklist_items = d.checklist_items.filter((i) => !cks.includes(i.checklist_id));
  ['card_labels', 'card_members', 'card_watchers', 'comments', 'attachments'].forEach((t) => {
    d[t] = d[t].filter((r) => r.card_id !== cardId);
  });
  d.activity = d.activity.filter((a) => a.card_id !== cardId);
}
