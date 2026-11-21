/**
 * @module element
 * @description The `<waveform-playlist>` custom element.
 *
 * A light-DOM wrapper, modelled on the core's `<waveform-player>`: the element
 * itself is the playlist's container, so its `[data-track]` / `[data-chapter]`
 * children are read exactly as a `[data-waveform-playlist]` container's are,
 * the stylesheet applies unchanged, and every `waveformplayer:*` event bubbles
 * from the tag. Configured by attributes — every `data-*` option the playlist
 * reads (its own and the player options it forwards), with or without the
 * `data-` prefix (`layout="hero"`, `show-volume`, …), the unprefixed form
 * winning.
 *
 * The default entry point registers it; `/no-autoinit` only exports
 * {@link defineWaveformPlaylistElement}.
 */

import {WaveformPlaylist, optionSources, instances} from './playlist.js';

declare global {
    interface HTMLElementTagNameMap {
        'waveform-playlist': WaveformPlaylistElement;
    }
}

/**
 * Every `data-*` key the playlist reads off its container, as its `dataset`
 * name: its own options (`parseOptions()`), then the player options the core's
 * `parseDataAttributes` reads and the playlist forwards — that is, minus
 * `NOT_FORWARDED` (audioMode, loop, showLoop, lazy) and the per-track keys
 * each `[data-track]` supplies (src/url, title, artist, album, artwork,
 * markers, waveform, duration, downloadUrl, downloadName). The element accepts
 * each as `data-<kebab>` and as plain `<kebab>`, except `style`: unprefixed,
 * that is the element's CSS, so the alias only works as `data-style` (or use
 * `waveform-style`). `test/element.test.js` fails if this list and the two
 * parsers drift apart.
 * @internal
 */
export const OPTION_KEYS = [
    // The playlist's own.
    'layout', 'continuous', 'expandChapters', 'showDuration', 'showPlayState', 'showArtist',
    'coverSize', 'thumbnailSize', 'density', 'coverPosition', 'barPosition',
    'showChapterMarkers', 'chapterMarkerColor',
    // The player's, forwarded (`layout` above is read by both).
    'height', 'samples', 'preload', 'crossOrigin',
    'style', 'waveformStyle', 'waveformGradient', 'barWidth', 'barSpacing', 'barRadius',
    'buttonAlign', 'buttonStyle', 'buttonSize', 'buttonRadius', 'colorPreset',
    'waveformColor', 'progressColor', 'autoplay', 'showControls', 'showInfo', 'showTime',
    'showHoverTime', 'seekHandle', 'showBpm', 'bpm', 'singlePlay', 'playOnSeek',
    'showVolume', 'volume', 'showDownload', 'artworkPosition',
    'playbackRate', 'showPlaybackSpeed', 'playbackRates', 'enableMediaSession', 'showMarkers',
    'accessibleSeek', 'seekLabel', 'seekValueText', 'errorText', 'playPauseLabel', 'speedLabel',
    'loopLabel', 'volumeLabel', 'muteLabel', 'downloadLabel', 'artworkAlt', 'unknownTrackText',
    'playIcon', 'pauseIcon',
];

/**
 * The `[data-track]` / `[data-chapter]` attributes `parseTracks()` reads. A
 * change to one of them (or to a chapter's text, or a track or chapter
 * added/removed) rebuilds the playlist. Checked against `parseTracks()` by
 * `test/element.test.js`.
 * @internal
 */
export const TRACK_ATTRIBUTES = [
    'data-track', 'data-url', 'data-title', 'data-artist', 'data-artwork', 'data-album',
    'data-duration', 'data-download-url', 'data-download-name', 'data-waveform', 'data-markers',
    'data-chapter', 'data-time', 'data-color',
];

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** Player options the core reads as booleans, by `dataset` key (cached). */
const booleans = new Map<string, boolean>();

/**
 * Whether the core parses `key` as a boolean — asked of the core's own
 * parser, so there is no list here to drift. The playlist's own flags read a
 * bare attribute as true already (present and not "false").
 * @param key - A `dataset` key.
 * @returns
 */
function isPlayerBoolean(key: string): boolean {
    let known = booleans.get(key);
    if (known === undefined) {
        const parsed = window.WaveformPlayer.utils.parseDataAttributes({dataset: {[key]: 'true'}} as unknown as HTMLElement);
        known = Object.values(parsed).some((v) => typeof v === 'boolean');
        booleans.set(key, known);
    }
    return known;
}

/**
 * The element's options as a `dataset`: each key from its plain attribute,
 * else its `data-` one. The playlist parses it exactly as it parses a
 * container's own `dataset` (its parser and the core's), so the element and
 * `[data-waveform-playlist]` cannot read a value differently. A bare boolean
 * attribute (`<waveform-playlist show-volume>`) means true, as HTML boolean
 * attributes do.
 * @param el - The element.
 * @returns Sparse `dataset`-shaped options.
 */
function readDataset(el: HTMLElement): Record<string, string> {
    const dataset: Record<string, string> = {};
    for (const key of OPTION_KEYS) {
        const name = kebab(key);
        const plain = key === 'style' ? null : el.getAttribute(name);
        const value = plain === '' && isPlayerBoolean(key) ? 'true' : plain ?? el.getAttribute('data-' + name);
        if (value != null) dataset[key] = value;
    }
    return dataset;
}

/** Where playback was, so a rebuild can carry on from there. */
type Resume = { element: HTMLElement | null | undefined; url: string | undefined; time: number; playing: boolean };

/**
 * @param playlist - The playlist about to be rebuilt.
 * @returns Its current track and position, or null with no tracks.
 */
function snapshot(playlist: WaveformPlaylist): Resume | null {
    const track = playlist.tracks[playlist.currentTrackIndex];
    if (!track) return null;
    const player = playlist.player as { audio?: HTMLMediaElement | null; isPlaying?: boolean } | null;
    const audio = player?.audio;
    return {
        element: track.element,
        url: track.url,
        time: audio?.currentTime || 0,
        playing: audio ? !audio.paused : !!player?.isPlaying,
    };
}

/**
 * Put the rebuilt playlist back where the old one was: the same track (the
 * same `[data-track]` element with the same url, else the first track with
 * that url), at the same time, playing if it was. A track that no longer
 * exists leaves the new playlist on its first track, paused.
 * @param playlist - The new playlist.
 * @param state - From {@link snapshot}.
 */
function resume(playlist: WaveformPlaylist, state: Resume) {
    const tracks = playlist.tracks;
    let index = tracks.findIndex((t) => t.element === state.element && t.url === state.url);
    if (index < 0) index = tracks.findIndex((t) => t.url === state.url);
    if (index < 0 || !playlist.player) return;
    if (index === 0 && !state.playing && !state.time) return;

    const carryOn = () => {
        if (state.playing) playlist.seekAndPlay(state.time);
        else if (state.time) (playlist.player as { seekTo(t: number): void } | null)?.seekTo(state.time);
    };
    if (index === 0) {
        // Already loading track 0 (asynchronously, as the core always loads
        // its first track): run once THAT load lands, as a chapter seek does.
        playlist.pending = {url: tracks[0].url, onLoad: carryOn};
    } else {
        playlist.loadTrackAt(index, carryOn, state.playing);
    }
}

// Defined on any host: SSR and plain-Node imports have no HTMLElement, and
// this module must still evaluate there (the class is only ever constructed
// by a browser's customElements).
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

/**
 * `<waveform-playlist layout="hero" show-volume><div data-track data-url="…"></div>…</waveform-playlist>`.
 *
 * - `connectedCallback` builds the playlist into the element (after
 *   `DOMContentLoaded` while the document is still parsing, so the tracks
 *   are there); `disconnectedCallback` destroys it, unless the element is put
 *   back before the current task ends (a move within the DOM keeps the
 *   playlist, and its playback).
 * - Changing an option attribute (either form), or adding, removing or
 *   changing a `[data-track]` / `[data-chapter]` child, rebuilds the playlist
 *   once per microtask. The rebuild carries on with the current track — same
 *   position, still playing if it was — when that track is still there.
 * - {@link WaveformPlaylistElement.playlist} is the instance (a new one after
 *   each rebuild); `play()`, `pause()`, `next()` and `previous()` forward to it.
 */
export class WaveformPlaylistElement extends Base {
    /** The playlist inside this element, or `null` while disconnected. */
    declare playlist: WaveformPlaylist | null;
    /** @internal A disconnection waiting to see whether the element comes back. */ declare _leaving: ReturnType<typeof setTimeout> | undefined;
    /** @internal A rebuild queued for the end of this microtask checkpoint. */ declare _queued: boolean | undefined;
    /** @internal Waiting for DOMContentLoaded to build. */ declare _waiting: (() => void) | undefined;
    /** @internal Watches the track markup. */ declare _observer: MutationObserver | undefined;

    static get observedAttributes(): string[] {
        return OPTION_KEYS.flatMap((key) => key === 'style' ? ['data-style'] : [kebab(key), 'data-' + kebab(key)]);
    }

    constructor() {
        super();
        this.playlist = null;
        optionSources.set(this, () => readDataset(this));
    }

    connectedCallback() {
        // Moved within the DOM: same playlist, just re-fit the waveform (a
        // move doesn't reliably trip the player's resize observer).
        if (this._leaving !== undefined) {
            clearTimeout(this._leaving);
            this._leaving = undefined;
            (this.playlist?.player as { resizeCanvas?(): void } | null)?.resizeCanvas?.();
            return;
        }
        if (this.playlist || this._waiting) return;
        // Parsed markup connects at its start tag, before its children: wait
        // for the tracks rather than building (and rebuilding) as they arrive.
        if (document.readyState === 'loading') {
            this._waiting = () => {
                this._waiting = undefined;
                if (this.isConnected && !this.playlist) this._build();
            };
            document.addEventListener('DOMContentLoaded', this._waiting, {once: true});
            return;
        }
        this._build();
    }

    disconnectedCallback() {
        clearTimeout(this._leaving);
        this._leaving = setTimeout(() => {
            this._leaving = undefined;
            if (!this.isConnected) this._teardown();
        }, 0);
    }

    attributeChangedCallback(name: string, previous: string | null, value: string | null) {
        // Before the build the attributes are simply read by it.
        if (previous !== value) this._queue();
    }

    /** Play the current track. */
    play(): Promise<void> | undefined {
        return (this.playlist?.player as { play(): Promise<void> | undefined } | null)?.play();
    }

    /** Pause. */
    pause() {
        (this.playlist?.player as { pause(): void } | null)?.pause();
    }

    /** Go to the next track — {@link WaveformPlaylist.nextTrack}. */
    next() {
        this.playlist?.nextTrack();
    }

    /** Go to the previous track — {@link WaveformPlaylist.previousTrack}. */
    previous() {
        this.playlist?.previousTrack();
    }

    /** @internal Rebuild once, after everything else this microtask checkpoint changes. */
    _queue() {
        if (!this.playlist || this._queued) return;
        this._queued = true;
        queueMicrotask(() => {
            this._queued = false;
            if (this.playlist) this._rebuild();
        });
    }

    /** @internal */
    _build() {
        // A `[data-waveform-playlist]` scan or a script may have built a
        // playlist here first; the element's own wins.
        instances.get(this)?.destroy();
        try {
            this.playlist = new WaveformPlaylist(this);
            // The scan's own claim flag (destroy() clears it): a scan by any
            // copy of the library skips this element.
            this.dataset.waveformPlaylistInitialized = 'true';
        } catch (error) {
            this.playlist = null;
            console.error('[WaveformPlaylist] Failed to initialize:', error, this);
        }
        if (!this._observer) {
            this._observer = new MutationObserver((records) => {
                if (records.some((r) => this._isTrackChange(r))) this._queue();
            });
        }
        this._observer.observe(this, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: TRACK_ATTRIBUTES,
        });
        // The build's own markup changes are not track changes.
        this._observer.takeRecords();
    }

    /** @internal */
    _teardown() {
        this._observer?.disconnect();
        this.playlist?.destroy();
        this.playlist = null;
    }

    /** @internal Rebuild from the current attributes and markup, carrying playback over. */
    _rebuild() {
        const state = this.playlist ? snapshot(this.playlist) : null;
        // Records already queued describe the markup this rebuild reads.
        this._observer?.takeRecords();
        this._teardown();
        this._build();
        if (state && this.playlist) resume(this.playlist, state);
    }

    /**
     * Whether a mutation touched the track markup — not the playlist's own
     * generated UI (whose time readouts change every frame), nor the inline
     * `display` it puts on the tracks (filtered out by `attributeFilter`).
     * @internal
     * @param record
     * @returns
     */
    _isTrackChange(record: MutationRecord): boolean {
        if (this._trackOf(record.target)) return true;
        // An element that just lost its data-track no longer matches above.
        if (record.attributeName === 'data-track') return record.target !== this;
        if (record.type !== 'childList') return false;
        const holdsTrack = (node: Node) => node instanceof Element &&
            (node.matches('[data-track]') || node.querySelector('[data-track]') !== null);
        return [...record.addedNodes].some(holdsTrack) || [...record.removedNodes].some(holdsTrack);
    }

    /**
     * @internal
     * @param node
     * @returns The `[data-track]` inside this element that holds `node`, if any.
     */
    _trackOf(node: Node): Element | null {
        const el = node instanceof Element ? node : node.parentElement;
        const track = el?.closest('[data-track]');
        return track && track !== this && this.contains(track) ? track : null;
    }
}

/**
 * Register the `<waveform-playlist>` element (or the same element under
 * another name). The default entry point does this on import; `/no-autoinit`
 * leaves it to you. A name that is already defined is left alone.
 * @param name - Tag name; must contain a hyphen.
 * @returns The registered constructor, or `undefined` outside a browser.
 */
export function defineWaveformPlaylistElement(name: string = 'waveform-playlist'): CustomElementConstructor | undefined {
    if (typeof customElements === 'undefined') return undefined;
    const existing = customElements.get(name);
    if (existing) return existing;
    // A constructor can only be registered once, so each name gets its own
    // subclass (all of them `instanceof WaveformPlaylistElement`).
    const element = class extends WaveformPlaylistElement {};
    customElements.define(name, element);
    return element;
}
