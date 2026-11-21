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
import { WaveformPlaylist } from './playlist.js';
export { WaveformPlaylist };
export { WaveformPlaylistElement, defineWaveformPlaylistElement } from './element.js';
export type { WaveformPlaylistChapter, WaveformPlaylistMarker, WaveformPlaylistOptions, WaveformPlaylistTrack, } from './types.js';
export default WaveformPlaylist;
//# sourceMappingURL=entry.d.ts.map