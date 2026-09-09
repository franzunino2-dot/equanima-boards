/* ==========================================================================
   search.js — resultados de búsqueda de tarjetas
   ========================================================================== */

import { html, raw, esc, on, mdPlain, fechaCorta } from '../util.js';
import { api } from '../api.js';
import { state } from '../store.js';
import { ico } from './icons.js';

export async function renderBusqueda(host, q) {
  host.className = 'view';
  host.innerHTML = html`
    <div class="search-res">
      <h2 style="margin:0 0 16px">Resultados para “${q}”</h2>
      <p class="muted">Buscando…</p>
    </div>`;

  let filas = [];
  try {
    filas = await api.searchCards(q);
  } catch (e) {
    host.querySelector('.search-res').innerHTML = html`
      <div class="empty-state">${raw(ico('info'))}<p>${e.message || 'La búsqueda falló'}</p></div>`;
    return () => {};
  }

  const cont = host.querySelector('.search-res');
  cont.innerHTML = html`
    <h2 style="margin:0 0 16px">
      ${filas.length} resultado${filas.length === 1 ? '' : 's'} para “${q}”
    </h2>
    ${filas.length ? raw(filas.map((c) => `
      <button class="res-item" data-b="${c.board_id}" data-c="${c.id}">
        <span class="cardnum">#${c.number}</span>
        <span style="flex:1;min-width:0">
          <div class="strong">${esc(c.title)}</div>
          <div class="res-path">${esc(c.board_title)} › ${esc(c.list_title)}</div>
          ${c.description ? `<div class="res-path">${esc(mdPlain(c.description, 100))}</div>` : ''}
        </span>
        ${c.due_at ? `<span class="small muted">${esc(fechaCorta(c.due_at))}</span>` : ''}
      </button>`).join('')) : raw(`
      <div class="empty-state">${ico('search')}<p>No encontramos tarjetas con ese texto.</p></div>`)}`;

  on(cont, 'click', '[data-c]', (_, b) => {
    location.hash = `#/b/${b.dataset.b}/c/${b.dataset.c}`;
  });
  void state;
  return () => {};
}
