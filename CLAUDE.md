# CLAUDE.md — @arraypress/waveform-playlist

Multi-track playlist built on `@arraypress/waveform-player`. Parses `[data-track]`
markup into tracks/chapters/markers and drives one embedded player.

## Commands
- `npm test` — vitest (run before committing). `npm run typecheck` — strict `tsc`, must be 0 errors.
- `npm run lint` — Biome. `npm run build` — iife + esm + min + css + types. `prepublishOnly` runs test + build.
- `npm run size`, `npm run dev` — as elsewhere in the family.

## How player options reach the embedded player

One path: the container's `data-*` is read by the **core's**
`WaveformPlayer.utils.parseDataAttributes`, merged over the constructor
options, and forwarded. A new player option needs no parsing edit here — the
1.x hand-written fallback parser is gone (2.0 requires a 2.0 core) — only its
key in `OPTION_KEYS` (`src/js/element.ts`), so `<waveform-playlist>` observes
it; `test/element.test.js` goes red until it's there.

Two lists in `src/js/playlist.ts` decide what is *not* forwarded:
- `NOT_FORWARDED` — `audioMode` (the playlist owns its audio), `loop` (a looping
  track never fires `ended`, which breaks `continuous`), `showLoop` (its button
  turns that loop on) and `lazy` (the playlist loads its own player). Stripped
  from constructor options *and* data-*. Documented in `types.ts` too.
- `PER_TRACK_OPTIONS` — url, title, artist, album, artwork, markers, waveform,
  duration, downloadUrl, downloadName: each `[data-track]` supplies these via
  `trackPlayerOptions()`, which always returns every key so nothing carries
  over between tracks. A new per-track player option goes in both.

Track `data-duration` is display text *and* seconds (`durationSeconds` → the
player's `duration`). `data-waveform` strings (URLs, `wp1:` compact peaks) pass
through for the core to decode; only a `[`-prefixed value is JSON-parsed here.

## Layout
- `src/js/playlist.ts` — the `WaveformPlaylist` class (parsing, DOM, playlist
  logic), no import-time side effects.
- `src/js/element.ts` — the `<waveform-playlist>` element (light DOM, the
  element is the container). `OPTION_KEYS` = the playlist's own `data-*`
  keys + the core's `parseDataAttributes` keys minus `NOT_FORWARDED` and the
  per-track keys; `TRACK_ATTRIBUTES` = what `parseTracks()` reads. Its
  attributes reach `parseOptions()` through `optionSources` (a synthetic
  `dataset`), so both go through the same parsers. `test/element.test.js`
  fails if either list drifts — a new playlist option or a core option the
  playlist forwards needs adding to `OPTION_KEYS`.
  Rebuild = `snapshot()` → destroy → build → `resume()` (same track by
  element+url, else url; same time; playing if it was).
- `src/js/entry.ts` — `/no-autoinit`: exports, `WaveformPlaylist.init` (the
  scan), `window.WaveformPlaylist`. `src/js/index.ts` — the default entry:
  entry.ts + registering the element + running the scan. Keep side effects
  out of entry.ts. The two ES builds share `dist/waveform-playlist-shared.esm.js`.
- `src/js/types.ts` — owns `WaveformPlaylistOptions` and the parsed
  track/chapter/marker shapes. The four `waveform-playlist-*` wrappers derive their
  types from it *and* from `waveform-player`'s. A new option still has to be added
  here by hand (`test/types.test.js` checks it against `PLAYLIST_OWN_OPTIONS`).
- `types/` — **generated** declarations + maps (`npm run build:types`, internals
  marked `@internal` are stripped); committed, like `dist/`. Don't edit by hand.
  `src/` ships so the declaration maps resolve.
- One `tsconfig.json` (strict, ES2022) for tsc and esbuild, so the IIFE builds
  start with `"use strict"`; `tsconfig.build.json` emits `types/`.
- Tests: `test/setup.js` installs a mock core on `window` but with the **real**
  core's `utils`; `test/integration.test.js` runs against the real core.

## Conventions
- ESM only (`"type": "module"`, no CJS build); `main` is the ESM bundle,
  `engines.node >=22.12` so `require()` loads it. `dist/` is committed.
- Peer dep `@arraypress/waveform-player@^2.0.0`; devDependency is the
  published `^2.0.0`.
- No `data-waveform-autoinit="false"` opt-out (the core and sounds honour it);
  the default entry always scans and registers — use `/no-autoinit`.
- Browser floor Chrome/Edge 111, Firefox 114, Safari 16.4.
- Logging prefix `[WaveformPlaylist]`.

## Cross-repo
The four `waveform-playlist-*` wrappers do **not** inherit runtime forwarding from
this package — each needs its own edit. Their drift tests' `NOT_FORWARDED`
must list `audioMode`, `loop`, `showLoop` and `lazy` (the wrapper can pass
them, but the playlist drops them) — as of 2.0 they list only `audioMode`. Load the
`waveform-release` skill for the full checklist.
