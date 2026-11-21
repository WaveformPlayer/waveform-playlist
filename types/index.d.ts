/**
 * WaveformPlaylist
 * Playlist and chapter navigation for WaveformPlayer
 *
 * @author ArrayPress
 * @license MIT
 */
import type { WaveformPlaylistOptions, WaveformPlaylistTrack } from './types.js';
export type { WaveformPlaylistChapter, WaveformPlaylistMarker, WaveformPlaylistOptions, WaveformPlaylistTrack, } from './types.js';
declare global {
    interface Window {
        WaveformPlaylist: typeof WaveformPlaylist;
    }
}
/**
 * WaveformPlaylist Class
 * Adds playlist and chapter navigation capabilities to WaveformPlayer
 *
 * @class WaveformPlaylist
 */
export declare class WaveformPlaylist {
    /** The resolved container element. */
    container: HTMLElement;
    /** Merged configuration options. */
    options: WaveformPlaylistOptions;
    /** Parsed tracks. */
    tracks: WaveformPlaylistTrack[];
    /** Index of the currently selected track. */
    currentTrackIndex: number;
    /** Index of the active chapter, or -1 when none. */
    currentChapterIndex: number;
    /** The underlying WaveformPlayer instance, or `null` before init. */
    player: unknown | null;
    /** Whether playback is currently active. */
    isPlaying: boolean;
    /**
     * Auto-initialize every element with a `data-waveform-playlist` attribute.
     */
    static init: () => void;
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
    constructor(container: string | HTMLElement, options?: WaveformPlaylistOptions);
    /**
     * Select and load a track
     * @public
     * @param index - Track index to select
     */
    selectTrack(index: number): void;
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
    seekToChapter(trackIndex: number, time: number): void;
    /**
     * Navigate to next track
     * @public
     */
    nextTrack(): void;
    /**
     * Navigate to previous track
     * @public
     */
    previousTrack(): void;
    /**
     * Get the underlying WaveformPlayer instance, or `null`.
     * @public
     * @returns The WaveformPlayer instance
     */
    getPlayer(): unknown | null;
    /**
     * Get current track index
     * @public
     * @returns Current track index
     */
    getCurrentTrackIndex(): number;
    /**
     * Get all tracks
     * @public
     * @returns Array of track objects
     */
    getTracks(): WaveformPlaylistTrack[];
    /**
     * Destroy the playlist: remove its listeners and generated DOM, restore the
     * original `[data-track]` markup in place, and drop the classes and
     * auto-init flag it added, so the container can be initialised again.
     * @public
     */
    destroy(): void;
}
export default WaveformPlaylist;
//# sourceMappingURL=index.d.ts.map