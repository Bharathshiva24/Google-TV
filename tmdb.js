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

// ---- trending feeds ----------------------------------------------------
// Recent, popular Indian titles, so the banner and picks stay current without
// anyone editing a hardcoded list.

const FEED_CACHE = path.join(__dirname, 'renderer', 'images', 'tmdb-feed.json');
const FEED_TTL = 12 * 3600 * 1000;          // refresh twice a day at most
const LANGS = 'hi|ta|te|ml|kn';

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

async function providerFor(kind, id, key) {
  try {
    const r = await net.fetch(`https://api.themoviedb.org/3/${kind}/${id}/watch/providers?api_key=${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    const india = ((await r.json()).results || {}).IN || {};
    const list = india.flatrate || india.free || india.ads || [];
    return list.length ? list[0].provider_name : null;
  } catch { return null; }
}

// kind: 'movie' | 'tv'
async function discover(kind, key, limit = 16) {
  const dateField = kind === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
  const since = monthsAgo(kind === 'movie' ? 18 : 36);
  const url = `https://api.themoviedb.org/3/discover/${kind}`
    + `?api_key=${encodeURIComponent(key)}`
    + `&with_original_language=${encodeURIComponent(LANGS)}`
    + `&sort_by=popularity.desc&include_adult=false&vote_count.gte=15`
    + `&${dateField}=${since}&page=1`;

  const r = await net.fetch(url);
  if (!r.ok) throw new Error(r.status === 401 ? 'TMDB rejected the API key' : 'TMDB HTTP ' + r.status);
  const img = (size, p) => 'https://image.tmdb.org/t/p/' + size + p;

  return ((await r.json()).results || [])
    .filter(x => x.backdrop_path || x.poster_path)
    .slice(0, limit)
    .map(x => ({
      id: x.id,
      kind,
      name: x.title || x.name || '',
      overview: (x.overview || '').trim(),
      year: String(x.release_date || x.first_air_date || '').slice(0, 4),
      card: x.backdrop_path ? img('w780', x.backdrop_path) : img('w500', x.poster_path),
      hero: x.backdrop_path ? img('w1280', x.backdrop_path) : null,
      poster: !x.backdrop_path
    }));
}

async function feeds(key) {
  if (!key) return null;
  try {
    const c = JSON.parse(fs.readFileSync(FEED_CACHE, 'utf8'));
    if (Date.now() - c.at < FEED_TTL) return c.data;
  } catch {}

  const [movies, shows] = await Promise.all([discover('movie', key), discover('tv', key)]);

  // Provider badges only for the handful that reach the banner.
  const hero = [...shows.filter(s => s.hero).slice(0, 3), ...movies.filter(m => m.hero).slice(0, 2)];
  await Promise.all(hero.map(async h => { h.provider = await providerFor(h.kind, h.id, key); }));

  const data = { movies, shows, hero };
  try { fs.mkdirSync(path.dirname(FEED_CACHE), { recursive: true }); fs.writeFileSync(FEED_CACHE, JSON.stringify({ at: Date.now(), data })); } catch {}
  return data;
}

module.exports.discover = discover;
module.exports.feeds = feeds;

