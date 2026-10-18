# Google TV–style launcher (macOS)

A single home screen for streaming services, modelled on the Google TV interface.
Netflix, Prime Video, Disney+ Hotstar, Sun NXT, YouTube, Apple TV, MX Player, ZEE5,
Sony LIV, Spotify and JioCinema each open **inside the app** in a real Chromium view —
not an iframe — so the services' own players run normally.

## Run

    npm install
    npm start

Requires Node.js. First launch fetches app icons and artwork, then caches both.

## Sign-in

Each service gets its own persistent Electron session, so you sign in once per service
and stay signed in. The app does not read credentials or cookies from your browser.

To sign out of everything:

    rm -rf ~/Library/Application\ Support/Google\ TV/Partitions

## Video playback (Widevine DRM)

Netflix, Prime Video and Hotstar encrypt their streams. This project uses the
[castLabs Electron build](https://github.com/castlabs/electron-releases), which ships
Widevine. On macOS the app must also be VMP-signed or Netflix returns error **E100**:

    python3 -m pip install --upgrade castlabs-evs
    python3 -m castlabs_evs.account signup      # free; `reauth` if you have an account
    python3 -m castlabs_evs.vmp sign-pkg node_modules/electron/dist

Re-run `sign-pkg` after every `npm install`. The EVS token expires monthly.

Note: the user agent must stay truthful. Spoofing a Chrome version that disagrees with
the runtime breaks DRM playback silently.

## Artwork (TMDB)

Posters, banners and official titles come from [TMDB](https://www.themoviedb.org/).
Put a free v3 API key in `tmdb-key.txt` in this folder, or paste it into Settings
(press `S` in the app). `tmdb-key.txt` is gitignored.

## App icons

Fetched automatically from each service's own site — web app manifest first, then
apple-touch-icon, then favicon — and cached in `renderer/logos/auto/`. `.ico` files are
decoded in-app since Electron cannot read them. To override one, drop your own square
image in `renderer/logos/` named after the app (`netflix.png`, `prime.svg`, …).

## Keys

| Key | Action |
|---|---|
| Arrow keys | Move, like a TV remote |
| Enter | Open the focused item |
| Esc / ⌘H | Back to the home screen |
| `/` or ⌘K | Search |
| `S` | Settings |
| `F` | Full screen |
| ⌘[ / ⌘R | Back / reload inside a service |

## Layout

- **For you** — hero banner plus horizontal rows
- **Movies**, **Shows** — 4-column grids, vertical scrolling
- **Apps** — 5-column grid of services

## Build a .dmg

    npm run dist

## Not affiliated

Not affiliated with Google, Netflix, Amazon, Disney or any service listed. "Google TV"
refers to the interface style this project imitates. All content is played by each
service's own web player, with its own subscription and DRM.
