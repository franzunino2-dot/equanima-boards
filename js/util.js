/* ==========================================================================
   util.js — helpers de DOM, fechas, posiciones fraccionarias y markdown
   ========================================================================== */

export const CFG = window.EQ_CONFIG || {};

/* ----------------------------- DOM ------------------------------------- */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escapa texto para interpolar en HTML. */
export function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Marca un string como HTML ya seguro para que `html` no lo escape. */
export function raw(s) { return { __raw: String(s ?? '') }; }

/**
 * Template tag que escapa todo lo interpolado.
 * Arrays se unen sin separador; `raw()` se inserta tal cual.
 */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    out += fmt(vals[i]) + strings[i + 1];
  }
  return out;
}
function fmt(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
}

/** Convierte un string de HTML en un elemento. */
export function node(str) {
  const t = document.createElement('template');
  t.innerHTML = String(str).trim();
  return t.content.firstElementChild;
}

/** Reemplaza el contenido de un elemento. */
export function fill(elm, str) { if (elm) elm.innerHTML = str; return elm; }

/** Delegación de eventos: on(root, 'click', '[data-act]', handler) */
export function on(root, type, sel, fn) {
  root.addEventListener(type, (ev) => {
    const t = ev.target.closest(sel);
    if (t && root.contains(t)) fn(ev, t);
  });
}

/** Autoajusta la altura de un textarea a su contenido. */
export function autogrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

export function focusEnd(elm) {
  elm.focus();
  if (elm.setSelectionRange) {
    const n = elm.value.length;
    try { elm.setSelectionRange(n, n); } catch { /* input type search */ }
  }
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* --------------------------- Identificadores ---------------------------- */

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ------------------- Posiciones fraccionarias (orden) ------------------ */

/** Devuelve una posición entre dos vecinos (cualquiera puede ser null). */
export function between(prev, next) {
  const a = typeof prev === 'number' ? prev : null;
  const b = typeof next === 'number' ? next : null;
  if (a === null && b === null) return 1000;
  if (a === null) return b - 1000;
  if (b === null) return a + 1000;
  return (a + b) / 2;
}

/** ¿Las posiciones quedaron tan juntas que conviene renumerar? */
export function needsRenumber(items) {
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].position - items[i - 1].position) < 0.0001) return true;
  }
  return false;
}

/* ------------------------------ Fechas -------------------------------- */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export const mesLargo = (i) => MESES_L[i];

export function parseDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
}

/** "9 sep" / "9 sep 2027" si es otro año. */
export function fechaCorta(v) {
  const d = parseDate(v); if (!d) return '';
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MESES[d.getMonth()]}${y}`;
}

/** "9 sep 14:30" */
export function fechaHora(v) {
  const d = parseDate(v); if (!d) return '';
  return `${fechaCorta(d)} ${hhmm(d)}`;
}

export function hhmm(v) {
  const d = parseDate(v); if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "hace 5 min", "ayer 14:30", "9 sep" */
export function haceRato(v) {
  const d = parseDate(v); if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (esAyer(d)) return `ayer ${hhmm(d)}`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return fechaCorta(d);
}

export function esHoy(d) {
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth()
      && d.getFullYear() === n.getFullYear();
}
export function esAyer(d) {
  const n = new Date(); n.setDate(n.getDate() - 1);
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth()
      && d.getFullYear() === n.getFullYear();
}
export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Estado del vencimiento: 'done' | 'late' | 'soon' | 'ok' */
export function dueState(card) {
  if (!card.due_at) return null;
  if (card.is_complete) return 'done';
  const t = new Date(card.due_at).getTime() - Date.now();
  if (t < 0) return 'late';
  if (t < 36 * 3600 * 1000) return 'soon';
  return 'ok';
}

/** Texto del badge de vencimiento. */
export function dueLabel(card) {
  const d = parseDate(card.due_at); if (!d) return '';
  if (esHoy(d)) return `hoy ${hhmm(d)}`;
  if (esAyer(d)) return `ayer ${hhmm(d)}`;
  return fechaCorta(d);
}

/* ------------------------------ Varios -------------------------------- */

export function bytes(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

/** Clase de color estable (c1..c8) derivada de un id. */
export function avatarClass(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 'c' + (Math.abs(h) % 8 + 1);
}

export const LABEL_COLORS = ['verde', 'amarillo', 'naranja', 'rojo', 'violeta',
                             'azul', 'celeste', 'lima', 'rosa', 'gris'];

export const BOARD_BGS = ['azul', 'verde', 'violeta', 'rojo', 'naranja',
                          'celeste', 'rosa', 'grafito', 'noche', 'oliva'];

export function labelStyle(color) {
  const c = LABEL_COLORS.includes(color) ? color : 'gris';
  return `background:var(--l-${c});color:var(--l-${c}-t)`;
}

/**
 * Iniciales de los nombres del equipo, desambiguadas entre sí.
 * "Rena" y "Regi" darían las dos "RE"; en los avatares chicos de las tarjetas
 * eso se lee igual. Se prueban variantes hasta encontrar una libre.
 * Se calcula una sola vez y en el orden de CFG.EQUIPO, así es estable.
 */
let mapaEquipo = null;
function inicialesEquipo() {
  if (mapaEquipo) return mapaEquipo;
  mapaEquipo = new Map();
  const usadas = new Set();
  for (const nombre of (Array.isArray(CFG.EQUIPO) ? CFG.EQUIPO : [])) {
    const n = String(nombre).trim();
    if (!n) continue;
    const c = n.toUpperCase();
    const variantes = [
      c.slice(0, 2),                              // Fran  -> FR
      c[0] + (c[2] || ''),                        // Regi  -> RG
      c[0] + (c[c.length - 1] || ''),             // Rena  -> RA
      c.slice(0, 3),                              // Chelo -> CHE
      c,
    ].filter((v) => v && v.length >= 2);
    const elegida = variantes.find((v) => !usadas.has(v)) || c.slice(0, 2);
    usadas.add(elegida);
    mapaEquipo.set(n.toLowerCase(), elegida);
  }
  return mapaEquipo;
}

export const inicialesDeEquipo = (nombre) =>
  inicialesEquipo().get(String(nombre || '').trim().toLowerCase()) || null;

export function initials(name = '', email = '') {
  const src = (name || email.split('@')[0] || '?').trim();

  // Si es alguien del equipo, se usan las iniciales desambiguadas
  const delEquipo = inicialesDeEquipo(src);
  if (delEquipo) return delEquipo;

  const p = src.split(/[\s.]+/).filter(Boolean);
  // Un solo nombre ("Chelo") rinde mejor con dos letras que con una sola
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || src[0].toUpperCase();
}

/** HTML de un avatar de perfil. */
export function avatarHTML(p, cls = '') {
  if (!p) return '';
  const ini = p.initials || initials(p.full_name, p.email);
  const title = p.full_name || p.email || '';
  if (p.avatar_url) {
    return html`<span class="avatar ${raw(cls)}" title="${title}"><img src="${p.avatar_url}" alt="${title}" referrerpolicy="no-referrer"></span>`;
  }
  // El color se deriva del NOMBRE, no del id: en modo público cada dispositivo
  // tiene su propio id anónimo, así que por id la misma persona cambiaría de
  // color según desde dónde entre.
  const semilla = p.full_name || p.email || p.user_id || p.id || title;
  return html`<span class="avatar ${raw(cls)} ${raw(avatarClass(semilla))}" title="${title}">${ini}</span>`;
}

/** Copia al portapapeles con fallback. */
export async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ----------------------------- Markdown -------------------------------- */
/* Subconjunto suficiente para descripciones y comentarios. Escapa primero,
   así que nunca inyecta HTML del usuario. */

export function md(src) {
  if (!src) return '';
  let s = esc(src).replace(/\r\n/g, '\n');

  // Bloques de código ```
  const blocks = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    blocks.push(code.replace(/^\n/, ''));
    return ` CODE${blocks.length - 1} `;
  });

  // Código en línea
  const inline = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => {
    inline.push(c);
    return ` IC${inline.length - 1} `;
  });

  const lines = s.split('\n');
  const out = [];
  let list = null;   // 'ul' | 'ol'
  let quote = false;
  let para = [];

  const cerrarPara = () => {
    if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; }
  };
  const cerrarLista = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const cerrarQuote = () => { if (quote) { out.push('</blockquote>'); quote = false; } };

  for (const ln of lines) {
    const t = ln.trim();

    if (!t) { cerrarPara(); cerrarLista(); cerrarQuote(); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      cerrarPara(); cerrarLista(); cerrarQuote(); out.push('<hr>'); continue;
    }

    const hd = t.match(/^(#{1,3})\s+(.*)$/);
    if (hd) {
      cerrarPara(); cerrarLista(); cerrarQuote();
      out.push(`<h${hd[1].length}>${inl(hd[2])}</h${hd[1].length}>`);
      continue;
    }

    const q = t.match(/^&gt;\s?(.*)$/);
    if (q) {
      cerrarPara(); cerrarLista();
      if (!quote) { out.push('<blockquote>'); quote = true; }
      out.push(`<p>${inl(q[1])}</p>`);
      continue;
    }
    cerrarQuote();

    const li = t.match(/^([-*+])\s+(.*)$/);
    const oli = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (li || oli) {
      cerrarPara();
      const want = li ? 'ul' : 'ol';
      if (list !== want) { cerrarLista(); out.push(`<${want}>`); list = want; }
      let body = (li ? li[2] : oli[2]);
      const box = body.match(/^\[([ xX])\]\s*(.*)$/);
      if (box) {
        const on = box[1].toLowerCase() === 'x';
        body = `<input type="checkbox" disabled ${on ? 'checked' : ''}> ${inl(box[2])}`;
        out.push(`<li style="list-style:none;margin-left:-16px">${body}</li>`);
      } else {
        out.push(`<li>${inl(body)}</li>`);
      }
      continue;
    }
    cerrarLista();

    para.push(inl(t));
  }
  cerrarPara(); cerrarLista(); cerrarQuote();

  let res = out.join('\n');
  res = res.replace(/ IC(\d+) /g, (_, i) => `<code>${inline[+i]}</code>`);
  res = res.replace(/ CODE(\d+) /g, (_, i) => `<pre><code>${blocks[+i]}</code></pre>`);
  return res;

  function inl(x) {
    return x
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\n]+)_/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
               '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
               '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }
}

/** Primera línea de texto plano de un markdown (para previews). */
export function mdPlain(src, max = 120) {
  const t = String(src || '').replace(/[#*_`>~\-[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}
