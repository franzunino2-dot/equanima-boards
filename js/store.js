/* ==========================================================================
   store.js — estado de la app, mutaciones optimistas y sincronización realtime
   --------------------------------------------------------------------------
   Patrón de cada mutación:
     1. se aplica en memoria y se avisa a la UI (respuesta instantánea)
     2. se manda al backend
     3. si falla: toast de error y recarga del tablero desde la base
   Los ids se generan en el cliente para que el eco de realtime sea idempotente.
   ========================================================================== */

import { api } from './api.js';
import { uuid, between, needsRenumber, dueState, parseDate } from './util.js';
import { toast } from './ui/kit.js';

/* ------------------------------- eventos ------------------------------- */

const handlers = new Map();
export const bus = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => handlers.get(name).delete(fn);
  },
  emit(name, data) {
    handlers.get(name)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
  },
};

/* -------------------------------- estado ------------------------------- */

export const state = {
  mode: 'demo',
  me: null,
  profiles: [],
  boards: [],

  boardId: null,
  board: null,
  lists: new Map(),
  cards: new Map(),
  labels: new Map(),
  members: [],
  cardLabels: new Set(),     // "cardId|labelId"
  cardMembers: new Set(),    // "cardId|userId"
  watchers: new Set(),       // "cardId|userId"
  checklists: new Map(),
  items: new Map(),
  comments: new Map(),
  attachments: new Map(),
  activity: [],

  view: 'board',             // board | tabla | calendario | resumen
  showArchived: false,
  filters: nuevoFiltro(),
  collapsed: new Set(),      // listas colapsadas (solo local)

  unsub: null,
};

export function nuevoFiltro() {
  return {
    text: '', labels: new Set(), members: new Set(),
    due: null,             // vence | hoy | semana | mes | sin
    sinMiembro: false, sinEtiqueta: false,
  };
}

export const filtroActivo = () => {
  const f = state.filters;
  return Boolean(f.text || f.labels.size || f.members.size || f.due || f.sinMiembro || f.sinEtiqueta);
};

/* ------------------------------ selectores ----------------------------- */

const porPos = (a, b) => a.position - b.position;

export const listasVisibles = () =>
  [...state.lists.values()].filter((l) => !l.is_archived).sort(porPos);

export const listasArchivadas = () =>
  [...state.lists.values()].filter((l) => l.is_archived).sort(porPos);

export const tarjetasArchivadas = () =>
  [...state.cards.values()].filter((c) => c.is_archived)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

/** Tarjetas de una lista, sin archivadas, aplicando filtros. */
export function tarjetasDe(listId, { conFiltro = true } = {}) {
  const arr = [...state.cards.values()]
    .filter((c) => c.list_id === listId && !c.is_archived)
    .sort(porPos);
  return conFiltro ? arr.filter(pasaFiltro) : arr;
}

export const todasLasTarjetas = () =>
  [...state.cards.values()].filter((c) => !c.is_archived);

export function pasaFiltro(c) {
  const f = state.filters;
  if (f.text) {
    const t = f.text.toLowerCase();
    if (!(c.title.toLowerCase().includes(t) ||
          (c.description || '').toLowerCase().includes(t) ||
          String(c.number) === t.replace('#', ''))) return false;
  }
  if (f.labels.size) {
    const ls = etiquetasDe(c.id);
    if (!ls.some((l) => f.labels.has(l.id))) return false;
  }
  if (f.sinEtiqueta && etiquetasDe(c.id).length) return false;

  if (f.members.size) {
    const ms = miembrosDe(c.id);
    if (!ms.some((m) => f.members.has(m.user_id || m.id))) return false;
  }
  if (f.sinMiembro && miembrosDe(c.id).length) return false;

  if (f.due) {
    const d = parseDate(c.due_at);
    if (f.due === 'sin') { if (d) return false; }
    else {
      if (!d) return false;
      const ms = d.getTime() - Date.now();
      if (f.due === 'vence' && !(ms < 0 && !c.is_complete)) return false;
      if (f.due === 'hoy' && !(ms < 86400e3)) return false;
      if (f.due === 'semana' && !(ms < 7 * 86400e3)) return false;
      if (f.due === 'mes' && !(ms < 31 * 86400e3)) return false;
    }
  }
  return true;
}

export const etiquetasDe = (cardId) =>
  [...state.labels.values()]
    .filter((l) => state.cardLabels.has(cardId + '|' + l.id))
    .sort(porPos);

export const miembrosDe = (cardId) =>
  state.members.filter((m) => state.cardMembers.has(cardId + '|' + m.user_id));

export const sigo = (cardId) =>
  state.me ? state.watchers.has(cardId + '|' + state.me.id) : false;

export const checklistsDe = (cardId) =>
  [...state.checklists.values()].filter((k) => k.card_id === cardId).sort(porPos);

export const itemsDe = (checklistId) =>
  [...state.items.values()].filter((i) => i.checklist_id === checklistId).sort(porPos);

export const comentariosDe = (cardId) =>
  [...state.comments.values()].filter((c) => c.card_id === cardId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

export const adjuntosDe = (cardId) =>
  [...state.attachments.values()].filter((a) => a.card_id === cardId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

export const actividadDe = (cardId) => state.activity.filter((a) => a.card_id === cardId);

/** {hechos, total, pct} de todos los checklists de una tarjeta. */
export function progresoCheck(cardId) {
  const ks = checklistsDe(cardId).map((k) => k.id);
  const its = [...state.items.values()].filter((i) => ks.includes(i.checklist_id));
  const hechos = its.filter((i) => i.is_done).length;
  return { hechos, total: its.length, pct: its.length ? Math.round(hechos / its.length * 100) : 0 };
}

/**
 * Perfiles que vale la pena ofrecer para asignar tarjetas.
 * En modo público cada browser que entra crea su perfil, así que hay que
 * dejar afuera a los que nunca eligieron nombre ("Invitado 8F2A"): son ruido.
 * Los que sí están asignados a algo se siguen viendo igual, porque eso sale
 * de state.members, no de acá.
 */
export function perfilesUtiles() {
  const sirve = (p) =>
    p.id === state.me?.id || !/^Invitado /i.test(p.full_name || '');

  // Deduplica por nombre: la misma persona entrando del celular y de la
  // compu genera dos sesiones anónimas, y las dos aparecerían en la lista.
  // Se prefiere el perfil propio, y si no, el más reciente.
  const porNombre = new Map();
  for (const p of state.profiles.filter(sirve)) {
    const k = (p.full_name || p.id).trim().toLowerCase();
    const previo = porNombre.get(k);
    if (!previo
        || p.id === state.me?.id
        || (previo.id !== state.me?.id
            && (p.created_at || '') > (previo.created_at || ''))) {
      porNombre.set(k, p);
    }
  }
  return [...porNombre.values()]
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'es'));
}

export const perfil = (id) =>
  state.profiles.find((p) => p.id === id) ||
  state.members.find((m) => m.user_id === id) ||
  null;

export const nombreDe = (id) => {
  const p = perfil(id);
  return p ? (p.full_name || p.email || 'Alguien') : 'Alguien';
};

export const esMiembroDelTablero = (userId) => state.members.some((m) => m.user_id === userId);

/* ---------------------------- carga de datos --------------------------- */

export async function cargarSesion() {
  state.me = await api.me();
  state.mode = api.mode;
  state.profiles = await api.profiles();
  if (!state.profiles.some((p) => p.id === state.me.id)) state.profiles.push(state.me);
}

export async function cargarBoards() {
  state.boards = await api.boardsOverview();
  bus.emit('boards');
  return state.boards;
}

export async function abrirTablero(id) {
  if (state.unsub) { state.unsub(); state.unsub = null; }
  const b = await api.boardBundle(id);
  if (!b || !b.board) throw new Error('El tablero no existe o no tenés acceso.');

  state.boardId = id;
  state.board = b.board;
  state.lists = mapa(b.lists);
  state.cards = mapa(b.cards);
  state.labels = mapa(b.labels);
  state.members = b.members || [];
  state.cardLabels = new Set((b.cardLabels || []).map((r) => r.card_id + '|' + r.label_id));
  state.cardMembers = new Set((b.cardMembers || []).map((r) => r.card_id + '|' + r.user_id));
  state.watchers = new Set((b.watchers || []).map((r) => r.card_id + '|' + r.user_id));
  state.checklists = mapa(b.checklists);
  state.items = mapa(b.items);
  state.comments = mapa(b.comments);
  state.attachments = mapa(b.attachments);
  state.activity = b.activity || [];
  state.filters = nuevoFiltro();

  state.unsub = api.subscribe(id, aplicarRealtime);
  bus.emit('board');
  return state.board;
}

export function cerrarTablero() {
  if (state.unsub) { state.unsub(); state.unsub = null; }
  state.boardId = null;
  state.board = null;
}

const mapa = (arr) => new Map((arr || []).map((r) => [r.id, r]));

export async function recargarTablero() {
  if (state.boardId) {
    try { await abrirTablero(state.boardId); }
    catch (e) { console.error(e); }
  }
}

/* ------------------------------- realtime ------------------------------ */

const TABLA_MAPA = {
  lists: 'lists', cards: 'cards', labels: 'labels',
  checklists: 'checklists', checklist_items: 'items',
  comments: 'comments', attachments: 'attachments',
};

function aplicarRealtime({ table, event, row }) {
  if (event === 'RELOAD') { recargarTablero(); return; }

  const key = TABLA_MAPA[table];
  if (key) {
    const m = state[key];
    if (event === 'DELETE') m.delete(row.id);
    else m.set(row.id, { ...(m.get(row.id) || {}), ...row });
    bus.emit('board');
    if (row.card_id) bus.emit('card', row.card_id);
    if (table === 'cards') bus.emit('card', row.id);
    return;
  }

  if (table === 'card_labels' || table === 'card_members' || table === 'card_watchers') {
    const set = table === 'card_labels' ? state.cardLabels
              : table === 'card_members' ? state.cardMembers : state.watchers;
    const k = row.card_id + '|' + (row.label_id || row.user_id);
    if (event === 'DELETE') set.delete(k); else set.add(k);
    bus.emit('board'); bus.emit('card', row.card_id);
    return;
  }

  if (table === 'boards') {
    if (row.id === state.boardId) {
      state.board = { ...state.board, ...row };
      bus.emit('board');
    }
    return;
  }

  if (table === 'board_members') { recargarTablero(); return; }

  if (table === 'activity') {
    if (row.user_id === state.me?.id) return;            // ya lo agregamos local
    if (state.activity.some((a) => a.id === row.id)) return;
    state.activity.unshift(row);
    bus.emit('board');
    if (row.card_id) bus.emit('card', row.card_id);
  }
}

/* --------------------------- infra de mutación ------------------------- */

async function push(fn, { recargar = true } = {}) {
  try { return await fn(); }
  catch (e) {
    console.error(e);
    toast(e.message || 'No se pudo guardar el cambio', 'err');
    if (recargar) await recargarTablero();
    return null;
  }
}

/** Registra actividad (local + base). */
async function log(type, data = {}, cardId = null) {
  const row = {
    board_id: state.boardId, card_id: cardId,
    user_id: state.me.id, type, data,
    created_at: new Date().toISOString(),
  };
  state.activity.unshift({ ...row, id: 'tmp-' + uuid() });
  if (state.activity.length > 300) state.activity.pop();
  try { await api.insert('activity', row); } catch (e) { console.warn('activity', e); }
}

/* ============================== TABLEROS =============================== */

export async function crearTablero({ title, background = 'azul', visibility = 'workspace' }) {
  const row = {
    id: uuid(), title: title.trim(), background, visibility,
    description: '', created_by: state.me.id,
  };
  const b = await api.insert('boards', row);
  if (api.mode === 'demo') {
    await api.insert('board_members', { board_id: b.id, user_id: state.me.id, role: 'admin' });
  }
  await cargarBoards();
  return b;
}

export async function actualizarTablero(patch) {
  const antes = { ...state.board };
  state.board = { ...state.board, ...patch };
  bus.emit('board');
  await push(async () => {
    await api.update('boards', { id: state.boardId }, patch);
    if ('title' in patch) await log('board_rename', { de: antes.title, a: patch.title });
  });
  const i = state.boards.findIndex((b) => b.id === state.boardId);
  if (i >= 0) state.boards[i] = { ...state.boards[i], ...patch };
}

export async function borrarTablero(id) {
  state.boards = state.boards.filter((b) => b.id !== id);
  bus.emit('boards');
  await push(() => api.removeWhere('boards', { id }), { recargar: false });
}

export async function toggleDestacado(id) {
  const b = state.boards.find((x) => x.id === id);
  const on = !(b?.starred);
  if (b) { b.starred = on; bus.emit('boards'); }
  if (state.board?.id === id) { state.board.starred = on; bus.emit('board'); }
  await push(async () => {
    if (on) await api.insert('board_stars', { board_id: id, user_id: state.me.id, position: Date.now() });
    else await api.removeWhere('board_stars', { board_id: id, user_id: state.me.id });
  }, { recargar: false });
}

export async function agregarMiembro(userId, role = 'miembro') {
  const p = perfil(userId);
  if (!p || esMiembroDelTablero(userId)) return;
  state.members.push({
    user_id: userId, role, email: p.email, full_name: p.full_name,
    avatar_url: p.avatar_url, initials: p.initials,
  });
  bus.emit('board');
  await push(async () => {
    await api.insert('board_members', { board_id: state.boardId, user_id: userId, role });
    await log('member_add', { nombre: p.full_name || p.email });
  });
}

export async function quitarMiembro(userId) {
  const p = perfil(userId);
  state.members = state.members.filter((m) => m.user_id !== userId);
  [...state.cardMembers].filter((k) => k.endsWith('|' + userId))
    .forEach((k) => state.cardMembers.delete(k));
  bus.emit('board');
  await push(async () => {
    await api.removeWhere('card_members', { board_id: state.boardId, user_id: userId });
    await api.removeWhere('board_members', { board_id: state.boardId, user_id: userId });
    await log('member_remove', { nombre: p?.full_name || p?.email || '' });
  });
}

export async function cambiarRol(userId, role) {
  const m = state.members.find((x) => x.user_id === userId);
  if (m) { m.role = role; bus.emit('board'); }
  await push(() => api.update('board_members', { board_id: state.boardId, user_id: userId }, { role }));
}

/* =============================== LISTAS ================================ */

export async function agregarLista(title) {
  const ls = listasVisibles();
  const row = {
    id: uuid(), board_id: state.boardId, title: title.trim() || 'Nueva lista',
    position: between(ls.at(-1)?.position ?? null, null),
    is_archived: false, wip_limit: null,
  };
  state.lists.set(row.id, row);
  bus.emit('board');
  await push(async () => {
    await api.insert('lists', row);
    await log('list_create', { title: row.title });
  });
  return row;
}

export async function actualizarLista(id, patch) {
  const l = state.lists.get(id); if (!l) return;
  const antes = l.title;
  state.lists.set(id, { ...l, ...patch });
  bus.emit('board');
  await push(async () => {
    await api.update('lists', { id }, patch);
    if (patch.title && patch.title !== antes) await log('list_rename', { de: antes, a: patch.title });
    if (patch.is_archived === true) await log('list_archive', { title: l.title });
  });
}

export async function moverLista(id, nuevaPos) {
  const l = state.lists.get(id); if (!l) return;
  state.lists.set(id, { ...l, position: nuevaPos });
  bus.emit('board');
  await push(() => api.update('lists', { id }, { position: nuevaPos }));
  await renumerarListasSiHaceFalta();
}

export async function borrarLista(id) {
  const l = state.lists.get(id);
  state.lists.delete(id);
  [...state.cards.values()].filter((c) => c.list_id === id)
    .forEach((c) => state.cards.delete(c.id));
  bus.emit('board');
  await push(async () => {
    await api.removeWhere('lists', { id });
    await log('list_delete', { title: l?.title || '' });
  });
}

export async function archivarTodasLasTarjetas(listId) {
  const cs = tarjetasDe(listId, { conFiltro: false });
  cs.forEach((c) => state.cards.set(c.id, { ...c, is_archived: true }));
  bus.emit('board');
  await push(async () => {
    for (const c of cs) await api.update('cards', { id: c.id }, { is_archived: true });
    await log('list_archive_cards', { title: state.lists.get(listId)?.title, n: cs.length });
  });
}

export async function moverTodasLasTarjetas(listId, destinoId) {
  const cs = tarjetasDe(listId, { conFiltro: false });
  const base = tarjetasDe(destinoId, { conFiltro: false }).at(-1)?.position ?? 0;
  cs.forEach((c, i) => state.cards.set(c.id, { ...c, list_id: destinoId, position: base + (i + 1) * 1000 }));
  bus.emit('board');
  await push(async () => {
    for (const [i, c] of cs.entries()) {
      await api.update('cards', { id: c.id }, { list_id: destinoId, position: base + (i + 1) * 1000 });
    }
  });
}

export async function ordenarLista(listId, modo) {
  const cs = tarjetasDe(listId, { conFiltro: false });
  const orden = [...cs].sort((a, b) => {
    if (modo === 'nombre') return a.title.localeCompare(b.title, 'es');
    if (modo === 'creacion') return (b.created_at || '').localeCompare(a.created_at || '');
    if (modo === 'creacion-asc') return (a.created_at || '').localeCompare(b.created_at || '');
    if (modo === 'vencimiento') {
      const x = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const y = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return x - y;
    }
    return 0;
  });
  orden.forEach((c, i) => state.cards.set(c.id, { ...c, position: (i + 1) * 1000 }));
  bus.emit('board');
  await push(async () => {
    for (const [i, c] of orden.entries()) {
      await api.update('cards', { id: c.id }, { position: (i + 1) * 1000 });
    }
  });
}

export async function duplicarLista(listId) {
  const l = state.lists.get(listId); if (!l) return;
  const nueva = await agregarLista(l.title + ' (copia)');
  const cs = tarjetasDe(listId, { conFiltro: false });
  for (const [i, c] of cs.entries()) {
    await agregarTarjeta(nueva.id, c.title, { position: (i + 1) * 1000, description: c.description });
  }
}

async function renumerarListasSiHaceFalta() {
  const ls = listasVisibles();
  if (!needsRenumber(ls)) return;
  for (const [i, l] of ls.entries()) {
    const p = (i + 1) * 1000;
    state.lists.set(l.id, { ...l, position: p });
    await api.update('lists', { id: l.id }, { position: p }).catch(() => {});
  }
  bus.emit('board');
}

/* ============================== TARJETAS =============================== */

export async function agregarTarjeta(listId, title, extra = {}) {
  const cs = tarjetasDe(listId, { conFiltro: false });
  const pos = extra.position ?? (extra.top
    ? between(null, cs[0]?.position ?? null)
    : between(cs.at(-1)?.position ?? null, null));

  const row = {
    id: uuid(), board_id: state.boardId, list_id: listId,
    title: title.trim(), description: extra.description || '',
    position: pos, due_at: extra.due_at || null, start_at: null,
    is_complete: false, cover: extra.cover || {}, is_archived: false,
    created_by: state.me.id, number: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  state.cards.set(row.id, row);
  bus.emit('board');

  const guardada = await push(async () => {
    const r = await api.insert('cards', row);
    await log('card_create', { title: row.title, list: state.lists.get(listId)?.title }, row.id);
    return r;
  });
  if (guardada) { state.cards.set(row.id, { ...row, ...guardada }); bus.emit('board'); }
  return state.cards.get(row.id);
}

export async function actualizarTarjeta(id, patch, { logType, logData } = {}) {
  const c = state.cards.get(id); if (!c) return;
  state.cards.set(id, { ...c, ...patch, updated_at: new Date().toISOString() });
  bus.emit('board'); bus.emit('card', id);
  await push(async () => {
    await api.update('cards', { id }, patch);
    if (logType) await log(logType, logData || {}, id);
  });
}

export async function moverTarjeta(id, listId, position) {
  const c = state.cards.get(id); if (!c) return;
  const cambioLista = c.list_id !== listId;
  const de = state.lists.get(c.list_id)?.title;
  state.cards.set(id, { ...c, list_id: listId, position });
  bus.emit('board'); bus.emit('card', id);
  await push(async () => {
    await api.update('cards', { id }, { list_id: listId, position });
    if (cambioLista) {
      await log('card_move', { de, a: state.lists.get(listId)?.title }, id);
    }
  });
  await renumerarTarjetasSiHaceFalta(listId);
}

async function renumerarTarjetasSiHaceFalta(listId) {
  const cs = tarjetasDe(listId, { conFiltro: false });
  if (!needsRenumber(cs)) return;
  for (const [i, c] of cs.entries()) {
    const p = (i + 1) * 1000;
    state.cards.set(c.id, { ...c, position: p });
    await api.update('cards', { id: c.id }, { position: p }).catch(() => {});
  }
  bus.emit('board');
}

export async function archivarTarjeta(id, on = true) {
  const c = state.cards.get(id);
  await actualizarTarjeta(id, { is_archived: on },
    { logType: on ? 'card_archive' : 'card_restore', logData: { title: c?.title } });
}

export async function borrarTarjeta(id) {
  const c = state.cards.get(id);
  state.cards.delete(id);
  [...state.cardLabels].filter((k) => k.startsWith(id + '|')).forEach((k) => state.cardLabels.delete(k));
  [...state.cardMembers].filter((k) => k.startsWith(id + '|')).forEach((k) => state.cardMembers.delete(k));
  checklistsDe(id).forEach((k) => {
    itemsDe(k.id).forEach((i) => state.items.delete(i.id));
    state.checklists.delete(k.id);
  });
  comentariosDe(id).forEach((x) => state.comments.delete(x.id));
  adjuntosDe(id).forEach((x) => state.attachments.delete(x.id));
  bus.emit('board');
  await push(async () => {
    await api.removeWhere('cards', { id });
    await log('card_delete', { title: c?.title || '' });
  });
}

/** Copia una tarjeta con sus etiquetas, miembros y checklists. */
export async function copiarTarjeta(id, { title, listId, copiarChecks = true, copiarEtiquetas = true, copiarMiembros = true } = {}) {
  const c = state.cards.get(id); if (!c) return null;
  const destino = listId || c.list_id;
  const nueva = await agregarTarjeta(destino, title || c.title, {
    description: c.description, cover: c.cover, due_at: c.due_at,
  });
  if (!nueva) return null;

  if (copiarEtiquetas) {
    for (const l of etiquetasDe(id)) await toggleEtiqueta(nueva.id, l.id, true);
  }
  if (copiarMiembros) {
    for (const m of miembrosDe(id)) await toggleMiembroTarjeta(nueva.id, m.user_id, true);
  }
  if (copiarChecks) {
    for (const k of checklistsDe(id)) {
      const nk = await agregarChecklist(nueva.id, k.title);
      for (const it of itemsDe(k.id)) {
        await agregarItem(nk.id, it.text, { is_done: it.is_done });
      }
    }
  }
  return nueva;
}

export async function toggleEtiqueta(cardId, labelId, forzar) {
  const k = cardId + '|' + labelId;
  const on = forzar !== undefined ? forzar : !state.cardLabels.has(k);
  if (on) state.cardLabels.add(k); else state.cardLabels.delete(k);
  bus.emit('board'); bus.emit('card', cardId);
  await push(async () => {
    if (on) await api.insert('card_labels', { card_id: cardId, label_id: labelId, board_id: state.boardId });
    else await api.removeWhere('card_labels', { card_id: cardId, label_id: labelId });
  });
}

export async function toggleMiembroTarjeta(cardId, userId, forzar) {
  const k = cardId + '|' + userId;
  const on = forzar !== undefined ? forzar : !state.cardMembers.has(k);
  if (on && !esMiembroDelTablero(userId)) await agregarMiembro(userId);
  if (on) state.cardMembers.add(k); else state.cardMembers.delete(k);
  bus.emit('board'); bus.emit('card', cardId);
  await push(async () => {
    if (on) {
      await api.insert('card_members', { card_id: cardId, user_id: userId, board_id: state.boardId });
      await log('card_assign', { nombre: nombreDe(userId) }, cardId);
    } else {
      await api.removeWhere('card_members', { card_id: cardId, user_id: userId });
      await log('card_unassign', { nombre: nombreDe(userId) }, cardId);
    }
  });
}

export async function toggleSeguir(cardId) {
  const k = cardId + '|' + state.me.id;
  const on = !state.watchers.has(k);
  if (on) state.watchers.add(k); else state.watchers.delete(k);
  bus.emit('card', cardId);
  await push(async () => {
    if (on) await api.insert('card_watchers', { card_id: cardId, user_id: state.me.id, board_id: state.boardId });
    else await api.removeWhere('card_watchers', { card_id: cardId, user_id: state.me.id });
  });
}

export async function fijarFechas(cardId, { start, due }) {
  await actualizarTarjeta(cardId, { start_at: start, due_at: due },
    { logType: due ? 'card_due' : 'card_due_clear', logData: { due } });
}

/** Marca o desmarca la tarjeta como completada (con o sin vencimiento). */
export async function toggleCompletada(cardId) {
  const c = state.cards.get(cardId); if (!c) return;
  await actualizarTarjeta(cardId, { is_complete: !c.is_complete },
    { logType: c.is_complete ? 'card_reabrir' : 'card_completar',
      logData: { title: c.title } });
}

export const setCover = (cardId, cover) => actualizarTarjeta(cardId, { cover: cover || {} });

/* ============================== ETIQUETAS ============================== */

export async function crearEtiqueta({ name = '', color = 'verde' }) {
  const row = {
    id: uuid(), board_id: state.boardId, name, color,
    position: between([...state.labels.values()].sort(porPos).at(-1)?.position ?? null, null),
  };
  state.labels.set(row.id, row);
  bus.emit('board');
  await push(() => api.insert('labels', row));
  return row;
}

export async function actualizarEtiqueta(id, patch) {
  const l = state.labels.get(id); if (!l) return;
  state.labels.set(id, { ...l, ...patch });
  bus.emit('board');
  await push(() => api.update('labels', { id }, patch));
}

export async function borrarEtiqueta(id) {
  state.labels.delete(id);
  [...state.cardLabels].filter((k) => k.endsWith('|' + id))
    .forEach((k) => state.cardLabels.delete(k));
  bus.emit('board');
  await push(() => api.removeWhere('labels', { id }));
}

/* ============================== CHECKLISTS ============================= */

export async function agregarChecklist(cardId, title = 'Checklist') {
  const row = {
    id: uuid(), card_id: cardId, board_id: state.boardId, title,
    position: between(checklistsDe(cardId).at(-1)?.position ?? null, null),
    created_at: new Date().toISOString(),
  };
  state.checklists.set(row.id, row);
  bus.emit('card', cardId); bus.emit('board');
  await push(() => api.insert('checklists', row));
  return row;
}

export async function actualizarChecklist(id, patch) {
  const k = state.checklists.get(id); if (!k) return;
  state.checklists.set(id, { ...k, ...patch });
  bus.emit('card', k.card_id);
  await push(() => api.update('checklists', { id }, patch));
}

export async function borrarChecklist(id) {
  const k = state.checklists.get(id); if (!k) return;
  itemsDe(id).forEach((i) => state.items.delete(i.id));
  state.checklists.delete(id);
  bus.emit('card', k.card_id); bus.emit('board');
  await push(() => api.removeWhere('checklists', { id }));
}

export async function agregarItem(checklistId, text, extra = {}) {
  const k = state.checklists.get(checklistId); if (!k) return null;
  const row = {
    id: uuid(), checklist_id: checklistId, board_id: state.boardId,
    text: text.trim(), is_done: Boolean(extra.is_done),
    position: between(itemsDe(checklistId).at(-1)?.position ?? null, null),
    due_at: null, assignee_id: null,
  };
  state.items.set(row.id, row);
  bus.emit('card', k.card_id); bus.emit('board');
  await push(() => api.insert('checklist_items', row));
  return row;
}

export async function actualizarItem(id, patch) {
  const i = state.items.get(id); if (!i) return;
  state.items.set(id, { ...i, ...patch });
  const cardId = state.checklists.get(i.checklist_id)?.card_id;
  bus.emit('card', cardId); bus.emit('board');
  await push(() => api.update('checklist_items', { id }, patch));
}

export async function borrarItem(id) {
  const i = state.items.get(id); if (!i) return;
  const cardId = state.checklists.get(i.checklist_id)?.card_id;
  state.items.delete(id);
  bus.emit('card', cardId); bus.emit('board');
  await push(() => api.removeWhere('checklist_items', { id }));
}

/* ============================== COMENTARIOS ============================ */

export async function comentar(cardId, body) {
  const row = {
    id: uuid(), card_id: cardId, board_id: state.boardId,
    user_id: state.me.id, body: body.trim(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  state.comments.set(row.id, row);
  bus.emit('card', cardId); bus.emit('board');
  await push(async () => {
    await api.insert('comments', row);
    if (!sigo(cardId)) await toggleSeguir(cardId);
  });
  return row;
}

export async function editarComentario(id, body) {
  const c = state.comments.get(id); if (!c) return;
  state.comments.set(id, { ...c, body, updated_at: new Date().toISOString() });
  bus.emit('card', c.card_id);
  await push(() => api.update('comments', { id }, { body }));
}

export async function borrarComentario(id) {
  const c = state.comments.get(id); if (!c) return;
  state.comments.delete(id);
  bus.emit('card', c.card_id); bus.emit('board');
  await push(() => api.removeWhere('comments', { id }));
}

/* =============================== ADJUNTOS ============================== */

export async function adjuntarLink(cardId, url, name) {
  const row = {
    id: uuid(), card_id: cardId, board_id: state.boardId, kind: 'link',
    name: name || url, url, storage_path: null, mime: null, size_bytes: null,
    created_by: state.me.id, created_at: new Date().toISOString(),
  };
  state.attachments.set(row.id, row);
  bus.emit('card', cardId); bus.emit('board');
  await push(async () => {
    await api.insert('attachments', row);
    await log('att_add', { name: row.name }, cardId);
  });
  return row;
}

export async function adjuntarArchivo(cardId, file) {
  const info = await api.uploadAttachment(file, state.boardId, cardId);
  const row = {
    id: uuid(), card_id: cardId, board_id: state.boardId, kind: 'file',
    name: info.name || file.name, url: info.url, storage_path: info.storage_path,
    mime: info.mime || file.type, size_bytes: info.size_bytes ?? file.size,
    created_by: state.me.id, created_at: new Date().toISOString(),
  };
  state.attachments.set(row.id, row);
  bus.emit('card', cardId); bus.emit('board');
  await push(async () => {
    await api.insert('attachments', row);
    await log('att_add', { name: row.name }, cardId);
  });
  return row;
}

export async function borrarAdjunto(id) {
  const a = state.attachments.get(id); if (!a) return;
  state.attachments.delete(id);
  bus.emit('card', a.card_id); bus.emit('board');
  await push(async () => {
    await api.removeWhere('attachments', { id });
    if (a.storage_path) await api.deleteStoragePath(a.storage_path).catch(() => {});
  });
}

/* ============================== NOVEDADES ============================== */

const LEIDO = 'eq_boards_leido';

/** Actividad de otros en tarjetas que me involucran. */
export function novedades() {
  if (!state.me) return [];
  return state.activity.filter((a) =>
    a.user_id && a.user_id !== state.me.id && a.card_id &&
    (state.cardMembers.has(a.card_id + '|' + state.me.id) ||
     state.watchers.has(a.card_id + '|' + state.me.id)));
}

export function novedadesSinLeer() {
  const t = Number(localStorage.getItem(LEIDO) || 0);
  return novedades().filter((a) => new Date(a.created_at).getTime() > t);
}

export const marcarNovedadesLeidas = () =>
  localStorage.setItem(LEIDO, String(Date.now()));

/* ========================== ORDEN / DUE HELPERS ======================== */

export { dueState };
