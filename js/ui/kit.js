/* ==========================================================================
   kit.js — popovers, modales, toasts, confirmaciones, selector de fecha
   ========================================================================== */

import { html, raw, node, esc, $, on, DOW, mesLargo, hhmm, ymd, parseDate } from '../util.js';

const popLayer = $('#popover-layer');
const modalLayer = $('#modal-layer');
const toastLayer = $('#toast-layer');

const ICON_BACK  = '<svg viewBox="0 0 24 24"><path d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg>';

/* ============================== POPOVER ================================ */

let stack = [];          // [{ opts, el }]
let backdrop = null;

/**
 * Abre un popover anclado a un elemento.
 * @param {object} o
 * @param {Element} o.anchor  elemento de referencia
 * @param {string}  o.title
 * @param {boolean} o.wide
 * @param {(body:HTMLElement, ctl:object)=>void} o.render
 * @param {Function} [o.onClose]
 * @param {boolean} [o.push]  true = apila (muestra flecha de volver)
 */
export function popover(o) {
  if (!o.push) closePopover({ silent: true });

  if (!backdrop) {
    backdrop = node('<div class="pop-backdrop"></div>');
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) closePopover();
    });
    popLayer.appendChild(backdrop);
  }

  const pop = node(html`
    <div class="popover ${o.wide ? 'wide' : ''}" role="dialog">
      <div class="pop-head">
        ${stack.length ? raw(`<button class="icon-btn" data-pop="back" aria-label="Volver">${ICON_BACK}</button>`) : ''}
        <span class="pop-title">${o.title || ''}</span>
        <button class="icon-btn" data-pop="close" aria-label="Cerrar">${raw(ICON_CLOSE)}</button>
      </div>
      <div class="pop-body ${o.tight ? 'tight' : ''}"></div>
    </div>`);

  const body = pop.querySelector('.pop-body');
  const ctl = {
    el: pop,
    body,
    close: () => closePopover(),
    back: () => popBack(),
    /** Reemplaza el contenido sin cerrar (útil tras un cambio). */
    rerender: () => { body.innerHTML = ''; o.render(body, ctl); },
  };

  on(pop, 'click', '[data-pop]', (ev, b) => {
    ev.preventDefault();
    if (b.dataset.pop === 'close') closePopover();
    else popBack();
  });

  popLayer.appendChild(pop);
  o.render(body, ctl);
  place(pop, o.anchor);
  stack.push({ opts: o, el: pop });

  const first = pop.querySelector('input, textarea, [data-autofocus]');
  if (first) setTimeout(() => first.focus(), 20);

  return ctl;
}

/** Abre un popover encima del actual (con flecha de volver). */
export const popoverPush = (o) => popover({ ...o, push: true });

function popBack() {
  const top = stack.pop();
  if (top) { top.opts.onClose?.(); top.el.remove(); }
  if (!stack.length) teardown();
}

export function closePopover({ silent } = {}) {
  while (stack.length) {
    const t = stack.pop();
    if (!silent) t.opts.onClose?.();
    t.el.remove();
  }
  teardown();
}

function teardown() {
  backdrop?.remove();
  backdrop = null;
}

export const popoverOpen = () => stack.length > 0;

function place(pop, anchor) {
  const m = 8;
  const r = anchor?.getBoundingClientRect?.() ||
            { left: innerWidth / 2 - 150, right: innerWidth / 2 + 150, top: 80, bottom: 80 };
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;

  let left = r.left;
  if (left + w > innerWidth - m) left = Math.max(m, r.right - w);
  if (left < m) left = m;

  let top = r.bottom + 6;
  if (top + h > innerHeight - m) {
    const above = r.top - 6 - h;
    top = above > m ? above : Math.max(m, innerHeight - h - m);
  }
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}

/* =============================== MODAL ================================= */

let modals = [];

/**
 * Abre un modal.
 * @param {object} o
 * @param {string} [o.size] 'sm'
 * @param {(root:HTMLElement, close:Function)=>void} o.render
 * @param {Function} [o.onClose]
 * @param {string} [o.id] identifica el modal (para no duplicar)
 */
export function modal(o) {
  const back = node('<div class="modal-backdrop"></div>');
  const box = node(html`
    <div class="modal ${o.size === 'sm' ? 'sm' : ''}" role="dialog" aria-modal="true">
      <button class="modal-close" data-modal-close aria-label="Cerrar">${raw(ICON_CLOSE)}</button>
      <div class="modal-content"></div>
    </div>`);
  back.appendChild(box);
  modalLayer.appendChild(back);
  modalLayer.style.pointerEvents = 'auto';

  const entry = { back, o };
  modals.push(entry);

  const close = () => {
    const i = modals.indexOf(entry);
    if (i < 0) return;
    modals.splice(i, 1);
    back.remove();
    if (!modals.length) modalLayer.style.pointerEvents = 'none';
    o.onClose?.();
  };

  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  on(box, 'click', '[data-modal-close]', (e) => { e.preventDefault(); close(); });

  o.render(box.querySelector('.modal-content'), close);
  return { el: box, content: box.querySelector('.modal-content'), close };
}

export function closeTopModal() {
  const t = modals[modals.length - 1];
  if (!t) return false;
  modals.pop();
  t.back.remove();
  if (!modals.length) modalLayer.style.pointerEvents = 'none';
  t.o.onClose?.();
  return true;
}
export const modalOpen = () => modals.length > 0;
export const topModalId = () => modals[modals.length - 1]?.o.id || null;

/* =============================== TOAST ================================= */

export function toast(msg, kind = '', { action, onAction, ms = 4000 } = {}) {
  const t = node(html`
    <div class="toast ${kind}">
      <span>${msg}</span>
      ${action ? raw(`<button data-toast-act>${esc(action)}</button>`) : ''}
    </div>`);
  toastLayer.appendChild(t);
  const kill = () => { t.style.opacity = '0'; setTimeout(() => t.remove(), 180); };
  const timer = setTimeout(kill, ms);
  t.querySelector('[data-toast-act]')?.addEventListener('click', () => {
    clearTimeout(timer); kill(); onAction?.();
  });
  return kill;
}

/* ============================ CONFIRMACIÓN ============================= */

export function confirmar({ title, body = '', ok = 'Aceptar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      size: 'sm',
      onClose: () => { if (!done) resolve(false); },
      render: (root, close) => {
        root.innerHTML = html`
          <div class="modal-pad">
            <h2>${title}</h2>
            ${body ? raw(`<p class="muted" style="margin:0">${esc(body)}</p>`) : ''}
            <div class="modal-actions">
              <button class="btn btn-ghost" data-x="no">Cancelar</button>
              <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="si">${ok}</button>
            </div>
          </div>`;
        on(root, 'click', '[data-x]', (_, b) => {
          done = true; resolve(b.dataset.x === 'si'); close();
        });
        root.querySelector('[data-x="si"]').focus();
      },
    });
    return m;
  });
}

/** Prompt de una línea. */
export function pedirTexto({ title, label = '', value = '', ok = 'Guardar', multiline = false }) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      size: 'sm',
      onClose: () => { if (!done) resolve(null); },
      render: (root, close) => {
        root.innerHTML = html`
          <div class="modal-pad">
            <h2>${title}</h2>
            ${label ? raw(`<label class="field-label">${esc(label)}</label>`) : ''}
            ${raw(multiline
              ? `<textarea class="textarea" data-f>${esc(value)}</textarea>`
              : `<input class="input" data-f value="${esc(value)}">`)}
            <div class="modal-actions">
              <button class="btn btn-ghost" data-x="no">Cancelar</button>
              <button class="btn btn-primary" data-x="si">${ok}</button>
            </div>
          </div>`;
        const f = root.querySelector('[data-f]');
        f.focus(); f.select?.();
        const accept = () => { done = true; resolve(f.value.trim() || null); close(); };
        on(root, 'click', '[data-x]', (_, b) => {
          if (b.dataset.x === 'si') accept();
          else { done = true; resolve(null); close(); }
        });
        f.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); accept(); }
        });
      },
    });
  });
}

/* ========================= SELECTOR DE FECHA =========================== */

/**
 * Popover con calendario + hora.
 * @param {object} o
 * @param {Element} o.anchor
 * @param {string|Date|null} o.start
 * @param {string|Date|null} o.due
 * @param {(v:{start:string|null,due:string|null})=>void} o.onSave
 */
export function datePicker(o) {
  let due = parseDate(o.due);
  let start = parseDate(o.start);
  let cursor = new Date(due || start || Date.now());
  cursor.setDate(1);

  return popover({
    anchor: o.anchor,
    title: 'Fechas',
    push: o.push,
    render(body, ctl) {
      body.innerHTML = html`
        <div class="dp">
          <div class="dp-head">
            <button class="icon-btn" data-mv="-1" aria-label="Mes anterior">
              <svg viewBox="0 0 24 24"><path d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>
            </button>
            <span class="m">${mesLargo(cursor.getMonth())} ${cursor.getFullYear()}</span>
            <button class="icon-btn" data-mv="1" aria-label="Mes siguiente">
              <svg viewBox="0 0 24 24"><path d="M8.6 7.4L10 6l6 6-6 6-1.4-1.4L13.2 12z"/></svg>
            </button>
          </div>
          <div class="dp-grid">
            ${DOW.map((d) => raw(`<div class="dp-dow">${d}</div>`))}
            ${raw(dias())}
          </div>
          <label class="field-label">Inicio</label>
          <div class="dp-times">
            <input class="input" type="date" data-f="sd" value="${start ? ymd(start) : ''}">
            <input class="input" type="time" data-f="st" value="${start ? hhmm(start) : ''}">
          </div>
          <label class="field-label">Vencimiento</label>
          <div class="dp-times">
            <input class="input" type="date" data-f="dd" value="${due ? ymd(due) : ''}">
            <input class="input" type="time" data-f="dt" value="${due ? hhmm(due) : '18:00'}">
          </div>
          <div class="row" style="margin-top:16px;gap:8px">
            <button class="btn btn-primary" data-x="save" style="flex:1">Guardar</button>
            <button class="btn" data-x="clear">Quitar</button>
          </div>
        </div>`;

      on(body, 'click', '[data-mv]', (_, b) => {
        cursor.setMonth(cursor.getMonth() + Number(b.dataset.mv));
        ctl.rerender();
      });

      on(body, 'click', '.dp-d', (_, b) => {
        const d = new Date(b.dataset.d + 'T12:00:00');
        const t = body.querySelector('[data-f="dt"]').value || '18:00';
        const [hh, mm] = t.split(':');
        d.setHours(+hh, +mm, 0, 0);
        due = d;
        ctl.rerender();
      });

      on(body, 'click', '[data-x]', (_, b) => {
        if (b.dataset.x === 'clear') { o.onSave({ start: null, due: null }); ctl.close(); return; }
        const g = (k) => body.querySelector(`[data-f="${k}"]`).value;
        const mk = (d, t) => d ? new Date(`${d}T${t || '12:00'}:00`).toISOString() : null;
        o.onSave({ start: mk(g('sd'), g('st')), due: mk(g('dd'), g('dt')) });
        ctl.close();
      });
    },
  });

  function dias() {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const off = (first.getDay() + 6) % 7;               // semana arranca lunes
    const cells = [];
    const cur = new Date(first);
    cur.setDate(1 - off);
    const hoy = ymd(new Date());
    const dueY = due ? ymd(due) : null;
    for (let i = 0; i < 42; i++) {
      const k = ymd(cur);
      const cls = [
        'dp-d',
        cur.getMonth() !== cursor.getMonth() ? 'out' : '',
        k === hoy ? 'today' : '',
        k === dueY ? 'sel' : '',
      ].filter(Boolean).join(' ');
      cells.push(`<button class="${cls}" data-d="${k}">${cur.getDate()}</button>`);
      cur.setDate(cur.getDate() + 1);
      if (i >= 34 && cur.getMonth() !== cursor.getMonth() && (i + 1) % 7 === 0) break;
    }
    return cells.join('');
  }
}
