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
import { WaveformPlaylist } from './playlist.js';
declare global {
    interface HTMLElementTagNameMap {
        'waveform-playlist': WaveformPlaylistElement;
    }
}
declare const Base: typeof HTMLElement;
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
export declare class WaveformPlaylistElement extends Base {
    /** The playlist inside this element, or `null` while disconnected. */
    playlist: WaveformPlaylist | null;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, previous: string | null, value: string | null): void;
    /** Play the current track. */
    play(): Promise<void> | undefined;
    /** Pause. */
    pause(): void;
    /** Go to the next track — {@link WaveformPlaylist.nextTrack}. */
    next(): void;
    /** Go to the previous track — {@link WaveformPlaylist.previousTrack}. */
    previous(): void;
}
/**
 * Register the `<waveform-playlist>` element (or the same element under
 * another name). The default entry point does this on import; `/no-autoinit`
 * leaves it to you. A name that is already defined is left alone.
 * @param name - Tag name; must contain a hyphen.
 * @returns The registered constructor, or `undefined` outside a browser.
 */
export declare function defineWaveformPlaylistElement(name?: string): CustomElementConstructor | undefined;
export {};
//# sourceMappingURL=element.d.ts.map