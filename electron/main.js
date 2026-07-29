import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// El servidor corre embebido: server.js no debe autoarrancar en el puerto fijo.
process.env.L4D2_SPRAY_EMBEDDED = '1';

let mainWindow = null;
let serverHandle = null;

/** Manda un evento al renderer, si la ventana sigue viva. */
function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function createWindow() {
  const { startServer } = await import('../server.js');
  // Puerto 0: el sistema asigna uno libre y evitamos chocar con otros programas.
  const { server, port } = await startServer({ port: 0 });
  serverHandle = server;

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    backgroundColor: '#14151a',
    autoHideMenuBar: true,
    title: 'L4D2 Spray Maker',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Los enlaces externos se abren en el navegador, no dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ------------------------------------------------------- actualizaciones --- */

/**
 * electron-updater consulta las Releases del repositorio publico declarado en
 * package.json. No hace falta que el usuario sepa nada de GitHub: solo ve el
 * aviso dentro de la app.
 */
function setupUpdater() {
  autoUpdater.autoDownload = false;          // primero avisamos, luego descargamos
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    send('update:available', { version: info.version, notes: info.releaseNotes ?? null });
  });
  autoUpdater.on('update-not-available', () => send('update:none'));
  autoUpdater.on('download-progress', (p) => {
    send('update:progress', { percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send('update:downloaded', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    send('update:error', { message: String(err?.message || err) });
  });

  ipcMain.handle('update:check', async () => {
    // En desarrollo no hay nada empaquetado contra lo que comparar.
    if (!app.isPackaged) return { skipped: true, reason: 'dev' };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { checked: true, version: result?.updateInfo?.version ?? null };
    } catch (err) {
      return { error: String(err?.message || err) };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { error: String(err?.message || err) };
    }
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall();
    return { ok: true };
  });

  ipcMain.handle('app:version', () => app.getVersion());
}

/* -------------------------------------------------------- ciclo de vida --- */

// Una sola instancia: si la abren dos veces, enfocamos la que ya esta.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupUpdater();
    await createWindow();

    // Damos unos segundos para no competir con la carga inicial.
    setTimeout(() => {
      if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
    }, 4000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (serverHandle) serverHandle.close();
    if (process.platform !== 'darwin') app.quit();
  });
}
