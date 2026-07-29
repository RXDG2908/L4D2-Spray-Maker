import { t } from './i18n.js';

/**
 * Aviso de actualizacion.
 *
 * Solo hace algo dentro de la app de escritorio: en el navegador `window.sprayApp`
 * no existe y todo esto se queda callado. La idea es que alguien que no sabe nada
 * de GitHub vea un cartel, pulse un boton y quede actualizado.
 */
export function setupUpdater() {
  const api = window.sprayApp;
  const bar = document.getElementById('update-bar');
  if (!api?.isDesktop || !bar) return;

  const text = document.getElementById('update-text');
  const actionBtn = document.getElementById('update-action');
  const dismissBtn = document.getElementById('update-dismiss');

  let pending = null;

  function show(message, { action = null, actionKey = null } = {}) {
    text.textContent = message;
    bar.hidden = false;
    if (action) {
      actionBtn.hidden = false;
      actionBtn.textContent = t(actionKey);
      actionBtn.onclick = action;
    } else {
      actionBtn.hidden = true;
      actionBtn.onclick = null;
    }
  }

  dismissBtn.addEventListener('click', () => { bar.hidden = true; });

  api.onUpdate((kind, payload) => {
    switch (kind) {
      case 'available':
        pending = payload.version;
        show(t('update.available', { version: payload.version }), {
          actionKey: 'update.download',
          action: async () => {
            show(t('update.downloading', { percent: 0 }));
            await api.downloadUpdate();
          },
        });
        break;

      case 'progress':
        show(t('update.downloading', { percent: payload.percent }));
        break;

      case 'downloaded':
        show(t('update.ready', { version: payload.version || pending || '' }), {
          actionKey: 'update.restart',
          action: () => api.installUpdate(),
        });
        break;

      case 'error':
        // Un fallo al buscar actualizaciones no debe estorbar el uso normal.
        console.warn('updater:', payload.message);
        bar.hidden = true;
        break;

      case 'none':
      default:
        bar.hidden = true;
        break;
    }
  });

  // Mostramos la version instalada en el pie.
  api.getVersion().then((v) => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${v}`;
  }).catch(() => {});

  api.checkForUpdates().catch(() => {});
}
