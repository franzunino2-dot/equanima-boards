/* ==========================================================================
   board.js — vista kanban: encabezado, listas, tarjetas, menús y filtros
   ========================================================================== */

import {
  html, raw, esc, on, $, autogrow, focusEnd, avatarHTML, labelStyle,
  LABEL_COLORS, BOARD_BGS, fechaCorta, haceRato, mdPlain, dueLabel,
  dueState, copiar, between, CFG,
} from '../util.js';
import {
  state, bus, abrirTablero, listasVisibles, tarjetasDe, etiquetasDe, miembrosDe,
  progresoCheck, comentariosDe, adjuntosDe, filtroActivo, nuevoFiltro,
  agregarLista, actualizarLista, moverLista, borrarLista, duplicarLista,
  ordenarLista, archivarTodasLasTarjetas, moverTodasLasTarjetas,
  agregarTarjeta, moverTarjeta, actualizarTarjeta, actualizarTablero, borrarTablero,
  toggleDestacado, agregarMiembro, quitarMiembro, cambiarRol,
  crearEtiqueta, actualizarEtiqueta, borrarEtiqueta,
  listasArchivadas, tarjetasArchivadas, archivarTarjeta, borrarTarjeta,
  nombreDe, esMiembroDelTablero, actividadDe,
} from '../store.js';
import { api } from '../api.js';
import { initDnD, arrastrando } from '../dnd.js';
import { ico } from './icons.js';
import { popover, popoverPush, closePopover, modal, toast, confirmar, pedirTexto } from './kit.js';
import { renderTabla, renderCalendario, renderResumen } from './views.js';
import { textoActividad } from './activity.js';

let host = null;
let offBus = null;
let offPresencia = null;
let enLinea = [];        // quién está mirando el tablero ahora
let pausas = 0;          // >0 = hay un editor inline abierto, no re-renderizar
let pendiente = false;
let composer = null;     // { listId, top }
let nuevaLista = false;

/* ============================== montaje ================================ */

export async function renderBoard(hostEl, boardId) {
  host = hostEl;
  pausas = 0; composer = null; nuevaLista = false; canvas = null;

  host.innerHTML = `<div class="empty-state" style="padding-top:80px">${ico('board')}<p>Cargando tablero…</p></div>`;

  try {
    await abrirTablero(boardId);
  } catch (e) {
    host.innerHTML = html`
      <div class="empty-state" style="padding-top:80px">
        ${raw(ico('info'))}
        <p>${e.message || 'No se pudo abrir el tablero'}</p>
        <a class="btn" href="#/">Volver a mis tableros</a>
      </div>`;
    return () => {};
  }

  host.innerHTML = html`
    <div class="board">
      <div class="board-bg"></div>
      <div id="bh-wrap"></div>
      <div id="board-body"></div>
    </div>`;

  pintarTodo();
  offBus = bus.on('board', () => {
    if (pausas > 0 || arrastrando()) { pendiente = true; return; }
    pintarTodo();
  });

  // Presencia: avatares de quién tiene el tablero abierto en este momento
  enLinea = [];
  offPresencia = api.presencia?.(boardId, state.me, (gente) => {
    enLinea = gente;
    if (host && state.board) pintarHeader();
  }) || null;

  return () => {
    offBus?.(); offBus = null;
    offPresencia?.(); offPresencia = null;
    enLinea = [];
    host = null;
  };
}

/** Suspende los re-renders mientras hay un input abierto. */
function pausar() { pausas++; }
function reanudar({ pintar = true } = {}) {
  pausas = Math.max(0, pausas - 1);
  if (pausas === 0 && (pendiente || pintar)) { pendiente = false; pintarTodo(); }
}

function pintarTodo() {
  if (!host || !state.board) return;
  const bgHost = host.querySelector('.board-bg');
  if (bgHost) {
    const bg = BOARD_BGS.includes(state.board.background) ? state.board.background : 'azul';
    bgHost.className = 'board-bg bg-' + bg;
  }
  pintarHeader();
  pintarBody();
}

/* ============================ encabezado =============================== */

function pintarHeader() {
  const wrap = host.querySelector('#bh-wrap');
  const b = state.board;
  const dest = state.boards.find((x) => x.id === b.id)?.starred;
  const nf = contarFiltros();

  wrap.innerHTML = html`
    <div class="bh">
      <div class="bh-title" data-act="rename-board" title="Cambiar el nombre">${b.title}</div>
      <button class="bh-icon ${dest ? 'starred' : ''}" data-act="star"
              title="${dest ? 'Quitar de destacados' : 'Destacar'}">${raw(ico(dest ? 'star' : 'starOff'))}</button>
      <button class="bh-btn" data-act="visibility" title="Visibilidad">
        ${raw(ico(b.visibility === 'private' ? 'user' : 'people'))}
        <span>${b.visibility === 'private' ? 'Privado'
                : CFG.ACCESS_MODE === 'publico' ? 'Abierto' : 'Equanima'}</span>
      </button>

      <div class="bh-sep"></div>

      <div class="bh-views">
        ${raw([
          ['board', 'board', 'Tablero'],
          ['tabla', 'table', 'Tabla'],
          ['calendario', 'calendar', 'Calendario'],
          ['resumen', 'dash', 'Resumen'],
        ].map(([v, i, t]) => `
          <button data-view="${v}" class="${state.view === v ? 'on' : ''}">
            ${ico(i)}<span>${t}</span>
          </button>`).join(''))}
      </div>

      <div class="bh-sep"></div>

      <button class="bh-btn ${nf ? 'on' : ''}" data-act="filter">
        ${raw(ico('filter'))}<span>Filtros${nf ? ` · ${nf}` : ''}</span>
      </button>

      <span class="spacer" style="flex:1"></span>

      ${enLinea.length ? raw(`
        <div class="bh-online" title="${esc(enLinea.map((p) => p.full_name || 'Invitado').join(', '))}">
          <span class="dot"></span>
          <span class="avatar-stack">
            ${enLinea.slice(0, 5).map((p) => avatarHTML(p, 'avatar-sm')).join('')}
            ${enLinea.length > 5 ? `<span class="avatar avatar-sm">+${enLinea.length - 5}</span>` : ''}
          </span>
        </div>
        <div class="bh-sep"></div>`) : ''}

      <div class="avatar-stack" data-act="share" style="cursor:pointer" title="Miembros del tablero">
        ${raw(state.members.slice(0, 6).map((m) => avatarHTML(m)).join(''))}
        ${state.members.length > 6 ? raw(`<span class="avatar">+${state.members.length - 6}</span>`) : ''}
      </div>
      <button class="bh-btn" data-act="share">${raw(ico('users'))}<span>Compartir</span></button>
      <button class="bh-icon" data-act="menu" title="Menú del tablero">${raw(ico('dots'))}</button>
    </div>
    ${nf ? raw(barraFiltros()) : ''}`;

  on(wrap, 'click', '[data-view]', (_, b2) => {
    state.view = b2.dataset.view;
    pintarTodo();
  });
  on(wrap, 'click', '[data-act]', (ev, b2) => accionHeader(ev, b2));
}

function contarFiltros() {
  const f = state.filters;
  return (f.text ? 1 : 0) + f.labels.size + f.members.size + (f.due ? 1 : 0) +
         (f.sinMiembro ? 1 : 0) + (f.sinEtiqueta ? 1 : 0);
}

function barraFiltros() {
  const f = state.filters;
  const chips = [];
  if (f.text) chips.push(chip(`texto: "${esc(f.text)}"`, 'text'));
  f.labels.forEach((id) => {
    const l = state.labels.get(id);
    if (l) chips.push(chip('etiqueta: ' + esc(l.name || l.color), 'label:' + id));
  });
  f.members.forEach((id) => chips.push(chip('miembro: ' + esc(nombreDe(id)), 'member:' + id)));
  if (f.due) chips.push(chip('vence: ' + esc(f.due), 'due'));
  if (f.sinMiembro) chips.push(chip('sin miembro', 'sinMiembro'));
  if (f.sinEtiqueta) chips.push(chip('sin etiqueta', 'sinEtiqueta'));

  const total = listasVisibles().reduce((n, l) => n + tarjetasDe(l.id).length, 0);
  return `<div class="filter-bar">
      <b>${total} tarjeta${total === 1 ? '' : 's'}</b>
      ${chips.join('')}
      <button class="bh-btn" data-act="clear-filters" style="height:24px;font-size:12px">Limpiar</button>
    </div>`;

  function chip(txt, key) {
    return `<span class="fchip">${txt}
      <button data-act="drop-filter" data-k="${key}" aria-label="Quitar filtro">${ico('close')}</button></span>`;
  }
}

async function accionHeader(ev, btn) {
  const act = btn.dataset.act;

  if (act === 'star') return toggleDestacado(state.board.id);

  if (act === 'rename-board') {
    pausar();
    const div = btn;
    const inp = document.createElement('input');
    inp.className = 'bh-title-input';
    inp.value = state.board.title;
    div.replaceWith(inp);
    focusEnd(inp);
    const fin = async (guardar) => {
      const v = inp.value.trim();
      if (guardar && v && v !== state.board.title) await actualizarTablero({ title: v });
      reanudar();
    };
    inp.addEventListener('blur', () => fin(true));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = state.board.title; inp.blur(); }
    });
    return;
  }

  if (act === 'visibility') return menuVisibilidad(btn);
  if (act === 'filter') return menuFiltros(btn);
  if (act === 'share') return menuMiembros(btn);
  if (act === 'menu') return panelLateral();

  if (act === 'clear-filters') { state.filters = nuevoFiltro(); return pintarTodo(); }

  if (act === 'drop-filter') {
    const k = btn.dataset.k;
    const f = state.filters;
    if (k === 'text') f.text = '';
    else if (k === 'due') f.due = null;
    else if (k === 'sinMiembro') f.sinMiembro = false;
    else if (k === 'sinEtiqueta') f.sinEtiqueta = false;
    else if (k.startsWith('label:')) f.labels.delete(k.slice(6));
    else if (k.startsWith('member:')) f.members.delete(k.slice(7));
    return pintarTodo();
  }
}

/* =============================== cuerpo ================================ */

let canvas = null;   // se reutiliza entre renders para no re-suscribir el DnD

function pintarBody() {
  const body = host.querySelector('#board-body');

  if (state.view !== 'board') {
    canvas = null;
    if (state.view === 'tabla') renderTabla(body);
    else if (state.view === 'calendario') renderCalendario(body);
    else renderResumen(body);
    return;
  }

  // El canvas se crea una sola vez por tablero: así el DnD y la delegación
  // de clicks se enganchan una vez y el scroll horizontal no se pierde.
  if (!canvas || !body.contains(canvas)) {
    body.innerHTML = '<div class="canvas"></div>';
    canvas = body.querySelector('.canvas');

    initDnD(canvas, {
      onCardDrop: (id, listId, position) => moverTarjeta(id, listId, position),
      onListDrop: (id, position) => moverLista(id, position),
    });
    on(canvas, 'click', '[data-act]', accionCanvas);
    on(canvas, 'click', '.card', (ev, c) => {
      if (ev.target.closest('[data-act], .card-inline-edit, input, textarea, button')) return;
      location.hash = `#/b/${state.boardId}/c/${c.dataset.card}`;
    });
  }

  // Preservar scroll vertical de cada lista
  const scrolls = new Map();
  canvas.querySelectorAll('.list-cards').forEach((c) => {
    scrolls.set(c.closest('.list').dataset.list, c.scrollTop);
  });

  canvas.innerHTML = listasVisibles().map(pintarLista).join('') + pintarAddList();

  scrolls.forEach((v, k) => {
    const c = canvas.querySelector(`.list[data-list="${k}"] .list-cards`);
    if (c) c.scrollTop = v;
  });

  // Reabrir composer si estaba abierto
  if (composer) abrirComposerTarjeta(composer.listId, composer.top, true);
  if (nuevaLista) abrirComposerLista(true);
}

function pintarLista(l) {
  const cards = tarjetasDe(l.id);
  const todas = tarjetasDe(l.id, { conFiltro: false });
  const colapsada = state.collapsed.has(l.id);
  const over = l.wip_limit && todas.length > l.wip_limit;

  if (colapsada) {
    return html`
      <div class="list collapsed" data-list="${l.id}" data-pos="${l.position}">
        <div class="list-head">
          <button class="list-title" data-act="expand" data-list="${l.id}">${l.title} (${todas.length})</button>
        </div>
      </div>`;
  }

  return html`
    <div class="list" data-list="${l.id}" data-pos="${l.position}">
      <div class="list-head">
        <div class="list-title" data-act="rename-list" data-list="${l.id}">${l.title}</div>
        <span class="list-count ${over ? 'over' : ''}"
              title="${l.wip_limit ? 'Límite: ' + l.wip_limit : ''}">
          ${filtroActivo() && cards.length !== todas.length
            ? raw(`${cards.length}/${todas.length}`)
            : todas.length}${l.wip_limit ? raw('/' + l.wip_limit) : ''}
        </span>
        <button class="icon-btn" data-act="list-menu" data-list="${l.id}"
                aria-label="Acciones de la lista">${raw(ico('dots'))}</button>
      </div>

      <div class="list-cards" data-list="${l.id}">
        ${raw(cards.map(pintarTarjeta).join(''))}
      </div>

      <div class="list-foot">
        <button class="list-add" data-act="add-card" data-list="${l.id}">
          ${raw(ico('plus'))}<span>Añadir una tarjeta</span>
        </button>
      </div>
    </div>`;
}

function pintarTarjeta(c) {
  const labels = etiquetasDe(c.id);
  const miembros = miembrosDe(c.id);
  const chk = progresoCheck(c.id);
  const nCom = comentariosDe(c.id).length;
  const nAtt = adjuntosDe(c.id).length;
  const ds = dueState(c);
  const cover = c.cover && c.cover.value ? c.cover : null;

  const badges = [];
  if (c.due_at) {
    badges.push(`<span class="bdg bdg-due ${ds || ''}" title="Vence ${esc(fechaCorta(c.due_at))}">
      ${ico('clock')} ${esc(dueLabel(c))}</span>`);
  }
  if (c.description) badges.push(`<span class="bdg" title="Tiene descripción">${ico('desc')}</span>`);
  if (nCom) badges.push(`<span class="bdg" title="${nCom} comentarios">${ico('comment')} ${nCom}</span>`);
  if (nAtt) badges.push(`<span class="bdg" title="${nAtt} adjuntos">${ico('attach')} ${nAtt}</span>`);
  if (chk.total) {
    badges.push(`<span class="bdg bdg-check ${chk.hechos === chk.total ? 'full' : ''}"
      title="Checklist">${ico('checklist')} ${chk.hechos}/${chk.total}</span>`);
  }

  return html`
    <div class="card ${c.due_complete ? 'done-cover' : ''}" data-card="${c.id}" data-pos="${c.position}">
      ${cover ? raw(`<div class="card-cover ${cover.size === 'tall' ? 'tall' : ''}" style="${
        cover.type === 'image' ? `background-image:url('${esc(cover.value)}')` : `background:var(--l-${esc(cover.value)})`
      }"></div>`) : ''}

      <button class="card-edit-btn" data-act="quick-edit" data-card="${c.id}"
              aria-label="Editar rápido">${raw(ico('pencil'))}</button>

      ${labels.length ? raw(`<div class="card-labels">${labels.map((l) => `
        <span class="label-chip" style="${labelStyle(l.color)}" title="${esc(l.name || l.color)}">${esc(l.name || '')}</span>`).join('')}</div>`) : ''}

      <div class="card-title"><span class="card-num">#${c.number}</span>${c.title}</div>

      ${badges.length || miembros.length ? raw(`
        <div class="card-badges">
          ${badges.join('')}
          ${miembros.length ? `<span class="avatar-stack">${miembros.map((m) => avatarHTML(m, 'avatar-sm')).join('')}</span>` : ''}
        </div>`) : ''}
    </div>`;
}

function pintarAddList() {
  return `<div class="add-list" data-addlist>
      <button data-act="add-list">${ico('plus')}<span>Añadir otra lista</span></button>
    </div>`;
}

/* =========================== acciones canvas =========================== */

async function accionCanvas(ev, btn) {
  ev.stopPropagation();
  const act = btn.dataset.act;
  const listId = btn.dataset.list;

  if (act === 'add-card') return abrirComposerTarjeta(listId, false);
  if (act === 'add-list') return abrirComposerLista();
  if (act === 'list-menu') return menuLista(btn, listId);
  if (act === 'quick-edit') return edicionRapida(btn.closest('.card'), btn.dataset.card);
  if (act === 'expand') { state.collapsed.delete(listId); return pintarTodo(); }

  if (act === 'rename-list') {
    pausar();
    const div = btn;
    const l = state.lists.get(listId);
    const inp = document.createElement('input');
    inp.className = 'list-title-input';
    inp.value = l.title;
    div.replaceWith(inp);
    inp.select();
    const fin = async (guardar) => {
      const v = inp.value.trim();
      if (guardar && v && v !== l.title) await actualizarLista(listId, { title: v });
      reanudar();
    };
    inp.addEventListener('blur', () => fin(true));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = l.title; inp.blur(); }
    });
  }
}

/* ---------------------------- composer tarjeta -------------------------- */

function abrirComposerTarjeta(listId, top = false, restaurando = false) {
  const list = host.querySelector(`.list[data-list="${listId}"]`);
  if (!list) return;
  composer = { listId, top };
  pausar();
  void restaurando;

  const foot = list.querySelector('.list-foot');
  const cardsBox = list.querySelector('.list-cards');
  foot.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'composer';
  box.dataset.nodrag = '1';
  box.innerHTML = html`
    <textarea placeholder="Escribí un título… (Enter para agregar)" rows="2"></textarea>
    <div class="composer-actions">
      <button class="btn btn-primary btn-sm" data-c="add">Añadir tarjeta</button>
      <button class="icon-btn" data-c="cancel" aria-label="Cerrar">${raw(ico('close'))}</button>
    </div>`;

  if (top) cardsBox.prepend(box); else foot.appendChild(box);

  const ta = box.querySelector('textarea');
  autogrow(ta);
  ta.focus();
  if (!top) cardsBox.scrollTop = cardsBox.scrollHeight;

  const agregar = async () => {
    const txt = ta.value.trim();
    if (!txt) return;
    const lineas = txt.split('\n').map((s) => s.trim()).filter(Boolean);
    ta.value = '';
    ta.style.height = 'auto';
    for (const t of lineas) await agregarTarjeta(listId, t, { top });
    if (lineas.length > 1) toast(`${lineas.length} tarjetas creadas`, 'ok');
    // Vuelve a pintar y reabre el composer
    pendiente = true;
    reanudar({ pintar: true });
  };

  const cerrar = () => {
    composer = null;
    reanudar();
  };

  on(box, 'click', '[data-c]', (e, b) => {
    e.preventDefault();
    if (b.dataset.c === 'add') agregar(); else cerrar();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregar(); }
    if (e.key === 'Escape') cerrar();
  });
}

function abrirComposerLista(restaurando = false) {
  const wrap = host.querySelector('[data-addlist]');
  if (!wrap) return;
  nuevaLista = true;
  pausar();
  void restaurando;

  wrap.classList.add('editing');
  wrap.innerHTML = html`
    <input placeholder="Nombre de la lista" maxlength="120">
    <div class="composer-actions">
      <button class="btn btn-primary btn-sm" data-c="add">Añadir lista</button>
      <button class="icon-btn" data-c="cancel" aria-label="Cerrar">${raw(ico('close'))}</button>
    </div>`;

  const inp = wrap.querySelector('input');
  inp.focus();

  const agregar = async () => {
    const v = inp.value.trim();
    if (!v) return;
    inp.value = '';
    await agregarLista(v);
    pendiente = true;
    reanudar({ pintar: true });
  };
  const cerrar = () => { nuevaLista = false; reanudar(); };

  on(wrap, 'click', '[data-c]', (e, b) => {
    e.preventDefault();
    if (b.dataset.c === 'add') agregar(); else cerrar();
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregar(); }
    if (e.key === 'Escape') cerrar();
  });
}

/* --------------------------- edición rápida ---------------------------- */

function edicionRapida(cardEl, cardId) {
  const c = state.cards.get(cardId);
  if (!c) return;
  pausar();

  const titleEl = cardEl.querySelector('.card-title');
  const box = document.createElement('div');
  box.className = 'card-inline-edit';
  box.dataset.nodrag = '1';
  box.innerHTML = `<textarea rows="2">${esc(c.title)}</textarea>`;
  titleEl.replaceWith(box);
  cardEl.querySelector('.card-edit-btn')?.remove();

  const ta = box.querySelector('textarea');
  autogrow(ta); ta.focus(); ta.select();

  const acciones = document.createElement('div');
  acciones.className = 'composer-actions';
  acciones.dataset.nodrag = '1';
  acciones.innerHTML = `
    <button class="btn btn-primary btn-sm" data-q="save">Guardar</button>
    <button class="btn btn-sm" data-q="labels">${ico('tag')} Etiquetas</button>
    <button class="btn btn-sm" data-q="archive">${ico('archive')}</button>`;
  box.appendChild(acciones);

  const guardar = async () => {
    const v = ta.value.trim();
    if (v && v !== c.title) await actualizarTarjeta(cardId, { title: v });
    reanudar();
  };

  on(acciones, 'click', '[data-q]', async (e, b) => {
    e.preventDefault(); e.stopPropagation();
    const q = b.dataset.q;
    if (q === 'save') return guardar();
    if (q === 'archive') { await archivarTarjeta(cardId, true); return reanudar(); }
    if (q === 'labels') {
      const { menuEtiquetasDeTarjeta } = await import('./card.js');
      menuEtiquetasDeTarjeta(b, cardId);
    }
  });

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar(); }
    if (e.key === 'Escape') reanudar();
  });
  ta.addEventListener('blur', () => setTimeout(() => {
    if (!box.contains(document.activeElement)) guardar();
  }, 120));
}

/* ============================ menú de lista ============================ */

function menuLista(anchor, listId) {
  const l = state.lists.get(listId);
  popover({
    anchor, title: 'Acciones de la lista', tight: true,
    render(body, ctl) {
      body.innerHTML = html`
        <button class="menu-item" data-m="add">${raw(ico('plus'))} Añadir tarjeta</button>
        <button class="menu-item" data-m="add-top">${raw(ico('plus'))} Añadir tarjeta arriba</button>
        <button class="menu-item" data-m="copy">${raw(ico('copy'))} Copiar lista</button>
        <button class="menu-item" data-m="collapse">${raw(ico('collapse'))} Colapsar lista</button>
        <div class="menu-sep"></div>
        <button class="menu-item" data-m="left">${raw(ico('arrowL'))} Mover a la izquierda</button>
        <button class="menu-item" data-m="right">${raw(ico('arrowR'))} Mover a la derecha</button>
        <button class="menu-item" data-m="sort">${raw(ico('sort'))} Ordenar tarjetas…</button>
        <button class="menu-item" data-m="wip">${raw(ico('target'))} Límite de tarjetas
          <span class="sub">${l.wip_limit ? 'Actual: ' + l.wip_limit : 'Sin límite'}</span></button>
        <div class="menu-sep"></div>
        <button class="menu-item" data-m="move-all">${raw(ico('move'))} Mover todas las tarjetas…</button>
        <button class="menu-item" data-m="arch-all">${raw(ico('archive'))} Archivar todas las tarjetas</button>
        <button class="menu-item" data-m="archive">${raw(ico('archive'))} Archivar esta lista</button>
        <button class="menu-item danger" data-m="delete">${raw(ico('trash'))} Eliminar lista</button>`;

      on(body, 'click', '[data-m]', async (ev, b) => {
        const m = b.dataset.m;
        const ls = listasVisibles();
        const i = ls.findIndex((x) => x.id === listId);

        if (m === 'add') { ctl.close(); return abrirComposerTarjeta(listId, false); }
        if (m === 'add-top') { ctl.close(); return abrirComposerTarjeta(listId, true); }
        if (m === 'collapse') { ctl.close(); state.collapsed.add(listId); return pintarTodo(); }
        if (m === 'copy') { ctl.close(); return duplicarLista(listId); }

        if (m === 'left' && i > 0) {
          ctl.close();
          return moverLista(listId, between(ls[i - 2]?.position ?? null, ls[i - 1].position));
        }
        if (m === 'right' && i < ls.length - 1) {
          ctl.close();
          return moverLista(listId, between(ls[i + 1].position, ls[i + 2]?.position ?? null));
        }

        if (m === 'sort') {
          return popoverPush({
            anchor, title: 'Ordenar tarjetas', tight: true,
            render(b2, c2) {
              b2.innerHTML = `
                <button class="menu-item" data-s="creacion">Fecha de creación (más nuevas primero)</button>
                <button class="menu-item" data-s="creacion-asc">Fecha de creación (más viejas primero)</button>
                <button class="menu-item" data-s="vencimiento">Fecha de vencimiento</button>
                <button class="menu-item" data-s="nombre">Nombre alfabético</button>`;
              on(b2, 'click', '[data-s]', (e3, b3) => {
                ordenarLista(listId, b3.dataset.s);
                c2.close(); closePopover();
              });
            },
          });
        }

        if (m === 'wip') {
          ctl.close();
          const v = await pedirTexto({
            title: 'Límite de tarjetas',
            label: 'Cantidad máxima (vacío = sin límite)',
            value: l.wip_limit || '',
          });
          const n = v === null ? null : parseInt(v, 10);
          return actualizarLista(listId, { wip_limit: Number.isFinite(n) && n > 0 ? n : null });
        }

        if (m === 'move-all') {
          return popoverPush({
            anchor, title: 'Mover todas a…', tight: true,
            render(b2, c2) {
              const otras = listasVisibles().filter((x) => x.id !== listId);
              b2.innerHTML = otras.length
                ? otras.map((x) => `<button class="menu-item" data-t="${x.id}">${esc(x.title)}</button>`).join('')
                : '<p class="muted small" style="padding:8px">No hay otra lista.</p>';
              on(b2, 'click', '[data-t]', (e3, b3) => {
                moverTodasLasTarjetas(listId, b3.dataset.t);
                c2.close(); closePopover();
              });
            },
          });
        }

        if (m === 'arch-all') {
          ctl.close();
          const n = tarjetasDe(listId, { conFiltro: false }).length;
          if (!n) return;
          if (await confirmar({
            title: `¿Archivar ${n} tarjeta${n === 1 ? '' : 's'}?`,
            body: 'Se pueden restaurar desde el archivo del tablero.',
            ok: 'Archivar',
          })) return archivarTodasLasTarjetas(listId);
          return;
        }

        if (m === 'archive') { ctl.close(); return actualizarLista(listId, { is_archived: true }); }

        if (m === 'delete') {
          ctl.close();
          const n = tarjetasDe(listId, { conFiltro: false }).length;
          if (await confirmar({
            title: `¿Eliminar la lista "${l.title}"?`,
            body: n ? `Se borran también sus ${n} tarjetas. No se puede deshacer.`
                    : 'No se puede deshacer.',
            ok: 'Eliminar', danger: true,
          })) return borrarLista(listId);
        }
      });
    },
  });
}

/* ============================ menú de filtros ========================== */

function menuFiltros(anchor) {
  popover({
    anchor, title: 'Filtrar', wide: true,
    render(body, ctl) {
      const f = state.filters;
      body.innerHTML = html`
        <label class="field-label">Texto</label>
        <input class="input" data-f="text" value="${f.text}" placeholder="Título, descripción o #número">

        <label class="field-label">Miembros</label>
        <label class="checkbox" style="margin-bottom:6px">
          <input type="checkbox" data-f="sinMiembro" ${f.sinMiembro ? 'checked' : ''}> Sin miembro asignado
        </label>
        ${raw(state.members.map((m) => `
          <label class="checkbox" style="display:flex;margin-bottom:6px">
            <input type="checkbox" data-mem="${m.user_id}" ${f.members.has(m.user_id) ? 'checked' : ''}>
            ${avatarHTML(m, 'avatar-sm')}
            <span>${esc(m.full_name || m.email)}${m.user_id === state.me.id ? ' (yo)' : ''}</span>
          </label>`).join(''))}

        <label class="field-label">Etiquetas</label>
        <label class="checkbox" style="margin-bottom:6px">
          <input type="checkbox" data-f="sinEtiqueta" ${f.sinEtiqueta ? 'checked' : ''}> Sin etiqueta
        </label>
        ${raw([...state.labels.values()].map((l) => `
          <label class="checkbox" style="display:flex;margin-bottom:6px">
            <input type="checkbox" data-lbl="${l.id}" ${f.labels.has(l.id) ? 'checked' : ''}>
            <span class="label-chip" style="${labelStyle(l.color)};flex:1">${esc(l.name || '')}</span>
          </label>`).join(''))}

        <label class="field-label">Vencimiento</label>
        <select class="input" data-f="due">
          <option value="">Cualquiera</option>
          <option value="vence" ${f.due === 'vence' ? 'selected' : ''}>Vencidas</option>
          <option value="hoy" ${f.due === 'hoy' ? 'selected' : ''}>Vencen hoy</option>
          <option value="semana" ${f.due === 'semana' ? 'selected' : ''}>Vencen esta semana</option>
          <option value="mes" ${f.due === 'mes' ? 'selected' : ''}>Vencen este mes</option>
          <option value="sin" ${f.due === 'sin' ? 'selected' : ''}>Sin fecha</option>
        </select>

        <button class="btn btn-block" data-clear style="margin-top:14px">Limpiar filtros</button>`;

      const aplicar = () => { pintarTodo(); };

      body.querySelector('[data-f="text"]').addEventListener('input', (e) => {
        f.text = e.target.value.trim(); aplicar();
      });
      body.querySelector('[data-f="due"]').addEventListener('change', (e) => {
        f.due = e.target.value || null; aplicar();
      });
      ['sinMiembro', 'sinEtiqueta'].forEach((k) => {
        body.querySelector(`[data-f="${k}"]`).addEventListener('change', (e) => {
          f[k] = e.target.checked; aplicar();
        });
      });
      on(body, 'change', '[data-mem]', (_, i) => {
        i.checked ? f.members.add(i.dataset.mem) : f.members.delete(i.dataset.mem);
        aplicar();
      });
      on(body, 'change', '[data-lbl]', (_, i) => {
        i.checked ? f.labels.add(i.dataset.lbl) : f.labels.delete(i.dataset.lbl);
        aplicar();
      });
      body.querySelector('[data-clear]').addEventListener('click', () => {
        state.filters = nuevoFiltro(); ctl.close(); pintarTodo();
      });
    },
  });
}

/* =========================== menú de miembros ========================== */

function menuMiembros(anchor) {
  popover({
    anchor, title: 'Miembros del tablero', wide: true,
    render(body, ctl) {
      const fuera = state.profiles.filter((p) => !esMiembroDelTablero(p.id));
      body.innerHTML = html`
        ${raw(state.members.map((m) => `
          <div class="row" style="margin-bottom:10px">
            ${avatarHTML(m)}
            <span style="flex:1;min-width:0">
              <div class="strong" style="overflow:hidden;text-overflow:ellipsis">${esc(m.full_name || m.email)}</div>
              <div class="small muted">${esc(m.email || '')}</div>
            </span>
            <select class="input" data-rol="${m.user_id}" style="width:104px;padding:3px 6px">
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="miembro" ${m.role === 'miembro' ? 'selected' : ''}>Miembro</option>
              <option value="observador" ${m.role === 'observador' ? 'selected' : ''}>Observador</option>
            </select>
            <button class="icon-btn" data-out="${m.user_id}" title="Quitar del tablero">${ico('close')}</button>
          </div>`).join(''))}

        <div class="menu-sep"></div>
        <label class="field-label">Agregar del equipo</label>
        ${fuera.length ? raw(fuera.map((p) => `
          <button class="menu-item" data-in="${p.id}">
            ${avatarHTML(p, 'avatar-sm')}
            <span style="flex:1">${esc(p.full_name || p.email)}</span>
            ${ico('plus')}
          </button>`).join('')) : raw('<p class="muted small" style="padding:6px 2px">Todo el equipo ya está en el tablero.</p>')}

        ${state.mode === 'supabase' ? raw(`
          <div class="menu-sep"></div>
          <p class="small muted" style="margin:0">
            Cualquier persona con mail @${esc(window.EQ_CONFIG.ALLOWED_EMAIL_DOMAIN)}
            que entre a la app ya aparece acá. Los tableros "Equanima" los ve todo el equipo
            aunque no sean miembros.</p>`) : ''}`;

      on(body, 'click', '[data-in]', async (_, b) => {
        await agregarMiembro(b.dataset.in);
        ctl.rerender();
      });
      on(body, 'click', '[data-out]', async (_, b) => {
        const id = b.dataset.out;
        if (await confirmar({
          title: `¿Quitar a ${nombreDe(id)} del tablero?`,
          body: 'También se lo desasigna de todas las tarjetas.',
          ok: 'Quitar', danger: true,
        })) { await quitarMiembro(id); ctl.rerender(); }
      });
      on(body, 'change', '[data-rol]', (_, s) => cambiarRol(s.dataset.rol, s.value));
    },
  });
}

function menuVisibilidad(anchor) {
  popover({
    anchor, title: 'Visibilidad', tight: true,
    render(body, ctl) {
      const abierto = CFG.ACCESS_MODE === 'publico';
      body.innerHTML = html`
        <button class="menu-item" data-v="workspace">${raw(ico('people'))}
          <span>${abierto ? 'Abierto' : 'Equanima'}<span class="sub">${
            abierto ? 'Cualquiera con el link ve y edita'
                    : 'Todo el equipo puede ver y editar'}</span></span></button>
        <button class="menu-item" data-v="private">${raw(ico('user'))}
          <span>Privado<span class="sub">Solo los miembros del tablero</span></span></button>
        ${abierto ? raw(`<div class="menu-sep"></div>
          <p class="small muted" style="margin:0;padding:2px 10px 6px">
            El tablero está en modo abierto: "Privado" limita a los miembros,
            pero cualquiera puede sumarse como miembro. Para cerrarlo de verdad
            hay que correr <code>schema_acceso_dominio.sql</code>.</p>`) : ''}`;
      on(body, 'click', '[data-v]', (_, b) => {
        actualizarTablero({ visibility: b.dataset.v });
        ctl.close();
      });
    },
  });
}

/* ========================= panel lateral (menú) ======================== */

function panelLateral(seccion = 'main') {
  host.querySelector('.side')?.remove();
  const side = document.createElement('div');
  side.className = 'side';
  host.querySelector('.board').appendChild(side);

  const cerrar = () => side.remove();
  pintarSide(seccion);

  function pintarSide(sec) {
    const titulos = {
      main: 'Menú del tablero', bg: 'Cambiar fondo', labels: 'Etiquetas',
      archive: 'Archivo', activity: 'Actividad', about: 'Acerca del tablero',
    };
    side.innerHTML = html`
      <div class="side-head">
        ${sec !== 'main' ? raw(`<button class="icon-btn" data-s="main">${ico('arrowL')}</button>`) : ''}
        <h3>${titulos[sec] || ''}</h3>
        <button class="icon-btn" data-close>${raw(ico('close'))}</button>
      </div>
      <div class="side-body">${raw(cuerpo(sec))}</div>`;

    side.querySelector('[data-close]').addEventListener('click', cerrar);
    on(side, 'click', '[data-s]', (_, b) => pintarSide(b.dataset.s));
    conectar(sec);
  }

  function cuerpo(sec) {
    if (sec === 'main') {
      const b = state.board;
      return html`
        <button class="menu-item" data-s="about">${raw(ico('info'))} Acerca del tablero</button>
        <button class="menu-item" data-s="bg">${raw(ico('palette'))} Cambiar fondo</button>
        <button class="menu-item" data-s="labels">${raw(ico('tag'))} Etiquetas</button>
        <button class="menu-item" data-s="archive">${raw(ico('archive'))} Archivo</button>
        <button class="menu-item" data-s="activity">${raw(ico('activity'))} Actividad</button>
        <div class="menu-sep"></div>
        <button class="menu-item" data-x="copy-link">${raw(ico('link'))} Copiar link del tablero</button>
        <button class="menu-item" data-x="close-board">${raw(ico('archive'))}
          ${b.is_closed ? 'Reabrir tablero' : 'Cerrar tablero'}</button>
        <button class="menu-item danger" data-x="delete-board">${raw(ico('trash'))} Eliminar tablero</button>`;
    }

    if (sec === 'about') {
      const b = state.board;
      const creador = nombreDe(b.created_by);
      return html`
        <label class="field-label">Descripción</label>
        <textarea class="textarea" data-desc rows="6"
          placeholder="¿Para qué sirve este tablero?">${b.description || ''}</textarea>
        <button class="btn btn-primary btn-sm" data-x="save-desc" style="margin-top:8px">Guardar</button>
        <div class="menu-sep"></div>
        <p class="small muted">
          Creado por <b>${creador}</b> el ${fechaCorta(b.created_at)}<br>
          ${state.lists.size} listas · ${state.cards.size} tarjetas · ${state.members.length} miembros<br>
          Visibilidad: ${b.visibility === 'private' ? 'Privado' : 'Equanima'}
        </p>`;
    }

    if (sec === 'bg') {
      return `<div class="swatches">${BOARD_BGS.map((c) => `
        <button class="swatch bg-${c} ${state.board.background === c ? 'on' : ''}"
                data-bg="${c}" aria-label="Fondo ${c}"></button>`).join('')}</div>`;
    }

    if (sec === 'labels') {
      return html`
        ${raw([...state.labels.values()].map((l) => `
          <div class="lbl-row">
            <div class="bar" style="${labelStyle(l.color)}" data-lbl="${l.id}">${esc(l.name || '')}</div>
            <button class="icon-btn" data-lbl-edit="${l.id}" title="Editar">${ico('pencil')}</button>
            <button class="icon-btn" data-lbl-del="${l.id}" title="Eliminar">${ico('trash')}</button>
          </div>`).join(''))}
        <button class="btn btn-block" data-x="new-label" style="margin-top:10px">Crear etiqueta</button>`;
    }

    if (sec === 'archive') {
      const cs = tarjetasArchivadas();
      const ls = listasArchivadas();
      return html`
        <label class="field-label">Tarjetas archivadas (${cs.length})</label>
        ${cs.length ? raw(cs.map((c) => `
          <div class="row" style="margin-bottom:8px;align-items:flex-start">
            <span style="flex:1">
              <div class="small strong">#${c.number} ${esc(c.title)}</div>
              <div class="small muted">${esc(haceRato(c.updated_at))}</div>
            </span>
            <button class="btn btn-sm" data-restore="${c.id}">Restaurar</button>
            <button class="icon-btn" data-del-card="${c.id}" title="Eliminar">${ico('trash')}</button>
          </div>`).join('')) : raw('<p class="small muted">Nada archivado.</p>')}

        <div class="menu-sep"></div>
        <label class="field-label">Listas archivadas (${ls.length})</label>
        ${ls.length ? raw(ls.map((l) => `
          <div class="row" style="margin-bottom:8px">
            <span style="flex:1" class="small strong">${esc(l.title)}</span>
            <button class="btn btn-sm" data-restore-list="${l.id}">Restaurar</button>
            <button class="icon-btn" data-del-list="${l.id}" title="Eliminar">${ico('trash')}</button>
          </div>`).join('')) : raw('<p class="small muted">Ninguna lista archivada.</p>')}`;
    }

    if (sec === 'activity') {
      if (!state.activity.length) return '<p class="small muted">Todavía no hay actividad.</p>';
      return state.activity.slice(0, 80).map((a) => `
        <div class="act-item">
          ${avatarHTML(perfilDe(a.user_id), 'avatar-sm')}
          <div class="act-body">
            ${textoActividad(a)}
            <div class="act-when">${esc(haceRato(a.created_at))}</div>
          </div>
        </div>`).join('');
    }
    return '';
  }

  function conectar(sec) {
    const body = side.querySelector('.side-body');

    on(body, 'click', '[data-bg]', (_, b) => {
      actualizarTablero({ background: b.dataset.bg });
      body.querySelectorAll('[data-bg]').forEach((s) =>
        s.classList.toggle('on', s.dataset.bg === b.dataset.bg));
    });

    on(body, 'click', '[data-x]', async (_, b) => {
      const x = b.dataset.x;
      if (x === 'copy-link') {
        await copiar(location.origin + location.pathname + `#/b/${state.boardId}`);
        return toast('Link copiado', 'ok');
      }
      if (x === 'save-desc') {
        await actualizarTablero({ description: body.querySelector('[data-desc]').value });
        return toast('Descripción guardada', 'ok');
      }
      if (x === 'close-board') {
        await actualizarTablero({ is_closed: !state.board.is_closed });
        return pintarSide('main');
      }
      if (x === 'delete-board') {
        if (await confirmar({
          title: `¿Eliminar "${state.board.title}"?`,
          body: 'Se borran todas sus listas, tarjetas y comentarios. No se puede deshacer.',
          ok: 'Eliminar tablero', danger: true,
        })) {
          const id = state.boardId;
          cerrar();
          location.hash = '#/';
          await borrarTablero(id);
        }
        return;
      }
      if (x === 'new-label') {
        await crearEtiqueta({ name: '', color: LABEL_COLORS[state.labels.size % LABEL_COLORS.length] });
        return pintarSide('labels');
      }
    });

    if (sec === 'labels') {
      on(body, 'click', '[data-lbl-edit], [data-lbl]', (_, b) => {
        const id = b.dataset.lblEdit || b.dataset.lbl;
        editorEtiqueta(b, id, () => pintarSide('labels'));
      });
      on(body, 'click', '[data-lbl-del]', async (_, b) => {
        if (await confirmar({ title: '¿Eliminar la etiqueta?', ok: 'Eliminar', danger: true })) {
          await borrarEtiqueta(b.dataset.lblDel);
          pintarSide('labels');
        }
      });
    }

    if (sec === 'archive') {
      on(body, 'click', '[data-restore]', async (_, b) => {
        await archivarTarjeta(b.dataset.restore, false); pintarSide('archive');
      });
      on(body, 'click', '[data-del-card]', async (_, b) => {
        if (await confirmar({ title: '¿Eliminar definitivamente?', ok: 'Eliminar', danger: true })) {
          await borrarTarjeta(b.dataset.delCard); pintarSide('archive');
        }
      });
      on(body, 'click', '[data-restore-list]', async (_, b) => {
        await actualizarLista(b.dataset.restoreList, { is_archived: false }); pintarSide('archive');
      });
      on(body, 'click', '[data-del-list]', async (_, b) => {
        if (await confirmar({ title: '¿Eliminar la lista y sus tarjetas?', ok: 'Eliminar', danger: true })) {
          await borrarLista(b.dataset.delList); pintarSide('archive');
        }
      });
    }
  }
}

const perfilDe = (id) => state.profiles.find((p) => p.id === id)
                      || state.members.find((m) => m.user_id === id)
                      || { full_name: 'Alguien', initials: '?' };

/** Popover para renombrar / recolorear una etiqueta. */
export function editorEtiqueta(anchor, labelId, alGuardar) {
  const l = state.labels.get(labelId);
  if (!l) return;
  let color = l.color;

  popover({
    anchor, title: 'Editar etiqueta',
    render(body, ctl) {
      body.innerHTML = html`
        <label class="field-label">Nombre</label>
        <input class="input" data-n value="${l.name || ''}" maxlength="60">
        <label class="field-label">Color</label>
        <div class="color-grid">
          ${raw(LABEL_COLORS.map((c) => `
            <button data-c="${c}" class="${c === color ? 'on' : ''}"
                    style="${labelStyle(c)}" aria-label="${c}"></button>`).join(''))}
        </div>
        <div class="row" style="margin-top:14px;gap:8px">
          <button class="btn btn-primary" data-x="save" style="flex:1">Guardar</button>
          <button class="btn btn-danger" data-x="del">${raw(ico('trash'))}</button>
        </div>`;

      on(body, 'click', '[data-c]', (_, b) => {
        color = b.dataset.c;
        body.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x.dataset.c === color));
      });
      on(body, 'click', '[data-x]', async (_, b) => {
        if (b.dataset.x === 'save') {
          await actualizarEtiqueta(labelId, { name: body.querySelector('[data-n]').value.trim(), color });
        } else {
          if (!await confirmar({ title: '¿Eliminar la etiqueta?', ok: 'Eliminar', danger: true })) return;
          await borrarEtiqueta(labelId);
        }
        ctl.close();
        alGuardar?.();
      });
    },
  });
}

export { pintarTodo as repintarTablero, panelLateral };
