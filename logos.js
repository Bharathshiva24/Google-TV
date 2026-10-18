// Downloads each service's own official icon straight from its website (runs on your machine,
// using your internet connection) and caches it in the app's data folder.
const { app, net, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SITES = {
  netflix: 'https://www.netflix.com/',        youtube: 'https://www.youtube.com/',
  prime:   'https://www.primevideo.com/',     hotstar: 'https://www.hotstar.com/in',
  sunnxt:  'https://www.sunnxt.com/',         appletv: 'https://tv.apple.com/',
  mxplayer:'https://www.mxplayer.in/',        zee5:    'https://www.zee5.com/',
  sonyliv: 'https://www.sonyliv.com/',        spotify: 'https://open.spotify.com/',
  jio:     'https://www.jiocinema.com/'
};
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const MAX_AGE = 30 * 24 * 3600 * 1000;
const EXT = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Prefer a folder inside the app (visible, inspectable, works with relative URLs).
// Falls back to the app's data folder when the app folder is read-only (packaged .app).
let DIR = null;
const dir = () => {
  if (DIR) return DIR;
  const devDir = path.join(__dirname, 'renderer', 'logos', 'auto');
  try { fs.mkdirSync(devDir, { recursive: true }); fs.accessSync(devDir, fs.constants.W_OK); DIR = devDir; }
  catch { DIR = path.join(app.getPath('userData'), 'logos'); fs.mkdirSync(DIR, { recursive: true }); }
  return DIR;
};
const inApp = () => dir().endsWith(path.join('renderer', 'logos', 'auto'));
const LOG = [];
const logPath = () => path.join(dir(), '_log.txt');
const flush = () => { try { fs.writeFileSync(logPath(), LOG.join('\n') + '\n'); } catch {} };

const attr = (tag, name) => { const m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')); return m ? (m[2] ?? m[3] ?? m[4]) : ''; };

// A site's web app manifest lists large PNGs (192/512px) - the best source of
// high-resolution icons. Returns extra candidates, or [] if there is no manifest.
async function manifestIcons(html, base) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/manifest/i.test(attr(tag, 'rel'))) continue;
    const href = attr(tag, 'href'); if (!href) continue;
    try {
      const mUrl = new URL(href, base).toString();
      const { text } = await get(mUrl, 'text');
      for (const ic of (JSON.parse(text).icons || [])) {
        if (!ic.src) continue;
        if (/monochrome/i.test(ic.purpose || '')) continue;          // silhouette, not the logo
        if (/monochrome/i.test(ic.src)) continue;
        const size = Math.max(...String(ic.sizes || '0x0').split(/\s+/).map(z => parseInt(z, 10) || 0));
        out.push({ url: new URL(ic.src, mUrl).toString(), score: 8000 + size, manifest: true });
      }
    } catch {}
    break;
  }
  return out;
}

function candidates(html, base) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = attr(tag, 'rel').toLowerCase(), href = attr(tag, 'href');
    if (!href || !/icon/.test(rel)) continue;
    let url; try { url = new URL(href, base).toString(); } catch { continue; }
    const size = parseInt((attr(tag, 'sizes').match(/(\d+)x/) || [])[1] || '0', 10);
    let score = size;
    if (/\.svg(\?|$)/i.test(url) || /svg/.test(attr(tag, 'type'))) score += 5000;     // vector, transparent
    else if (rel.includes('apple-touch-icon')) score += 3000;                         // large PNG
    else if (/\.ico(\?|$)/i.test(url)) score += 200;                                  // decodable via icoExtract
    if (rel.includes('mask-icon')) score -= 4000;                                      // monochrome
    if (/monochrome/i.test(url)) score -= 9000;                                        // silhouette variant
    out.push({ url, score });
  }
  for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.ico']) {
    try { out.push({ url: new URL(p, base).toString(), score: p.includes('apple') ? 2500 : -1000 }); } catch {}
  }
  return out.sort((a, b) => b.score - a.score);
}

async function get(url, as) {
  const r = await net.fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9' }, redirect: 'follow' });
  if (!r.ok) throw new Error(r.status);
  return as === 'text' ? { text: await r.text(), url: r.url || url } : { buf: Buffer.from(await r.arrayBuffer()), type: (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
}

function existing(id) {
  try { const f = fs.readdirSync(dir()).find(n => n.startsWith(id + '.')); return f ? path.join(dir(), f) : null; } catch { return null; }
}

// nativeImage cannot decode .ico, and several services (Hotstar, Sun NXT, JioCinema,
// Netflix) only offer one. An .ico is a container: pick its largest entry, which is
// either an embedded PNG or a headerless DIB we can turn back into a .bmp.
function icoExtract(buf) {
  try {
    if (buf.length < 22 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
    const n = buf.readUInt16LE(4);
    let best = null;
    for (let i = 0; i < n; i++) {
      const o = 6 + i * 16;
      if (o + 16 > buf.length) break;
      const w = buf[o] || 256, h = buf[o + 1] || 256;
      const size = buf.readUInt32LE(o + 8), off = buf.readUInt32LE(o + 12);
      if (off + size > buf.length || size < 8) continue;
      if (!best || w * h > best.w * best.h) best = { w, h, size, off };
    }
    if (!best) return null;
    const data = buf.subarray(best.off, best.off + best.size);
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e) return { buf: data, ext: 'png' };
    const biSize = data.readUInt32LE(0);
    if (biSize < 12 || biSize > 124) return null;
    const bits = data.readUInt16LE(14);
    const clrUsed = data.readUInt32LE(32);
    const palette = bits <= 8 ? (clrUsed || (1 << bits)) * 4 : 0;
    const out = Buffer.alloc(14 + data.length);
    out.write('BM', 0);
    out.writeUInt32LE(14 + data.length, 2);
    out.writeUInt32LE(14 + biSize + palette, 10);
    data.copy(out, 14);
    out.writeInt32LE(best.h, 14 + 8);        // ICO stores double height (image + mask)
    return { buf: out, ext: 'bmp' };
  } catch { return null; }
}

// Returns { w, h, bg } - bg is the icon's own background colour when its corners are
// opaque and agree, so the tile can use it and the square icon blends into the circle.
function inspect(buf, ext) {
  if (ext === 'svg') return { w: 0, h: 0, bg: null };          // vector: assume transparent
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) return null;
  const { width: w, height: h } = img.getSize();
  let bg = null;
  try {
    const bmp = img.toBitmap();                                 // BGRA, row-major
    const at = (x, y) => { const i = (y * w + x) * 4; return [bmp[i + 2], bmp[i + 1], bmp[i], bmp[i + 3]]; };
    const pts = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];
    const opaque = pts.every(c => c[3] > 250);
    const near = pts.every(c => Math.abs(c[0] - pts[0][0]) < 12 && Math.abs(c[1] - pts[0][1]) < 12 && Math.abs(c[2] - pts[0][2]) < 12);
    if (opaque && near) bg = '#' + pts[0].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
  } catch {}
  return { w, h, bg };
}

const META_V = 2;
const META = {};
const metaPath = () => path.join(dir(), '_meta.json');

async function fetchOne(id) {
  const have = existing(id);
  // Re-fetch when there is no metadata for this icon: it predates the high-resolution
  // lookup, so its size and background colour are unknown.
  let known = false;
  try { const m = JSON.parse(fs.readFileSync(metaPath(), 'utf8')); known = m.__v === META_V && !!m[id]; } catch {}
  if (have && known && Date.now() - fs.statSync(have).mtimeMs < MAX_AGE) {
    META[id] = JSON.parse(fs.readFileSync(metaPath(), 'utf8'))[id];
    LOG.push(`${id}: cached ${path.basename(have)}`);
    return;
  }
  let page = { text: '', url: SITES[id] };
  try {
    page = await get(SITES[id], 'text');
    LOG.push(`${id}: page ok (${page.text.length} chars) ${page.url}`);
  } catch (e) { LOG.push(`${id}: PAGE FAILED ${e.message}`); }
  let cands = [];
  try { cands = candidates(page.text, page.url || SITES[id]); } catch (e) { LOG.push(`${id}: PARSE FAILED ${e.message}`); }
  try { cands = (await manifestIcons(page.text, page.url || SITES[id])).concat(cands).sort((a, b) => b.score - a.score); } catch {}
  LOG.push(`${id}: ${cands.length} candidates -> ${cands.slice(0, 3).map(c => c.url).join(' | ')}`);

  const MIN = 128;              // anything smaller looks soft on a 131px tile
  let best = null;              // best below MIN, used only if nothing better exists
  for (const c of cands.slice(0, 10)) {
    try {
      const { buf, type } = await get(c.url);
      const ext = EXT[type] || (/\.svg/i.test(c.url) ? 'svg' : null);
      if (!ext) { LOG.push(`${id}:   skip (type "${type}") ${c.url}`); continue; }
      if (buf.length < 400) { LOG.push(`${id}:   skip (${buf.length} bytes) ${c.url}`); continue; }
      let data = buf, useExt = ext;
      if (ext === 'ico') {
        const conv = icoExtract(buf);
        if (!conv) { LOG.push(`${id}:   skip (bad ico) ${c.url}`); continue; }
        data = conv.buf; useExt = conv.ext;
      }
      const info = inspect(data, useExt);
      if (!info) { LOG.push(`${id}:   skip (undecodable ${useExt}) ${c.url}`); continue; }
      const px = ext === 'svg' ? 9999 : Math.max(info.w, info.h);
      if (px < MIN) {
        if (!best || px > best.px) best = { buf: data, ext: useExt, info, px, url: c.url };
        LOG.push(`${id}:   small ${info.w}x${info.h} ${c.url}`);
        continue;
      }
      return save(id, data, useExt, info, px, c.url);
    } catch (e) { LOG.push(`${id}:   err ${e.message} ${c.url}`); }
  }
  if (best) return save(id, best.buf, best.ext, best.info, best.px, best.url);
  LOG.push(`${id}: NONE`);
}

function save(id, buf, ext, info, px, url) {
  fs.mkdirSync(dir(), { recursive: true });
  for (const n of fs.readdirSync(dir())) if (n.startsWith(id + '.')) fs.unlinkSync(path.join(dir(), n));
  fs.writeFileSync(path.join(dir(), `${id}.${ext}`), buf);
  META[id] = { file: `${id}.${ext}`, w: info.w, h: info.h, bg: info.bg };
  LOG.push(`${id}: SAVED ${id}.${ext} ${info.w}x${info.h} bg=${info.bg || 'transparent'} <- ${url}`);
}

async function refreshAll() {
  LOG.length = 0;
  LOG.push(`run ${new Date().toISOString()}  dir=${dir()}`);
  const r = await Promise.allSettled(Object.keys(SITES).map(fetchOne));
  r.forEach((x, i) => { if (x.status === 'rejected') LOG.push(`${Object.keys(SITES)[i]}: REJECTED ${x.reason}`); });
  // auto/ is entirely app-managed: drop anything we did not just verify, so icons
  // saved by older versions cannot linger as low-quality tiles.
  try {
    for (const n of fs.readdirSync(dir())) {
      if (n.startsWith('_')) continue;
      const id = n.slice(0, n.lastIndexOf('.'));
      if (id.startsWith('__')) continue;
      if (!META[id]) { fs.unlinkSync(path.join(dir(), n)); LOG.push(`cleanup: removed stale ${n}`); }
    }
  } catch {}
  try { fs.writeFileSync(metaPath(), JSON.stringify({ __v: META_V, ...META }, null, 1)); } catch {}
  flush();
}
function list() {
  let meta = META;
  if (!Object.keys(meta).length) { try { meta = JSON.parse(fs.readFileSync(metaPath(), 'utf8')); } catch {} }
  const out = {};
  for (const id of Object.keys(SITES)) {
    const f = existing(id);
    if (!f) continue;
    const base = path.basename(f);
    out[id] = {
      src: inApp() ? 'logos/auto/' + base : 'gtvlogo://logos/' + base,
      bg: (meta[id] || {}).bg || null
    };
  }
  return out;
}
module.exports = { refreshAll, list, dir };
