import { t } from './i18n.js';
import { getPref, setPref } from './prefs.js';

/**
 * Visualizador de los sprays que ya estan en la carpeta del juego.
 *
 * Las miniaturas no son PNG: el servidor manda los pixeles RGBA crudos leidos
 * del nivel de mipmap que ya trae el propio VTF, y aqui se vuelcan en un canvas.
 * Los animados se mueven a los mismos 5 FPS del motor, con un unico temporizador
 * para todas las tarjetas en vez de uno por spray.
 */

const ENGINE_SPRAY_FPS = 5;
const THUMB_MAX_SIDE = 128;

const $ = (id) => document.getElementById(id);

const section = $('library');
const toggleBtn = $('library-toggle');
const body = $('library-body');
const grid = $('library-grid');
const countBadge = $('library-count');
const emptyNote = $('library-empty');
const refreshBtn = $('library-refresh');
const openBtn = $('library-open');

/** Tarjetas animadas que el temporizador tiene que ir avanzando. */
const playing = new Set();
let ticker = null;

let showStatus = () => {};
let dirs = null;

/* ------------------------------------------------------------ animacion --- */

function startTicker() {
  if (ticker || !playing.size) return;
  ticker = setInterval(() => {
    for (const card of playing) {
      card.index = (card.index + 1) % card.frames.length;
      card.ctx.putImageData(card.frames[card.index], 0, 0);
    }
  }, 1000 / ENGINE_SPRAY_FPS);
}

function stopTicker() {
  if (ticker && !playing.size) {
    clearInterval(ticker);
    ticker = null;
  }
}

/** Deja de animar y suelta los frames: el grid se rehace entero en cada refresco. */
function clearGrid() {
  playing.clear();
  stopTicker();
  pendingThumbs.clear();
  grid.innerHTML = '';
}

/* -------------------------------------------------------------- miniatura --- */

async function loadPixels(spray) {
  const query = new URLSearchParams({
    location: spray.location,
    name: spray.name,
    max: String(THUMB_MAX_SIDE),
  });

  const resp = await fetch(`/api/sprays/pixels?${query}`);
  if (!resp.ok) return null;

  const width = Number(resp.headers.get('X-Spray-Width'));
  const height = Number(resp.headers.get('X-Spray-Height'));
  const total = Number(resp.headers.get('X-Spray-Frames'));
  if (!width || !height || !total) return null;

  const bytes = new Uint8ClampedArray(await resp.arrayBuffer());
  const frameBytes = width * height * 4;

  const frames = [];
  for (let i = 0; i < total; i++) {
    const slice = bytes.slice(i * frameBytes, (i + 1) * frameBytes);
    if (slice.length < frameBytes) break;
    frames.push(new ImageData(slice, width, height));
  }

  return frames.length ? { width, height, frames } : null;
}

/** Pinta la miniatura y, si tiene mas de un frame, la pone a animar. */
async function fillThumb(spray, thumb, canvas) {
  const decoded = await loadPixels(spray);
  if (!decoded) {
    thumb.dataset.state = 'failed';
    thumb.textContent = t('library.unreadable');
    return;
  }

  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(decoded.frames[0], 0, 0);
  thumb.dataset.state = 'ready';

  if (decoded.frames.length > 1) {
    playing.add({ ctx, frames: decoded.frames, index: 0 });
    startTicker();
  }
}

/*
 * Carga diferida de miniaturas.
 *
 * Una carpeta con muchos sprays animados son varios MB de pixeles, asi que solo
 * se piden los que se estan viendo. Se calcula a mano contra el rectangulo de la
 * grilla —que tiene su propio scroll— en vez de usar IntersectionObserver:
 * el observer depende de que la pagina se este pintando, y si por lo que sea no
 * dispara, las tarjetas se quedan en blanco para siempre. Esto siempre responde.
 */
const pendingThumbs = new Set();

const LOOKAHEAD = 200;

function loadVisibleThumbs() {
  if (body.hidden || !pendingThumbs.size) return;

  const view = grid.getBoundingClientRect();
  for (const card of [...pendingThumbs]) {
    const box = card.getBoundingClientRect();
    const above = box.bottom < view.top - LOOKAHEAD;
    const below = box.top > view.bottom + LOOKAHEAD;
    if (above || below) continue;

    pendingThumbs.delete(card);
    card._loadThumb();
  }
}

// El scroll dispara muchas veces seguidas, asi que se agrupa. Se usa un
// temporizador y no requestAnimationFrame por lo mismo que arriba: rAF se para
// cuando la ventana no se esta pintando y las miniaturas no llegarian nunca.
let scrollScheduled = false;
function onScroll() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  setTimeout(() => {
    scrollScheduled = false;
    loadVisibleThumbs();
  }, 60);
}

/* ---------------------------------------------------------------- acciones --- */

async function copyCommand(command) {
  try {
    await navigator.clipboard.writeText(command);
  } catch {
    // Sin permiso de portapapeles: el metodo viejo sigue funcionando.
    const helper = document.createElement('textarea');
    helper.value = command;
    document.body.append(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  showStatus(t('library.copied'), 'ok');
}

function errorText(payload) {
  const key = `error.${payload?.error || 'UNKNOWN'}`;
  const translated = t(key);
  return translated === key ? (payload?.message || t('error.UNKNOWN')) : translated;
}

async function submitRename(spray, newName) {
  const resp = await fetch('/api/sprays/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: spray.location, name: spray.name, newName }),
  });
  const data = await resp.json();

  if (!resp.ok) {
    showStatus(errorText(data), 'error');
    return false;
  }

  showStatus(t('library.renamed', { name: data.name }), 'ok');
  await refreshLibrary();
  return true;
}

async function submitDelete(spray) {
  const resp = await fetch('/api/sprays/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: spray.location, name: spray.name }),
  });
  const data = await resp.json();

  if (!resp.ok) {
    showStatus(errorText(data), 'error');
    return;
  }

  showStatus(t('library.deleted', { name: data.name, n: data.removed.length }), 'ok');
  await refreshLibrary();
}

/* ---------------------------------------------------------------- tarjeta --- */

function metaLine(spray) {
  const parts = [];
  if (spray.width) parts.push(`${spray.width} x ${spray.height}`);
  if (spray.format) parts.push(spray.format);
  if (spray.frames > 1) parts.push(t('library.frames', { n: spray.frames }));
  if (spray.bytes) parts.push(formatBytes(spray.bytes));
  return parts.join(' · ');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function button(label, className) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  return el;
}

function buildCard(spray) {
  const card = document.createElement('article');
  card.className = 'spray-card';

  /* --- miniatura --- */
  const thumb = document.createElement('div');
  thumb.className = 'spray-thumb';
  thumb.dataset.state = 'loading';

  const canvas = document.createElement('canvas');
  thumb.append(canvas);

  if (spray.readable) {
    card._loadThumb = () => fillThumb(spray, thumb, canvas);
    pendingThumbs.add(card);
  } else {
    thumb.dataset.state = 'failed';
    thumb.textContent = t('library.unreadable');
  }

  if (spray.animated) {
    const tag = document.createElement('span');
    tag.className = 'spray-tag';
    tag.textContent = t('library.animated');
    thumb.append(tag);
  }

  /* --- datos --- */
  const info = document.createElement('div');
  info.className = 'spray-info';

  const title = document.createElement('h3');
  title.className = 'spray-name';
  title.textContent = spray.name;

  const meta = document.createElement('p');
  meta.className = 'spray-meta';
  meta.textContent = metaLine(spray);

  info.append(title, meta);

  if (!spray.hasVmt) {
    const warn = document.createElement('p');
    warn.className = 'spray-warn';
    warn.textContent = t('library.noVmt');
    info.append(warn);
  }

  /* --- botones --- */
  const actions = document.createElement('div');
  actions.className = 'spray-buttons';

  const renameBtn = button(t('library.rename'), 'mini-btn');
  const deleteBtn = button(t('library.delete'), 'mini-btn danger');
  actions.append(renameBtn, deleteBtn);

  if (spray.command) {
    const copyBtn = button(t('library.copy'), 'mini-btn');
    copyBtn.addEventListener('click', () => copyCommand(spray.command));
    actions.append(copyBtn);
  }

  /* --- renombrar --- */
  const renameRow = document.createElement('div');
  renameRow.className = 'spray-rename';
  renameRow.hidden = true;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 40;
  input.value = spray.name;

  const saveBtn = button(t('library.renameSave'), 'mini-btn');
  const cancelBtn = button(t('library.renameCancel'), 'mini-btn');
  renameRow.append(input, saveBtn, cancelBtn);

  function closeRename() {
    renameRow.hidden = true;
    actions.hidden = false;
    input.value = spray.name;
  }

  renameBtn.addEventListener('click', () => {
    confirmRow.hidden = true;
    actions.hidden = true;
    renameRow.hidden = false;
    input.focus();
    input.select();
  });

  cancelBtn.addEventListener('click', closeRename);
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const ok = await submitRename(spray, input.value);
    saveBtn.disabled = false;
    if (!ok) closeRename();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
    if (e.key === 'Escape') closeRename();
  });

  /* --- borrar, con la lista de archivos a la vista --- */
  const confirmRow = document.createElement('div');
  confirmRow.className = 'spray-confirm';
  confirmRow.hidden = true;

  const confirmText = document.createElement('p');
  const fileList = document.createElement('ul');
  fileList.className = 'spray-files';

  const yesBtn = button(t('library.deleteYes'), 'mini-btn danger');
  const noBtn = button(t('library.deleteNo'), 'mini-btn');

  const confirmButtons = document.createElement('div');
  confirmButtons.className = 'spray-confirm-buttons';
  confirmButtons.append(yesBtn, noBtn);
  confirmRow.append(confirmText, fileList, confirmButtons);

  deleteBtn.addEventListener('click', async () => {
    renameRow.hidden = true;

    // Se piden los archivos reales para que el aviso diga exactamente que se va
    // a quitar, en vez de un "¿seguro?" a ciegas.
    fileList.innerHTML = '';
    let files = [];
    try {
      const query = new URLSearchParams({ location: spray.location, name: spray.name });
      const resp = await fetch(`/api/sprays/files?${query}`);
      if (resp.ok) files = (await resp.json()).files || [];
    } catch {
      // Si no se puede consultar, igual se avisa; el borrado dira que paso.
    }

    // En la app de escritorio los archivos van a la papelera y se pueden
    // recuperar; en el navegador el borrado es definitivo. El aviso lo dice.
    const key = window.sprayApp?.isDesktop
      ? 'library.deleteConfirmTrash'
      : 'library.deleteConfirm';
    confirmText.textContent = t(key, { name: spray.name, n: files.length });
    for (const file of files) {
      const item = document.createElement('li');
      item.textContent = file;
      fileList.append(item);
    }

    actions.hidden = true;
    confirmRow.hidden = false;
  });

  noBtn.addEventListener('click', () => {
    confirmRow.hidden = true;
    actions.hidden = false;
  });
  yesBtn.addEventListener('click', async () => {
    yesBtn.disabled = true;
    await submitDelete(spray);
  });

  info.append(actions, renameRow, confirmRow);
  card.append(thumb, info);
  return card;
}

/* ------------------------------------------------------------------ lista --- */

// Al arrancar, el cambio de idioma y el setup piden la lista casi a la vez.
// Solo vale la ultima peticion: asi no se pinta la grilla dos veces ni se
// decodifican miniaturas que van a sobrar.
let refreshToken = 0;

export async function refreshLibrary() {
  const token = ++refreshToken;

  let data;
  try {
    const resp = await fetch('/api/sprays/installed');
    data = await resp.json();
  } catch {
    data = { found: false, sprays: [] };
  }

  if (token !== refreshToken) return;
  clearGrid();

  if (!data.found) {
    section.hidden = true;
    return;
  }

  dirs = data.dirs || null;
  section.hidden = false;
  countBadge.textContent = String(data.sprays.length);
  emptyNote.hidden = data.sprays.length > 0;

  for (const spray of data.sprays) {
    grid.append(buildCard(spray));
  }
  loadVisibleThumbs();

  // El boton de abrir carpeta solo existe en la app de escritorio.
  openBtn.hidden = !(window.sprayApp?.openFolder && dirs?.custom);
}

/* ------------------------------------------------------------------ init --- */

function setOpen(open) {
  body.hidden = !open;
  toggleBtn.setAttribute('aria-expanded', String(open));
  section.classList.toggle('open', open);
  setPref('libraryOpen', open);
  // Estando cerrado no se mide nada, asi que al abrir hay que mirar de nuevo.
  if (open) loadVisibleThumbs();
}

export function setupLibrary(options = {}) {
  showStatus = options.showStatus || (() => {});

  toggleBtn.addEventListener('click', () => setOpen(body.hidden));
  refreshBtn.addEventListener('click', () => refreshLibrary());
  grid.addEventListener('scroll', onScroll);
  window.addEventListener('resize', onScroll);
  openBtn.addEventListener('click', () => {
    if (dirs?.custom) window.sprayApp?.openFolder(dirs.custom);
  });

  setOpen(getPref('libraryOpen', false) === true);
  refreshLibrary();
}
