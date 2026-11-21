/**
 * WaveformPlaylist
 * Playlist and chapter navigation for WaveformPlayer
 *
 * The default entry point: everything `entry.ts` exports, plus making markup
 * come alive by itself — it registers `<waveform-playlist>` and scans for
 * `[data-waveform-playlist]` once the DOM is ready (and the core is loaded).
 * `@arraypress/waveform-playlist/no-autoinit` does neither, and nor does
 * this entry on a page with `<html data-waveform-autoinit="false">`.
 *
 * @author ArrayPress
 * @license MIT
 */

import WaveformPlaylist, {defineWaveformPlaylistElement} from './entry.js';

export * from './entry.js';
export default WaveformPlaylist;

/**
 * Whether the page has opted out of what this module does on import — the
 * family's switch, read exactly as `@arraypress/waveform-player` reads it:
 * `<html data-waveform-autoinit="false">`.
 *
 * A page that renders markup it does not author (user content, a CMS, an
 * editor canvas) may not want every `[data-waveform-playlist]` or
 * `<waveform-playlist>` on it to become a playlist. With the attribute set,
 * nothing is built and the tag is not registered unless the page asks:
 * `WaveformPlaylist.init()` scans and `defineWaveformPlaylistElement()`
 * registers, both still exported. Read off `<html>` rather than a global
 * because a static `import` is evaluated before the importing module's body
 * could set one; markup is in place before any script runs. A bundle embedded
 * in a page it doesn't own imports `/no-autoinit` instead.
 * @returns 
 */
const autoInitDisabled = () => document.documentElement?.dataset.waveformAutoinit === 'false';

// This block is the entire difference between this module and entry.ts.
if (typeof document !== 'undefined' && !autoInitDisabled()) {
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
