/* ==========================================================================
   home.js — listado de tableros
   ========================================================================== */

import { html, raw, on, esc, fechaCorta, avatarHTML, BOARD_BGS } from '../util.js';
import { state, bus, cargarBoards, crearTablero, toggleDestacado,
         todasLasTarjetas, tarjetasDe } from '../store.js';
import { ico } from './icons.js';
import { modal, toast } from './kit.js';

let root = null;

export function renderHome(host) {
  root = host;
  root.className = 'view';
  root.innerHTML = '<div class="home"><div class="home-inner"></div></div>';
  pintar();

  on(root, 'click', '[data-star]', (ev, b) => {
    ev.preventDefault(); ev.stopPropagation();
    toggleDestacado(b.dataset.star);
  });
  on(root, 'click', '[data-new-board]', (ev) => { ev.preventDefault(); nuevoTablero(); });

  const off = bus.on('boards', pintar);
  cargarBoards().catch((e) => {
    toast(e.message || 'No se pudieron cargar los tableros', 'err');
  });
  return () => off();
}

function pintar() {
  const inner = root.querySelector('.home-inner');
  if (!inner) return;

  const bs = state.boards.filter((b) => !b.is_closed);
  const dest = bs.filter((b) => b.starred);
  const cerrados = state.boards.filter((b) => b.is_closed);

  inner.innerHTML = html`
    ${dest.length ? raw(`
      <h2>${ico('star')} Destacados</h2>
      <div class="board-grid">${dest.map(tile).join('')}</div>`) : ''}

    <h2>${raw(ico('board'))} Tus tableros</h2>
    <div class="board-grid">
      ${raw(bs.map(tile).join(''))}
      <button class="tile-new" data-new-board>
        ${raw(ico('plus'))}
        <span>Crear tablero</span>
      </button>
    </div>

    ${cerrados.length ? raw(`
      <h2>${ico('archive')} Cerrados</h2>
      <div class="board-grid">${cerrados.map(tile).join('')}</div>`) : ''}

    ${bs.length === 0 ? raw(`
      <div class="empty-state">
        ${ico('board')}
        <p>Todavía no hay tableros. Creá el primero para arrancar.</p>
      </div>`) : ''}
  `;
}

function tile(b) {
  const bg = BOARD_BGS.includes(b.background) ? b.background : 'azul';
  const miembros = (b.members || []).slice(0, 4);
  return html`
    <a class="board-tile bg-${raw(bg)}" href="#/b/${b.id}">
      <button class="bt-star ${b.starred ? 'on' : ''}" data-star="${b.id}"
              title="${b.starred ? 'Quitar de destacados' : 'Destacar'}"
              aria-label="Destacar">${raw(ico(b.starred ? 'star' : 'starOff'))}</button>
      <div class="bt-title">${b.title}</div>
      <div class="bt-meta">
        <span>${b.list_count || 0} listas · ${b.card_count || 0} tarjetas</span>
        <span class="spacer" style="flex:1"></span>
        <span class="avatar-stack">
          ${raw(miembros.map((m) => avatarHTML(m, 'avatar-sm')).join(''))}
        </span>
      </div>
    </a>`;
}

/* --------------------------- crear tablero ------------------------------ */

export function nuevoTablero() {
  let bg = 'azul';
  let vis = 'workspace';

  modal({
    size: 'sm',
    render(host, close) {
      host.innerHTML = html`
        <div class="modal-pad">
          <h2>Crear tablero</h2>

          <label class="field-label">Fondo</label>
          <div class="swatches" data-sw>
            ${raw(BOARD_BGS.map((c) => `
              <button class="swatch bg-${c} ${c === bg ? 'on' : ''}" data-bg="${c}"
                      aria-label="Fondo ${c}"></button>`).join(''))}
          </div>

          <label class="field-label" for="nb-t">Título del tablero</label>
          <input class="input" id="nb-t" placeholder="Ej: Mesa de Dinero" maxlength="120">

          <label class="field-label">Visibilidad</label>
          <select class="input" data-vis>
            <option value="workspace">Equanima — lo ve todo el equipo</option>
            <option value="private">Privado — solo los miembros que agregues</option>
          </select>

          <div class="modal-actions">
            <button class="btn btn-ghost" data-x="no">Cancelar</button>
            <button class="btn btn-primary" data-x="si">Crear</button>
          </div>
        </div>`;

      const inp = host.querySelector('#nb-t');
      inp.focus();

      on(host, 'click', '[data-bg]', (_, b) => {
        bg = b.dataset.bg;
        host.querySelectorAll('[data-bg]').forEach((s) => s.classList.toggle('on', s.dataset.bg === bg));
      });
      host.querySelector('[data-vis]').addEventListener('change', (e) => { vis = e.target.value; });

      const crear = async () => {
        const title = inp.value.trim();
        if (!title) { inp.focus(); return; }
        const btn = host.querySelector('[data-x="si"]');
        btn.disabled = true; btn.textContent = 'Creando…';
        try {
          const b = await crearTablero({ title, background: bg, visibility: vis });
          close();
          location.hash = '#/b/' + b.id;
        } catch (e) {
          toast(e.message || 'No se pudo crear el tablero', 'err');
          btn.disabled = false; btn.textContent = 'Crear';
        }
      };

      on(host, 'click', '[data-x]', (_, b) => (b.dataset.x === 'si' ? crear() : close()));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') crear(); });
    },
  });
}

/* ------------------------- página "mis tarjetas" ------------------------ */

export function renderMisTarjetas(host) {
  host.className = 'view';
  host.innerHTML = '<div class="search-res"><div class="home-inner"></div></div>';
  const inner = host.querySelector('.home-inner');

  if (!state.boardId) {
    inner.innerHTML = html`
      <h2 style="margin-top:0">Mis tarjetas</h2>
      <div class="empty-state">
        ${raw(ico('info'))}
        <p>Abrí un tablero para ver las tarjetas que tenés asignadas ahí.</p>
        <p class="small">La vista global de todos los tableros llega cuando haya
        más de un tablero cargado en memoria.</p>
      </div>`;
    return () => {};
  }

  const mias = todasLasTarjetas()
    .filter((c) => state.cardMembers.has(c.id + '|' + state.me.id))
    .sort((a, b) => {
      const x = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const y = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return x - y;
    });

  inner.innerHTML = html`
    <h2 style="margin-top:0">Mis tarjetas en ${state.board.title}</h2>
    ${mias.length ? raw(mias.map((c) => `
      <button class="res-item" data-go="${c.id}">
        <span class="cardnum">#${c.number}</span>
        <span style="flex:1">
          <div class="strong">${esc(c.title)}</div>
          <div class="res-path">${esc(state.lists.get(c.list_id)?.title || '')}</div>
        </span>
        ${c.due_at ? `<span class="small muted">${esc(fechaCorta(c.due_at))}</span>` : ''}
      </button>`).join('')) : raw(`
      <div class="empty-state">${ico('check')}<p>No tenés tarjetas asignadas en este tablero.</p></div>`)}
  `;

  on(inner, 'click', '[data-go]', (_, b) => {
    location.hash = `#/b/${state.boardId}/c/${b.dataset.go}`;
  });
  return () => {};
}
