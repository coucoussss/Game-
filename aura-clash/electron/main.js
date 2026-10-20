// Processus principal Electron : fenêtre du jeu, serveur LAN embarqué et découverte réseau.
// Le rendu (Three.js) tourne dans la fenêtre ; ce processus ne fait que du réseau et du système.
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { LanServer } = require('./lanServer');
const { Discovery } = require('./discovery');
const { localIPv4s } = require('./netUtils');

// Pas de mise en veille du rendu quand la fenêtre perd le focus : une partie LAN doit continuer.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// Vieux PC : utilise quand même le GPU s'il est sur liste noire, et à défaut un rendu WebGL logiciel.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

let win = null;
const server = new LanServer();
const discovery = new Discovery();

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#05060a',
    title: 'Aura Clash',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // F11 : plein écran ; Ctrl+Maj+I : outils de développement (débogage).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  win.on('closed', () => { win = null; });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// --- IPC : le rendu pilote le serveur LAN ---------------------------------------------

ipcMain.handle('lan:host', async (_e, opts) => {
  const info = await server.start(opts || {});
  discovery.startBeacon(() => server.beaconInfo());
  return { ...info, ips: localIPv4s() };
});

ipcMain.handle('lan:stop', async () => {
  discovery.stopBeacon();
  await server.stop();
  return true;
});

ipcMain.handle('lan:discover', (_e, on) => {
  if (on) discovery.startListening((list) => send('lan:servers', list));
  else discovery.stopListening();
  return true;
});

ipcMain.handle('lan:ips', () => localIPv4s());
ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:fullscreen', (_e, on) => {
  if (win) win.setFullScreen(!!on);
  return win ? win.isFullScreen() : false;
});

// --- Cycle de vie ---------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Une seule instance par machine : le port LAN ne peut être ouvert qu'une fois.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', async () => {
  discovery.stopBeacon();
  discovery.stopListening();
  await server.stop();
  app.quit();
});
