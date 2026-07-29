const { contextBridge, ipcRenderer } = require('electron');

/**
 * Puente entre la app web y Electron.
 *
 * Se expone una superficie minima y fija: la pagina no puede invocar IPC
 * arbitrario, solo estas operaciones de actualizacion.
 */
contextBridge.exposeInMainWorld('sprayApp', {
  isDesktop: true,

  getVersion: () => ipcRenderer.invoke('app:version'),
  pickGameFolder: () => ipcRenderer.invoke('game:pickFolder'),
  openFolder: (target) => ipcRenderer.invoke('shell:openPath', target),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  /** Suscribe a los avisos del actualizador. Devuelve una funcion para cancelar. */
  onUpdate: (handler) => {
    const channels = [
      'update:available',
      'update:none',
      'update:progress',
      'update:downloaded',
      'update:error',
    ];
    const listeners = channels.map((channel) => {
      const fn = (_event, payload) => handler(channel.replace('update:', ''), payload || {});
      ipcRenderer.on(channel, fn);
      return () => ipcRenderer.removeListener(channel, fn);
    });
    return () => listeners.forEach((off) => off());
  },
});
