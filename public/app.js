import { t, setLang, getLang, initLang, applyTranslations } from './i18n.js';
import { loadPrefs, getPref } from './prefs.js';
import { Cropper } from './cropper.js';
import { setupUpdater } from './updater.js';
import { setupLibrary, refreshLibrary } from './library.js';

const MAX_FRAMES = 10;
const SIZE_LIMIT_BYTES = 512 * 1024;

// El motor de L4D2 anima los sprays a 5 FPS fijos (materials/decals/playerlogoNN.vmt).
const ENGINE_SPRAY_FPS = 5;

// Lados validos para una textura de Source: potencia de dos.
const STATIC_MAX_SIDES = [128, 256, 512, 1024];
const ANIM_SIDES = [64, 128, 256];
const MIN_SIDE = 64;
const MAX_SIDE = 1024;

// Solo proporciones que existen con lados potencia de dos. Un 4:3, por ejemplo,
// necesitaria un lado de 384 px, que no es potencia de dos y terminaria
// redondeando a 1:1 y estirando la imagen.
const ASPECTS = [
  { key: 'free', value: null },
  { key: 'square', value: 1 },
  { key: 'landscape21', value: 2 },
  { key: 'portrait12', value: 0.5 },
  { key: 'landscape41', value: 4 },
  { key: 'portrait14', value: 0.25 },
];

const state = {
  mode: 'image',
  file: null,
  sessionId: null,
  frameCount: 0,
  selected: [],
  steam: null,
  cropSource: null,
};

const $ = (id) => document.getElementById(id);

const dropzone = $('dropzone');
const fileInput = $('file-input');
const dropzoneEmpty = $('dropzone-empty');
const dropzoneLabel = $('dropzone-label');
const previewWrap = $('preview-wrap');
const previewImg = $('preview-img');
const previewVideo = $('preview-video');
const framesSection = $('frames-section');
const framesGrid = $('frames-grid');
const framesCounter = $('frames-counter');
const framesHelp = $('frames-help');
const cropSection = $('crop-section');
const cropInfo = $('crop-info');
const aspectSelect = $('aspect-select');
const sizeSelect = $('size');
const qualitySelect = $('quality');
const nameInput = $('name');
const sizeEstimate = $('size-estimate');
const downloadBtn = $('download-btn');
const installBtn = $('install-btn');
const statusBox = $('status');

const cropper = new Cropper($('crop-area'));

/* ------------------------------------------------------------- utilidades --- */

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Redondea al lado potencia de dos mas cercano, como el "Nearest Power Of 2" de VTFEdit. */
function nearestPowerOfTwo(value) {
  const pow = 2 ** Math.round(Math.log2(Math.max(value, 1)));
  return Math.min(Math.max(pow, MIN_SIDE), MAX_SIDE);
}

function showStatus(html, kind) {
  statusBox.innerHTML = html;
  statusBox.className = `status ${kind}`;
  statusBox.hidden = false;
}

function hideStatus() { statusBox.hidden = true; }

function errorMessage(payload) {
  const key = `error.${payload?.error || 'UNKNOWN'}`;
  const translated = t(key);
  return translated === key ? (payload?.message || t('error.UNKNOWN')) : translated;
}

/* ------------------------------------------------------------------ modo --- */

function populateSizes() {
  const sizes = state.mode === 'video' ? ANIM_SIDES : STATIC_MAX_SIDES;
  const preferred = state.mode === 'video' ? 256 : 512;
  sizeSelect.innerHTML = '';
  for (const size of sizes) {
    const opt = document.createElement('option');
    opt.value = String(size);
    opt.textContent = state.mode === 'video' ? `${size} x ${size}` : `${size} px`;
    if (size === preferred) opt.selected = true;
    sizeSelect.append(opt);
  }
  $('size-label').dataset.i18n = state.mode === 'video' ? 'field.size' : 'field.maxSide';
  $('size-label').textContent = t($('size-label').dataset.i18n);
}

function populateAspects() {
  aspectSelect.innerHTML = '';
  // Los animados van siempre en 1:1; no tiene sentido ofrecer otros.
  const list = state.mode === 'video' ? ASPECTS.filter((a) => a.value === 1) : ASPECTS;
  for (const a of list) {
    const opt = document.createElement('option');
    opt.value = a.key;
    opt.textContent = t(`aspect.${a.key}`);
    aspectSelect.append(opt);
  }
  aspectSelect.value = state.mode === 'video' ? 'square' : 'free';
  aspectSelect.disabled = state.mode === 'video';
}

function currentAspect() {
  return ASPECTS.find((a) => a.key === aspectSelect.value)?.value ?? null;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  fileInput.accept = mode === 'video'
    ? '.mp4,.webm,.mov,.avi,.mkv,.gif,.m4v,.wmv,.flv,video/*'
    : '.png,.jpg,.jpeg,.bmp,.tga,.gif,.webp,.tif,.tiff,image/*';
  dropzoneLabel.dataset.i18n = mode === 'video' ? 'drop.video' : 'drop.image';
  dropzoneLabel.textContent = t(dropzoneLabel.dataset.i18n);

  $('fps-field').hidden = mode !== 'video';
  // Defaults pensados para no pasar los 512 KB.
  qualitySelect.value = mode === 'video' ? 'dxt1' : 'dxt5';

  populateSizes();
  populateAspects();
  clearFile();
}

/* ----------------------------------------------------------------- input --- */

dropzone.addEventListener('click', (e) => {
  if (e.target.closest('.clear-btn')) return;
  fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

$('clear-file').addEventListener('click', (e) => {
  e.stopPropagation();
  clearFile();
});

// Windows no registra MIME para .tga ni .webp, asi que el navegador manda
// cadena vacia: hay que aceptar tambien por extension.
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'bmp', 'tga', 'gif', 'webp', 'tif', 'tiff'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'gif', 'm4v', 'wmv', 'flv'];

const extensionOf = (file) => (file.name.split('.').pop() || '').toLowerCase();
const isGifFile = (file) => file.type === 'image/gif' || extensionOf(file) === 'gif';

async function handleFile(file) {
  const ext = extensionOf(file);
  const wantsVideo = state.mode === 'video';
  const matches = wantsVideo
    ? (file.type.startsWith('video') || isGifFile(file) || VIDEO_EXTS.includes(ext))
    : (file.type.startsWith('image') || IMAGE_EXTS.includes(ext));

  if (!matches) {
    const kind = t(wantsVideo ? 'status.kind.video' : 'status.kind.image');
    showStatus(t('status.selectFile', { kind }), 'error');
    return;
  }

  state.file = file;
  hideStatus();

  const url = URL.createObjectURL(file);
  dropzoneEmpty.hidden = true;
  previewWrap.hidden = false;

  if (wantsVideo && !isGifFile(file)) {
    previewImg.hidden = true;
    previewVideo.hidden = false;
    previewVideo.src = url;
  } else {
    previewVideo.hidden = true;
    previewImg.hidden = false;
    // Si el navegador no sabe dibujar el formato (TGA), lo convierte el servidor.
    previewImg.onerror = () => { previewImg.onerror = null; loadServerPreview(file); };
    previewImg.src = url;
  }

  // El nombre se regenera con cada archivo: si se quedara el anterior, el
  // siguiente spray sobrescribiria al que ya estaba instalado.
  nameInput.value = await uniqueName(baseNameFrom(file.name));

  if (wantsVideo) {
    await analyzeVideo(file);
  } else {
    await setupCropper(previewImg.src);
    setButtonsEnabled(true);
  }
}

/** Pide al servidor un PNG de vista previa para formatos que el navegador no dibuja. */
async function loadServerPreview(file) {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/preview', { method: 'POST', body: fd });
    if (!resp.ok) return;
    previewImg.src = URL.createObjectURL(await resp.blob());
    await setupCropper(previewImg.src);
  } catch {
    // Sin vista previa: el archivo igual se puede convertir.
  }
}

function clearFile() {
  state.file = null;
  state.sessionId = null;
  state.frameCount = 0;
  state.selected = [];
  state.cropSource = null;
  fileInput.value = '';
  // removeAttribute en vez de src='': asignar cadena vacia deja la imagen rota
  // a la vista en algunos navegadores.
  previewImg.removeAttribute('src');
  previewVideo.removeAttribute('src');
  previewVideo.load();
  previewImg.onerror = null;
  // Sin esto, al cambiar de modo el recortador seguia mostrando el archivo
  // anterior hasta que cargaba el nuevo.
  cropper.clear();
  dropzoneEmpty.hidden = false;
  previewWrap.hidden = true;
  framesSection.hidden = true;
  cropSection.hidden = true;
  framesGrid.innerHTML = '';
  preview.images = [];
  stopPreviewLoop();
  previewSection.hidden = true;
  setButtonsEnabled(false);
  updateEstimate();
}

function setButtonsEnabled(enabled) {
  downloadBtn.disabled = !enabled;
  installBtn.disabled = !enabled || !state.steam?.found;
}


/* ------------------------------------------------- nombre del spray --- */

/** Convierte el nombre de archivo en un nombre de spray valido. */
function baseNameFrom(filename) {
  const base = filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34);
  return base || 'spray';
}

/**
 * Devuelve un nombre que no pise ningun spray ya instalado.
 * Si "mi-spray" existe, propone "mi-spray-2", "mi-spray-3", etc.
 */
async function uniqueName(base) {
  let taken = new Set();
  try {
    const resp = await fetch('/api/sprays');
    const data = await resp.json();
    taken = new Set((data.names || []).map((n) => String(n).toLowerCase()));
  } catch {
    // Sin lista no podemos comprobar; devolvemos el nombre tal cual.
  }

  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-5)}`;
}

/* ---------------------------------------------------------------- recorte --- */

async function setupCropper(src) {
  if (!src) return;
  state.cropSource = src;
  cropSection.hidden = false;
  await cropper.setImage(src, { aspect: currentAspect() });
  onCropChanged();
}

cropper.onChange = () => onCropChanged();

function onCropChanged() {
  const out = computeOutputSize();
  const px = cropper.getPixelSize();
  const cropAspect = (px.width || 1) / (px.height || 1);
  const outAspect = out.width / out.height;
  // Al redondear los lados a potencia de dos el resultado puede quedar estirado.
  const stretch = Math.max(cropAspect / outAspect, outAspect / cropAspect);

  let text = t('crop.info', { width: out.width, height: out.height });
  if (stretch > 1.06) text += ` — ${t('crop.stretch')}`;
  cropInfo.textContent = text;
  cropInfo.className = `hint${stretch > 1.06 ? ' warn' : ''}`;

  updateEstimate();
  refreshPreview();
}

aspectSelect.addEventListener('change', () => {
  cropper.setAspect(currentAspect());
  onCropChanged();
});
$('crop-reset').addEventListener('click', () => {
  cropper.reset();
  onCropChanged();
});

/**
 * Dimensiones finales del VTF.
 * Los animados son cuadrados; los estaticos derivan el lado corto del recorte
 * y lo redondean a potencia de dos.
 */
function computeOutputSize() {
  if (state.mode === 'video') {
    const s = Number(sizeSelect.value) || 256;
    return { width: s, height: s };
  }

  const maxSide = Number(sizeSelect.value) || 512;
  const px = cropper.getPixelSize();
  const aspect = (px.width || 1) / (px.height || 1);

  if (aspect >= 1) {
    return { width: maxSide, height: nearestPowerOfTwo(maxSide / aspect) };
  }
  return { width: nearestPowerOfTwo(maxSide * aspect), height: maxSide };
}

/* -------------------------------------------------- seleccion de frames --- */

async function analyzeVideo(file) {
  setButtonsEnabled(false);
  showStatus(t('frames.analyzing'), 'info');

  const fd = new FormData();
  fd.append('file', file);

  try {
    const resp = await fetch('/api/analyze', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(errorMessage(data));

    state.sessionId = data.sessionId;
    state.frameCount = data.frameCount;
    state.selected = [];

    renderFrameGrid();
    autoSelectFrames();
    framesSection.hidden = false;
    await setupCropper(`/api/frames/${state.sessionId}/${state.selected[0] ?? 0}`);
    hideStatus();
  } catch (err) {
    showStatus(err.message, 'error');
    clearFile();
  }
}

function renderFrameGrid() {
  framesGrid.innerHTML = '';
  for (let i = 0; i < state.frameCount; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'frame-cell';
    cell.dataset.index = String(i);

    const img = document.createElement('img');
    img.src = `/api/frames/${state.sessionId}/${i}`;
    img.alt = `Frame ${i + 1}`;
    img.loading = 'lazy';

    const badge = document.createElement('span');
    badge.className = 'frame-badge';

    cell.append(img, badge);
    cell.addEventListener('click', () => toggleFrame(i));
    framesGrid.append(cell);
  }
  updateFrameUI();
}

function toggleFrame(index) {
  const pos = state.selected.indexOf(index);
  if (pos >= 0) {
    state.selected.splice(pos, 1);
  } else {
    if (state.selected.length >= MAX_FRAMES) return;
    state.selected.push(index);
  }
  updateFrameUI();
}

function autoSelectFrames() {
  const target = Math.min(MAX_FRAMES, state.frameCount);
  state.selected = [];
  for (let i = 0; i < target; i++) {
    // Repartimos las tomas de forma pareja a lo largo de todo el clip.
    state.selected.push(Math.round((i * (state.frameCount - 1)) / Math.max(target - 1, 1)));
  }
  state.selected = [...new Set(state.selected)];
  updateFrameUI();
}

function updateFrameUI() {
  framesGrid.querySelectorAll('.frame-cell').forEach((cell) => {
    const index = Number(cell.dataset.index);
    const order = state.selected.indexOf(index);
    cell.classList.toggle('selected', order >= 0);
    cell.querySelector('.frame-badge').textContent = order >= 0 ? String(order + 1) : '';
  });

  framesCounter.textContent = t('frames.counter', {
    n: state.selected.length,
    max: MAX_FRAMES,
  });

  setButtonsEnabled(state.selected.length >= 2);
  updateEstimate();
  refreshPreview();
}

$('frames-auto').addEventListener('click', autoSelectFrames);
$('frames-clear').addEventListener('click', () => {
  state.selected = [];
  updateFrameUI();
});

/* ------------------------------------------------------ previsualizador --- */

const previewSection = $('spray-preview');
const previewStage = $('preview-stage');
const previewCanvas = $('preview-canvas');
const previewInfo = $('preview-info');
const ctx = previewCanvas.getContext('2d');

const preview = { images: [], frame: 0, timer: null };

/** Dibuja la region recortada, tal como la va a recortar FFmpeg en el servidor. */
function drawCropped(image) {
  const { width: w, height: h } = previewCanvas;
  ctx.clearRect(0, 0, w, h);
  if (!image?.naturalWidth) return;

  const r = cropper.getRect();
  const sx = r.x * image.naturalWidth;
  const sy = r.y * image.naturalHeight;
  const sw = Math.max(1, r.w * image.naturalWidth);
  const sh = Math.max(1, r.h * image.naturalHeight);

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
}

function stopPreviewLoop() {
  if (preview.timer) clearInterval(preview.timer);
  preview.timer = null;
}

function renderPreview() {
  stopPreviewLoop();

  if (!preview.images.length) {
    previewSection.hidden = true;
    return;
  }

  const out = computeOutputSize();
  previewCanvas.width = out.width;
  previewCanvas.height = out.height;
  previewSection.hidden = false;

  if (preview.images.length === 1) {
    drawCropped(preview.images[0]);
    previewInfo.textContent = t('preview.info.static', { width: out.width, height: out.height });
    return;
  }

  preview.frame = 0;
  drawCropped(preview.images[0]);
  preview.timer = setInterval(() => {
    preview.frame = (preview.frame + 1) % preview.images.length;
    drawCropped(preview.images[preview.frame]);
  }, 1000 / ENGINE_SPRAY_FPS);

  previewInfo.textContent = t('preview.info.animated', {
    width: out.width,
    height: out.height,
    frames: preview.images.length,
    fps: ENGINE_SPRAY_FPS,
    seconds: (preview.images.length / ENGINE_SPRAY_FPS).toFixed(1),
  });
}

function loadPreviewImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let previewToken = 0;

async function refreshPreview() {
  const token = ++previewToken;
  if (!state.file) {
    preview.images = [];
    renderPreview();
    return;
  }

  let images;
  if (state.mode === 'video') {
    const sources = state.selected.map((i) => `/api/frames/${state.sessionId}/${i}`);
    images = (await Promise.all(sources.map(loadPreviewImage))).filter(Boolean);
  } else {
    const img = await loadPreviewImage(previewImg.src);
    images = img ? [img] : [];
  }

  // Otra actualizacion arranco mientras cargabamos: descartamos esta.
  if (token !== previewToken) return;
  preview.images = images;
  renderPreview();
}

$('preview-bg-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.bg-btn');
  if (!btn) return;
  document.querySelectorAll('.bg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  previewStage.dataset.bg = btn.dataset.bg;
});

/* ------------------------------------------------------ estimacion peso --- */

const BYTES_PER_PIXEL = { uncompressed: 4, dxt5: 1, dxt1: 0.5 };
// La cadena completa de mipmaps agrega alrededor de un tercio al peso base.
const MIPMAP_FACTOR = 4 / 3;

function updateEstimate() {
  if (!state.file) {
    sizeEstimate.hidden = true;
    return;
  }

  const out = computeOutputSize();
  const frames = state.mode === 'video' ? Math.max(state.selected.length, 1) : 1;
  const bytes = Math.round(
    out.width * out.height * frames * BYTES_PER_PIXEL[qualitySelect.value] * MIPMAP_FACTOR,
  ) + 1024;

  const over = bytes > SIZE_LIMIT_BYTES;
  sizeEstimate.hidden = false;
  sizeEstimate.className = `size-estimate ${over ? 'over' : 'ok'}`;
  sizeEstimate.textContent = t('size.estimate', { size: formatBytes(bytes) })
    + (over ? ` — ${t('size.warning')}` : '');
}

sizeSelect.addEventListener('change', () => { onCropChanged(); });
qualitySelect.addEventListener('change', updateEstimate);

/* ------------------------------------------------------------- generacion --- */

async function generate(target) {
  if (!state.file) return;

  downloadBtn.disabled = true;
  installBtn.disabled = true;
  showStatus(t(target === 'install' ? 'action.installing' : 'action.generating'), 'info');

  try {
    const resp = state.mode === 'video'
      ? await requestAnimated(target)
      : await requestStatic(target);

    if (!resp.ok) {
      let payload = {};
      try { payload = await resp.json(); } catch { /* respuesta sin JSON */ }
      throw new Error(errorMessage(payload));
    }

    if (target === 'install') {
      const data = await resp.json();
      const howTo = state.mode === 'video' ? t('status.howToAnimated') : t('status.howToStatic');
      showStatus(`${t('status.installed')} ${howTo}<br><code>${data.command}</code>`, 'ok');
      // El spray recien instalado tiene que aparecer en la lista de abajo.
      refreshLibrary();
    } else {
      await downloadFile(resp);
      showStatus(t('status.downloaded'), 'ok');
    }
  } catch (err) {
    showStatus(err.message || t('error.UNKNOWN'), 'error');
  } finally {
    setButtonsEnabled(state.mode === 'video' ? state.selected.length >= 2 : true);
  }
}

function requestStatic(target) {
  const out = computeOutputSize();
  const fd = new FormData();
  fd.append('file', state.file);
  fd.append('name', nameInput.value || 'spray');
  fd.append('width', String(out.width));
  fd.append('height', String(out.height));
  fd.append('quality', qualitySelect.value);
  fd.append('crop', JSON.stringify(cropper.getRect()));
  fd.append('target', target);
  return fetch('/api/generate/image', { method: 'POST', body: fd });
}

function requestAnimated(target) {
  return fetch('/api/generate/animated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: state.sessionId,
      selected: state.selected,
      name: nameInput.value || 'spray',
      size: Number(sizeSelect.value),
      quality: qualitySelect.value,
      crop: cropper.getRect(),
      target,
    }),
  });
}

async function downloadFile(resp) {
  const blob = await resp.blob();
  const disposition = resp.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : `${nameInput.value || 'spray'}.vtf`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

downloadBtn.addEventListener('click', () => generate('download'));
installBtn.addEventListener('click', () => generate('install'));

/* ----------------------------------------------------------------- juego --- */

const steamBox = $('steam-box');
const steamText = $('steam-text');
const steamPath = $('steam-path');
const manualForm = $('steam-manual-form');
const manualInput = $('steam-manual-input');

/** Refleja en la interfaz donde quedo apuntando la app. */
function renderGameLocation() {
  const found = state.steam?.found;
  steamBox.classList.remove('searching', 'found', 'missing');
  steamBox.classList.add(found ? 'found' : 'missing');

  if (found) {
    // Mostramos la carpeta del juego, que es lo que el usuario reconoce;
    // las subcarpetas exactas las gestiona la app.
    steamText.textContent = t(state.steam.source === 'manual'
      ? 'steam.detectedManual'
      : 'steam.detected');
    steamPath.hidden = false;
    steamPath.textContent = state.steam.gameRoot;
    $('steam-manual-hint').hidden = true;
  } else {
    steamText.textContent = t('steam.notFound');
    steamPath.hidden = true;
    $('steam-manual-hint').hidden = false;
  }

  $('steam-auto').hidden = false;
  $('steam-manual').hidden = false;
  $('steam-auto').textContent = t('steam.auto');
  $('steam-manual').textContent = t('steam.manual');
  setButtonsEnabled(!downloadBtn.disabled);
}

async function detectSteam() {
  try {
    const resp = await fetch('/api/steam');
    state.steam = await resp.json();
  } catch {
    state.steam = { found: false };
  }
  renderGameLocation();
}

/** Vuelve a sondear, olvidando cualquier ruta elegida a mano. */
$('steam-auto').addEventListener('click', async () => {
  steamText.textContent = t('steam.searching');
  manualForm.hidden = true;
  try {
    const resp = await fetch('/api/steam/auto', { method: 'POST' });
    state.steam = await resp.json();
  } catch {
    state.steam = { found: false };
  }
  renderGameLocation();
  refreshLibrary();
  if (!state.steam.found) showStatus(t('steam.autoFailed'), 'error');
});

/**
 * Busqueda manual. En la app de escritorio abre el selector de carpetas
 * nativo; en el navegador no existe esa posibilidad, asi que se escribe
 * la ruta a mano.
 */
$('steam-manual').addEventListener('click', async () => {
  if (window.sprayApp?.pickGameFolder) {
    const picked = await window.sprayApp.pickGameFolder();
    if (picked?.canceled || !picked?.path) return;
    await saveGamePath(picked.path);
    return;
  }
  manualForm.hidden = !manualForm.hidden;
  if (!manualForm.hidden) manualInput.focus();
});

$('steam-manual-save').addEventListener('click', () => saveGamePath(manualInput.value));
manualInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveGamePath(manualInput.value);
});

async function saveGamePath(candidate) {
  if (!candidate) return;
  try {
    const resp = await fetch('/api/steam/locate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: candidate }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(errorMessage(data));

    state.steam = data;
    manualForm.hidden = true;
    renderGameLocation();
    refreshLibrary();
    showStatus(t('steam.saved'), 'ok');
  } catch (err) {
    showStatus(err.message || t('error.INVALID_GAME_PATH'), 'error');
  }
}

/* --------------------------------------------------------- actualizar --- */

$('check-updates').addEventListener('click', async () => {
  const api = window.sprayApp;
  if (!api?.checkForUpdates) {
    showStatus(t('update.onlyDesktop'), 'info');
    return;
  }

  showStatus(t('update.checking'), 'info');
  const result = await api.checkForUpdates();

  if (result?.skipped) showStatus(t('update.devMode'), 'info');
  else if (result?.error) showStatus(t('update.failed'), 'error');
  else if (!result?.version) showStatus(t('update.upToDate'), 'ok');
  // Si hay version nueva, el evento 'available' muestra la barra de arriba.
  else hideStatus();
});

/* ---------------------------------------------------------------- idioma --- */

$('lang-select').addEventListener('change', (e) => setLang(e.target.value));

document.addEventListener('languagechange', () => {
  framesHelp.textContent = t('frames.help', { max: MAX_FRAMES });
  $('frames-auto').textContent = t('frames.auto', { max: MAX_FRAMES });
  $('frames-clear').textContent = t('frames.clear');
  populateSizes();
  const keep = aspectSelect.value;
  populateAspects();
  if ([...aspectSelect.options].some((o) => o.value === keep)) aspectSelect.value = keep;
  if (state.frameCount) updateFrameUI();
  if (state.file) onCropChanged(); else updateEstimate();
  // Las tarjetas llevan sus textos ya puestos: se rehacen en el idioma nuevo.
  refreshLibrary();
});

document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

/* ------------------------------------------------------------------ init --- */

// Las preferencias se leen ANTES de pintar: el idioma vive en el perfil del
// usuario, no en localStorage, porque el puerto del servidor embebido cambia en
// cada arranque y localStorage se separa por origen.
await loadPrefs();
initLang(getPref('lang', 'es'));

$('lang-select').value = getLang();
applyTranslations();
setMode('image');
detectSteam();
setupUpdater();
setupLibrary({ showStatus });
