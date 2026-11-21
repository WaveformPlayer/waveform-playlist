<div align="center">

# WaveformPlaylist

**Playlist and chapter navigation for WaveformPlayer.**
Turn a list of tracks into a player with track switching, artwork and clickable chapters.

[![npm version](https://img.shields.io/npm/v/@arraypress/waveform-playlist?style=flat-square&labelColor=09090b&color=3f3f46)](https://www.npmjs.com/package/@arraypress/waveform-playlist)
[![gzip size](https://img.shields.io/bundlephobia/minzip/@arraypress/waveform-playlist?style=flat-square&label=gzip&labelColor=09090b&color=3f3f46)](https://bundlephobia.com/package/@arraypress/waveform-playlist)
[![license](https://img.shields.io/npm/l/@arraypress/waveform-playlist?style=flat-square&labelColor=09090b&color=3f3f46)](https://github.com/WaveformPlayer/waveform-playlist/blob/main/LICENSE)

**[Documentation](https://docs.waveformplayer.com/)** · [npm](https://www.npmjs.com/package/@arraypress/waveform-playlist)

</div>

---

## Install

```bash
npm install @arraypress/waveform-playlist @arraypress/waveform-player
```

```html
<div data-waveform-playlist>
  <div data-track data-url="episode.mp3" data-title="Episode 42" data-artist="with Dr. Sarah Chen">
    <div data-chapter data-time="0:00">Introduction</div>
    <div data-chapter data-time="5:30">Main Topic</div>
  </div>
</div>
```

## The `<waveform-playlist>` element

The same markup, as a custom element. Its attributes are the playlist's
`data-*` options with or without the `data-` prefix:

```html
<waveform-playlist layout="hero" show-volume continuous>
  <div data-track data-url="intro.mp3" data-title="Intro" data-duration="187"></div>
  <div data-track data-url="episode.mp3" data-title="Episode 42">
    <div data-chapter data-time="0:00">Introduction</div>
    <div data-chapter data-time="5:30">Main Topic</div>
  </div>
</waveform-playlist>
```

- Changing an attribute or a track rebuilds it, and the current track keeps
  playing (from the same spot) if it is still in the list. Moving the element
  keeps playback; removing it destroys the playlist.
- `el.playlist` is the `WaveformPlaylist`; `el.play()`, `el.pause()`,
  `el.next()` and `el.previous()` control it. Events (`waveformplayer:*`)
  bubble from the element.
- The default import and the CDN script register the tag (and scan for
  `data-waveform-playlist`) unless the page sets
  `<html data-waveform-autoinit="false">`. From
  `@arraypress/waveform-playlist/no-autoinit` (no auto-init at all), call
  `defineWaveformPlaylistElement()` — optionally with another tag name.
- Before it upgrades it is a block reserving `--wp-element-height` (90px by
  default); set that to your playlist's height to avoid any shift.

## Documentation

Full options, chapters and the JavaScript API live in the docs.

### -> [docs.waveformplayer.com](https://docs.waveformplayer.com/)

[Options](https://docs.waveformplayer.com/extensions/playlist/options/) · [Chapters](https://docs.waveformplayer.com/extensions/playlist/chapters/) · [API](https://docs.waveformplayer.com/extensions/playlist/api/)

## License

MIT © [ArrayPress](https://github.com/arraypress)
