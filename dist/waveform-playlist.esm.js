import {
  WaveformPlaylist,
  WaveformPlaylistElement,
  defineWaveformPlaylistElement,
  entry_default
} from "./waveform-playlist-shared.esm.js";

// src/js/index.ts
var js_default = entry_default;
if (typeof document !== "undefined") {
  const start = () => {
    defineWaveformPlaylistElement();
    entry_default.init();
  };
  if (document.readyState === "loading") {
    defineWaveformPlaylistElement();
    document.addEventListener("DOMContentLoaded", () => entry_default.init());
  } else if (typeof window !== "undefined" && window.WaveformPlayer) {
    start();
  } else if (typeof window !== "undefined") {
    const checkInterval = setInterval(() => {
      if (window.WaveformPlayer) {
        clearInterval(checkInterval);
        start();
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 5e3);
  }
}
export {
  WaveformPlaylist,
  WaveformPlaylistElement,
  js_default as default,
  defineWaveformPlaylistElement
};
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
