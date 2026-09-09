/* ==========================================================================
   app.js — arranque, autenticación, router y atajos de teclado
   ========================================================================== */

import { $, html, raw, esc, on, CFG, avatarHTML, debounce, haceRato } from './util.js';
import { api, initApi, configurado, demoForzado, activarDemo, salirDemo } from './api.js';
import {
  state, bus, cargarSesion, cargarBoards, cerrarTablero, listasVisibles,
  nuevoFiltro, novedades, novedadesSinLeer, marcarNovedadesLeidas, nombreDe,
} from './store.js';
import { renderHome, nuevoTablero, renderMisTarjetas } from './ui/home.js';
import { renderBoard, repintarTablero } from './ui/board.js';
import { abrirTarjeta, cerrarTarjeta, tarjetaAbierta } from './ui/card.js';
import { renderBusqueda } from './ui/search.js';
import { ico } from './ui/icons.js';
import {
  popover, closePopover, popoverOpen, modal, closeTopModal, modalOpen, toast,
} from './ui/kit.js';
import { textoActividad } from './ui/activity.js';

const boot = $('#boot');
const authEl = $('#auth');
const appEl = $('#app');
const viewEl = $('#view');

let actual = { kind: null, boardId: null, cleanup: null };

/* ================================ tema ================================= */

const TEMA = 'eq_boards_tema';

function aplicarTema(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(TEMA, t);
}
function alternarTema() {
  const actualT = localStorage.getItem(TEMA) || 'auto';
  const oscuroSistema = matchMedia('(prefers-color-scheme: dark)').matches;
  const esOscuro = actualT === 'dark' || (actualT === 'auto' && oscuroSistema);
  aplicarTema(esOscuro ? 'light' : 'dark');
}
aplicarTema(localStorage.getItem(TEMA) || 'auto');

/* =============================== arranque ============================== */

arrancar();

async function arrancar() {
  $('#auth-domain').textContent = '@' + (CFG.ALLOWED_EMAIL_DOMAIN || 'equanimasecurities.com');
  if (!configurado()) {
    $('#btn-google').disabled = true;
    $('#btn-google').title = 'Falta configurar Supabase en config.js';
  }

  try {
    const modo = await initApi();
    const { user } = await api.auth.init();

    if (!user) { mostrarLogin(); return; }

    await cargarSesion();
    mostrarApp(modo);
  } catch (e) {
    console.error(e);
    mostrarLogin(e.message);
  }
}

function mostrarLogin(error) {
  boot.hidden = true;
  appEl.hidden = true;
  authEl.hidden = false;

  const err = $('#auth-error');
  if (error) { err.textContent = error; err.hidden = false; } else { err.hidden = true; }

  $('#btn-google').onclick = async () => {
    const b = $('#btn-google');
    b.disabled = true;
    b.querySelector('span').textContent = 'Redirigiendo a Google…';
    try {
      salirDemo();
      await api.auth.signInGoogle();
    } catch (e) {
      b.disabled = false;
      b.querySelector('span').textContent = 'Entrar con Google';
      err.textContent = e.message || 'No se pudo iniciar sesión';
      err.hidden = false;
    }
  };

  $('#btn-demo').onclick = () => { activarDemo(); location.reload(); };
}

async function mostrarApp(modo) {
  boot.hidden = true;
  authEl.hidden = true;
  appEl.hidden = false;

  pintarTopbar();
  conectarTopbar();
  atajos();

  if (modo === 'demo') {
    toast('Modo demo: los datos quedan solo en este browser', '', {
      ms: 7000,
      action: configurado() ? 'Salir del demo' : undefined,
      onAction: () => { salirDemo(); location.reload(); },
    });
  }

  await cargarBoards().catch(() => {});
  addEventListener('hashchange', router);
  await router();
}

/* =============================== topbar ================================ */

function pintarTopbar() {
  $('#tb-me').innerHTML = state.me.avatar_url
    ? `<img src="${esc(state.me.avatar_url)}" alt="" referrerpolicy="no-referrer">`
    : esc(state.me.initials || '?');
  $('.tb-name').textContent = (CFG.WORKSPACE_NAME || 'Equanima') + ' Boards';
  refrescarCampana();
}

function refrescarCampana() {
  const n = novedadesSinLeer().length;
  $('#bell-badge').hidden = n === 0;
  $('#tb-bell').title = n ? `${n} novedades` : 'Novedades';
}

function conectarTopbar() {
  $('#tb-home').onclick = () => { location.hash = '#/'; };
  $('#tb-new').onclick = () => nuevoTablero();
  $('#tb-theme').onclick = alternarTema;
  $('#tb-mine').onclick = () => misTarjetas();
  $('#tb-bell').onclick = (e) => menuNovedades(e.currentTarget);
  $('#tb-me').onclick = (e) => menuCuenta(e.currentTarget);

  on(document.querySelector('.tb-nav'), 'click', '[data-menu]', (ev, b) => {
    menuTableros(b, b.dataset.menu);
  });

  const q = $('#tb-q');
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q.value.trim()) {
      location.hash = '#/buscar?q=' + encodeURIComponent(q.value.trim());
      q.blur();
    }
    if (e.key === 'Escape') { q.value = ''; q.blur(); }
  });
  // Búsqueda rápida dentro del tablero abierto
  q.addEventListener('input', debounce(() => {
    if (actual.kind !== 'board' || !q.value.trim()) return;
    state.filters.text = q.value.trim();
    repintarTablero();
  }, 250));

  bus.on('board', refrescarCampana);
}

function menuTableros(anchor, tipo) {
  const titulo = tipo === 'starred' ? 'Destacados' : tipo === 'recent' ? 'Recientes' : 'Tableros';
  popover({
    anchor, title: titulo, tight: true,
    render(body) {
      let bs = state.boards.filter((b) => !b.is_closed);
      if (tipo === 'starred') bs = bs.filter((b) => b.starred);
      if (tipo === 'recent') bs = bs.slice(0, 8);

      body.innerHTML = bs.length ? bs.map((b) => `
        <a class="menu-item" href="#/b/${b.id}">
          <span class="swatch bg-${esc(b.background)}" style="width:32px;height:24px;border-radius:4px;box-shadow:none"></span>
          <span style="flex:1">${esc(b.title)}
            <span class="sub">${b.card_count || 0} tarjetas</span></span>
          ${b.starred ? ico('star') : ''}
        </a>`).join('')
        : '<p class="muted small" style="padding:8px">No hay tableros acá.</p>';

      on(body, 'click', 'a', () => closePopover());
    },
  });
}

function menuNovedades(anchor) {
  popover({
    anchor, title: 'Novedades', wide: true,
    render(body) {
      const ns = novedades().slice(0, 30);
      body.innerHTML = ns.length ? ns.map((a) => `
        <div class="act-item">
          ${avatarHTML(state.profiles.find((p) => p.id === a.user_id) || { initials: '?' }, 'avatar-sm')}
          <div class="act-body">
            ${textoActividad(a)}
            <div class="act-when">${esc(haceRato(a.created_at))}</div>
          </div>
        </div>`).join('')
        : `<div class="empty-state" style="padding:24px">${ico('bell')}
             <p class="small">Sin novedades en tus tarjetas.</p></div>`;
      marcarNovedadesLeidas();
      refrescarCampana();
    },
  });
}

function menuCuenta(anchor) {
  popover({
    anchor, title: 'Cuenta', tight: true,
    render(body) {
      body.innerHTML = html`
        <div class="row" style="padding:8px 10px 12px">
          ${raw(avatarHTML(state.me, 'avatar-lg'))}
          <span style="min-width:0">
            <div class="strong">${state.me.full_name || state.me.email}</div>
            <div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${state.me.email}</div>
          </span>
        </div>
        <div class="menu-sep"></div>
        <button class="menu-item" data-x="theme">${raw(ico('palette'))} Cambiar tema</button>
        <button class="menu-item" data-x="shortcuts">${raw(ico('keyboard'))} Atajos de teclado</button>
        <div class="menu-sep"></div>
        <p class="small muted" style="padding:4px 10px">
          Backend: <b>${state.mode === 'demo' ? 'demo local' : 'Supabase'}</b>
        </p>
        ${state.mode === 'demo' && configurado() ? raw(
          `<button class="menu-item" data-x="exit-demo">${ico('logout')} Salir del modo demo</button>`) : ''}
        <button class="menu-item danger" data-x="logout">${raw(ico('logout'))} Cerrar sesión</button>`;

      on(body, 'click', '[data-x]', (_, b) => {
        const x = b.dataset.x;
        closePopover();
        if (x === 'theme') alternarTema();
        if (x === 'shortcuts') ayudaAtajos();
        if (x === 'exit-demo') { salirDemo(); location.reload(); }
        if (x === 'logout') api.auth.signOut();
      });
    },
  });
}

/* ================================ router =============================== */

async function router() {
  const bruto = location.hash.slice(1) || '/';
  const [path, query] = bruto.split('?');
  const seg = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');

  // --- tablero (y opcionalmente una tarjeta abierta) ---
  if (seg[0] === 'b' && seg[1]) {
    const boardId = seg[1];
    const cardId = seg[2] === 'c' ? seg[3] : null;

    if (actual.kind !== 'board' || actual.boardId !== boardId) {
      limpiar();
      actual = { kind: 'board', boardId, cleanup: await renderBoard(viewEl, boardId) };
    }
    if (cardId) {
      if (tarjetaAbierta() !== cardId) {
        cerrarTarjeta();
        abrirTarjeta(cardId, () => {
          // Al cerrar la tarjeta se vuelve al tablero
          if (location.hash.includes('/c/')) location.hash = `#/b/${boardId}`;
        });
      }
    } else if (tarjetaAbierta()) {
      cerrarTarjeta();
    }
    return;
  }

  // --- búsqueda ---
  if (seg[0] === 'buscar') {
    const q = params.get('q') || '';
    if (!q) { location.hash = '#/'; return; }
    limpiar();
    actual = { kind: 'search', cleanup: await renderBusqueda(viewEl, q) };
    return;
  }

  // --- mis tarjetas ---
  if (seg[0] === 'mis-tarjetas') {
    limpiar();
    actual = { kind: 'mine', cleanup: renderMisTarjetas(viewEl) };
    return;
  }

  // --- home ---
  limpiar();
  actual = { kind: 'home', cleanup: renderHome(viewEl) };
}

function limpiar() {
  cerrarTarjeta();
  closePopover();
  actual.cleanup?.();
  if (actual.kind === 'board') cerrarTablero();
  actual = { kind: null, boardId: null, cleanup: null };
  viewEl.innerHTML = '';
}

function misTarjetas() {
  if (actual.kind === 'board') {
    // Dentro de un tablero: filtra por mí en vez de cambiar de página
    const f = state.filters;
    if (f.members.has(state.me.id)) f.members.delete(state.me.id);
    else f.members.add(state.me.id);
    repintarTablero();
    return;
  }
  location.hash = '#/mis-tarjetas';
}

/* ============================ atajos de teclado ======================== */

function atajos() {
  addEventListener('keydown', (e) => {
    const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

    if (e.key === 'Escape') {
      if (popoverOpen()) { closePopover(); return; }
      if (modalOpen()) { closeTopModal(); return; }
      return;
    }

    if (enCampo || e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case '/':
        e.preventDefault(); $('#tb-q').focus(); break;

      case '?':
        e.preventDefault(); ayudaAtajos(); break;

      case 'b': case 'B':
        e.preventDefault();
        menuTableros($('.tb-nav [data-menu="boards"]'), 'boards');
        break;

      case 'q': case 'Q':
        e.preventDefault(); misTarjetas(); break;

      case 'f': case 'F':
        if (actual.kind === 'board') {
          e.preventDefault();
          document.querySelector('[data-act="filter"]')?.click();
        }
        break;

      case 'x': case 'X':
        if (actual.kind === 'board') {
          e.preventDefault();
          state.filters = nuevoFiltro();
          $('#tb-q').value = '';
          repintarTablero();
        }
        break;

      case 'n': case 'N':
        if (actual.kind === 'board') {
          e.preventDefault();
          const l = listasVisibles()[0];
          if (l) document.querySelector(`[data-act="add-card"][data-list="${l.id}"]`)?.click();
        }
        break;

      case 'c': case 'C':
        if (actual.kind === 'board' && !tarjetaAbierta()) {
          e.preventDefault();
          document.querySelector('[data-act="add-list"]')?.click();
        }
        break;
    }
  });
}

function ayudaAtajos() {
  const filas = [
    ['/', 'Ir al buscador'],
    ['b', 'Abrir la lista de tableros'],
    ['q', 'Filtrar solo mis tarjetas'],
    ['f', 'Abrir filtros'],
    ['x', 'Limpiar filtros'],
    ['n', 'Nueva tarjeta en la primera lista'],
    ['c', 'Nueva lista'],
    ['Esc', 'Cerrar lo que esté abierto'],
    ['Enter', 'Guardar (en títulos y composers)'],
    ['Shift+Enter', 'Salto de línea'],
    ['Ctrl+Enter', 'Enviar comentario o descripción'],
    ['?', 'Esta ayuda'],
  ];
  modal({
    size: 'sm',
    render(hostEl, close) {
      hostEl.innerHTML = html`
        <div class="modal-pad">
          <h2>Atajos de teclado</h2>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            ${raw(filas.map(([k, d]) => `
              <tr><td style="padding:6px 10px 6px 0;white-space:nowrap"><kbd>${esc(k)}</kbd></td>
                  <td style="padding:6px 0;color:var(--text-2)">${esc(d)}</td></tr>`).join(''))}
          </table>
          <div class="modal-actions">
            <button class="btn btn-primary" data-ok>Listo</button>
          </div>
        </div>`;
      hostEl.querySelector('[data-ok]').onclick = close;
    },
  });
}

/* Deja algunas cosas accesibles desde la consola para debug */
window.EQ = { state, api, bus, nombreDe, demoForzado };
