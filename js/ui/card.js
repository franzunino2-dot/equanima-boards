/* ==========================================================================
   card.js — modal de detalle de tarjeta
   ========================================================================== */

import {
  html, raw, esc, on, $, autogrow, md, avatarHTML, labelStyle, LABEL_COLORS,
  fechaCorta, fechaHora, haceRato, hhmm, bytes, dueState, copiar, between, CFG,
} from '../util.js';
import {
  state, bus, etiquetasDe, miembrosDe, checklistsDe, itemsDe, comentariosDe,
  adjuntosDe, actividadDe, progresoCheck, sigo, listasVisibles, tarjetasDe,
  nombreDe, perfil, perfilesUtiles,
  actualizarTarjeta, archivarTarjeta, borrarTarjeta, copiarTarjeta, moverTarjeta,
  toggleEtiqueta, toggleMiembroTarjeta, toggleSeguir, fijarFechas,
  toggleVencimientoCumplido, setCover,
  crearEtiqueta, agregarChecklist, actualizarChecklist, borrarChecklist,
  agregarItem, actualizarItem, borrarItem,
  comentar, editarComentario, borrarComentario,
  adjuntarLink, adjuntarArchivo, borrarAdjunto,
} from '../store.js';
import { api } from '../api.js';
import { ico } from './icons.js';
import {
  modal, popover, popoverPush, closePopover, toast, confirmar,
  pedirTexto, datePicker,
} from './kit.js';
import { textoActividad } from './activity.js';
import { editorEtiqueta } from './board.js';

let ref = null;        // { close, content, cardId }
let pausas = 0;
let offBus = null;

/* ============================== apertura =============================== */

export function abrirTarjeta(cardId, alCerrar) {
  if (ref?.cardId === cardId) return ref;

  const c = state.cards.get(cardId);
  if (!c) { toast('La tarjeta no existe', 'err'); alCerrar?.(); return null; }

  const m = modal({
    id: 'card:' + cardId,
    render(hostEl) { hostEl.innerHTML = '<div class="cd"></div>'; },
    onClose() {
      offBus?.(); offBus = null; ref = null; pausas = 0;
      alCerrar?.();
    },
  });

  ref = { ...m, cardId };
  pintar();

  offBus = bus.on('card', (id) => {
    if (id && id !== cardId) return;
    if (pausas > 0) return;
    if (!state.cards.get(cardId)) { m.close(); return; }
    pintar();
  });

  return ref;
}

export const tarjetaAbierta = () => ref?.cardId || null;
export const cerrarTarjeta = () => ref?.close();

function pausar() { pausas++; }
function reanudar() { pausas = Math.max(0, pausas - 1); if (!pausas) pintar(); }

/* =============================== render ================================ */

function pintar() {
  if (!ref) return;
  const c = state.cards.get(ref.cardId);
  if (!c) return;

  const lista = state.lists.get(c.list_id);
  const labels = etiquetasDe(c.id);
  const miembros = miembrosDe(c.id);
  const ds = dueState(c);
  const cover = c.cover && c.cover.value ? c.cover : null;

  const cd = ref.content.querySelector('.cd');
  const scroll = ref.content.closest('.modal-backdrop')?.scrollTop || 0;

  cd.innerHTML = html`
    ${cover ? raw(`<div class="cd-cover" style="${
      cover.type === 'image' ? `background-image:url('${esc(cover.value)}')`
                             : `background:var(--l-${esc(cover.value)})`}"></div>`) : ''}

    <div class="cd-head">
      ${raw(ico('board'))}
      <div>
        <div class="cd-title" data-a="rename">${c.title}</div>
        <div class="cd-crumb">
          <span class="num">#${c.number}</span> en la lista
          <b data-a="move" style="cursor:pointer;text-decoration:underline">${lista?.title || '—'}</b>
          ${c.is_archived ? raw(' · <b style="color:var(--red)">Archivada</b>') : ''}
        </div>
      </div>
    </div>

    <div class="cd-grid">
      <div class="cd-main">
        <div class="cd-metas">
          ${miembros.length ? raw(`
            <div class="cd-meta">
              <h5>Miembros</h5>
              <div class="row-wrap">
                ${miembros.map((m) => `<span data-a="member-menu" style="cursor:pointer">${avatarHTML(m)}</span>`).join('')}
                <button class="add-chip" data-a="member-menu" aria-label="Agregar miembro">${ico('plus')}</button>
              </div>
            </div>`) : ''}

          ${labels.length ? raw(`
            <div class="cd-meta">
              <h5>Etiquetas</h5>
              <div class="row-wrap">
                ${labels.map((l) => `<span class="label-chip tall" style="${labelStyle(l.color)}"
                    data-a="labels">${esc(l.name || l.color)}</span>`).join('')}
                <button class="add-chip" data-a="labels" aria-label="Agregar etiqueta">${ico('plus')}</button>
              </div>
            </div>`) : ''}

          ${c.due_at || c.start_at ? raw(`
            <div class="cd-meta">
              <h5>${c.start_at && c.due_at ? 'Fechas' : c.due_at ? 'Vencimiento' : 'Inicio'}</h5>
              <div class="due-pill" data-a="dates">
                ${c.due_at ? `<input type="checkbox" data-a="due-done" ${c.due_complete ? 'checked' : ''}
                    title="Marcar como cumplida">` : ''}
                <span>${c.start_at ? esc(fechaCorta(c.start_at)) + ' → ' : ''}${esc(c.due_at ? fechaHora(c.due_at) : '')}</span>
                ${ds === 'late' ? '<span class="tag late">Vencida</span>' : ''}
                ${ds === 'soon' ? '<span class="tag soon">Pronto</span>' : ''}
                ${ds === 'done' ? '<span class="tag done">Lista</span>' : ''}
              </div>
            </div>`) : ''}
        </div>

        <!-- Descripción -->
        <div class="cd-sec">
          <div class="cd-sec-head">
            ${raw(ico('desc'))}<h4>Descripción</h4>
            ${c.description ? raw('<button class="btn btn-sm" data-a="desc-edit">Editar</button>') : ''}
          </div>
          <div data-slot="desc">
            ${c.description
              ? raw(`<div class="desc-view md" data-a="desc-edit">${md(c.description)}</div>`)
              : raw('<div class="desc-view empty" data-a="desc-edit">Agregá una descripción más detallada…</div>')}
          </div>
        </div>

        <!-- Checklists -->
        <div data-slot="checks">${raw(checklistsHTML(c))}</div>

        <!-- Adjuntos -->
        ${raw(adjuntosHTML(c))}

        <!-- Comentarios y actividad -->
        <div class="cd-sec">
          <div class="cd-sec-head">
            ${raw(ico('comment'))}<h4>Comentarios y actividad</h4>
          </div>
          <div class="cmt-new">
            ${raw(avatarHTML(state.me))}
            <div>
              <textarea data-cmt placeholder="Escribí un comentario…" rows="1"></textarea>
              <div class="composer-actions" data-cmt-actions hidden>
                <button class="btn btn-primary btn-sm" data-a="cmt-save">Comentar</button>
                <span class="small muted">Ctrl+Enter para enviar</span>
              </div>
            </div>
          </div>
          ${raw(feedHTML(c))}
        </div>
      </div>

      <!-- Columna lateral -->
      <div>
        <div class="cd-side">
          <h5>Añadir a la tarjeta</h5>
          <button class="side-btn" data-a="member-menu">${raw(ico('user'))} Miembros</button>
          <button class="side-btn" data-a="labels">${raw(ico('tag'))} Etiquetas</button>
          <button class="side-btn" data-a="checklist">${raw(ico('checklist'))} Checklist</button>
          <button class="side-btn" data-a="dates">${raw(ico('clock'))} Fechas</button>
          <button class="side-btn" data-a="attach">${raw(ico('attach'))} Adjunto</button>
          <button class="side-btn" data-a="cover">${raw(ico('image'))} Portada</button>
        </div>

        <div class="cd-side">
          <h5>Acciones</h5>
          <button class="side-btn" data-a="move">${raw(ico('move'))} Mover</button>
          <button class="side-btn" data-a="copy">${raw(ico('copy'))} Copiar</button>
          <button class="side-btn ${sigo(c.id) ? 'on' : ''}" data-a="watch">
            ${raw(ico('eye'))} ${sigo(c.id) ? 'Siguiendo' : 'Seguir'}</button>
          <button class="side-btn" data-a="link">${raw(ico('link'))} Copiar link</button>
          ${c.is_archived
            ? raw(`<button class="side-btn" data-a="unarchive">${ico('restore')} Restaurar</button>`)
            : raw(`<button class="side-btn" data-a="archive">${ico('archive')} Archivar</button>`)}
          <button class="side-btn" data-a="delete">${raw(ico('trash'))} Eliminar</button>
        </div>
      </div>
    </div>`;

  const back = ref.content.closest('.modal-backdrop');
  if (back) back.scrollTop = scroll;

  conectar(c);
}

/* ---------------------------- sub-render HTML --------------------------- */

function checklistsHTML(c) {
  const ks = checklistsDe(c.id);
  if (!ks.length) return '';
  return ks.map((k) => {
    const its = itemsDe(k.id);
    const hechos = its.filter((i) => i.is_done).length;
    const pct = its.length ? Math.round(hechos / its.length * 100) : 0;
    return html`
      <div class="cd-sec">
        <div class="cd-sec-head">
          ${raw(ico('checklist'))}
          <h4 class="t" data-a="chk-rename" data-k="${k.id}">${k.title}</h4>
          <button class="btn btn-sm" data-a="chk-hide" data-k="${k.id}">
            ${hechos ? raw(`${hechos} de ${its.length}`) : 'vacío'}</button>
          <button class="btn btn-sm" data-a="chk-del" data-k="${k.id}">Eliminar</button>
        </div>
        <div class="chk">
          <div class="chk-bar">
            <span class="chk-pct">${pct}%</span>
            <span class="chk-track"><i class="${pct === 100 ? 'full' : ''}" style="width:${pct}%"></i></span>
          </div>
          ${raw(its.map((i) => `
            <div class="chk-item ${i.is_done ? 'done' : ''}" data-i="${i.id}">
              <input type="checkbox" ${i.is_done ? 'checked' : ''} data-a="item-toggle" data-i="${i.id}">
              <span class="txt" data-a="item-edit" data-i="${i.id}">${esc(i.text)}</span>
              <button class="icon-btn del" data-a="item-del" data-i="${i.id}" aria-label="Borrar">${ico('close')}</button>
            </div>`).join(''))}
          <button class="list-add" data-a="item-add" data-k="${k.id}" style="margin-top:4px">
            ${raw(ico('plus'))} Añadir un elemento
          </button>
        </div>
      </div>`;
  }).join('');
}

function adjuntosHTML(c) {
  const as = adjuntosDe(c.id);
  if (!as.length) return '';
  return html`
    <div class="cd-sec">
      <div class="cd-sec-head">${raw(ico('attach'))}<h4>Adjuntos</h4>
        <button class="btn btn-sm" data-a="attach">Agregar</button></div>
      ${raw(as.map((a) => {
        const img = (a.mime || '').startsWith('image/');
        const ext = (a.name.split('.').pop() || 'link').slice(0, 5);
        return `
        <div class="att" data-att="${a.id}">
          <span class="att-thumb" data-thumb="${a.id}"
                data-path="${esc(a.storage_path || '')}" data-url="${esc(a.url || '')}"
                data-img="${img ? '1' : ''}">${img ? '' : esc(a.kind === 'link' ? 'LINK' : ext.toUpperCase())}</span>
          <span class="att-info">
            <span class="att-name">${esc(a.name)}</span>
            <span class="att-sub">
              ${esc(haceRato(a.created_at))}${a.size_bytes ? ' · ' + esc(bytes(a.size_bytes)) : ''}
              · <button data-a="att-open" data-att="${a.id}">Abrir</button>
              ${img ? `· <button data-a="att-cover" data-att="${a.id}">Portada</button>` : ''}
              · <button data-a="att-del" data-att="${a.id}">Borrar</button>
            </span>
          </span>
        </div>`;
      }).join(''))}
    </div>`;
}

function feedHTML(c) {
  const cms = comentariosDe(c.id);
  const acts = actividadDe(c.id);
  const items = [
    ...cms.map((x) => ({ t: x.created_at, kind: 'cmt', x })),
    ...acts.map((x) => ({ t: x.created_at, kind: 'act', x })),
  ].sort((a, b) => (b.t || '').localeCompare(a.t || ''));

  if (!items.length) return '<p class="small muted" style="margin-left:38px">Sin actividad todavía.</p>';

  return items.slice(0, 60).map(({ kind, x }) => {
    const p = perfil(x.user_id) || { full_name: 'Alguien', initials: '?' };
    if (kind === 'cmt') {
      const mio = x.user_id === state.me.id;
      return html`
        <div class="feed-item" data-cmt-id="${x.id}">
          ${raw(avatarHTML(p))}
          <div>
            <div class="feed-who"><b>${p.full_name || p.email}</b>
              <span class="feed-when">${haceRato(x.created_at)}${
                x.updated_at && x.updated_at !== x.created_at ? raw(' · editado') : ''}</span></div>
            <div class="cmt-body md">${raw(md(x.body))}</div>
            ${mio ? raw(`<div class="cmt-tools">
              <button data-a="cmt-edit" data-c="${x.id}">Editar</button>
              <button data-a="cmt-del" data-c="${x.id}">Borrar</button>
            </div>`) : ''}
          </div>
        </div>`;
    }
    return html`
      <div class="feed-item">
        ${raw(avatarHTML(p, 'avatar-sm'))}
        <div>
          <div class="feed-act">${raw(textoActividad(x))}</div>
          <div class="feed-when">${haceRato(x.created_at)}</div>
        </div>
      </div>`;
  }).join('');
}

/* ============================== eventos ================================ */

function conectar(c) {
  const root = ref.content;

  // Miniaturas de adjuntos (URLs firmadas)
  root.querySelectorAll('[data-thumb]').forEach(async (el) => {
    if (!el.dataset.img) return;
    const url = await api.signedUrl(el.dataset.path || null, el.dataset.url || null);
    if (url) el.style.backgroundImage = `url('${url}')`;
  });

  // Comentario
  const ta = root.querySelector('[data-cmt]');
  const acts = root.querySelector('[data-cmt-actions]');
  if (ta) {
    autogrow(ta);
    ta.addEventListener('focus', () => { acts.hidden = false; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviarComentario(); }
    });
  }
  async function enviarComentario() {
    const v = ta.value.trim();
    if (!v) return;
    ta.value = ''; acts.hidden = true;
    await comentar(c.id, v);
  }

  on(root, 'click', '[data-a]', async (ev, b) => {
    const a = b.dataset.a;
    ev.stopPropagation();

    switch (a) {
      case 'rename':      return editarTitulo(b, c.id);
      case 'desc-edit':   return editarDescripcion(c.id);
      case 'labels':      return menuEtiquetasDeTarjeta(b, c.id);
      case 'member-menu': return menuMiembrosDeTarjeta(b, c.id);
      case 'dates':       return menuFechas(b, c.id);
      case 'checklist':   return nuevoChecklist(b, c.id);
      case 'attach':      return menuAdjuntar(b, c.id);
      case 'cover':       return menuPortada(b, c.id);
      case 'move':        return menuMover(b, c.id);
      case 'copy':        return dialogoCopiar(c.id);
      case 'watch':       return toggleSeguir(c.id);
      case 'cmt-save':    return enviarComentario();

      case 'due-done':    return toggleVencimientoCumplido(c.id);

      case 'link': {
        await copiar(location.origin + location.pathname + `#/b/${state.boardId}/c/${c.id}`);
        return toast('Link de la tarjeta copiado', 'ok');
      }
      case 'archive':   await archivarTarjeta(c.id, true);  return toast('Tarjeta archivada', 'ok');
      case 'unarchive': return archivarTarjeta(c.id, false);
      case 'delete': {
        if (await confirmar({
          title: '¿Eliminar la tarjeta?',
          body: 'Se borran sus comentarios, checklists y adjuntos. No se puede deshacer.',
          ok: 'Eliminar', danger: true,
        })) { ref.close(); await borrarTarjeta(c.id); }
        return;
      }

      /* --- checklists --- */
      case 'chk-rename': {
        const k = state.checklists.get(b.dataset.k);
        const v = await pedirTexto({ title: 'Renombrar checklist', value: k.title });
        if (v) await actualizarChecklist(k.id, { title: v });
        return;
      }
      case 'chk-del': {
        if (await confirmar({ title: '¿Eliminar el checklist?', ok: 'Eliminar', danger: true })) {
          await borrarChecklist(b.dataset.k);
        }
        return;
      }
      case 'item-add':    return agregarItemInline(b, b.dataset.k);
      case 'item-toggle': return actualizarItem(b.dataset.i, { is_done: b.checked });
      case 'item-edit':   return editarItem(b, b.dataset.i);
      case 'item-del':    return borrarItem(b.dataset.i);

      /* --- adjuntos --- */
      case 'att-open': {
        const at = state.attachments.get(b.dataset.att);
        const url = await api.signedUrl(at.storage_path, at.url);
        if (url) open(url, '_blank', 'noopener');
        else toast('No se pudo abrir el adjunto', 'err');
        return;
      }
      case 'att-cover': {
        const at = state.attachments.get(b.dataset.att);
        const url = await api.signedUrl(at.storage_path, at.url);
        if (url) await setCover(c.id, { type: 'image', value: url, size: 'tall' });
        return;
      }
      case 'att-del': {
        if (await confirmar({ title: '¿Borrar el adjunto?', ok: 'Borrar', danger: true })) {
          await borrarAdjunto(b.dataset.att);
        }
        return;
      }

      /* --- comentarios --- */
      case 'cmt-edit':  return editarComentarioInline(b.dataset.c);
      case 'cmt-del': {
        if (await confirmar({ title: '¿Borrar el comentario?', ok: 'Borrar', danger: true })) {
          await borrarComentario(b.dataset.c);
        }
        return;
      }
    }
  });
}

/* ========================== editores inline ============================ */

function editarTitulo(el, cardId) {
  pausar();
  const c = state.cards.get(cardId);
  const ta = document.createElement('textarea');
  ta.className = 'cd-title-input';
  ta.rows = 1;
  ta.value = c.title;
  el.replaceWith(ta);
  autogrow(ta); ta.focus(); ta.select();

  const fin = async (guardar) => {
    const v = ta.value.trim();
    if (guardar && v && v !== c.title) await actualizarTarjeta(cardId, { title: v });
    reanudar();
  };
  ta.addEventListener('blur', () => fin(true));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { ta.value = c.title; ta.blur(); }
  });
}

function editarDescripcion(cardId) {
  pausar();
  const c = state.cards.get(cardId);
  const slot = ref.content.querySelector('[data-slot="desc"]');
  slot.innerHTML = html`
    <div class="desc-edit">
      <textarea placeholder="Podés usar **negrita**, listas con - y links">${c.description || ''}</textarea>
      <div class="composer-actions">
        <button class="btn btn-primary btn-sm" data-d="save">Guardar</button>
        <button class="btn btn-sm" data-d="cancel">Cancelar</button>
        <span class="md-hint">Markdown soportado · Ctrl+Enter para guardar</span>
      </div>
    </div>`;

  const ta = slot.querySelector('textarea');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const guardar = async () => {
    const v = ta.value;
    if (v !== (c.description || '')) {
      await actualizarTarjeta(cardId, { description: v }, { logType: 'card_desc' });
    }
    reanudar();
  };
  on(slot, 'click', '[data-d]', (e, b) => {
    e.preventDefault();
    if (b.dataset.d === 'save') guardar(); else reanudar();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); guardar(); }
    if (e.key === 'Escape') reanudar();
  });
}

function agregarItemInline(btn, checklistId) {
  pausar();
  const box = document.createElement('div');
  box.className = 'composer';
  box.style.padding = '0';
  box.innerHTML = `
    <textarea rows="2" placeholder="Agregar un elemento (Enter para guardar)"></textarea>
    <div class="composer-actions">
      <button class="btn btn-primary btn-sm" data-k="add">Añadir</button>
      <button class="btn btn-sm" data-k="cancel">Cancelar</button>
    </div>`;
  btn.replaceWith(box);
  const ta = box.querySelector('textarea');
  autogrow(ta); ta.focus();

  const agregar = async () => {
    const v = ta.value.trim();
    if (!v) return;
    ta.value = ''; ta.style.height = 'auto';
    for (const linea of v.split('\n').map((s) => s.trim()).filter(Boolean)) {
      await agregarItem(checklistId, linea);
    }
    // Deja el campo abierto para seguir cargando
    const cont = box.parentElement;
    reanudar();
    setTimeout(() => {
      const nuevo = ref?.content.querySelector(`[data-a="item-add"][data-k="${checklistId}"]`);
      nuevo && agregarItemInline(nuevo, checklistId);
    }, 30);
    void cont;
  };

  on(box, 'click', '[data-k]', (e, b) => {
    e.preventDefault();
    if (b.dataset.k === 'add') agregar(); else reanudar();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregar(); }
    if (e.key === 'Escape') reanudar();
  });
}

function editarItem(el, itemId) {
  pausar();
  const it = state.items.get(itemId);
  const cont = el.closest('.chk-item');
  const ta = document.createElement('textarea');
  ta.value = it.text;
  el.replaceWith(ta);
  autogrow(ta); ta.focus(); ta.select();

  const fin = async (guardar) => {
    const v = ta.value.trim();
    if (guardar && v && v !== it.text) await actualizarItem(itemId, { text: v });
    reanudar();
  };
  ta.addEventListener('blur', () => fin(true));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { ta.value = it.text; ta.blur(); }
  });
  void cont;
}

function editarComentarioInline(id) {
  pausar();
  const cm = state.comments.get(id);
  const item = ref.content.querySelector(`[data-cmt-id="${id}"] .cmt-body`);
  const ta = document.createElement('textarea');
  ta.style.cssText = 'width:100%;min-height:70px;border:0;outline:2px solid var(--brand-500);border-radius:8px;padding:9px 12px;background:var(--surface);color:var(--text);font-family:inherit;font-size:13.5px';
  ta.value = cm.body;
  item.replaceWith(ta);
  ta.focus();

  const fin = async (guardar) => {
    const v = ta.value.trim();
    if (guardar && v && v !== cm.body) await editarComentario(id, v);
    reanudar();
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fin(true); }
    if (e.key === 'Escape') fin(false);
  });
  ta.addEventListener('blur', () => fin(true));
}

/* ============================== popovers =============================== */

/** Popover de etiquetas de una tarjeta (lo usa también la edición rápida). */
export function menuEtiquetasDeTarjeta(anchor, cardId) {
  popover({
    anchor, title: 'Etiquetas',
    render(body, ctl) {
      const puestas = new Set(etiquetasDe(cardId).map((l) => l.id));
      body.innerHTML = html`
        ${raw([...state.labels.values()].map((l) => `
          <div class="lbl-row">
            <span class="chk">${puestas.has(l.id) ? ico('check') : ''}</span>
            <div class="bar" style="${labelStyle(l.color)}" data-t="${l.id}">${esc(l.name || '')}</div>
            <button class="icon-btn" data-e="${l.id}" aria-label="Editar">${ico('pencil')}</button>
          </div>`).join(''))}
        <button class="btn btn-block" data-new style="margin-top:10px">Crear etiqueta nueva</button>`;

      on(body, 'click', '[data-t]', async (_, b) => {
        await toggleEtiqueta(cardId, b.dataset.t);
        ctl.rerender();
      });
      on(body, 'click', '[data-e]', (_, b) => {
        editorEtiqueta(b, b.dataset.e, () => ctl.rerender());
      });
      body.querySelector('[data-new]').addEventListener('click', async () => {
        const l = await crearEtiqueta({
          name: '', color: LABEL_COLORS[state.labels.size % LABEL_COLORS.length],
        });
        ctl.rerender();
        const el = body.querySelector(`[data-e="${l.id}"]`);
        el && editorEtiqueta(el, l.id, () => ctl.rerender());
      });
    },
  });
}

function menuMiembrosDeTarjeta(anchor, cardId) {
  popover({
    anchor, title: 'Miembros',
    render(body, ctl) {
      const puestos = new Set(miembrosDe(cardId).map((m) => m.user_id));
      const equipo = perfilesUtiles();
      body.innerHTML = html`
        <label class="field-label">Del tablero</label>
        ${raw(state.members.map((m) => fila(m.user_id, m)).join(''))}
        ${equipo.some((p) => !state.members.some((m) => m.user_id === p.id)) ? raw(`
          <label class="field-label">Del equipo</label>
          ${equipo.filter((p) => !state.members.some((m) => m.user_id === p.id))
                  .map((p) => fila(p.id, p)).join('')}`) : ''}`;

      function fila(id, p) {
        return `<button class="menu-item" data-u="${id}">
            ${avatarHTML(p, 'avatar-sm')}
            <span style="flex:1">${esc(p.full_name || p.email)}${id === state.me.id ? ' (yo)' : ''}</span>
            ${puestos.has(id) ? ico('check') : ''}
          </button>`;
      }

      on(body, 'click', '[data-u]', async (_, b) => {
        await toggleMiembroTarjeta(cardId, b.dataset.u);
        ctl.rerender();
      });
    },
  });
}

function menuFechas(anchor, cardId) {
  const c = state.cards.get(cardId);
  datePicker({
    anchor, start: c.start_at, due: c.due_at,
    onSave: ({ start, due }) => fijarFechas(cardId, { start, due }),
  });
}

async function nuevoChecklist(anchor, cardId) {
  const v = await pedirTexto({ title: 'Agregar checklist', label: 'Título', value: 'Checklist' });
  if (v) await agregarChecklist(cardId, v);
}

function menuAdjuntar(anchor, cardId) {
  popover({
    anchor, title: 'Adjuntar',
    render(body, ctl) {
      body.innerHTML = html`
        <button class="btn btn-block" data-x="file">Subir un archivo</button>
        <input type="file" data-file hidden>
        <label class="field-label">O pegar un link</label>
        <input class="input" data-url placeholder="https://…">
        <label class="field-label">Nombre (opcional)</label>
        <input class="input" data-name placeholder="Cómo se muestra">
        <button class="btn btn-primary btn-block" data-x="link" style="margin-top:14px">Adjuntar link</button>
        <p class="small muted" style="margin:10px 0 0">
          Máximo ${CFG.MAX_ATTACHMENT_MB || 25} MB por archivo.
          ${state.mode === 'demo' ? raw('<br>En modo demo los archivos quedan solo en este browser.') : ''}
        </p>`;

      const file = body.querySelector('[data-file]');
      body.querySelector('[data-x="file"]').addEventListener('click', () => file.click());

      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        ctl.close();
        const kill = toast(`Subiendo ${f.name}…`, '', { ms: 60000 });
        try { await adjuntarArchivo(cardId, f); kill(); toast('Adjunto subido', 'ok'); }
        catch (e) { kill(); toast(e.message || 'No se pudo subir', 'err'); }
      });

      body.querySelector('[data-x="link"]').addEventListener('click', async () => {
        const url = body.querySelector('[data-url]').value.trim();
        if (!/^https?:\/\//i.test(url)) return toast('El link tiene que empezar con http', 'err');
        const nombre = body.querySelector('[data-name]').value.trim();
        ctl.close();
        await adjuntarLink(cardId, url, nombre || url);
      });
    },
  });
}

function menuPortada(anchor, cardId) {
  const c = state.cards.get(cardId);
  popover({
    anchor, title: 'Portada',
    render(body, ctl) {
      const actual = c.cover?.value;
      body.innerHTML = html`
        <label class="field-label">Color</label>
        <div class="color-grid">
          ${raw(LABEL_COLORS.map((col) => `
            <button data-c="${col}" class="${actual === col ? 'on' : ''}"
                    style="${labelStyle(col)}" aria-label="${col}"></button>`).join(''))}
        </div>
        ${c.cover?.type === 'image' ? raw(`
          <label class="field-label">Tamaño</label>
          <div class="row" style="gap:8px">
            <button class="btn btn-sm" data-sz="short" style="flex:1">Chica</button>
            <button class="btn btn-sm" data-sz="tall" style="flex:1">Grande</button>
          </div>`) : ''}
        <button class="btn btn-block" data-x="none" style="margin-top:14px">Quitar portada</button>`;

      on(body, 'click', '[data-c]', async (_, b) => {
        await setCover(cardId, { type: 'color', value: b.dataset.c });
        ctl.close();
      });
      on(body, 'click', '[data-sz]', async (_, b) => {
        await setCover(cardId, { ...c.cover, size: b.dataset.sz });
        ctl.close();
      });
      body.querySelector('[data-x="none"]').addEventListener('click', async () => {
        await setCover(cardId, null); ctl.close();
      });
    },
  });
}

function menuMover(anchor, cardId) {
  const c = state.cards.get(cardId);
  popover({
    anchor, title: 'Mover tarjeta',
    render(body, ctl) {
      const listas = listasVisibles();
      body.innerHTML = html`
        <label class="field-label">Lista</label>
        <select class="input" data-l>
          ${raw(listas.map((l) => `<option value="${l.id}" ${l.id === c.list_id ? 'selected' : ''}>${esc(l.title)}</option>`).join(''))}
        </select>
        <label class="field-label">Posición</label>
        <select class="input" data-p></select>
        <button class="btn btn-primary btn-block" data-x style="margin-top:14px">Mover</button>`;

      const selL = body.querySelector('[data-l]');
      const selP = body.querySelector('[data-p]');

      const llenarPos = () => {
        const cs = tarjetasDe(selL.value, { conFiltro: false }).filter((x) => x.id !== cardId);
        selP.innerHTML = Array.from({ length: cs.length + 1 }, (_, i) =>
          `<option value="${i}">${i + 1}</option>`).join('');
        const actual = cs.findIndex((x) => x.position > c.position);
        selP.value = String(actual === -1 ? cs.length : actual);
      };
      llenarPos();
      selL.addEventListener('change', llenarPos);

      body.querySelector('[data-x]').addEventListener('click', async () => {
        const listId = selL.value;
        const i = Number(selP.value);
        const cs = tarjetasDe(listId, { conFiltro: false }).filter((x) => x.id !== cardId);
        const pos = between(cs[i - 1]?.position ?? null, cs[i]?.position ?? null);
        ctl.close();
        await moverTarjeta(cardId, listId, pos);
      });
    },
  });
}

function dialogoCopiar(cardId) {
  const c = state.cards.get(cardId);
  modal({
    size: 'sm',
    render(hostEl, close) {
      hostEl.innerHTML = html`
        <div class="modal-pad">
          <h2>Copiar tarjeta</h2>
          <label class="field-label">Título</label>
          <textarea class="textarea" data-t rows="2">${c.title}</textarea>
          <label class="field-label">Lista de destino</label>
          <select class="input" data-l>
            ${raw(listasVisibles().map((l) => `
              <option value="${l.id}" ${l.id === c.list_id ? 'selected' : ''}>${esc(l.title)}</option>`).join(''))}
          </select>
          <label class="field-label">Copiar también</label>
          <label class="checkbox" style="display:flex;margin-bottom:5px"><input type="checkbox" data-k checked> Checklists</label>
          <label class="checkbox" style="display:flex;margin-bottom:5px"><input type="checkbox" data-e checked> Etiquetas</label>
          <label class="checkbox" style="display:flex"><input type="checkbox" data-m checked> Miembros</label>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-x="no">Cancelar</button>
            <button class="btn btn-primary" data-x="si">Crear copia</button>
          </div>
        </div>`;

      on(hostEl, 'click', '[data-x]', async (_, b) => {
        if (b.dataset.x === 'no') return close();
        const nueva = await copiarTarjeta(cardId, {
          title: hostEl.querySelector('[data-t]').value.trim() || c.title,
          listId: hostEl.querySelector('[data-l]').value,
          copiarChecks: hostEl.querySelector('[data-k]').checked,
          copiarEtiquetas: hostEl.querySelector('[data-e]').checked,
          copiarMiembros: hostEl.querySelector('[data-m]').checked,
        });
        close();
        if (nueva) toast('Copia creada', 'ok');
      });
    },
  });
}
