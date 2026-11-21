/**
 * WaveformPlaylist
 * Playlist and chapter navigation for WaveformPlayer
 *
 * The default entry point: everything `entry.ts` exports, plus making markup
 * come alive by itself — it registers `<waveform-playlist>` and scans for
 * `[data-waveform-playlist]` once the DOM is ready (and the core is loaded).
 * `@arraypress/waveform-playlist/no-autoinit` does neither.
 *
 * @author ArrayPress
 * @license MIT
 */

import WaveformPlaylist, {defineWaveformPlaylistElement} from './entry.js';

export * from './entry.js';
export default WaveformPlaylist;

// This block is the entire difference between this module and entry.ts.
if (typeof document !== 'undefined') {
    // Register the element, then scan: an element that upgrades first claims
    // its container, and the scan skips it.
    const start = () => {
        defineWaveformPlaylistElement();
        WaveformPlaylist.init();
    };

    if (document.readyState === 'loading') {
        // Parsed <waveform-playlist> tags upgrade as they arrive and build at
        // DOMContentLoaded, as the scan does.
        defineWaveformPlaylistElement();
        document.addEventListener('DOMContentLoaded', () => WaveformPlaylist.init());
    } else if (typeof window !== 'undefined' && window.WaveformPlayer) {
        start();
    } else if (typeof window !== 'undefined') {
        // Wait for WaveformPlayer to load — the element too, as it can't
        // build without it.
        const checkInterval = setInterval(() => {
            if (window.WaveformPlayer) {
                clearInterval(checkInterval);
                start();
            }
        }, 100);
        // Give up after 5 seconds
        setTimeout(() => clearInterval(checkInterval), 5000);
    }
}
