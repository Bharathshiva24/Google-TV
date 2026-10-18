# Google TV–style launcher for macOS

A single home screen for your streaming subscriptions, modelled on the Google TV
interface. Services open **inside the app** in real Chromium views — not iframes —
so each one runs its own official web player with its own DRM and your own account.

![MIT License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

---

## Overview

Streaming across several services usually means several browser tabs and several
sign-ins. This project collects them behind one remote-navigable interface: a hero
banner, rows of titles, and a row of app tiles, laid out like a television home
screen rather than a browser.

It is a personal project and an interface experiment. It does not host, re-stream,
decrypt or redistribute any content — every service is loaded from its own website
and played by its own player.

---

## Features

- **Unified home screen** — Netflix, Prime Video, Disney+ Hotstar, Sun NXT, YouTube,
  Apple TV, MX Player, ZEE5, Sony LIV, Spotify and JioCinema in one window
- **Per-service sessions** — each service has its own isolated, persistent Electron
  session, so you sign in once per service and stay signed in
- **DRM playback** — protected video plays via Widevine, where the service permits it
  (see [DRM setup](#drm-setup-widevine))
- **Remote-style navigation** — arrow keys move, Enter opens, Esc goes back
- **Browse grids** — Movies, Shows and Apps tabs render as vertically scrolling grids
- **Artwork** — posters, banners and official titles from TMDB, cached locally
- **App icons** — fetched from each service's own site at runtime and cached
- **Search** — across apps and titles, with per-service search hand-off
- **Settings** — banner rotation, custom app tiles, API key entry

---

## Requirements

| | |
|---|---|
| OS | macOS (Apple Silicon or Intel) |
| Node.js | 18 or newer |
| Disk | ~400 MB, mostly the Electron runtime |
| Accounts | Your own subscription for each service you use |

---

## Installation

```bash
git clone https://github.com/Bharathshiva24/Google-TV.git
cd Google-TV
npm install
npm start
```

`npm install` downloads the castLabs Electron build, which is larger than stock
Electron because it bundles the Widevine CDM.

### If Electron fails to start

Some Node versions block Electron's postinstall step, leaving the runtime
half-installed. If `npm start` reports *"Electron failed to install correctly"*:

```bash
node node_modules/electron/install.js
```

If the extraction itself fails, unpack the cached archive directly:

```bash
cd node_modules/electron
rm -rf dist && mkdir dist
ditto -x -k "$(find ~/Library/Caches/electron -name 'electron-v*darwin-*.zip' | head -1)" dist
printf 'Electron.app/Contents/MacOS/Electron' > path.txt
xattr -cr dist
```

---

## Configuration

### TMDB API key (optional)

Artwork and official titles come from [TMDB](https://www.themoviedb.org/). Without a
key the app still runs — cards fall back to colour placeholders with text titles.

```bash
cp .env.example .env
```

Then edit `.env`:

```
TMDB_API_KEY=your_tmdb_v3_api_key_here
```

Get a free key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
(Developer plan, personal use). Use the **API Key (v3 auth)** value, not the read
access token.

Alternatively, press `S` in the app and paste the key into Settings — it is then
stored in the app's local storage rather than on disk.

`.env` is gitignored. Never commit it.

### Custom artwork and logos

| Folder | Contents |
|---|---|
| `renderer/images/` | `hero-1`…`hero-5` banners, `pick-1`…`pick-6` cards (jpg/png/webp) |
| `renderer/logos/` | Per-app overrides, e.g. `netflix.png`, `prime.svg` |
| `renderer/logos/auto/` | Icons fetched automatically — managed by the app |

Files you provide take priority over anything downloaded.

---

## DRM setup (Widevine)

Netflix, Prime Video and Hotstar encrypt their streams. Stock Chromium cannot decrypt
them, so this project uses the
[castLabs Electron build](https://github.com/castlabs/electron-releases), which ships
the Widevine CDM.

On macOS the application must also be **VMP-signed**, or Netflix returns error
**E100**. Loading the CDM is not sufficient on its own:

```bash
python3 -m pip install --upgrade castlabs-evs
python3 -m castlabs_evs.account signup      # free; use `reauth` if you have an account
python3 -m castlabs_evs.vmp sign-pkg node_modules/electron/dist
```

Notes:

- Re-run `sign-pkg` after every `npm install` — reinstalling replaces the signed binary
- The EVS authorization token expires roughly monthly; re-run `reauth` then sign again
- The user agent must stay truthful. Spoofing a Chrome version that disagrees with the
  runtime breaks DRM silently, with no error beyond a playback failure

---

## Usage

| Key | Action |
|---|---|
| Arrow keys | Move between tiles, like a TV remote |
| Enter | Open the focused item |
| Esc / ⌘H | Return to the home screen |
| `/` or ⌘K | Search |
| `S` | Settings |
| `F` | Toggle full screen |
| ⌘[ | Back, inside a service |
| ⌘R | Reload, inside a service |

### Tabs

- **For you** — hero banner with horizontally scrolling rows
- **Movies** / **Shows** — four-column grids, vertical scroll
- **Apps** — five-column grid of services

### Signing out

Each service keeps an isolated session. To clear all of them:

```bash
rm -rf ~/Library/Application\ Support/Google\ TV/Partitions
```

### Building a distributable

```bash
npm run dist
```

Produces a `.dmg` in `dist/`. VMP signing must be done before packaging.

---

## Project structure

```
main.js            Electron main process: windows, sessions, DRM, IPC
preload.js         Context-isolated bridge between main and renderer
logos.js           Fetches and caches official app icons (incl. ICO decoding)
tmdb.js            TMDB lookups for artwork and titles, with on-disk cache
renderer/
  index.html       The entire UI — markup, styles and logic in one file
  images/          Your artwork and the TMDB cache
  logos/           Your logo overrides and the auto-fetched cache
build/icon.png     Application icon
```

---

## Known limitations

- **macOS only.** The code is close to cross-platform, but DRM signing, the Dock icon
  and the sign-out path are macOS-specific.
- **Playback resolution is capped.** Browser-based Widevine is limited to 720p on
  Netflix and similar on other services. Native apps get higher tiers; this will not.
- **DRM requires signing.** Without VMP signing, protected services load and let you
  sign in but refuse to play video.
- **Services can change without warning.** Layout, DRM policy or bot detection changes
  on any provider's site can break playback or sign-in at any time.
- **Icons depend on each site.** If a service publishes only a small favicon, its tile
  will look soft. Supply your own file to override it.
- **Artwork matching is approximate.** TMDB is searched by title; an ambiguous title
  can match the wrong entry. Set `img` manually in `renderer/index.html` to pin one.
- **Regional availability applies.** Content and even TMDB itself may be unreachable on
  some ISPs. Netflix error E100 usually means the title is unavailable in your region,
  not that the app is broken.
- **No offline downloads, casting, profiles switching or parental controls.**

---

## Security and privacy

- **No credentials are read from your browser.** The app does not touch Chrome's cookie
  store, keychain entries or saved passwords.
- **Sessions stay local.** Each service's cookies live in an isolated Electron partition
  on your machine. Nothing is transmitted anywhere except to the service itself.
- **No telemetry.** The app makes no analytics or reporting calls.
- **Secrets live in the environment.** The TMDB key is read from `TMDB_API_KEY` or a
  gitignored `.env`. No credential is committed to this repository.
- **Context isolation is on** and service views run sandboxed, so page scripts cannot
  reach Node APIs.
- **Rotate anything exposed.** If you ever paste a key into a chat, issue or screenshot,
  revoke and regenerate it.

If you find a security problem, please open an issue describing the impact — without
including real credentials.

---

## Caution and legal notices

This is an independent, non-commercial personal project. Read this section before
using, forking or redistributing it.

### Third-party logos and trademarks

Company names, logos, brand marks and product names referenced or displayed —
including Google TV, Netflix, Prime Video, Disney+ Hotstar, Sun NXT, YouTube, Apple TV,
MX Player, ZEE5, Sony LIV, Spotify and JioCinema — are the property of their respective
owners. Their appearance here is nominative, to identify each service, and does **not**
imply affiliation, sponsorship, endorsement or partnership. This project is not
affiliated with or endorsed by Google or any streaming provider. The interface is an
independent homage to the Google TV design language, not a Google product.

### Widevine and DRM

Playback of protected content depends on Widevine support, valid licensing, platform
capabilities and each provider's own DRM policy. This project uses Widevine through the
castLabs Electron distribution and the official EVS signing process, as those vendors
intend. It does **not** bypass, weaken, strip or circumvent DRM, access controls,
geographic restrictions or authentication, and must not be modified to do so. Whether a
given title plays is entirely the provider's decision. Circumventing technological
protection measures is unlawful in many jurisdictions.

### Third-party streaming services

Netflix, Prime Video, Sun NXT, Disney+ Hotstar and every other integrated service are
independently operated and governed by their own terms of service, privacy policies and
technical constraints. You are responsible for holding a valid subscription and for
complying with each provider's terms. Using a third-party interface may not be permitted
by every provider's terms — review them. Services may change or block access at any time.

### Copyright and content rights

Movie and series posters, promotional artwork, backdrops, synopses and other metadata are
supplied at runtime by [TMDB](https://www.themoviedb.org/) and remain the property of
their respective rights holders, subject to TMDB's
[terms of use](https://www.themoviedb.org/terms-of-use). This product uses the TMDB API
but is **not endorsed or certified by TMDB**. No artwork is redistributed in this
repository; it is fetched and cached locally at runtime. All streamed content remains the
property of its rights holders.

### Authentication and privacy

This project stores no passwords and transmits no credentials. Sign-in happens directly
with each provider inside an isolated session, and session cookies remain on your own
machine. Do not modify this project to capture, log, export or transmit passwords,
session cookies or authentication tokens, and do not commit such data to any repository.

### Compatibility

See [Known limitations](#known-limitations). In short: macOS only, 720p ceiling on
protected content, DRM requires signing, and provider-side changes can break things
without notice. Provided **as is**, without warranty — see [LICENSE](LICENSE).

---

## Contributing

Issues and pull requests are welcome. Please do not submit changes that circumvent DRM,
scrape content, store credentials, or bundle third-party logos or artwork into the
repository.

---

## License

[MIT](LICENSE) — covers this project's own source code only. It grants no rights over
third-party trademarks, logos, artwork, metadata or streamed content, nor over Widevine
or the castLabs Electron distribution, each of which carries its own terms.
