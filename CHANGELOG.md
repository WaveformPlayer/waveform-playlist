# Changelog

All notable changes to `@arraypress/waveform-playlist` are documented here. The
format is based on [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.1.0] — 2026-11-21

### Added

- **`WaveformPlaylist.defineElement(name?)`** registers `<waveform-playlist>`
  from the global, for a `<script>` page that opted out of auto-init.

- **`<waveform-playlist>` custom element.** Light DOM: the element is the
  playlist's container, so its `[data-track]` / `[data-chapter]` children are
  written exactly as inside `data-waveform-playlist`, the stylesheet applies
  as is, and `waveformplayer:*` events bubble from the tag.
  - Attributes: every `data-*` option the playlist reads — its own (`layout`,
    `continuous`, `cover-size`, …) and the player options it forwards
    (`height`, `show-volume`, `waveform-style`, …) — with or without the
    `data-` prefix, the unprefixed form winning; a bare boolean attribute is
    true. `style` is CSS, so its alias is `data-style` only. `audio-mode`,
    `loop`, `show-loop`, `lazy` and the per-track keys are not attributes
    (the playlist never forwards them).
  - Built on connect (after `DOMContentLoaded` while the page is still
    parsing); destroyed on removal, unless the element is re-added in the
    same task, so moving it keeps the playlist and its playback.
  - Changing an option attribute, or adding, removing or editing a
    `[data-track]` / `[data-chapter]` child, rebuilds the playlist (once per
    microtask). The rebuild carries on with the current track — same
    position, playing if it was — when that track (same element and url, else
    same url) is still there; otherwise it starts on the first track, paused.
  - `.playlist` is the instance (a new one after a rebuild); `play()`,
    `pause()`, `next()` and `previous()` forward to it.
  - The default entry (npm root and the CDN build) registers it;
    `defineWaveformPlaylistElement(name = 'waveform-playlist')` registers it
    under any name. Typed in `HTMLElementTagNameMap`.
  - CSS: `display: block`; before upgrade it reserves
    `--wp-element-height` (default `90px`), and its raw tracks stay hidden
    until the playlist is built.
- **`@arraypress/waveform-playlist/no-autoinit`** — the same exports without
  the import-time side effects: it neither scans for `[data-waveform-playlist]`
  nor registers `<waveform-playlist>`. Both ES entries share one chunk, so an
  app importing both gets one class.

### Fixed

- **Pages that opted out of auto-init still had playlists built.** The
  family's switch, `<html data-waveform-autoinit="false">`, is now honoured
  as the core honours it: on such a page importing the package (or loading
  the CDN script) neither scans for `[data-waveform-playlist]` nor registers
  `<waveform-playlist>`. `WaveformPlaylist.init()` and
  `defineWaveformPlaylistElement()` still do, when the page calls them.
- The `[data-waveform-playlist]` scan (`WaveformPlaylist.init()`) skips a
  container that already has a playlist built in script, instead of building
  a second one over it.

## [2.0.0] — 2026-11-21

Requires `@arraypress/waveform-player` 2.0.

### Added

- **Per-track `duration`.** A track's `data-duration` now also reaches the
  player as its 2.0 `duration` option, so the time readout, markers and seeks
  have a length before the audio's metadata loads (with `preload: 'none'`,
  that is not until playback starts). It accepts `"3:45"`, `"1:02:03"` or a
  bare count of seconds (`"225"`, the core's own form). Parsed tracks gain
  `durationSeconds`.
- **Per-track download target.** `data-download-url` and `data-download-name`
  on a `[data-track]` (`downloadUrl` / `downloadName` on the parsed track)
  set the player's download link for that track; without them the core
  links the track's own url. Turn the link on with `data-show-download` on
  the playlist.
- **Compact `wp1:` peaks** in a track's `data-waveform` are passed through
  for the player to decode, like a peaks URL.
- The 2.0 player options set on the playlist — `showVolume`, `volume`,
  `showDownload`, `volumeLabel`, `muteLabel`, `downloadLabel`, … — reach its
  player, from `data-*` or constructor options.

### Changed

- **Written in TypeScript**, with generated type declarations (`types/`) and
  declaration maps, so "Go to definition" opens the shipped source.
- **Browser support is Chrome/Edge 111+, Firefox 114+ and Safari 16.4+**,
  as the core's. The bundles are built for ES2022.
- **The script-tag builds run in strict mode.** They now start with
  `"use strict"`; the ES module build always did.
- **Only the core reads the playlist's `data-*` player options.** The
  playlist kept a parser of its own for cores older than
  `WaveformPlayer.utils.parseDataAttributes`; every 2.0 core has it, so the
  core's parser is the only path and the playlist can no longer fall behind
  a new player option. Its value checks are the core's: a non-numeric
  `data-height` falls back to the default with the core's warning, and
  `data-playback-rates="2"` is a one-rate list.
- **A bare-seconds `data-duration` is shown formatted**: `"187"` displays as
  `3:07` (it was shown as `187`). Any other value is shown as written.
- **`main` is the ES module build** (`"type": "module"`). It was the IIFE,
  so `require()` returned an empty object and only set
  `window.WaveformPlaylist`.
- **An explicit `exports` map**: `.`, `./styles.css`, `./dist/*` (for the
  documented CDN and `dist/` paths) and `./package.json`.
- **CSS tidied for the 2.0 browser floor**: declarations that could never
  apply are gone and repeated rules are merged. Rendering is unchanged.

### Removed

- **CommonJS.** The `require` export condition (which pointed at the IIFE)
  and the `module` field are gone. `require('@arraypress/waveform-playlist')`
  still works on Node 22.12+, which loads the ES module through `require()`;
  `engines` now says `>=22.12`.
- **`loop`, `showLoop` and `lazy` are never passed to the player**, from
  constructor options or `data-*`, like `audioMode`. A looping track never
  fires `ended`, which ends `continuous` auto-advance, and `showLoop`'s button
  turns that same loop on, so it would play the current track forever. `lazy`
  would only defer the playlist's own player.
- **The container's `data-duration`, `data-download-url` and
  `data-download-name`** are ignored: they describe one track, so they go on
  each `[data-track]`.

### Fixed

- **Compact density keeps its 28px thumbnails on phones.** Below 480px the
  narrow-screen rule's 32px lead column overrode `density: 'compact'`, so
  compact lists got bigger thumbnails on the smallest screens.

## [1.9.0] — 2026-10-07

### Changed

- **A redesigned stylesheet, one grid for every layout.** Three variables
  line everything up — `--wp-inset`, `--wp-thumb-size`, `--wp-gap`: the
  cover, thumbnails and chapter dots share a left edge, titles and chapter
  labels start on one line, and durations, chapter times and the hero clock
  end on one right edge in tabular figures. (Measured on 1.8.0's hero layout:
  six different left edges.)
- **The playing track is marked once:** a bold title and an animated
  "now playing" glyph on its thumbnail (pause under the pointer), instead of
  a tint, a side bar, bold text and a play icon at once.
- **No nested boxes.** One hairline divides "now playing" from the list; the
  bordered list box and per-row borders are gone. Rows are 48px (40px
  compact), with a rounded hover.
- **Chapters** sit under their track on the title line, with a dot rail —
  the playing chapter's dot filled, its label bold — instead of an inset
  panel with a highlight louder than the track's. Times are right-aligned in
  the page font (they were the browser's default monospace).
- **Hero:** the title (larger) and artist sit above the waveform with the
  time; the cover's glyph is a small disc, so the artwork isn't dimmed, and
  it hides while playing (not on a cover without artwork). The default
  `coverSize` is `height + 48` (was `+ 36`). Marker labels open below the
  waveform there, clear of the title.
- The grid's now-playing bar has its title above the waveform too, under a
  hairline instead of in a box.

### Fixed

- **Icons no longer need an icon font.** Play/pause rendered as Tabler
  `ti` glyphs, so on a page without the Tabler font every icon was blank.
  They're inline SVG now (`.wp-state`, `data-state` = `play` | `pause` |
  `playing`); the `ti-*` classes are gone.

## [1.8.0] — 2026-09-24

### Fixed

- **Playlist options passed to the constructor are honoured.** `expandChapters`,
  `showDuration` and `showPlayState` were read from `data-*` alone,
  `showChapterMarkers` was reset to the smart default, and `chapterMarkerColor`
  was always the attribute or the built-in grey — so `new WaveformPlaylist(el,
  { showDuration: false })` did nothing. The React/Vue/Svelte wrappers pass
  exactly these as constructor options, so every one of those props was a
  no-op. Each now resolves as `data-*` > constructor option > default, like the
  rest of the surface.
- **A forwarded `audioMode` no longer produces a playlist that never plays.**
  `audioMode` was stripped from the container's `data-*` but not from the
  constructor options, and the wrappers forward it: `audioMode: 'external'`
  handed the playlist a player that dispatches request-play events nobody
  answers. The playlist always owns its audio, so the option is now ignored
  from either source.
- **Your player callbacks run instead of being replaced.** `onPlay`, `onPause`,
  `onEnd`, `onTimeUpdate`, `onNextTrack` and `onPreviousTrack` are documented
  pass-through options (the Svelte wrapper's `on:play`/`on:pause`/`on:end`/
  `on:timeupdate` ride on them), but the playlist overwrote all six with its
  own handlers. Yours now run after the playlist's own handling, with the
  core's arguments.
- **Per-track `data-waveform` peaks are used.** They were never read, so every
  track decoded its audio even with peaks in the markup. A JSON array is
  parsed (a malformed one warns and falls back to decoding); a `.json` peaks
  URL is passed through for the core to fetch.
- **The previous track's album no longer sticks on the lock screen.** An
  absent album was sent as `undefined`, which the core's option merge skips,
  so Media Session kept the last album that had one.
- **Hero cover art follows the track.** A track without artwork kept showing
  the previous cover, and a hero playlist whose first track had no artwork
  never showed any cover at all. The art is now created on demand and hidden
  for artless tracks.
- **`destroy()` leaves the container as it found it.** It emptied the
  container *before* restoring the original `[data-track]` elements, so they
  were gone — and the React/Vue/Svelte wrappers, which render the tracks as
  children and destroy + rebuild on a prop change, rebuilt an empty playlist.
  It now removes only what the playlist generated, un-hides the tracks in
  place (restoring any inline `display` they had), removes every layout class
  it added (`wp-hero-layout`, `wp-grid-layout`, `wp-density-compact`,
  `wp-cover-top`, `wp-no-artist`, …) while keeping the author's own, and
  clears `data-waveform-playlist-initialized` so `WaveformPlaylist.init()` can
  rebuild it.
- **A chapter seek into another track waits for that track to load.** It
  treated any `waveformplayer:ready` as "loaded", but the core emits that once,
  ~100ms after construction, never after a load — so a deep link such as
  `seekToChapter(1, 60)` right after construction seeked before track 1 had a
  duration and silently stayed at 0:00. It now waits for the player's `onLoad`
  for that track.
- **A pending chapter seek no longer lands on the wrong track.** When the
  target track failed to load, the waiting seek (and a document-level listener)
  stayed armed forever and fired on the next track that did load — jumping it
  to the failed track's chapter time — and survived `destroy()`. There is now
  a single pending seek, cancelled by a load error, by selecting another track,
  and by `destroy()`. Your `onError` still runs.
- **Chapter seeks work with `data-preload="none"`.** The duration is unknown
  until playback starts and the core's `seekTo()` is a no-op without one, so
  clicking a chapter just played from 0:00. Playback now starts and the seek
  lands when the metadata arrives.
- **The right chapter list opens for the selected track.** Sublists were
  matched to tracks by position, so when not every track had chapters the
  wrong one (or none) was shown — and in the hero layout this overrode the
  correct, index-matched reveal. The list layout also never revealed the first
  track's chapters until you changed track.
- **The play/pause overlay sits on the active row.** Overlays were matched by
  position, but only tracks with artwork have one, so with an artless track
  earlier in the list the overlay appeared on the wrong row (or not at all).
- **No stale chapter highlight when returning to a track.** If its first
  chapter starts after 0:00, the previously active chapter kept its highlight
  and `aria-current` until playback crossed a chapter boundary.
- **Chapters sharing a start time highlight the first, not the last.** Most
  visibly, several chapters without `data-time` all sit at 0:00 and the last
  of them was marked as playing.
- **`H:MM:SS` chapter times parse.** `data-time="1:05:30"` read as 1 second —
  only the first field of a three-part time was used. `SS` and `M:SS` are
  unchanged, and a malformed time still reads as 0.
- **Keyboard shortcuts no longer hijack browser shortcuts.** With focus in the
  playlist, Cmd/Ctrl+P (print) went to the previous track, Ctrl+N to the next,
  and Ctrl/Alt+1–9 selected tracks instead of switching tabs. Keys with Ctrl,
  Cmd or Alt held now pass through untouched.
- **The legacy `data-*` parser (cores without `WaveformPlayer.utils`) is back
  in step with the core.** It was missing `waveformGradient`, `buttonStyle`,
  `buttonSize`/`buttonRadius`, `seekHandle`, `bpm`, `artworkPosition`,
  `seekValueText`, `playPauseLabel`, `speedLabel`, `artworkAlt` and
  `unknownTrackText`, the `data-style`/`data-color`/`data-theme` aliases, and
  JSON gradient stops in `data-waveform-color`/`data-progress-color`; it also
  forwarded empty strings and ignored a present-but-empty boolean attribute
  where the core does the opposite. A test now compares it key-for-key with the
  real core's `parseDataAttributes`.
- **Types cover the whole playlist option surface.** `layout` was typed
  `'list' | 'minimal'` although `'hero'` and `'grid'` ship, and `showArtist`,
  `coverSize`, `thumbnailSize`, `density`, `coverPosition` and `barPosition`
  were untyped, so the framework wrappers couldn't pass them without a cast.
  Parsed tracks also gain `waveform`. A test keeps `index.d.ts` in step with the
  runtime's own option list.

### Changed

- **Boolean playlist attributes follow one rule: present means true unless it
  is `"false"`.** `data-continuous` and `data-show-chapter-markers` previously
  required the literal `"true"`; a bare `data-continuous` now enables it, as
  `data-expand-chapters` and friends always did.
- **Chapters are sorted by time.** Out-of-order markup rendered out of order
  and confused the active-chapter scan. The playlist now also warns
  (`[WaveformPlaylist] …`) about a chapter with no `data-time` (placed at
  0:00) and, once the duration is known, one that starts after the track ends.
- **Peer dependency raised to `@arraypress/waveform-player@^1.24.5`** (was
  `^1.7.2`, which it had long since outgrown). The playlist relies on
  `onNextTrack`/`onPreviousTrack` (1.19.0), `loadTrack()` adding and removing
  artist/artwork in place (1.21.0), `crossOrigin` (1.23.0), and — new with the
  chapter-seek fix above — `load()` reporting `onLoad` under `preload: 'none'`
  instead of hanging (1.24.5).

## [1.7.4] — 2026-08-11

### Fixed

- **The playlist no longer leaks its own `layout` into the embedded player.**
  Both components read options from the same container and the same `data-*`
  namespace, and `layout` exists in both surfaces with different vocabularies —
  the playlist's is `list | minimal | hero | grid`, the player's is
  `default | preview`. `initPlayer()` spread the playlist's whole option object
  into the player, so a hero playlist handed the player a layout it has never
  supported. Harmless in appearance (the player fell back to `default`, which is
  what it silently did before) but it printed
  `[WaveformPlayer] Invalid layout option, using default: hero` on every hero
  playlist once core 1.25.0 began validating enumerated options. Playlist-owned
  options are now stripped before forwarding.

## [1.7.3] — 2026-08-11

### Fixed

- **One malformed `data-markers` no longer takes the whole playlist down.**
  `parseTracks()` read every track's attribute through a bare `JSON.parse`, and
  it runs before anything is rendered — so a single syntax error anywhere in the
  markup threw and destroyed the playlist rather than costing that one track its
  markers. Markers are now parsed defensively and shape-checked: `JSON.parse`
  validates syntax only, so `'2'` or `'"x"'` parsed cleanly and then failed at
  the first `.length`/`.map()` downstream. Entries whose `time` isn't a number
  are dropped instead of rendering at `left: NaN%`.
- **Unparseable numeric attributes are no longer forwarded to the player.**
  `data-height="tall"` became `NaN`, which sizes the player's canvas to nothing —
  a broken-looking player from a typo'd attribute. Bad values now leave the
  default in place and warn, naming the attribute.
- **`data-playback-rates` must be a JSON array.** Non-array JSON was forwarded
  verbatim and threw inside the player's speed menu.
- **A mistyped chapter `data-time` reads as 0 rather than NaN.** `parseTime`
  returned `NaN` for the two-part form (`"1:ab"`), which then rendered as `NaN`
  in the chapter list and positioned its marker at `left: NaN%`.

## [1.7.2] — 2026-07-22

### Added

- **`crossOrigin` player option is forwarded.** Container `data-cross-origin`
  (and the `crossOrigin` option) now flow to each track's player. The modern
  path already forwarded it verbatim through `WaveformPlayer.utils.parseDataAttributes`;
  this adds it to the legacy fallback parser too, so it works regardless of the
  installed core version. Requires `@arraypress/waveform-player@^1.23.0` for the
  option to take effect.

## [1.7.1] — 2026-07-17

### Fixed

- **The play glyph on cover art is now legible at rest.** The hero cover doubles
  as the transport, and its overlay rested at `rgba(0, 0, 0, 0.22)` — only
  **1.69:1** against a light cover, well under WCAG 1.4.11's 3:1 minimum for
  non-text contrast. The glyph was effectively invisible until you hovered it,
  at which point the overlay deepened to `0.5` and became readable: the resting
  state, which is what everyone actually sees, was the unsafe one. The grid
  item's overlay had the same problem less severely (`0.4` → 2.85:1), and it
  stays up for the *active* item rather than only on hover.

  Both now rest at a scrim that clears 3:1 over any cover, and hover deepens
  from an already-safe floor instead of rescuing an unsafe one. The colours moved
  to `--wp-cover-overlay-color` / `--wp-cover-overlay-scrim` /
  `--wp-cover-overlay-scrim-hover`, mirroring `--wfp-btn-artwork-*` in
  `@arraypress/waveform-player` — re-theme the scrim and glyph together, or the
  contrast guarantee goes with it. A test recomputes the worst case from the
  declared values and fails below 3:1.

## [1.7.0] — 2026-07-01

### Added

- **Lock-screen skip-track buttons.** Wires `onNextTrack` / `onPreviousTrack` to
  the playlist's track navigation, so the OS Media Session next/previous controls
  move between tracks. (Needs `@arraypress/waveform-player` >= 1.19.)

## [1.6.0] — 2026-07-01

### Changed

- **BREAKING — renamed `subtitle` -> `artist`** on tracks and the embedded
  player (`data-subtitle` -> `data-artist`, `showSubtitle` -> `showArtist`,
  `.wp-subtitle` -> `.wp-artist`). No back-compat alias.

## [1.5.1] — 2026-06-30

### Fixed

- **List/minimal now-playing header had no spacing — it touched the track
  list.** The core player reclasses its container to `waveform-player` on init,
  which clobbered the `wp-player` hook the list-layout CSS targets, so the
  header's styling (including its bottom margin) silently never applied. The
  class is now restored after the player mounts, and the header carries a small
  bottom margin so it sits cleanly above the list.

## [1.5.0] — 2026-06-30

### Added

- **Artwork fallback.** Track artwork that fails to load (404 / broken) now
  shows a muted music-note placeholder in the hero cover, queue thumbnails and
  grid cards instead of the browser's broken-image icon.

### Fixed

- **`density` and `showArtist` now apply to the list / minimal layouts**, not
  only hero / grid. `density: 'compact'` tightens list rows (the compact CSS
  already covered `.wp-item`; the class just wasn't being added for list), and
  `showArtist: false` hides the now-playing and per-row artists. Also gave
  the list-layout now-playing header a little more bottom margin.
- **`new WaveformPlaylist(...)` from the IIFE/CDN build.** The browser bundle was
  built with esbuild `--global-name=WaveformPlaylist`, which wrapped the exports
  so `window.WaveformPlaylist` resolved to the ES-module *namespace*
  (`{ default, WaveformPlaylist }`) rather than the class — so manual
  construction (`new WaveformPlaylist('#el', { ... })`, as the docs show) threw
  "not a constructor". Dropped `--global-name` so the bundle's own
  `window.WaveformPlaylist = WaveformPlaylist` (the class, with its static
  `init`) stands, matching `@arraypress/waveform-player`. Auto-init and
  `WaveformPlaylist.init()` are unaffected.

- **Light-mode rendering.** The list / hero / grid surfaces built their hover,
  active-row and chapter-panel highlights from fixed `rgba(255,255,255,…)` and
  `rgba(0,0,0,…)` overlays that assumed a dark background — so on a light page
  the chapter panel and active states rendered as muddy grey slabs. Those
  page-surface overlays are now `color-mix(in srgb, currentColor …, transparent)`,
  which adapts to the surrounding text colour (near-identical on dark, correct on
  light). Artwork play-overlays stay dark — they sit over cover images.

## [1.4.0] — 2026-06-30

### Added

- **`hero` layout** (`layout="hero"`) — a "now playing" unit (cover artwork that
  doubles as the play/pause button, immediately beside the waveform, with a
  title/artist + current/total time meta row) over a stripped track queue. The
  active track lives only in the hero and the queue carries titles, so nothing is
  shown twice.
- **`grid` layout** (`layout="grid"`) — a responsive grid of cover-art cards to
  browse, with a slim "now playing" bar (waveform + title/time) docked above or
  below it. The active card is ringed.
- **Chapters in the hero layout.** A single chaptered track renders a seekable
  chapter list beneath the hero with chapter markers on the waveform; a
  multi-track playlist expands the active track's row to reveal its chapters
  (and shows that track's markers when `showChapterMarkers` is on).
- **Sizing + style options**, all settable via `data-*` or JS:
  - `coverSize` / `thumbnailSize` (px) — hero cover + queue/grid artwork size
    (`thumbnailSize` is also exposed as the `--wp-thumb-size` CSS variable).
  - `density` (`'comfortable'` | `'compact'`) — row spacing.
  - `coverPosition` (`'left'` | `'top'`) — hero cover beside or above the waveform.
  - `barPosition` (`'top'` | `'bottom'`) — grid's now-playing bar placement.
  - `showArtist` (boolean) — show/hide the now-playing artist.

### Changed

- **Clicking the active track row/card now toggles play/pause** (matching the
  play/pause icon it shows) instead of restarting from the top. Clicking a
  different track still loads and plays it from the start.
- `togglePlay()` reads the embedded audio element's `paused` state directly, so
  pausing is reliable even though the hero/grid player runs without its built-in
  controls.

### Notes

- Requires `@arraypress/waveform-player` `^1.7.2` (peer dependency). The hero and
  grid layouts embed a single waveform-only player and supply their own cover,
  time and queue chrome.
