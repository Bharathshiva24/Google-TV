const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hub', {
  open: (url, title) => ipcRenderer.send('open', url, title),
  home: () => ipcRenderer.send('home'),
  reload: () => ipcRenderer.send('reload'),
  back: () => ipcRenderer.send('back'),
  fullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  signOut: (host) => ipcRenderer.invoke('sign-out', host),
  logos: () => ipcRenderer.invoke('logos'),
  tmdb: (title, key) => ipcRenderer.invoke('tmdb', title, key),
  tmdbKey: () => ipcRenderer.invoke('tmdb-key'),
  tmdbFeeds: (key) => ipcRenderer.invoke('tmdb-feeds', key),
  onLogos: (cb) => ipcRenderer.on('logos-updated', cb),
  onHome: (cb) => ipcRenderer.on('go-home', cb)
});
