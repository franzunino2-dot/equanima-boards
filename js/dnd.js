/* ==========================================================================
   dnd.js — arrastrar y soltar tarjetas y listas
   --------------------------------------------------------------------------
   Implementación propia sobre Pointer Events (no HTML5 drag&drop) para que
   funcione igual con mouse y con touch:
     * mouse: arranca a los 5 px de movimiento
     * touch: arranca con un toque sostenido de 200 ms, así el scroll sigue vivo
   El elemento original se queda en su lugar como hueco (.placeholder) y se
   mueve por el DOM para previsualizar el destino; al soltar se calcula la
   posición fraccionaria entre los vecinos.
   ========================================================================== */

import { between } from './util.js';

const UMBRAL_MOUSE = 5;
const HOLD_TOUCH = 200;
const BORDE = 60;          // zona de autoscroll
const VEL = 16;

let drag = null;           // estado del arrastre en curso
let candidato = null;      // gesto todavía sin confirmar

export const arrastrando = () => Boolean(drag);

// Los listeners globales se registran una sola vez: el canvas se recrea en
// cada render y volver a suscribirlos duplicaría el procesamiento del gesto.
addEventListener('pointermove', mover, { passive: false });
addEventListener('pointerup', soltar);
addEventListener('pointercancel', cancelar);

/**
 * @param {HTMLElement} canvas contenedor con scroll horizontal
 * @param {object} cb
 * @param {(cardId:string, listId:string, position:number)=>void} cb.onCardDrop
 * @param {(listId:string, position:number)=>void} cb.onListDrop
 */
export function initDnD(canvas, cb) {
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;

    // No arrastrar desde controles ni mientras se edita
    if (ev.target.closest('input, textarea, button, a, .composer, [data-nodrag]')) return;

    const card = ev.target.closest('.card');
    const listHead = ev.target.closest('.list-head');

    let tipo = null; let el = null;
    if (card && canvas.contains(card)) { tipo = 'card'; el = card; }
    else if (listHead && canvas.contains(listHead)) { tipo = 'list'; el = listHead.closest('.list'); }
    if (!el) return;

    candidato = {
      tipo, el, canvas, cb,
      x0: ev.clientX, y0: ev.clientY,
      pointerId: ev.pointerId,
      touch: ev.pointerType === 'touch',
      timer: null,
      movio: false,
    };

    if (candidato.touch) {
      candidato.timer = setTimeout(() => {
        if (candidato && !candidato.movio) iniciar(candidato, candidato.x0, candidato.y0);
      }, HOLD_TOUCH);
    }
  });
}

/* ------------------------------ arranque -------------------------------- */

function iniciar(c, x, y) {
  const r = c.el.getBoundingClientRect();

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = r.width + 'px';
  const copia = c.el.cloneNode(true);
  copia.classList.remove('placeholder');
  if (c.tipo === 'list') copia.style.maxHeight = Math.min(r.height, 520) + 'px';
  ghost.appendChild(copia);
  document.getElementById('drag-layer').appendChild(ghost);

  drag = {
    ...c,
    ghost,
    dx: x - r.left,
    dy: y - r.top,
    alto: r.height,
    ancho: r.width,
    origen: {
      listId: c.el.dataset.list || c.el.closest('.list')?.dataset.list,
      next: c.el.nextElementSibling,
      parent: c.el.parentElement,
    },
  };

  c.el.classList.add('placeholder');
  if (c.tipo === 'card') c.el.style.height = r.height + 'px';
  document.body.classList.add('dragging');
  candidato = null;
  posicionarGhost(x, y);
}

function posicionarGhost(x, y) {
  drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(3deg)`;
}

/* ------------------------------ movimiento ------------------------------ */

function mover(ev) {
  if (candidato && !drag) {
    const d = Math.hypot(ev.clientX - candidato.x0, ev.clientY - candidato.y0);
    if (candidato.touch) {
      // Si se mueve antes del hold, es scroll: se abandona el gesto
      if (d > 8) { clearTimeout(candidato.timer); candidato.movio = true; candidato = null; }
      return;
    }
    if (d > UMBRAL_MOUSE) iniciar(candidato, ev.clientX, ev.clientY);
    return;
  }
  if (!drag) return;

  ev.preventDefault();
  posicionarGhost(ev.clientX, ev.clientY);
  autoscroll(ev.clientX, ev.clientY);

  if (drag.tipo === 'card') ubicarTarjeta(ev.clientX, ev.clientY);
  else ubicarLista(ev.clientX);
}

function ubicarTarjeta(x, y) {
  const cont = contenedorTarjetas(x, y);
  if (!cont) return;

  const hijos = [...cont.children].filter((n) => n.classList.contains('card') && n !== drag.el);
  let ref = null;
  for (const n of hijos) {
    const r = n.getBoundingClientRect();
    if (y < r.top + r.height / 2) { ref = n; break; }
  }
  if (ref) cont.insertBefore(drag.el, ref);
  else cont.appendChild(drag.el);
}

/** Busca el .list-cards bajo el puntero; si no hay, el más cercano en X. */
function contenedorTarjetas(x, y) {
  const conts = [...drag.canvas.querySelectorAll('.list:not(.collapsed) .list-cards')];
  let mejor = null; let mejorD = Infinity;

  for (const c of conts) {
    const r = c.getBoundingClientRect();
    const lista = c.closest('.list').getBoundingClientRect();
    if (x >= lista.left && x <= lista.right) {
      // Dentro de la columna: aceptar aunque el puntero esté sobre el pie
      if (y >= r.top - 40 && y <= r.bottom + 60) return c;
      mejor = c; mejorD = 0;
      continue;
    }
    const d = x < lista.left ? lista.left - x : x - lista.right;
    if (d < mejorD) { mejorD = d; mejor = c; }
  }
  return mejor;
}

function ubicarLista(x) {
  const cont = drag.canvas;
  const listas = [...cont.children].filter((n) => n.classList.contains('list') && n !== drag.el);
  let ref = null;
  for (const n of listas) {
    const r = n.getBoundingClientRect();
    if (x < r.left + r.width / 2) { ref = n; break; }
  }
  const addList = cont.querySelector('.add-list');
  if (ref) cont.insertBefore(drag.el, ref);
  else cont.insertBefore(drag.el, addList || null);
}

function autoscroll(x, y) {
  const c = drag.canvas;
  const r = c.getBoundingClientRect();
  if (x < r.left + BORDE) c.scrollLeft -= VEL;
  else if (x > r.right - BORDE) c.scrollLeft += VEL;

  if (drag.tipo === 'card') {
    const cont = drag.el.parentElement;
    if (cont?.classList.contains('list-cards')) {
      const cr = cont.getBoundingClientRect();
      if (y < cr.top + 40) cont.scrollTop -= VEL;
      else if (y > cr.bottom - 40) cont.scrollTop += VEL;
    }
  }
}

/* -------------------------------- soltar -------------------------------- */

function soltar() {
  if (candidato) { clearTimeout(candidato.timer); candidato = null; }
  if (!drag) return;

  const { tipo, el, cb } = drag;
  const id = el.dataset.card || el.dataset.list;

  let resultado = null;
  if (tipo === 'card') {
    const cont = el.parentElement;
    const listId = cont?.closest('.list')?.dataset.list;
    if (listId) {
      const { prev, next } = vecinos(el, '.card');
      resultado = () => cb.onCardDrop(id, listId, between(pos(prev), pos(next)));
    }
  } else {
    const { prev, next } = vecinos(el, '.list');
    resultado = () => cb.onListDrop(id, between(pos(prev), pos(next)));
  }

  limpiar();
  resultado?.();
}

function vecinos(el, sel) {
  let prev = el.previousElementSibling;
  while (prev && !prev.matches(sel)) prev = prev.previousElementSibling;
  let next = el.nextElementSibling;
  while (next && !next.matches(sel)) next = next.nextElementSibling;
  return { prev, next };
}

const pos = (n) => (n ? Number(n.dataset.pos) : null);

function cancelar() {
  if (candidato) { clearTimeout(candidato.timer); candidato = null; }
  if (!drag) return;
  const { origen, el } = drag;
  // Devolver el elemento a su lugar original
  if (origen.parent) origen.parent.insertBefore(el, origen.next);
  limpiar();
}

function limpiar() {
  if (!drag) return;
  drag.ghost.remove();
  drag.el.classList.remove('placeholder');
  drag.el.style.height = '';
  document.body.classList.remove('dragging');
  drag = null;
}
