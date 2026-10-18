const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu, shell, protocol, net, nativeImage } = require('electron');
const { pathToFileURL } = require('url');
const logos = require('./logos');
const tmdb = require('./tmdb');
const path = require('path');
const fs = require('fs');

// Widevine DRM (needed for Netflix / Prime / Hotstar playback) comes from the
// castlabs Electron build. On stock Electron `components` is undefined and DRM is skipped.
const { components } = require('electron');

const BAR = 46;            // height of the viewer's top bar drawn by the renderer
// Netflix and other DRM sites reject a spoofed user-agent: the claimed Chrome version
// then disagrees with what the runtime can actually do. Instead of inventing one, use
// Electron's real UA with only the "Electron/..." and app-name tokens removed, so the
// Chrome version stays truthful. (castlabs/electron-releases#199)
function realChromeUA() {
  return app.userAgentFallback
    .replace(/\(KHTML, like Gecko\) .*?(?=Chrome\/)/, '(KHTML, like Gecko) ')  // drop app-name token
    .replace(/ Electron\/[\d.]+/, '');                                        // drop Electron token
}

// Each service gets its own persistent profile => sign in once, stay signed in.
const GROUPS = [
  ['netflix',  /netflix\.com$/],
  ['prime',    /(primevideo\.com|amazon\.(com|in))$/],
  ['hotstar',  /(hotstar\.com|disneyplus\.com)$/],
  ['sunnxt',   /sunnxt\.com$/],
  ['youtube',  /(youtube\.com|youtu\.be|google\.com|accounts\.google\.com)$/],
  ['apple',    /apple\.com$/],
  ['mx',       /mxplayer\.in$/],
  ['zee5',     /zee5\.com$/],
  ['sonyliv',  /sonyliv\.com$/],
  ['spotify',  /spotify\.com$/]
];
const groupFor = (url) => {
  try { const h = new URL(url).hostname; for (const [id, re] of GROUPS) if (re.test(h)) return id; return 'h_' + h.replace(/^www\./, ''); }
  catch { return 'misc'; }
};

let win, view = null, fsView = false;

function bounds() {
  const [w, h] = win.getContentSize();
  return fsView ? { x: 0, y: 0, width: w, height: h } : { x: 0, y: BAR, width: w, height: h - BAR };
}
function layout() { if (view) view.setBounds(bounds()); }

function openService(url, title) {
  closeService(false);
  const ses = session.fromPartition('persist:' + groupFor(url));
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['fullscreen', 'media', 'notifications', 'clipboard-sanitized-write'].includes(perm)));
  view = new WebContentsView({ webPreferences: { session: ses, contextIsolation: true, sandbox: true } });
  const wc = view.webContents;
  win.contentView.addChildView(view);
  layout();
  // Popups (login windows, "open in new tab") stay inside the same view.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) wc.loadURL(url); else shell.openExternal(url);
    return { action: 'deny' };
  });
  // HTML5 video fullscreen -> fill the window.
  wc.on('enter-html-full-screen', () => { fsView = true; win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { fsView = false; layout(); });
  wc.loadURL(url);
}

function closeService(notify = true) {
  if (view) {
    try { win.contentView.removeChildView(view); view.webContents.close(); } catch {}
    view = null; fsView = false;
  }
  if (notify && win && !win.isDestroyed()) win.webContents.send('go-home');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#0a0a0c', title: 'Google TV',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile('renderer/index.html');
  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
}

ipcMain.handle('logos', () => logos.list());
// Key lives in tmdb-key.txt, which is gitignored - never in the source.
const fileKey = () => { try { return fs.readFileSync(path.join(__dirname, 'tmdb-key.txt'), 'utf8').trim(); } catch { return ''; } };
ipcMain.handle('tmdb-key', () => fileKey());
ipcMain.handle('tmdb', (_e, title, key) =>
  tmdb.lookup(title, key || fileKey()).catch(err => ({ error: String(err && err.message || err) })));
ipcMain.on('open', (_e, url, title) => { if (/^https?:\/\//.test(url)) openService(url, title); });
ipcMain.on('home', () => closeService(false));
ipcMain.on('reload', () => view && view.webContents.reload());
ipcMain.on('back', () => view && view.webContents.navigationHistory.canGoBack() && view.webContents.navigationHistory.goBack());
ipcMain.on('toggle-fullscreen', () => win.setFullScreen(!win.isFullScreen()));
ipcMain.handle('sign-out', async (_e, id) => { await session.fromPartition('persist:' + id).clearStorageData(); return true; });

app.setName('Google TV');
protocol.registerSchemesAsPrivileged([{ scheme: 'gtvlogo', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }]);
app.whenReady().then(async () => {
  if (components && components.whenReady) {
    try { await components.whenReady(); console.log('Widevine ready:', components.status()); }
    catch (e) { console.warn('Widevine unavailable:', e); }
  }
  // Dock icon for `npm start`; packaged builds use build/icon.png via electron-builder.
  if (process.platform === 'darwin' && app.dock) {
    const ic = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
    if (!ic.isEmpty()) app.dock.setIcon(ic);
  }
  app.userAgentFallback = realChromeUA();
  console.log('User agent:', app.userAgentFallback);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Navigate', submenu: [
      { label: 'Home', accelerator: 'CmdOrCtrl+H', click: () => closeService(true) },
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => view && view.webContents.navigationHistory.goBack() },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => view && view.webContents.reload() }
    ]},
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]));
  protocol.handle('gtvlogo', (req) => net.fetch(pathToFileURL(path.join(logos.dir(), path.basename(new URL(req.url).pathname))).toString()));
  createWindow();
  logos.refreshAll().then(() => win && !win.isDestroyed() && win.webContents.send('logos-updated')).catch(() => {});
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
