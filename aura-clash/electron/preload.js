// Pont sécurisé entre la page du jeu et le processus principal (contextIsolation).
// La page n'a pas accès à Node : elle ne voit que ces quelques fonctions.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auraNative', {
  isElectron: true,
  host: (opts) => ipcRenderer.invoke('lan:host', opts),
  stopHost: () => ipcRenderer.invoke('lan:stop'),
  discover: (on) => ipcRenderer.invoke('lan:discover', on),
  onServers: (cb) => {
    const handler = (_e, list) => cb(list);
    ipcRenderer.on('lan:servers', handler);
    return () => ipcRenderer.removeListener('lan:servers', handler);
  },
  localIPs: () => ipcRenderer.invoke('lan:ips'),
  quit: () => ipcRenderer.invoke('app:quit'),
  setFullscreen: (on) => ipcRenderer.invoke('app:fullscreen', on),
});
