/* ==========================================================================
   views.js — vistas alternativas del tablero: tabla, calendario y resumen
   ========================================================================== */

import {
  html, raw, esc, on, avatarHTML, labelStyle, fechaCorta, haceRato,
  dueState, dueLabel, DOW, mesLargo, ymd,
} from '../util.js';
import {
  state, listasVisibles, tarjetasDe, etiquetasDe, miembrosDe,
  progresoCheck, pasaFiltro, nombreDe,
} from '../store.js';
import { ico } from './icons.js';

const abrir = (id) => { location.hash = `#/b/${state.boardId}/c/${id}`; };

/* =============================== TABLA ================================= */

let ordenKey = 'lista';
let ordenDir = 1;

export function renderTabla(host) {
  const filas = filasVisibles();
  const cols = [
    ['num', '#'], ['title', 'Tarjeta'], ['lista', 'Lista'], ['labels', 'Etiquetas'],
    ['members', 'Miembros'], ['due', 'Vencimiento'], ['check', 'Checklist'],
    ['upd', 'Actualizada'],
  ];

  host.innerHTML = html`
    <div class="table-wrap">
      <table class="eb-table">
        <thead><tr>${raw(cols.map(([k, t]) => `
          <th data-sort="${k}">${t}${ordenKey === k ? ` <span class="arrow">${ordenDir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join(''))}
        </tr></thead>
        <tbody>${raw(filas.map(fila).join(''))}</tbody>
      </table>
      ${filas.length === 0 ? raw(`<div class="empty-state">${ico('table')}<p>No hay tarjetas que coincidan.</p></div>`) : ''}
    </div>`;

  on(host, 'click', '[data-sort]', (_, th) => {
    const k = th.dataset.sort;
    if (ordenKey === k) ordenDir *= -1; else { ordenKey = k; ordenDir = 1; }
    renderTabla(host);
  });
  on(host, 'click', 'tbody tr', (_, tr) => abrir(tr.dataset.card));
}

function filasVisibles() {
  const listas = listasVisibles();
  const idx = new Map(listas.map((l, i) => [l.id, i]));
  const arr = [];
  listas.forEach((l) => tarjetasDe(l.id).forEach((c) => arr.push(c)));

  const val = (c) => {
    switch (ordenKey) {
      case 'num':     return c.number;
      case 'title':   return c.title.toLowerCase();
      case 'lista':   return idx.get(c.list_id) * 1e6 + c.position;
      case 'labels':  return etiquetasDe(c.id).map((l) => l.name || l.color).join(',');
      case 'members': return miembrosDe(c.id).map((m) => m.full_name || '').join(',');
      case 'due':     return c.due_at ? new Date(c.due_at).getTime() : Infinity;
      case 'check':   return progresoCheck(c.id).pct;
      case 'upd':     return c.updated_at || '';
      default:        return 0;
    }
  };
  return arr.sort((a, b) => {
    const x = val(a); const y = val(b);
    if (x === y) return 0;
    return (x > y ? 1 : -1) * ordenDir;
  });
}

function fila(c) {
  const chk = progresoCheck(c.id);
  const ds = dueState(c);
  return html`
    <tr data-card="${c.id}">
      <td class="cardnum">#${c.number}</td>
      <td class="tt">${c.title}</td>
      <td class="muted">${state.lists.get(c.list_id)?.title || ''}</td>
      <td><span class="row-wrap">${raw(etiquetasDe(c.id).map((l) => `
        <span class="label-chip" style="${labelStyle(l.color)}">${esc(l.name || '')}</span>`).join(''))}</span></td>
      <td><span class="avatar-stack">${raw(miembrosDe(c.id).map((m) => avatarHTML(m, 'avatar-sm')).join(''))}</span></td>
      <td>${c.due_at ? raw(`<span class="bdg-due ${ds || ''}" style="padding:2px 6px;border-radius:4px">${esc(dueLabel(c))}</span>`) : raw('<span class="muted">—</span>')}</td>
      <td class="muted">${chk.total ? raw(`${chk.hechos}/${chk.total}`) : '—'}</td>
      <td class="muted small">${haceRato(c.updated_at)}</td>
    </tr>`;
}

/* ============================= CALENDARIO ============================== */

let cursor = new Date();

export function renderCalendario(host) {
  cursor.setDate(1);
  const y = cursor.getFullYear();
  const m = cursor.getMonth();

  const porDia = new Map();
  listasVisibles().forEach((l) => tarjetasDe(l.id).forEach((c) => {
    if (!c.due_at) return;
    const k = ymd(new Date(c.due_at));
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(c);
  }));

  const first = new Date(y, m, 1);
  const off = (first.getDay() + 6) % 7;
  const cur = new Date(y, m, 1 - off);
  const hoy = ymd(new Date());
  const celdas = [];

  for (let i = 0; i < 42; i++) {
    const k = ymd(cur);
    const cs = porDia.get(k) || [];
    celdas.push(html`
      <div class="cal-cell ${cur.getMonth() !== m ? 'out' : ''} ${k === hoy ? 'today' : ''}">
        <div class="cal-num"><span>${cur.getDate()}</span></div>
        ${raw(cs.map((c) => {
          const ds = dueState(c);
          return `<button class="cal-card ${ds === 'done' ? 'done' : ''} ${ds === 'late' ? 'late' : ''}"
                    data-card="${c.id}" title="${esc(c.title)}">#${c.number} ${esc(c.title)}</button>`;
        }).join(''))}
      </div>`);
    cur.setDate(cur.getDate() + 1);
    if (i >= 34 && cur.getMonth() !== m && (i + 1) % 7 === 0) break;
  }

  const sinFecha = listasVisibles()
    .flatMap((l) => tarjetasDe(l.id))
    .filter((c) => !c.due_at);

  host.innerHTML = html`
    <div class="cal-wrap">
      <div class="cal-head">
        <button class="icon-btn" data-mv="-1" aria-label="Mes anterior">${raw(ico('arrowL'))}</button>
        <h3>${mesLargo(m)} ${y}</h3>
        <button class="icon-btn" data-mv="1" aria-label="Mes siguiente">${raw(ico('arrowR'))}</button>
        <button class="btn btn-sm" data-mv="0">Hoy</button>
        <span class="spacer" style="flex:1"></span>
        <span class="small muted">${sinFecha.length} tarjetas sin fecha</span>
      </div>
      <div class="cal-grid">
        ${raw(DOW.map((d) => `<div class="cal-dow">${d}</div>`).join(''))}
        ${raw(celdas.join(''))}
      </div>
    </div>`;

  on(host, 'click', '[data-mv]', (_, b) => {
    const v = Number(b.dataset.mv);
    if (v === 0) cursor = new Date();
    else cursor.setMonth(cursor.getMonth() + v);
    renderCalendario(host);
  });
  on(host, 'click', '[data-card]', (_, b) => abrir(b.dataset.card));
}

/* =============================== RESUMEN =============================== */

export function renderResumen(host) {
  const listas = listasVisibles();
  const cards = listas.flatMap((l) => tarjetasDe(l.id));
  const total = cards.length;

  const vencidas = cards.filter((c) => dueState(c) === 'late').length;
  const proximas = cards.filter((c) => dueState(c) === 'soon').length;
  const cumplidas = cards.filter((c) => c.due_complete).length;
  const sinAsignar = cards.filter((c) => miembrosDe(c.id).length === 0).length;

  const porLista = listas.map((l) => [l.title, tarjetasDe(l.id).length]);
  const porMiembro = state.members.map((m) => [
    m.full_name || m.email,
    cards.filter((c) => state.cardMembers.has(c.id + '|' + m.user_id)).length,
  ]).sort((a, b) => b[1] - a[1]);
  const porEtiqueta = [...state.labels.values()].map((l) => [
    l.name || l.color,
    cards.filter((c) => state.cardLabels.has(c.id + '|' + l.id)).length,
    l.color,
  ]).sort((a, b) => b[1] - a[1]);

  host.innerHTML = html`
    <div class="dash">
      <div class="dash-grid">
        <div class="panel">
          <h4>Estado general</h4>
          <div class="stat-row"><span class="stat-num">${total}</span><span class="muted">tarjetas activas</span></div>
          <div class="stat-row"><span class="stat-num" style="color:var(--red)">${vencidas}</span><span class="muted">vencidas</span></div>
          <div class="stat-row"><span class="stat-num" style="color:var(--yellow)">${proximas}</span><span class="muted">vencen en 36 h</span></div>
          <div class="stat-row"><span class="stat-num" style="color:var(--green)">${cumplidas}</span><span class="muted">cumplidas</span></div>
          <div class="stat-row"><span class="stat-num">${sinAsignar}</span><span class="muted">sin responsable</span></div>
        </div>

        <div class="panel">
          <h4>Tarjetas por lista</h4>
          ${raw(barras(porLista, total))}
        </div>

        <div class="panel">
          <h4>Carga por persona</h4>
          ${porMiembro.length ? raw(barras(porMiembro, Math.max(1, ...porMiembro.map((x) => x[1]))))
            : raw('<p class="small muted">Nadie tiene tarjetas asignadas.</p>')}
        </div>

        <div class="panel">
          <h4>Tarjetas por etiqueta</h4>
          ${porEtiqueta.length ? raw(porEtiqueta.map(([n, q, color]) => `
            <div class="bar-row">
              <span class="nm">${esc(n)}</span>
              <span class="bar"><i style="width:${total ? Math.round(q / Math.max(1, ...porEtiqueta.map((x) => x[1])) * 100) : 0}%;background:var(--l-${esc(color)})"></i></span>
              <span class="qt">${q}</span>
            </div>`).join('')) : raw('<p class="small muted">Sin etiquetas.</p>')}
        </div>

        <div class="panel">
          <h4>Próximos vencimientos</h4>
          ${raw(proximosVencimientos(cards))}
        </div>
      </div>
    </div>`;

  on(host, 'click', '[data-card]', (_, b) => abrir(b.dataset.card));
}

function barras(pares, max) {
  if (!pares.length) return '<p class="small muted">Sin datos.</p>';
  const m = Math.max(1, max);
  return pares.map(([n, q]) => `
    <div class="bar-row">
      <span class="nm" title="${esc(n)}">${esc(n)}</span>
      <span class="bar"><i style="width:${Math.round(q / m * 100)}%"></i></span>
      <span class="qt">${q}</span>
    </div>`).join('');
}

function proximosVencimientos(cards) {
  const próx = cards
    .filter((c) => c.due_at && !c.due_complete)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 8);
  if (!próx.length) return '<p class="small muted">No hay vencimientos pendientes.</p>';
  return próx.map((c) => {
    const ds = dueState(c);
    return `<button class="row" data-card="${c.id}" style="width:100%;text-align:left;padding:5px 0;gap:8px">
        <span class="bdg-due ${ds || ''}" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600">
          ${esc(fechaCorta(c.due_at))}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${esc(c.title)}</span>
      </button>`;
  }).join('');
}
