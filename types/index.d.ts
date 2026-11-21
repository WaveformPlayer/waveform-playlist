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
import WaveformPlaylist from './entry.js';
export * from './entry.js';
export default WaveformPlaylist;
//# sourceMappingURL=index.d.ts.map