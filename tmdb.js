// Looks up real artwork for a title via TMDB (themoviedb.org).
// Runs in the main process so there is no CORS restriction, and caches results
// next to the app so repeat launches are instant and the API isn't hammered.
const { net } = require('electron');
const fs = require('fs');
const path = require('path');

// v2 adds the official title, year and poster flag, so the v1 cache is not reused.
const CACHE = path.join(__dirname, 'renderer', 'images', 'tmdb-cache-v2.json');
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
  return cache;
}
function save() {
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1)); }
  catch {}
}

// Card art is "F A R Z I" on screen; TMDB needs "FARZI".
function cleanTitle(t) {
  const s = String(t || '').trim();
  return /^(\S ){2,}\S$/.test(s) ? s.replace(/ /g, '') : s;
}

async function lookup(title, key) {
  const q = cleanTitle(title);
  if (!q || !key) return null;
  const c = load();
  if (Object.prototype.hasOwnProperty.call(c, q)) return c[q];

  const url = 'https://api.themoviedb.org/3/search/multi?include_adult=false'
    + '&api_key=' + encodeURIComponent(key)
    + '&query=' + encodeURIComponent(q);
  const r = await net.fetch(url);
  if (!r.ok) throw new Error(r.status === 401 ? 'TMDB rejected the API key' : 'TMDB HTTP ' + r.status);
  const j = await r.json();

  const hit = (j.results || [])
    .filter(x => x.backdrop_path || x.poster_path)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];

  // 16:9 backdrops suit both the cards and the banner, so nothing has to be cropped
  // to fit. Posters are only a fallback when a title has no backdrop.
  const img = (size, p) => 'https://image.tmdb.org/t/p/' + size + p;
  const out = hit ? {
    card: hit.backdrop_path ? img('w780', hit.backdrop_path) : img('w500', hit.poster_path),
    hero: hit.backdrop_path ? img('w1280', hit.backdrop_path) : null,
    // A poster is 2:3, so a 16:9 card must letterbox it rather than crop faces off.
    poster: !hit.backdrop_path,
    name: hit.title || hit.name || q,
    year: String(hit.release_date || hit.first_air_date || '').slice(0, 4)
  } : null;

  c[q] = out;
  save();
  return out;
}

module.exports = { lookup, cleanTitle };
