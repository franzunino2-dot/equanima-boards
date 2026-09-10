/* ==========================================================================
   activity.js — texto legible de cada entrada del registro de actividad
   ========================================================================== */

import { esc, fechaHora } from '../util.js';
import { state, nombreDe } from '../store.js';

// Siempre en tercera persona con el nombre: mezclar "Vos" con el verbo
// conjugado en tercera daba textos como "Vos quitó el vencimiento".
const quien = (a) => `<b>${esc(nombreDe(a.user_id))}</b>`;
const titulo = (a) => esc(a.data?.title || state.cards.get(a.card_id)?.title || 'una tarjeta');

const PLANTILLAS = {
  board_create:       (a) => `creó el tablero <b>${esc(a.data.title)}</b>`,
  board_rename:       (a) => `renombró el tablero a <b>${esc(a.data.a)}</b>`,
  member_add:         (a) => `agregó a <b>${esc(a.data.nombre)}</b> al tablero`,
  member_remove:      (a) => `quitó a <b>${esc(a.data.nombre)}</b> del tablero`,

  list_create:        (a) => `creó la lista <b>${esc(a.data.title)}</b>`,
  list_rename:        (a) => `renombró la lista <b>${esc(a.data.de)}</b> a <b>${esc(a.data.a)}</b>`,
  list_archive:       (a) => `archivó la lista <b>${esc(a.data.title)}</b>`,
  list_delete:        (a) => `eliminó la lista <b>${esc(a.data.title)}</b>`,
  list_archive_cards: (a) => `archivó ${a.data.n} tarjetas de <b>${esc(a.data.title)}</b>`,

  card_create:        (a) => `agregó <b>${titulo(a)}</b> a <b>${esc(a.data.list || '')}</b>`,
  card_move:          (a) => `movió <b>${titulo(a)}</b> de <b>${esc(a.data.de || '')}</b> a <b>${esc(a.data.a || '')}</b>`,
  card_archive:       (a) => `archivó <b>${titulo(a)}</b>`,
  card_restore:       (a) => `restauró <b>${titulo(a)}</b>`,
  card_delete:        (a) => `eliminó <b>${esc(a.data.title || '')}</b>`,
  card_assign:        (a) => `asignó a <b>${esc(a.data.nombre)}</b>`,
  card_unassign:      (a) => `desasignó a <b>${esc(a.data.nombre)}</b>`,
  card_due:           (a) => `puso vencimiento el <b>${esc(fechaHora(a.data.due))}</b>`,
  card_due_clear:     ()  => 'quitó el vencimiento',
  card_completar:     (a) => `completó <b>${titulo(a)}</b>`,
  card_reabrir:       (a) => `reabrió <b>${titulo(a)}</b>`,
  card_desc:          ()  => 'actualizó la descripción',

  att_add:            (a) => `adjuntó <b>${esc(a.data.name)}</b>`,
  comment:            (a) => `comentó: ${esc(a.data.body || '')}`,
};

/** Devuelve el HTML de una entrada de actividad. */
export function textoActividad(a) {
  const f = PLANTILLAS[a.type];
  const cuerpo = f ? f(a) : esc(a.type);
  return `${quien(a)} ${cuerpo}`;
}
