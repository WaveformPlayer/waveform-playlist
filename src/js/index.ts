/**
 * WaveformPlaylist
 * Playlist and chapter navigation for WaveformPlayer
 *
 * @version 1.0.0
 * @author ArrayPress
 * @license MIT
 */

import type { WaveformPlayer } from '@arraypress/waveform-player';
import type {
    WaveformPlaylistMarker,
    WaveformPlaylistOptions,
    WaveformPlaylistTrack,
} from './types.js';

export type {
    WaveformPlaylistChapter,
    WaveformPlaylistMarker,
    WaveformPlaylistOptions,
    WaveformPlaylistTrack,
} from './types.js';

/**
 * The embedded player as the playlist drives it: the core's public API plus
 * the `<audio>` element it reads play state and metadata from.
 * @internal
 */
type Player = WaveformPlayer & { audio?: HTMLMediaElement | null };

/**
 * The single post-load action in flight: a chapter seek waiting on a track
 * load (`url` + `onLoad`) or on metadata (`cleanup`).
 * @internal
 */
type PendingAction = { url?: string; onLoad?: () => void; cleanup?: () => void };

declare global {
    interface Window {
        WaveformPlaylist: typeof WaveformPlaylist;
    }
}

/**
 * Placeholder shown when a track's artwork URL fails to load (404 / broken) — a
 * muted music-note tile instead of the browser's broken-image icon. Inline SVG
 * data-URI (no font / network needed).
 */
const ARTWORK_FALLBACK = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#71717a" fill-opacity="0.15"/><g fill="none" stroke="#a1a1aa" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="17" r="2.2"/><circle cx="17" cy="15" r="2.2"/><path d="M10.2 17V7l9-1.6v9"/></g></svg>'
);

/**
 * Options the playlist owns, which must never travel to the embedded player.
 *
 * The playlist and the player read their options from the SAME container and
 * the same `data-*` namespace, and `layout` exists in both surfaces with
 * different vocabularies — the playlist's is `list | minimal | hero | grid`,
 * the player's is `default | preview`. Spreading the playlist's options into
 * the player therefore handed it a layout it has never supported.
 *
 * That was invisible until core 1.25.0: the player only ever tested
 * `layout === 'preview'`, so an unknown value silently rendered as `default`.
 * 1.25.0 validates enumerated options, so the same leak now prints
 * `[WaveformPlayer] Invalid layout option, using default: hero` on every hero
 * playlist. Rendering is unchanged either way — the warning was the symptom,
 * not the bug.
 *
 * `layout` is the only name that genuinely collides today; the rest are listed
 * so a future player option can't quietly start colliding with one of them.
 * @internal
 */
const PLAYLIST_OWN_OPTIONS = [
    'layout', 'continuous', 'expandChapters', 'showDuration', 'showPlayState',
    'showArtist', 'coverSize', 'thumbnailSize', 'density', 'coverPosition',
    'barPosition', 'showChapterMarkers', 'chapterMarkerColor'
];

/**
 * Player options the playlist never passes to its embedded player, whether
 * they come from the constructor or the container's `data-*`:
 *
 * - `audioMode` — the playlist always owns its audio. An `'external'` player
 *   inside a playlist dispatches request-play events nobody answers, so the
 *   playlist would never play.
 * - `loop` — whole-track looping is the `<audio>` element's own `loop`, so
 *   `ended` never fires: continuous auto-advance and the end-of-track chapter
 *   reset would stop working.
 * - `showLoop` — the player's loop button turns on that same whole-track
 *   loop, so pressing it would play the current track forever and silently
 *   end auto-advance. The playlist has no loop button of its own.
 * - `lazy` — the playlist builds its player when it initialises and loads
 *   tracks into it on demand; deferring that player's first load until it
 *   scrolls into view only delays the first track's waveform.
 * @internal
 */
const NOT_FORWARDED = ['audioMode', 'loop', 'showLoop', 'lazy'];

/**
 * Player options each `[data-track]` supplies for itself (see
 * trackPlayerOptions()), so the container's `data-*` never sets them.
 * @internal
 */
const PER_TRACK_OPTIONS = ['url', 'title', 'artist', 'album', 'artwork', 'markers', 'waveform'];

/**
 * The play-state glyphs, inline: the playlist draws its own icons rather than
 * relying on an icon font the host page may not load (it used Tabler's `ti`
 * classes, so on a page without Tabler every play/pause icon was blank).
 * @internal
 */
const ICONS = {
    play: '<svg class="wp-i wp-i-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.6-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>',
    pause: '<svg class="wp-i wp-i-pause" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
    // "Now playing": three bars, animated while the track plays.
    bars: '<span class="wp-bars" aria-hidden="true"><i></i><i></i><i></i></span>',
};

/**
 * A play-state glyph: one element holding all three icons, of which CSS shows
 * the one named by `data-state` — `play`, `pause`, or `playing` (the bars;
 * hovering the row swaps them for pause).
 * @internal
 * @param className - Extra classes (`wp-queue-state`, …).
 * @returns 
 */
function stateIcon(className: string = ''): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = ('wp-state ' + className).trim();
    el.dataset.state = 'play';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = ICONS.play + ICONS.pause + ICONS.bars;
    return el;
}

/** Swap a broken artwork `<img>` for the placeholder tile on load failure. */
function applyArtFallback(img: HTMLImageElement) {
    img.addEventListener('error', () => {
        if (!img.src.startsWith('data:')) img.src = ARTWORK_FALLBACK;
    });
}

/**
 * WaveformPlaylist Class
 * Adds playlist and chapter navigation capabilities to WaveformPlayer
 *
 * @class WaveformPlaylist
 */
export class WaveformPlaylist {
    /** The resolved container element. */
    declare container: HTMLElement;
    /** Merged configuration options. */
    declare options: WaveformPlaylistOptions;
    /** Parsed tracks. */
    declare tracks: WaveformPlaylistTrack[];
    /** Index of the currently selected track. */
    declare currentTrackIndex: number;
    /** Index of the active chapter, or -1 when none. */
    declare currentChapterIndex: number;
    /** The underlying WaveformPlayer instance, or `null` before init. */
    declare player: unknown | null;
    /** Whether playback is currently active. */
    declare isPlaying: boolean;

    /** @internal */ declare listElement: HTMLElement | null;
    /** @internal */ declare isMinimal: boolean;
    /** @internal */ declare isHero: boolean;
    /** @internal */ declare isGrid: boolean;
    /** @internal */ declare keydownHandler: ((e: KeyboardEvent) => void) | null;
    /** @internal */ declare pending: PendingAction | null;
    /** @internal */ declare ownNodes: HTMLElement[];
    /** @internal */ declare ownClasses: string[];
    /** @internal */ declare trackDisplay: Map<HTMLElement, string> | null;
    /** @internal */ declare heroCover: HTMLButtonElement | null | undefined;
    /** @internal */ declare heroIcon: HTMLSpanElement | null | undefined;
    /** @internal */ declare heroArt: HTMLImageElement | null | undefined;
    /** @internal */ declare heroTitle: HTMLSpanElement | null | undefined;
    /** @internal */ declare heroSub: HTMLSpanElement | null | undefined;
    /** @internal */ declare heroTime: HTMLDivElement | null | undefined;
    /** @internal */ declare rangeChecked: Set<number> | undefined;
    /** @internal */ declare _heroTimeIndex: number | undefined;

    /**
     * Auto-initialize every element with a `data-waveform-playlist` attribute.
     */
    declare static init: () => void;

    /**
     * Create a new WaveformPlaylist instance
     *
     * @param {string|HTMLElement} container - Container element or CSS selector
     * @param {Object} [options={}] - Configuration options
     * @param {string} [options.layout='list'] - Layout style: 'list', 'minimal', 'hero' or 'grid'
     * @param {boolean} [options.continuous=false] - Auto-advance to next track
     * @param {boolean} [options.expandChapters=true] - Show chapters under tracks
     * @param {boolean} [options.showDuration=true] - Display track durations
     * @param {boolean|null} [options.showChapterMarkers=null] - Show chapters as waveform markers (null = smart default)
     * @param {string} [options.chapterMarkerColor='rgba(161, 161, 170, 0.85)'] - Default color for chapter markers
     * @param {boolean} [options.showPlayState=true] - Show play/pause icon on active track artwork
     * @param {boolean} [options.showArtist=true] - Show the now-playing / per-row artist
     * @param {number} [options.coverSize] - Hero cover size in px
     * @param {number} [options.thumbnailSize] - Queue thumbnail / grid cover size in px
     * @param {string} [options.density='comfortable'] - Row density: 'comfortable' or 'compact'
     * @param {string} [options.coverPosition='left'] - Hero cover position: 'left' or 'top'
     * @param {string} [options.barPosition='bottom'] - Grid now-playing bar position: 'top' or 'bottom'
     *
     * Any other option is forwarded to the embedded WaveformPlayer, including
     * its callbacks (chained after the playlist's own). `audioMode`, `loop`,
     * `showLoop` and `lazy` are never forwarded (see NOT_FORWARDED): the
     * playlist owns its audio, and a looping player never ends a track.
     * @throws {Error} If container not found or WaveformPlayer not available
     */
    constructor(container: string | HTMLElement, options: WaveformPlaylistOptions = {}) {
        // Resolve container
        this.container = typeof container === 'string'
            ? document.querySelector<HTMLElement>(container)!
            : container;

        if (!this.container) {
            throw new Error('[WaveformPlaylist] Container element not found');
        }

        // Check for WaveformPlayer dependency
        if (typeof window.WaveformPlayer === 'undefined') {
            throw new Error('[WaveformPlaylist] WaveformPlayer is required but not found');
        }

        // Parse options from data attributes and merge with provided options
        this.options = this.parseOptions(options);

        // Initialize state
        this.tracks = [];
        this.currentTrackIndex = 0;
        this.currentChapterIndex = -1;
        this.player = null;
        this.listElement = null;
        this.isMinimal = this.options.layout === 'minimal';
        this.isHero = this.options.layout === 'hero';
        this.isGrid = this.options.layout === 'grid';
        this.isPlaying = false;
        this.keydownHandler = null;
        // The single post-load action in flight (a chapter seek waiting on a
        // track load or on metadata); see loadTrackAt() / seekAndPlay().
        this.pending = null;

        // Parse tracks from markup
        this.parseTracks();

        // Initialize if we have tracks
        if (this.tracks.length > 0) {
            this.init();
        }
    }

    /**
     * Parse options from container data attributes and merge with provided options
     * @internal
     * @param providedOptions - Options passed to constructor
     * @returns Merged options object
     */
    parseOptions(providedOptions: WaveformPlaylistOptions): WaveformPlaylistOptions {
        const container = this.container;
        const ds = container.dataset;
        const options: Record<string, any> = {...providedOptions};

        // Player options the playlist never forwards (see NOT_FORWARDED) are
        // stripped from BOTH the constructor options (here) and the
        // container's data-* (below): the framework wrappers pass every prop
        // as a constructor option.
        NOT_FORWARDED.forEach(key => delete options[key]);

        // Inherit the player's full `data-*` option surface from the container,
        // parsed by the core itself so the playlist never drifts from it.
        // data-* values take precedence over constructor options.
        const fromData: Record<string, any> = {...window.WaveformPlayer.utils.parseDataAttributes(container)};
        // Strip what the playlist never forwards and what each [data-track]
        // supplies, so a container-level data-* can never override them.
        [...NOT_FORWARDED, ...PER_TRACK_OPTIONS].forEach(key => delete fromData[key]);
        Object.assign(options, fromData);

        // Playlist-specific options resolve as data-* > constructor option >
        // default. These used to read data-* alone, so the React/Vue/Svelte
        // wrappers — which pass exactly these as constructor options and set
        // no data-* — had every one of them silently ignored. A present
        // boolean attribute is true unless it says "false".
        const flag = (key: string, fallback: boolean | null) => (ds[key] !== undefined
            ? ds[key] !== 'false'
            : (options[key] ?? fallback));

        options.layout = ds.layout || options.layout || 'list';
        options.continuous = flag('continuous', false);
        options.expandChapters = flag('expandChapters', true);
        options.showDuration = flag('showDuration', true);
        options.showPlayState = flag('showPlayState', true);
        // Hero layout: show the now-playing artist. On by default (useful for
        // mixed-artist playlists); set false for single-artist albums where it
        // would just repeat.
        options.showArtist = flag('showArtist', true);

        // Hero/grid sizing (px) — null falls back to the derived/CSS default.
        options.coverSize = parseInt(ds.coverSize as string, 10) || options.coverSize || null;
        options.thumbnailSize = parseInt(ds.thumbnailSize as string, 10) || options.thumbnailSize || null;
        // Row density ('comfortable' | 'compact') and hero cover position
        // ('left' | 'top').
        options.density = ds.density || options.density || 'comfortable';
        options.coverPosition = ds.coverPosition || options.coverPosition || 'left';
        // Grid layout: place the now-playing bar above or below the cover grid.
        options.barPosition = ds.barPosition || options.barPosition || 'bottom';

        // null = smart default, decided by content in initPlayer().
        options.showChapterMarkers = flag('showChapterMarkers', null);
        options.chapterMarkerColor = ds.chapterMarkerColor || options.chapterMarkerColor || 'rgba(161, 161, 170, 0.85)';

        return options;
    }

    /**
     * Parse a track's `data-markers` attribute into renderable markers.
     *
     * Every track's attribute is read during `parseTracks()`, which runs before
     * anything is rendered — so an unguarded parse here meant one malformed
     * `data-markers` anywhere in the markup threw and took the whole playlist
     * down with it. Bad input now costs that one track its markers and warns.
     *
     * Entries are shape-checked as well as parsed: `JSON.parse` validates
     * syntax only, so `'2'` or `'"x"'` parse cleanly and then fail at the first
     * `.length`/`.map()` downstream, and a marker whose `time` isn't a number
     * renders at `left: NaN%`.
     *
     * @internal
     * @param raw - Raw `data-markers` value.
     * @returns Renderable markers (empty when nothing survives).
     */
    parseMarkers(raw: string | undefined): WaveformPlaylistMarker[] {
        if (!raw) return [];

        let parsed: any;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            console.warn('[WaveformPlaylist] Invalid markers JSON:', e);
            return [];
        }

        if (!Array.isArray(parsed)) {
            console.warn('[WaveformPlaylist] Invalid markers attribute, expected a JSON array:', raw);
            return [];
        }

        return parsed
            .map(m => (m && typeof m === 'object') ? {...m, time: Number(m.time)} : null)
            .filter(m => m && Number.isFinite(m.time));
    }

    /**
     * Parse a track's `data-waveform` peaks.
     *
     * A JSON array is parsed here so a typo costs that one track its peaks
     * (the player then decodes the audio) rather than reaching the player as
     * a string; anything else — a `.json` peaks URL, or a comma-separated
     * list — is passed through for the core to resolve, which it already does.
     *
     * @internal
     * @param raw - Raw `data-waveform` value.
     * @returns Peaks, a peaks source, or undefined.
     */
    parseWaveform(raw: string | undefined): number[] | string | undefined {
        const value = (raw || '').trim();
        if (!value) return undefined;
        if (!value.startsWith('[')) return value;

        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) { /* warned below */ }

        console.warn('[WaveformPlaylist] Invalid waveform attribute, expected a JSON array of peaks or a peaks URL:', raw);
        return undefined;
    }

    /**
     * Parse tracks and chapters from container markup
     * @internal
     */
    parseTracks() {
        const trackElements = this.container.querySelectorAll<HTMLElement>('[data-track]');

        this.tracks = Array.from(trackElements).map((el, index) => {
            // Parse chapters from child elements, in time order (stable, so
            // chapters sharing a time keep their markup order). Everything
            // downstream — the rendered list, the active-chapter scan, the
            // markers — assumes ascending times.
            const chapters = Array.from(el.querySelectorAll<HTMLElement>('[data-chapter]')).map(ch => {
                const label = ch.textContent!.trim();
                if (!(ch.dataset.time || '').trim()) {
                    console.warn(`[WaveformPlaylist] Chapter "${label}" has no data-time; placing it at 0:00.`);
                }
                return {
                    time: this.parseTime(ch.dataset.time || '0:00'),
                    label: label,
                    color: ch.dataset.color,
                    element: ch
                };
            }).sort((a, b) => a.time - b.time);

            return {
                element: el,
                index: index,
                url: el.dataset.url,
                title: el.dataset.title || this.extractTitleFromUrl(el.dataset.url),
                artist: el.dataset.artist || '',
                artwork: el.dataset.artwork,
                album: el.dataset.album,
                duration: el.dataset.duration,
                waveform: this.parseWaveform(el.dataset.waveform),
                chapters: chapters,
                // Parse explicit markers if provided (separate from chapters)
                markers: this.parseMarkers(el.dataset.markers)
            };
        });
    }

    /**
     * Initialize the playlist UI and player
     * @internal
     */
    init() {
        // Everything init() adds to the container is recorded, so destroy()
        // can remove exactly that and leave the author's markup (the
        // [data-track] elements a framework wrapper rendered) in place.
        this.ownNodes = [];
        this.ownClasses = [];

        // Add classes to container
        this.addOwnClass('waveform-playlist');
        if (this.isMinimal) {
            this.addOwnClass('wp-minimal');
        }
        // Hero + grid share the "now playing" hero unit; they differ only in the
        // browser below it (a queue list vs a cover-art grid).
        if (this.isHero || this.isGrid) {
            this.addOwnClass('wp-hero-layout');
        }
        if (this.isGrid) {
            this.addOwnClass('wp-grid-layout');
        }
        // Density applies to every layout (the compact CSS covers list rows,
        // queue rows, grid cards and chapters alike).
        if (this.options.density === 'compact') {
            this.addOwnClass('wp-density-compact');
        }
        if ((this.isHero || this.isGrid) && this.options.coverPosition === 'top') {
            this.addOwnClass('wp-cover-top');
        }
        // `showArtist` also applies to the list/minimal layouts: hero/grid skip
        // rendering the artist element, while list relies on this class to hide
        // the now-playing + per-row artists via CSS.
        if (!this.options.showArtist) {
            this.addOwnClass('wp-no-artist');
        }

        // Hide original track elements, remembering any inline display the
        // author set so destroy() can put it back.
        this.trackDisplay = new Map();
        this.tracks.forEach(track => {
            if (track.element) {
                this.trackDisplay!.set(track.element, track.element.style.display);
                track.element.style.display = 'none';
            }
        });

        // Create player container
        const playerContainer = document.createElement('div');
        playerContainer.className = (this.isHero || this.isGrid) ? 'wp-hero-stage' : 'wp-player';
        playerContainer.id = 'wp-player-' + this.generateId();

        if (this.isGrid && !(this.tracks.length === 1 && this.tracks[0].chapters.length > 0)) {
            // Grid layout: a cover-art grid to browse, with a "now playing" bar
            // (cover + waveform + title/time) above OR below it as the transport.
            // The active card is ringed; nothing is shown as a big hero.
            if (this.options.barPosition === 'top') {
                this.createNowPlayingBar(playerContainer);
                this.createHeroGrid();
            } else {
                this.createHeroGrid();
                this.createNowPlayingBar(playerContainer);
            }
        } else if (this.isHero || this.isGrid) {
            // Hero layout: a "now playing" unit — cover (with play/pause overlay)
            // beside the waveform + a time readout — over a browser of the other
            // tracks (a stripped queue, or, for a single chaptered track, the
            // chapter list). The waveform is a real WaveformPlayer; the cover,
            // time and browser are this component's chrome, so the active track
            // is never shown twice.
            this.createHeroLayout(playerContainer);
            if (this.tracks.length === 1 && this.tracks[0].chapters.length > 0) {
                // Single chaptered track: the area below the hero becomes the
                // seekable chapter list, and the waveform shows chapter markers
                // (converted from chapters in initPlayer).
                this.createChapterList();
            } else {
                this.createHeroQueue();
            }
        } else {
            this.appendOwn(playerContainer);

            // Create appropriate UI based on content
            if (this.tracks.length === 1 && this.tracks[0].chapters.length > 0) {
                // Single track with chapters - show chapters only (no track list)
                this.createChapterList();
            } else if (this.isMinimal) {
                // Minimal layout - show buttons
                this.createMinimalControls();
            } else {
                // Multiple tracks - show full track list
                this.createTrackList();
            }
        }

        // Initialize WaveformPlayer instance
        this.initPlayer(playerContainer);

        // Bind keyboard shortcuts
        this.bindKeyboard();
    }

    /**
     * Append a generated node to the container and record it for destroy().
     * @internal
     * @param node
     */
    appendOwn(node: HTMLElement) {
        this.container.appendChild(node);
        this.ownNodes.push(node);
    }

    /**
     * Add a class to the container and record it for destroy() — unless the
     * author already set it, in which case it isn't ours to remove.
     * @internal
     * @param name
     */
    addOwnClass(name: string) {
        if (this.container.classList.contains(name)) return;
        this.container.classList.add(name);
        this.ownClasses.push(name);
    }

    /**
     * Build the hero "now playing" unit: a cover that doubles as the play/pause
     * button, immediately left of the waveform stage, with a current/total time
     * readout beneath the waveform.
     * @internal
     * @param stage - The container the WaveformPlayer renders into.
     */
    createHeroLayout(stage: HTMLElement) {
        const first = this.tracks[0];

        const hero = document.createElement('div');
        hero.className = 'wp-hero';

        // The cover IS the transport — clicking it toggles play/pause. Size it
        // explicitly (coverSize option, else ~waveform height + the time line)
        // so it sits flush with the waveform column and never balloons to the
        // artwork's native size.
        // Default: the waveform plus the title/artist block above it.
        const coverSize = (this.options.coverSize || (((this.options.height as number) || 56) + 48)) + 'px';
        const cover = document.createElement('button');
        cover.type = 'button';
        cover.className = 'wp-hero-cover';
        cover.style.width = coverSize;
        cover.style.height = coverSize;
        cover.setAttribute('aria-label', 'Play');

        const overlay = document.createElement('span');
        overlay.className = 'wp-hero-overlay';
        const icon = stateIcon();
        overlay.appendChild(icon);
        cover.appendChild(overlay);
        cover.addEventListener('click', () => this.togglePlay());
        this.heroCover = cover;
        this.heroIcon = icon;
        this.setHeroArt(first.artwork);
        hero.appendChild(cover);

        // Title/artist + time, then the waveform beneath them.
        const main = document.createElement('div');
        main.className = 'wp-hero-main';

        // Meta row above the waveform: now-playing title/artist on the
        // left, current/total time on the right.
        const meta = document.createElement('div');
        meta.className = 'wp-hero-meta';

        const titles = document.createElement('div');
        titles.className = 'wp-hero-titles';
        const titleEl = document.createElement('span');
        titleEl.className = 'wp-hero-title';
        titleEl.textContent = first.title || '';
        titles.appendChild(titleEl);
        this.heroTitle = titleEl;
        // Artist is optional (showArtist); when on it's always present so a
        // later track's artist can fill in (an empty one is hidden via CSS).
        if (this.options.showArtist) {
            const subEl = document.createElement('span');
            subEl.className = 'wp-hero-sub';
            subEl.textContent = first.artist || '';
            titles.appendChild(subEl);
            this.heroSub = subEl;
        }
        meta.appendChild(titles);

        const time = document.createElement('div');
        time.className = 'wp-hero-time';
        time.textContent = '0:00 / ' + (first.duration || '0:00');
        this.heroTime = time;
        meta.appendChild(time);

        main.appendChild(meta);
        main.appendChild(stage);

        hero.appendChild(main);
        this.appendOwn(hero);
    }

    /**
     * Show `src` on the hero cover, or hide the cover art when the track has
     * none. The `<img>` is created on first use: it used to exist only when
     * the FIRST track had artwork, so a playlist opening on an artless track
     * never showed any later cover — and one that did kept showing the
     * previous cover on an artless track. No-op without a hero cover (grid).
     * @internal
     * @param src - Artwork URL.
     */
    setHeroArt(src: string | undefined) {
        if (!this.heroCover) return;

        if (src) {
            if (!this.heroArt) {
                const img = document.createElement('img');
                img.className = 'wp-hero-art';
                img.alt = '';
                applyArtFallback(img);
                // Beneath the play/pause overlay.
                this.heroCover.insertBefore(img, this.heroCover.firstChild);
                this.heroArt = img;
            }
            this.heroArt.style.display = '';
            if (this.heroArt.getAttribute('src') !== src) this.heroArt.src = src;
            this.heroCover.classList.add('has-art');
        } else if (this.heroArt) {
            this.heroArt.style.display = 'none';
            // Removing the attribute (rather than src = '') fires no error
            // event, so the broken-art fallback doesn't kick in.
            this.heroArt.removeAttribute('src');
        }
        // Without artwork the cover is a blank tile: its play/pause disc stays
        // on while playing rather than leaving an empty square.
        if (!src) this.heroCover.classList.remove('has-art');
    }

    /**
     * Build the slim "now playing" transport bar for the grid layout: a small
     * cover (play/pause) + title + waveform + time, in one row below the
     * cover-art grid. Shares the hero* refs so updatePlayState / setActiveTrack
     * / updateHeroTime drive it just like the hero.
     * @internal
     * @param stage - The container the WaveformPlayer renders into.
     */
    createNowPlayingBar(stage: HTMLElement) {
        const first = this.tracks[0];

        const bar = document.createElement('div');
        bar.className = 'wp-now-bar';

        // No cover here — the grid cards carry the artwork + play/pause. The bar
        // is a title/time meta row with the waveform beneath it, like the hero.

        // Meta row above the waveform: title/artist on the left, time on the
        // right (full width, so the title is never clipped).
        const meta = document.createElement('div');
        meta.className = 'wp-now-meta';

        const titles = document.createElement('div');
        titles.className = 'wp-now-titles';
        const titleEl = document.createElement('span');
        titleEl.className = 'wp-hero-title';
        titleEl.textContent = first.title || '';
        titles.appendChild(titleEl);
        this.heroTitle = titleEl;
        if (this.options.showArtist) {
            const subEl = document.createElement('span');
            subEl.className = 'wp-hero-sub';
            subEl.textContent = first.artist || '';
            titles.appendChild(subEl);
            this.heroSub = subEl;
        }
        meta.appendChild(titles);

        const time = document.createElement('div');
        time.className = 'wp-hero-time';
        time.textContent = '0:00 / ' + (first.duration || '0:00');
        this.heroTime = time;
        meta.appendChild(time);

        bar.appendChild(meta);
        bar.appendChild(stage);

        if (this.options.barPosition === 'top') bar.classList.add('wp-now-bar-top');
        this.appendOwn(bar);
    }

    /**
     * Build the stripped queue beneath the hero: numbered rows of title +
     * duration only (no covers, no waveform, no artist), with the active row
     * marked. Reuses the `.wp-item` / `wp-active` machinery the rest of the
     * component already drives.
     * @internal
     */
    createHeroQueue() {
        const listContainer = document.createElement('div');
        listContainer.className = 'wp-list-container wp-queue';
        if (this.options.thumbnailSize) {
            listContainer.style.setProperty('--wp-thumb-size', this.options.thumbnailSize + 'px');
        }

        const list = document.createElement('ul');
        list.className = 'wp-list';

        this.tracks.forEach((track, index) => {
            const item = document.createElement('li');
            item.className = 'wp-item wp-queue-item';
            item.dataset.index = index as any;

            // Leading slot: an artwork thumbnail with a play/pause overlay
            // (shown on hover + on the active row), or a track number when the
            // track has no artwork. The `.wp-queue-state` icon reflects play
            // state and is driven by updatePlayState().
            if (track.artwork) {
                const thumb = document.createElement('div');
                thumb.className = 'wp-queue-thumb';
                const img = document.createElement('img');
                img.className = 'wp-queue-thumb-art';
                img.src = track.artwork;
                img.alt = '';
                applyArtFallback(img);
                thumb.appendChild(img);
                const overlay = document.createElement('span');
                overlay.className = 'wp-queue-ov';
                overlay.appendChild(stateIcon('wp-queue-state'));
                thumb.appendChild(overlay);
                item.appendChild(thumb);
            } else {
                const num = document.createElement('span');
                num.className = 'wp-num';
                num.setAttribute('aria-hidden', 'true');
                num.textContent = (index + 1) as any;
                item.appendChild(num);
                item.appendChild(stateIcon('wp-queue-state wp-queue-state-num'));
            }

            const info = document.createElement('div');
            info.className = 'wp-info';
            const title = document.createElement('div');
            title.className = 'wp-title';
            title.textContent = track.title;
            info.appendChild(title);
            item.appendChild(info);

            if (this.options.showDuration && track.duration) {
                const duration = document.createElement('span');
                duration.className = 'wp-duration';
                duration.textContent = track.duration;
                item.appendChild(duration);
            }

            // Clicking the active row toggles play/pause (matching the icon it
            // shows); clicking any other row loads + plays that track from 0.
            this.makeActivatable(item, () => {
                if (index === this.currentTrackIndex) {
                    this.togglePlay();
                } else {
                    this.selectTrack(index);
                }
            });

            list.appendChild(item);

            // Expandable chapters beneath the row (revealed for the active
            // track) — multi-track playlists that also carry chapters.
            const sub = this.buildChapterSublist(track, index);
            if (sub) list.appendChild(sub);
        });

        listContainer.appendChild(list);
        this.appendOwn(listContainer);
        this.listElement = list;
    }

    /**
     * Build the cover-art grid beneath the hero (layout="grid"). Each card is a
     * cover with a play/pause overlay + a title; clicking it plays from the
     * start. Reuses the active-track (.wp-item / wp-active) and play-state
     * (.wp-queue-state) machinery the hero already drives.
     * @internal
     */
    createHeroGrid() {
        const gridContainer = document.createElement('div');
        gridContainer.className = 'wp-grid';
        if (this.options.thumbnailSize) {
            gridContainer.style.setProperty('--wp-grid-cover', this.options.thumbnailSize + 'px');
        }

        this.tracks.forEach((track, index) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'wp-item wp-grid-item';
            card.dataset.index = index as any;

            const cover = document.createElement('span');
            cover.className = 'wp-grid-cover';
            if (track.artwork) {
                const img = document.createElement('img');
                img.className = 'wp-grid-art';
                img.src = track.artwork;
                img.alt = '';
                applyArtFallback(img);
                cover.appendChild(img);
            } else {
                // No artwork: a centered track number stands in for the cover.
                const num = document.createElement('span');
                num.className = 'wp-grid-num';
                num.setAttribute('aria-hidden', 'true');
                num.textContent = (index + 1) as any;
                cover.appendChild(num);
            }
            const overlay = document.createElement('span');
            overlay.className = 'wp-grid-ov';
            overlay.appendChild(stateIcon('wp-queue-state'));
            cover.appendChild(overlay);
            card.appendChild(cover);

            const title = document.createElement('span');
            title.className = 'wp-grid-title';
            title.textContent = track.title;
            card.appendChild(title);

            // Clicking the active card toggles play/pause (matching the overlay
            // icon); clicking any other card loads + plays it. Native <button>
            // gives us Enter/Space + focus for free.
            card.addEventListener('click', () => {
                if (index === this.currentTrackIndex) {
                    this.togglePlay();
                } else {
                    this.selectTrack(index);
                }
            });

            gridContainer.appendChild(card);
        });

        this.appendOwn(gridContainer);
        this.listElement = gridContainer;
    }

    /**
     * Toggle play/pause on the active track (the hero cover + active queue row).
     * @internal
     */
    togglePlay() {
        if (!this.player) return;
        // Use the audio element's own paused state as the ground truth — the
        // player's isPlaying flag can lag, and pausing must be reliable.
        const audio = (this.player as Player).audio;
        const playing = audio ? !audio.paused : !!(this.player as Player).isPlaying;
        if (playing) {
            (this.player as Player).pause();
        } else {
            (this.player as Player).play();
        }
    }

    /**
     * Update the hero time readout from real playback values.
     * @internal
     * @param current
     * @param total
     */
    updateHeroTime(current: number, total: number) {
        if (!this.heroTime) return;
        const totalStr = (total && isFinite(total))
            ? this.formatTime(total)
            : ((this.tracks[this.currentTrackIndex] && this.tracks[this.currentTrackIndex].duration) || '0:00');
        this.heroTime.textContent = this.formatTime(current) + ' / ' + totalStr;
    }

    /**
     * Initialize the WaveformPlayer instance with first track
     * @internal
     * @param container - Container for the player
     */
    initPlayer(container: HTMLElement) {
        const firstTrack = this.tracks[0];

        // Smart default: Show chapter markers for single track with chapters
        if (this.options.showChapterMarkers === null) {
            this.options.showChapterMarkers = (this.tracks.length === 1 && firstTrack.chapters.length > 0);
        }

        // Merge container options with first track data, minus the options the
        // playlist owns — see PLAYLIST_OWN_OPTIONS for why `layout` in
        // particular must not travel.
        const forwarded: Record<string, any> = {...this.options};
        PLAYLIST_OWN_OPTIONS.forEach(key => delete forwarded[key]);

        const playerOptions = {
            ...forwarded,
            url: firstTrack.url,
            title: firstTrack.title,
            artist: firstTrack.artist,
            ...this.trackPlayerOptions(firstTrack),
            // Hero layout drives a waveform-ONLY player: the cover (with its
            // play/pause overlay), the time readout and the queue are this
            // component's own chrome, so suppress the player's button + info row.
            ...((this.isHero || this.isGrid) ? { showControls: false, showInfo: false } : {}),
            // Set once here: the core's loadTrack() merges new options over the
            // old, so these survive every track change.
            ...this.playerCallbacks()
        };

        // Create player instance
        // (`as any`: a playlist marker's label is optional, the core's WaveformMarker
        // requires one.)
        this.player = new window.WaveformPlayer(container, playerOptions as any);

        // The player reclasses its container to `waveform-player`, clobbering the
        // `wp-player` hook the list/minimal now-playing CSS relies on (the inset
        // that aligns it with the track rows + the bottom margin that keeps it
        // from touching the list). Hero/grid target the post-clobber class, so
        // only list/minimal need the hook restored.
        if (!this.isHero && !this.isGrid) {
            container.classList.add('wp-player');
        }

        // Mark first track as active immediately
        this.setActiveTrack(0);

        // Initialize chapter tracking
        this.updateActiveChapter(0);
    }

    /**
     * The per-track options handed to the player — on construction for the
     * first track, via loadTrack() for every later one — so the two paths can't
     * drift apart.
     *
     * Every key is always present, because the core merges loadTrack() options
     * over the previous track's and skips `undefined`: an absent album used to
     * leave the previous track's album on the lock screen / Media Session.
     * The core itself resets `artwork` (removed when falsy), `markers` and
     * `waveform` (falsy = decode from the audio) per load.
     *
     * @internal
     * @param track - Parsed track.
     * @returns 
     */
    trackPlayerOptions(track: WaveformPlaylistTrack): { markers: WaveformPlaylistMarker[]; artwork: string | undefined; album: string; waveform: string | number[] | undefined } {
        let markers = track.markers;

        // Convert chapters to markers if needed (explicit markers win).
        if (this.options.showChapterMarkers && track.chapters.length > 0 && markers.length === 0) {
            markers = track.chapters.map(ch => ({
                time: ch.time,
                label: ch.label,
                color: ch.color || this.options.chapterMarkerColor
            }));
        }

        return {
            markers: markers,
            artwork: track.artwork,
            album: track.album || '',
            waveform: track.waveform
        };
    }

    /**
     * The player callbacks the playlist drives itself off.
     *
     * Every core callback is a documented pass-through option, and the wrappers
     * rely on that (the Svelte one maps its on:play/on:pause/on:end/
     * on:timeupdate onto them), so a user-supplied callback is chained to run
     * AFTER the playlist's own handling instead of being overwritten by it.
     *
     * @internal
     * @returns Callback options for the WaveformPlayer.
     */
    playerCallbacks(): Record<string, any> {
        const user = this.options;
        const chain = (name: string, own: (...args: any[]) => void) => (...args: any[]) => {
            own(...args);
            if (typeof user[name] === 'function') user[name](...args);
        };

        return {
            onLoad: chain('onLoad', (player) => this.resolvePending(player)),
            // The core never calls onLoad for a failed load, so a seek waiting
            // on it would otherwise stay armed and fire on the next track.
            onError: chain('onError', () => this.cancelPending()),
            onEnd: chain('onEnd', () => this.onTrackEnd()),
            onNextTrack: chain('onNextTrack', () => this.nextTrack()),
            onPreviousTrack: chain('onPreviousTrack', () => this.previousTrack()),
            onTimeUpdate: chain('onTimeUpdate', (current, total) => {
                this.checkChapterRange(total);
                this.updateActiveChapter(current);
                if (this.isHero || this.isGrid) this.updateHeroTime(current, total);
            }),
            onPlay: chain('onPlay', () => {
                this.isPlaying = true;
                this.setActiveTrack(this.currentTrackIndex);
                this.updatePlayState();
            }),
            onPause: chain('onPause', () => {
                this.isPlaying = false;
                this.updatePlayState();
                // Reset chapter when paused at end
                if (this.player && (this.player as Player).audio) {
                    const current = (this.player as Player).audio!.currentTime;
                    const duration = (this.player as Player).audio!.duration;
                    if (current >= duration - 0.1) {
                        this.currentChapterIndex = -1;
                        this.updateActiveChapter(0);
                    }
                }
            })
        };
    }

    /**
     * Update play/pause state on artwork
     * @internal
     */
    updatePlayState() {
        // Hero/grid: reflect play/pause on the cover overlay and the active
        // queue row / grid card.
        if (this.isHero || this.isGrid) {
            const playing = this.isPlaying;
            if (this.heroIcon) {
                this.heroIcon.dataset.state = playing ? 'pause' : 'play';
            }
            if (this.heroCover) {
                this.heroCover.setAttribute('aria-label', playing ? 'Pause' : 'Play');
                this.heroCover.classList.toggle('is-playing', playing);
            }
            if (this.listElement) {
                this.listElement.querySelectorAll<HTMLElement>('.wp-queue-state').forEach((ic) => {
                    const item = ic.closest<HTMLElement>('[data-index]');
                    const i = item ? Number(item.dataset.index) : -1;
                    ic.dataset.state = playing && i === this.currentTrackIndex ? 'playing' : 'play';
                });
            }
            return;
        }

        if (!this.options.showPlayState) return;

        // Update all artwork play states. Resolve each overlay's track from
        // its row: only tracks with artwork have a container, so the Nth
        // container is not necessarily track N.
        this.listElement!.querySelectorAll('.wp-artwork-container').forEach((container) => {
            const row = container.closest<HTMLElement>('[data-index]');
            const isActive = !!row && Number(row.dataset.index) === this.currentTrackIndex;
            const overlay = container.querySelector<HTMLElement>('.wp-artwork-overlay');
            if (overlay) {
                overlay.style.display = isActive ? 'flex' : 'none';
                const icon = overlay.querySelector<HTMLElement>('.wp-state');
                if (icon) {
                    icon.dataset.state = this.isPlaying && isActive ? 'playing' : 'play';
                }
            }
        });
    }

    /**
     * Update active chapter based on playback position
     * @internal
     * @param currentTime - Current playback time in seconds
     */
    updateActiveChapter(currentTime: number) {
        const track = this.tracks[this.currentTrackIndex];
        if (!track.chapters.length) return;

        // Find current chapter based on time. Chapters are sorted, so it's the
        // last one started — but the FIRST of several sharing a start time
        // (e.g. untimed chapters, which all sit at 0:00), not the last.
        let activeChapterIndex = -1;
        for (let i = 0; i < track.chapters.length; i++) {
            const time = track.chapters[i].time;
            if (time > currentTime) break;
            if (activeChapterIndex === -1 || time !== track.chapters[activeChapterIndex].time) {
                activeChapterIndex = i;
            }
        }

        // Only update UI if chapter changed
        if (activeChapterIndex === this.currentChapterIndex) return;
        this.currentChapterIndex = activeChapterIndex;

        // Update UI based on layout
        if (this.tracks.length === 1 && track.chapters.length > 0) {
            // Single track with chapters - update chapter items
            this.listElement!.querySelectorAll<HTMLElement>('.wp-chapter-item').forEach((item, i) => {
                this.setChapterActive(item, i === activeChapterIndex);
            });
        } else if (this.tracks.length > 1 && this.options.expandChapters) {
            // Multiple tracks - update chapters under current track
            const chapters = this.listElement!.querySelector(`.wp-chapters[data-track-index="${this.currentTrackIndex}"]`);
            if (chapters) {
                chapters.querySelectorAll<HTMLElement>('.wp-chapter').forEach((item, i) => {
                    this.setChapterActive(item, i === activeChapterIndex);
                });
            }
        }
    }

    /**
     * Warn (once per track) about chapters that start beyond the track's end —
     * a typo'd `data-time` that can never become active. Only checkable once
     * the real duration is known, hence the time-update hook.
     * @internal
     * @param duration - Track duration in seconds.
     */
    checkChapterRange(duration: number) {
        const index = this.currentTrackIndex;
        const track = this.tracks[index];
        if (!track || !(duration > 0) || !Number.isFinite(duration)) return;
        this.rangeChecked = this.rangeChecked || new Set();
        if (this.rangeChecked.has(index)) return;
        this.rangeChecked.add(index);

        track.chapters.filter(ch => ch.time > duration).forEach(ch => {
            console.warn(`[WaveformPlaylist] Chapter "${ch.label}" starts at ${this.formatTime(ch.time)}, after the end of "${track.title}" (${this.formatTime(duration)}).`);
        });
    }

    /**
     * Toggle a chapter row's active styling and its `aria-current` state so the
     * playing chapter is conveyed to assistive technology, not just visually.
     * @internal
     * @param item - Chapter row element
     * @param isActive - Whether this chapter is the active one
     */
    setChapterActive(item: HTMLElement, isActive: boolean) {
        item.classList.toggle('wp-active', isActive);
        if (isActive) {
            item.setAttribute('aria-current', 'true');
        } else {
            item.removeAttribute('aria-current');
        }
    }

    /**
     * Create chapter list UI for single track with chapters
     * @internal
     */
    createChapterList() {
        const track = this.tracks[0];

        const listContainer = document.createElement('div');
        listContainer.className = 'wp-list-container';

        const list = document.createElement('ul');
        list.className = 'wp-list wp-chapters-only';
        list.setAttribute('aria-label', 'Chapters');

        track.chapters.forEach((chapter, index) => {
            const item = document.createElement('li');
            item.className = 'wp-chapter-item';
            item.dataset.time = chapter.time as any;
            item.dataset.index = index as any;

            const time = document.createElement('span');
            time.className = 'wp-time';
            time.textContent = this.formatTime(chapter.time);
            item.appendChild(time);

            const label = document.createElement('span');
            label.className = 'wp-label';
            label.textContent = chapter.label;
            item.appendChild(label);

            this.makeActivatable(item, () => this.seekToChapter(0, chapter.time));

            list.appendChild(item);
        });

        listContainer.appendChild(list);
        this.appendOwn(listContainer);
        this.listElement = list;
    }

    /**
     * Build the expandable `.wp-chapters` sublist for a track (shared by the
     * track list and the hero queue). Returns null when the track has no
     * chapters or `expandChapters` is off. Hidden by default; shown for the
     * active track by setActiveTrack/selectTrack.
     * @internal
     * @param track
     * @param index
     * @returns 
     */
    buildChapterSublist(track: WaveformPlaylistTrack, index: number): HTMLElement | null {
        if (!(track.chapters.length > 0 && this.options.expandChapters)) return null;

        const chapters = document.createElement('ul');
        chapters.className = 'wp-chapters';
        chapters.dataset.trackIndex = index as any;
        chapters.setAttribute('aria-label', 'Chapters');
        chapters.style.display = 'none';

        track.chapters.forEach((chapter, chapterIndex) => {
            const chapterItem = document.createElement('li');
            chapterItem.className = 'wp-chapter';
            chapterItem.dataset.time = chapter.time as any;
            chapterItem.dataset.index = chapterIndex as any;

            const time = document.createElement('span');
            time.className = 'wp-chapter-time';
            time.textContent = this.formatTime(chapter.time);
            chapterItem.appendChild(time);

            const label = document.createElement('span');
            label.className = 'wp-chapter-label';
            label.textContent = chapter.label;
            chapterItem.appendChild(label);

            this.makeActivatable(chapterItem, (e) => {
                if (e) e.stopPropagation();
                this.seekToChapter(index, chapter.time);
            });

            chapters.appendChild(chapterItem);
        });

        return chapters;
    }

    /**
     * Create track list UI for multiple tracks
     * @internal
     */
    createTrackList() {
        const listContainer = document.createElement('div');
        listContainer.className = 'wp-list-container';

        const list = document.createElement('ul');
        list.className = 'wp-list';
        // Each track row is itself focusable (see makeActivatable below), so
        // keyboard users can Tab to a row and use the 1-9 track-select shortcuts;
        // the label gives screen-reader users context for the list of rows.
        list.setAttribute('aria-label', 'Playlist');

        this.tracks.forEach((track, index) => {
            // Create track item
            const item = document.createElement('li');
            item.className = 'wp-item';
            item.dataset.index = index as any;

            // Track artwork or number indicator
            if (track.artwork) {
                const artworkContainer = document.createElement('div');
                artworkContainer.className = 'wp-artwork-container';

                const artwork = document.createElement('img');
                artwork.className = 'wp-artwork';
                artwork.src = track.artwork;
                applyArtFallback(artwork);
                // Decorative: the row's own text already announces the title, so
                // an empty alt avoids the screen reader reading it twice.
                artwork.alt = '';
                artworkContainer.appendChild(artwork);

                // Add play/pause overlay if enabled
                if (this.options.showPlayState) {
                    const overlay = document.createElement('div');
                    overlay.className = 'wp-artwork-overlay';
                    overlay.style.display = 'none';

                    overlay.appendChild(stateIcon()); // purely visual

                    artworkContainer.appendChild(overlay);
                }

                item.appendChild(artworkContainer);
            } else {
                const indicator = document.createElement('span');
                indicator.className = 'wp-indicator';
                indicator.textContent = (index + 1) as any;
                // The visible number duplicates the row's position; hide it from
                // AT so the accessible name stays just the title/artist.
                indicator.setAttribute('aria-hidden', 'true');
                item.appendChild(indicator);
            }

            // Track info container
            const info = document.createElement('div');
            info.className = 'wp-info';

            const title = document.createElement('div');
            title.className = 'wp-title';
            title.textContent = track.title;
            info.appendChild(title);

            if (track.artist) {
                const artist = document.createElement('div');
                artist.className = 'wp-artist';
                artist.textContent = track.artist;
                info.appendChild(artist);
            }

            item.appendChild(info);

            // Duration display
            if (this.options.showDuration && track.duration) {
                const duration = document.createElement('span');
                duration.className = 'wp-duration';
                duration.textContent = track.duration;
                item.appendChild(duration);
            }

            // Keyboard-operable row: toggle play/pause on the active track,
            // select any other track. Works with mouse, Enter and Space.
            this.makeActivatable(item, () => {
                if (index === this.currentTrackIndex) {
                    // Toggle play/pause on the active track
                    if (this.player && (this.player as Player).isPlaying) {
                        (this.player as Player).pause();
                    } else if (this.player) {
                        (this.player as Player).play();
                    }
                } else {
                    // Select a different track
                    this.selectTrack(index);
                }
            });

            list.appendChild(item);

            // Add expandable chapters if they exist.
            const sub = this.buildChapterSublist(track, index);
            if (sub) list.appendChild(sub);
        });

        listContainer.appendChild(list);
        this.appendOwn(listContainer);
        this.listElement = list;
    }

    /**
     * Create minimal control buttons UI
     * @internal
     */
    createMinimalControls() {
        const controls = document.createElement('div');
        controls.className = 'wp-controls';

        this.tracks.forEach((track, index) => {
            const btn = document.createElement('button');
            btn.className = 'wp-track-btn';
            btn.dataset.index = index as any;
            btn.textContent = track.title;
            // Reflect which track is selected for assistive technology.
            btn.setAttribute('aria-pressed', 'false');

            btn.addEventListener('click', () => this.selectTrack(index));

            controls.appendChild(btn);
        });

        this.appendOwn(controls);
        this.listElement = controls;
    }

    /**
     * Select and load a track
     * @public
     * @param index - Track index to select
     */
    selectTrack(index: number) {
        this.loadTrackAt(index, null);
    }

    /**
     * Select and load a track, optionally running `onLoaded` once THAT track
     * has loaded.
     *
     * The callback is registered before loadTrack() is called: the core can
     * report a load synchronously (preload="none" with inline peaks skips
     * every await), so registering afterwards could miss it.
     *
     * @internal
     * @param index - Track index to select
     * @param onLoaded - Run after the track's onLoad
     */
    loadTrackAt(index: number, onLoaded: (() => void) | null) {
        if (index < 0 || index >= this.tracks.length) return;

        const track = this.tracks[index];
        this.currentTrackIndex = index;
        this.currentChapterIndex = -1;

        // Whatever was waiting on the previous track is void now: its seek
        // time belongs to that track, not this one.
        this.cancelPending();
        if (onLoaded) {
            this.pending = { url: track.url, onLoad: onLoaded };
        }

        // Load track into player. Callbacks were set at construction and
        // survive the core's option merge, so only per-track data travels.
        if (this.player) {
            (this.player as Player).loadTrack(track.url!, track.title, track.artist, this.trackPlayerOptions(track) as any);
        }

        // Update UI (setActiveTrack also reveals this track's chapter sublist).
        this.setActiveTrack(index);

        // The chapter index was reset above, so updateActiveChapter() only
        // repaints on a change: without this, coming back to a track whose
        // first chapter starts after 0:00 kept the old highlight until
        // playback crossed a chapter boundary.
        this.clearChapterHighlights();
    }

    /**
     * Remove the active styling / `aria-current` from every chapter row.
     * @internal
     */
    clearChapterHighlights() {
        if (!this.listElement) return;
        this.listElement.querySelectorAll<HTMLElement>('.wp-chapter, .wp-chapter-item').forEach((item) => {
            this.setChapterActive(item, false);
        });
    }

    /**
     * Seek to a chapter within a track. If the chapter lives on a different
     * track, the track is loaded first and the seek runs once that track has
     * loaded; it is dropped if the load fails or another track is selected
     * first. When the duration isn't known yet (e.g. `preload: 'none'`),
     * playback starts and the seek lands when the metadata arrives.
     * @public
     * @param trackIndex - Track index
     * @param time - Time in seconds to seek to
     */
    seekToChapter(trackIndex: number, time: number) {
        if (!this.player) return;

        // Same track - seek straight away (or as soon as the duration is known).
        if (trackIndex === this.currentTrackIndex) {
            this.cancelPending();
            this.seekAndPlay(time);
            return;
        }

        // Cross-track: load the new track, then seek once it has loaded. The
        // signal is the core's onLoad for THIS track — not
        // `waveformplayer:ready`, which the core emits once ~100ms after
        // construction and never after a load, so a deep link that seeks into
        // another track straight away used to seek before it had a duration
        // (a silent no-op). A load that fails, or a different track being
        // selected first, cancels the seek instead of leaving it to land on
        // whichever track loads next.
        this.loadTrackAt(trackIndex, () => this.seekAndPlay(time));
    }

    /**
     * Seek the current track to `time` and make sure it's playing.
     *
     * The core's seekTo() is a no-op until the duration is known, which with
     * `preload="none"` is not until playback starts. In that case playback is
     * started — which fetches the metadata — and the seek runs on
     * `loadedmetadata` (cancelled like any other pending action).
     *
     * @internal
     * @param time - Time in seconds
     */
    seekAndPlay(time: number) {
        const player = this.player as Player | null;
        if (!player) return;

        const audio = player.audio;
        if (audio && !(audio.duration > 0) && typeof audio.addEventListener === 'function') {
            const pending = {
                cleanup: () => audio.removeEventListener('loadedmetadata', onMetadata)
            };
            const onMetadata = () => {
                if (this.pending !== pending) return;
                this.cancelPending();
                player.seekTo(time);
            };
            this.cancelPending();
            this.pending = pending;
            audio.addEventListener('loadedmetadata', onMetadata);
            if (!player.isPlaying) player.play();
            return;
        }

        player.seekTo(time);
        if (!player.isPlaying) {
            player.play();
        }
    }

    /**
     * Resolve the pending post-load action, if the load that just finished is
     * the one it was waiting for. Wired to the player's `onLoad`.
     * @internal
     * @param player - The player that loaded.
     */
    resolvePending(player?: Record<string, any>) {
        const pending = this.pending;
        if (!pending || !pending.onLoad) return;
        const url = player && player.options ? player.options.url : undefined;
        if (url !== undefined && url !== pending.url) return;
        this.pending = null;
        pending.onLoad();
    }

    /**
     * Drop the pending post-load action (there is only ever one). Called when
     * another track is selected, when a load fails, and on destroy().
     * @internal
     */
    cancelPending() {
        const pending = this.pending;
        this.pending = null;
        if (pending && pending.cleanup) pending.cleanup();
    }

    /**
     * Update active track UI state
     * @internal
     * @param index - Track index to mark as active
     */
    setActiveTrack(index: number) {
        if (this.isMinimal) {
            // Minimal layout - update buttons
            this.listElement!.querySelectorAll('.wp-track-btn').forEach((btn, i) => {
                const isActive = i === index;
                btn.classList.toggle('wp-active', isActive);
                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        } else if (this.tracks.length > 1 || this.isGrid) {
            // Track list / grid - update items (grid highlights even a single card)
            this.listElement!.querySelectorAll('.wp-item').forEach((item, i) => {
                const isActive = i === index;
                item.classList.toggle('wp-active', isActive);
                // aria-current marks the playing track for screen-reader users.
                if (isActive) {
                    item.setAttribute('aria-current', 'true');
                } else {
                    item.removeAttribute('aria-current');
                }
            });
        }

        // Hero: the single cover always shows the active track's artwork. Reset
        // the time readout to the new track's known duration until playback
        // reports real values (avoids briefly showing the previous track's time).
        if ((this.isHero || this.isGrid) && this.tracks[index]) {
            const t = this.tracks[index];
            this.setHeroArt(t.artwork);
            if (this.heroTitle) this.heroTitle.textContent = t.title || '';
            if (this.heroSub) this.heroSub.textContent = t.artist || '';
            if (this.heroTime && index !== this._heroTimeIndex) {
                this.heroTime.textContent = '0:00 / ' + (t.duration || '0:00');
                this._heroTimeIndex = index;
            }
        }

        // Reveal the active track's chapter sublist, hide the rest — in every
        // layout (the list layout used to leave the first track's chapters
        // hidden until a track change). Matched by data-track-index, not
        // position: not every track has chapters, so sublist N isn't track N.
        if (this.options.expandChapters && this.tracks.length > 1 && this.listElement) {
            this.listElement.querySelectorAll<HTMLElement>('.wp-chapters').forEach((ch) => {
                ch.style.display = Number(ch.dataset.trackIndex) === index ? 'block' : 'none';
            });
        }
        // Single track with chapters doesn't need track highlighting
    }

    /**
     * Handle track end event
     * @internal
     */
    onTrackEnd() {
        // Reset chapter highlighting to beginning
        this.currentChapterIndex = -1;
        this.updateActiveChapter(0);

        // Auto-advance if continuous mode is enabled
        if (this.options.continuous && this.currentTrackIndex < this.tracks.length - 1) {
            this.selectTrack(this.currentTrackIndex + 1);
        }
    }

    /**
     * Navigate to next track
     * @public
     */
    nextTrack() {
        if (this.currentTrackIndex < this.tracks.length - 1) {
            this.selectTrack(this.currentTrackIndex + 1);
        }
    }

    /**
     * Navigate to previous track
     * @public
     */
    previousTrack() {
        if (this.currentTrackIndex > 0) {
            this.selectTrack(this.currentTrackIndex - 1);
        }
    }

    /**
     * Bind keyboard shortcuts for navigation
     * @internal
     */
    bindKeyboard() {
        // Store the bound handler so destroy() can remove it. A document-level
        // listener that is never cleaned up leaks closures and, with several
        // playlists on one page, would cross-fire between instances.
        this.keydownHandler = (e) => {
            const active = document.activeElement;
            // `contains` matches the element itself too, so when the player has
            // focus playlistHasFocus is also true (the player lives inside the
            // playlist container). Tracking both lets us tell "playlist UI" from
            // "player" focus below.
            const playlistHasFocus = this.container.contains(active);
            const playerHasFocus = !!(this.player as Player | null)?.container.contains(active);

            // Only act when this playlist (or its own player) holds focus, so
            // multiple playlists on the same page never cross-fire.
            if (!playlistHasFocus && !playerHasFocus) {
                return;
            }

            // Leave browser/OS shortcuts alone: Cmd/Ctrl+P is print, Ctrl+N a
            // new window, Ctrl/Cmd/Alt+digit switches tabs. Shift is allowed
            // (Shift+N still reads as "n").
            if (e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'n':
                    if (this.tracks.length > 1) {
                        e.preventDefault();
                        this.nextTrack();
                    }
                    break;
                case 'p':
                    if (this.tracks.length > 1) {
                        e.preventDefault();
                        this.previousTrack();
                    }
                    break;
            }

            // Number keys 1-9 select a track. The core player already binds 0-9
            // to "seek to 0%-90%" whenever it holds focus, so handling bare
            // digits here too would make a single keypress BOTH seek and switch
            // track. To avoid that collision we only treat digits as
            // track-select when focus is on the playlist's own UI (e.g. a track
            // button or the focusable list) and NOT on the player. When the
            // player is focused, bare digits fall through to the core player's
            // documented seek behaviour.
            if (this.tracks.length > 1 && playlistHasFocus && !playerHasFocus &&
                e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key, 10) - 1;
                if (index < this.tracks.length) {
                    e.preventDefault();
                    this.selectTrack(index);
                }
            }
        };

        document.addEventListener('keydown', this.keydownHandler);
    }

    /**
     * Make a non-interactive element (e.g. an `<li>` row) behave like a button
     * for keyboard and assistive-technology users: it exposes a `button` role,
     * joins the tab order, and runs the same handler on Enter/Space as on click.
     *
     * Without this, the clickable track and chapter rows are mouse-only and
     * invisible to keyboard and screen-reader users.
     *
     * @internal
     * @param el - Element to make activatable
     * @param onActivate - Handler run on click / Enter / Space; receives the originating event
     */
    makeActivatable(el: HTMLElement, onActivate: (e?: Event) => void) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.addEventListener('click', onActivate);
        el.addEventListener('keydown', (e) => {
            // Enter and Space are the standard activation keys for buttons.
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault(); // stop Space from scrolling the page
                onActivate(e);
            }
        });
    }

    /**
     * Parse time string to seconds
     *
     * A `data-time` an author mistyped (`"1:ab"`, `"soon"`) used to yield NaN
     * for the two-part form, which then rendered as `NaN` in the chapter list
     * and positioned the chapter marker at `left: NaN%`. Anything unparseable
     * is 0 — the start of the track — rather than a value that poisons every
     * calculation it touches.
     *
     * Hour-long chapters need `H:MM:SS`, which used to read as just the hour
     * (`"1:05:30"` → 1 second).
     *
     * @internal
     * @param timeStr - Time string: "SS", "M:SS" or "H:MM:SS"
     * @returns Time in seconds, or 0 when unparseable
     */
    parseTime(timeStr: string): number {
        const parts = String(timeStr ?? '').trim().split(':');
        // An empty field ("1::30") would coerce to 0 and pass as valid.
        if (parts.length > 3 || (parts.length > 1 && parts.some(p => p.trim() === ''))) return 0;

        const seconds = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
        return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    }

    /**
     * Format seconds to time string
     * @internal
     * @param seconds - Time in seconds
     * @returns Formatted time string "M:SS"
     */
    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Extract title from URL filename
     * @internal
     * @param url - Audio file URL
     * @returns Extracted title
     */
    extractTitleFromUrl(url: string | undefined): string {
        if (!url) return 'Untitled';
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        return filename.split('.')[0].replace(/[-_]/g, ' ');
    }

    /**
     * Generate unique ID
     * @internal
     * @returns Random ID string
     */
    generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }

    /**
     * Get the underlying WaveformPlayer instance, or `null`.
     * @public
     * @returns The WaveformPlayer instance
     */
    getPlayer(): unknown | null {
        return this.player;
    }

    /**
     * Get current track index
     * @public
     * @returns Current track index
     */
    getCurrentTrackIndex(): number {
        return this.currentTrackIndex;
    }

    /**
     * Get all tracks
     * @public
     * @returns Array of track objects
     */
    getTracks(): WaveformPlaylistTrack[] {
        return this.tracks;
    }

    /**
     * Destroy the playlist: remove its listeners and generated DOM, restore the
     * original `[data-track]` markup in place, and drop the classes and
     * auto-init flag it added, so the container can be initialised again.
     * @public
     */
    destroy() {
        // Remove the global keydown listener so it does not leak or keep
        // firing after this playlist is gone.
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }

        // A chapter seek still waiting on a load must not outlive the player.
        this.cancelPending();

        // Destroy player instance
        if (this.player) {
            (this.player as Player).destroy();
        }

        // Remove only what init() generated. This used to wipe innerHTML
        // before "restoring" the track elements — which were gone by then —
        // so a framework wrapper that destroys and rebuilds on a prop change
        // (with the tracks rendered as its children) rebuilt an empty playlist.
        (this.ownNodes || []).forEach(node => node.remove());
        this.container.classList.remove(...(this.ownClasses || []));
        // autoInit()'s claim flag, so WaveformPlaylist.init() can rebuild it.
        delete this.container.dataset.waveformPlaylistInitialized;

        // Restore original elements, in place
        this.tracks.forEach(track => {
            if (track.element) {
                track.element.style.display = (this.trackDisplay && this.trackDisplay.get(track.element)) || '';
            }
        });

        // Clear references
        this.player = null;
        this.listElement = null;
        this.ownNodes = [];
        this.ownClasses = [];
        this.trackDisplay = null;
        this.heroCover = this.heroArt = this.heroIcon = null;
        this.heroTitle = this.heroSub = this.heroTime = null;
        this.tracks = [];
    }
}

/**
 * Auto-initialization function
 * Automatically initializes all elements with data-waveform-playlist attribute
 */
function autoInit() {
    if (typeof document === 'undefined') return;

    const elements = document.querySelectorAll<HTMLElement>('[data-waveform-playlist]');
    elements.forEach(element => {
        if (element.dataset.waveformPlaylistInitialized === 'true') return;

        try {
            new WaveformPlaylist(element);
            element.dataset.waveformPlaylistInitialized = 'true';
        } catch (error) {
            console.error('[WaveformPlaylist] Failed to initialize:', error);
        }
    });
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        if (typeof window !== 'undefined' && window.WaveformPlayer) {
            autoInit();
        } else if (typeof window !== 'undefined') {
            // Wait for WaveformPlayer to load
            const checkInterval = setInterval(() => {
                if (window.WaveformPlayer) {
                    clearInterval(checkInterval);
                    autoInit();
                }
            }, 100);
            // Give up after 5 seconds
            setTimeout(() => clearInterval(checkInterval), 5000);
        }
    }
}

// Add static init method
WaveformPlaylist.init = autoInit;

// Export for browser usage
if (typeof window !== 'undefined') {
    window.WaveformPlaylist = WaveformPlaylist;
}

// Default export
export default WaveformPlaylist;