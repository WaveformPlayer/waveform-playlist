/**
 * @module entry
 * @description The runtime surface behind both public entry points.
 *
 * Everything the library exposes — the {@link WaveformPlaylist} class, the
 * `WaveformPlaylist.init` scan hook, the `<waveform-playlist>` element and the
 * `window` global for `<script>`/CDN usage — *except* the import-time side
 * effects: running the `[data-waveform-playlist]` scan and registering
 * `<waveform-playlist>`. Those live in `index.ts` alone:
 *
 * - `@arraypress/waveform-playlist` → `index.ts`: this surface, plus the scan
 *   and the tag.
 * - `@arraypress/waveform-playlist/no-autoinit` → this module: never scans,
 *   never registers (call {@link defineWaveformPlaylistElement} yourself).
 */

import {WaveformPlaylist, instances} from './playlist.js';
import {WaveformPlaylistElement, defineWaveformPlaylistElement} from './element.js';

/**
 * Initialise every `[data-waveform-playlist]` element not already claimed —
 * by an earlier scan (the `data-waveform-playlist-initialized` flag), by a
 * playlist built in script, or by being a `<waveform-playlist>`, which builds
 * its own (possibly once `DOMContentLoaded` arrives).
 */
function autoInit() {
    if (typeof document === 'undefined') return;

    const elements = document.querySelectorAll<HTMLElement>('[data-waveform-playlist]');
    elements.forEach(element => {
        if (element.dataset.waveformPlaylistInitialized === 'true') return;
        if (element instanceof WaveformPlaylistElement || instances.has(element)) return;

        try {
            new WaveformPlaylist(element);
            element.dataset.waveformPlaylistInitialized = 'true';
        } catch (error) {
            console.error('[WaveformPlaylist] Failed to initialize:', error);
        }
    });
}

// Add static init method
WaveformPlaylist.init = autoInit;
// And the element definer, for script-tag pages that opted out of auto-init.
WaveformPlaylist.defineElement = defineWaveformPlaylistElement;

// Export for browser usage
if (typeof window !== 'undefined') {
    window.WaveformPlaylist = WaveformPlaylist;
}

export {WaveformPlaylist};
export {WaveformPlaylistElement, defineWaveformPlaylistElement} from './element.js';

export type {
    WaveformPlaylistChapter,
    WaveformPlaylistMarker,
    WaveformPlaylistOptions,
    WaveformPlaylistTrack,
} from './types.js';

// Default export
export default WaveformPlaylist;
