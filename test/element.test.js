import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { MockWaveformPlayer, realUtils, settle } from './setup.js';
import { WaveformPlaylist, WaveformPlaylistElement, defineWaveformPlaylistElement } from '../src/js/index.js';

/**
 * The `<waveform-playlist>` custom element: light DOM, the element is the
 * container, configured by every data-* option the playlist reads with or
 * without the prefix, rebuilt (carrying playback over) when its attributes or
 * its track markup change. Runs against the MockWaveformPlayer from setup.js;
 * importing index.js registered the tag (setup.js installs the core first).
 */

const flush = () => new Promise((r) => queueMicrotask(r));
/** Past the MutationObserver delivery and the microtask rebuild it queues. */
const rebuilt = async () => { await flush(); await flush(); await flush(); };

const TRACKS = `
	<div data-track data-url="/a.mp3" data-title="A" data-duration="3:00"></div>
	<div data-track data-url="/b.mp3" data-title="B" data-duration="187">
		<span data-chapter data-time="0:00">B intro</span>
		<span data-chapter data-time="1:00">B main</span>
	</div>
	<div data-track data-url="/c.mp3" data-title="C"></div>
`;

/** Parse markup into the document, as a server-rendered page would arrive. */
function render(attrs = '', tracks = TRACKS) {
	document.body.innerHTML = `<waveform-playlist ${attrs}>${tracks}</waveform-playlist>`;
	return document.body.firstElementChild;
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const both = (keys) => [...keys].flatMap((k) => (k === 'style' ? ['data-style'] : [kebab(k), 'data-' + kebab(k)]));
const SRC = readFileSync(resolve(process.cwd(), 'src/js/playlist.ts'), 'utf8');
/** The body of a method of WaveformPlaylist, by name. */
const method = (name) => {
	const body = SRC.slice(SRC.indexOf(`\n    ${name}(`));
	return body.slice(0, body.indexOf('\n    }\n'));
};
const list = (name) => SRC.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))[1].match(/'([^']+)'/g).map((k) => k.slice(1, -1));

beforeEach(() => {
	MockWaveformPlayer.instances = [];
	MockWaveformPlayer.failingUrls = new Set();
	MockWaveformPlayer.durations = {};
	MockWaveformPlayer.loadDelays = {};
});

afterEach(async () => {
	document.body.innerHTML = '';
	await settle(); // removed elements tear down after their task
	MockWaveformPlayer.utils = realUtils;
	vi.restoreAllMocks();
});

const live = () => MockWaveformPlayer.instances.filter((p) => !p.destroyed);

describe('attributes', () => {
	it('observes exactly what the two parsers read, minus what the playlist never forwards', () => {
		// Drift guard. The player keys are what the core's parseDataAttributes
		// reads (from the installed core's source), minus the options the
		// playlist strips from data-* (NOT_FORWARDED and the per-track keys,
		// matched on the OPTION each key parses to, so data-src → url counts as
		// per-track); the playlist's own keys are what parseOptions() reads.
		const require = createRequire(import.meta.url);
		const corePkg = dirname(require.resolve('@arraypress/waveform-player/package.json'));
		const utils = readFileSync(resolve(corePkg, 'src/js/utils.ts'), 'utf8');
		const body = utils.slice(utils.indexOf('export function parseDataAttributes'));
		const fn = body.slice(0, body.indexOf('\n}\n'));
		const coreKeys = new Set();
		for (const m of fn.matchAll(/dataset\.([a-zA-Z]+)/g)) coreKeys.add(m[1]);
		for (const m of fn.matchAll(/set(?:Bool|Num|Length|JsonArray)\('([a-zA-Z]+)'(?:, '([a-zA-Z]+)')?/g)) coreKeys.add(m[2] ?? m[1]);
		// Deprecated 1.x aliases: kept in the parser for old markup only.
		for (const deprecated of ['color', 'theme']) coreKeys.delete(deprecated);

		const stripped = new Set([...list('NOT_FORWARDED'), ...list('PER_TRACK_OPTIONS')]);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const forwarded = [...coreKeys].filter((key) => {
			const produced = new Set();
			for (const value of ['true', '1', '[1]']) {
				for (const opt of Object.keys(realUtils.parseDataAttributes({ dataset: { [key]: value } }))) produced.add(opt);
			}
			expect(produced.size, `data-${kebab(key)} parses to no option`).toBeGreaterThan(0);
			return [...produced].some((opt) => !stripped.has(opt));
		});
		warn.mockRestore();

		const parse = method('parseOptions');
		const own = new Set([...parse.matchAll(/ds\.([a-zA-Z]+)/g)].map((m) => m[1]));
		for (const m of parse.matchAll(/flag\('([a-zA-Z]+)'/g)) own.add(m[1]);
		expect(own.size).toBeGreaterThan(10);

		const expected = new Set(both(new Set([...own, ...forwarded])));
		expect([...WaveformPlaylistElement.observedAttributes].sort()).toEqual([...expected].sort());
		// And the never-forwarded ones really are absent.
		for (const name of ['loop', 'show-loop', 'lazy', 'audio-mode', 'src', 'url', 'title', 'duration']) {
			expect(WaveformPlaylistElement.observedAttributes).not.toContain(name);
		}
	});

	it('watches every track/chapter attribute parseTracks() reads', async () => {
		const { TRACK_ATTRIBUTES } = await import('../src/js/element.js');
		const read = [...method('parseTracks').matchAll(/(?:el|ch)\.dataset\.([a-zA-Z]+)/g)].map((m) => 'data-' + kebab(m[1]));
		expect(read.length).toBeGreaterThan(8);
		expect([...new Set([...read, 'data-track', 'data-chapter'])].sort()).toEqual([...TRACK_ATTRIBUTES].sort());
	});

	it('builds the playlist into the element itself (light DOM) on connect', () => {
		const el = render('layout="hero"');
		expect(el).toBeInstanceOf(WaveformPlaylistElement);
		expect(el.playlist).toBeInstanceOf(WaveformPlaylist);
		expect(el.playlist.container).toBe(el);
		expect(el.shadowRoot).toBeNull();
		expect(el.classList.contains('waveform-playlist')).toBe(true);
		expect(el.querySelector('.wp-hero')).not.toBeNull();
		expect(el.playlist.tracks.map((t) => t.title)).toEqual(['A', 'B', 'C']);
		expect(el.playlist.tracks[1].chapters.map((c) => c.label)).toEqual(['B intro', 'B main']);
		expect(el.playlist.tracks[1].durationSeconds).toBe(187);
		expect(live()).toHaveLength(1);
		expect(live()[0].container.parentElement.closest('waveform-playlist')).toBe(el);
	});

	it('takes plain and data-* forms, the plain one winning, for playlist and player options alike', () => {
		const el = render('data-layout="list" layout="grid" data-density="compact" data-height="80" height="40" waveform-style="bars" data-bar-width="3" chapter-marker-color="red"');
		expect(el.playlist.options).toMatchObject({ layout: 'grid', density: 'compact', chapterMarkerColor: 'red' });
		expect(el.playlist.player.options).toMatchObject({ height: 40, waveformStyle: 'bars', barWidth: 3 });
		// The playlist's own layout never reaches the player.
		expect(el.playlist.player.options.layout).toBeUndefined();
	});

	it('parses values exactly as the data-* container does', () => {
		const attrs = { coverSize: '120', showDuration: 'false', continuous: 'true', volume: '0.5', playbackRates: '0.5, 1, 2', waveformColor: '["#111","#222"]', showBpm: 'true' };
		const el = render(Object.entries(attrs).map(([k, v]) => `${kebab(k)}='${v}'`).join(' '));
		const host = document.createElement('div');
		Object.assign(host.dataset, attrs);
		host.innerHTML = TRACKS;
		document.body.appendChild(host);
		const viaData = new WaveformPlaylist(host);
		const { onLoad, onError, onEnd, onNextTrack, onPreviousTrack, onTimeUpdate, onPlay, onPause, ...fromData } = viaData.player.options;
		expect(el.playlist.player.options).toMatchObject(fromData);
		expect(el.playlist.options).toMatchObject({ coverSize: 120, showDuration: false, continuous: true });
		viaData.destroy();
	});

	it('reads a bare boolean attribute as true', () => {
		const el = render('show-volume show-download continuous show-artist="false"');
		expect(el.playlist.player.options).toMatchObject({ showVolume: true, showDownload: true });
		expect(el.playlist.options).toMatchObject({ continuous: true, showArtist: false });
	});

	it('leaves the plain style attribute to CSS (data-style still aliases waveformStyle)', () => {
		const el = render('style="color: red" data-style="dots"');
		expect(el.playlist.player.options.waveformStyle).toBe('dots');
		expect(el.style.color).toBe('red');
	});

	it('never forwards audioMode, loop, showLoop or lazy, in either form', () => {
		const el = render('loop show-loop lazy audio-mode="external" data-loop="true" data-show-loop="true" data-lazy="true" data-audio-mode="external" title="Not a track"');
		const options = el.playlist.player.options;
		for (const key of ['audioMode', 'loop', 'showLoop', 'lazy']) expect(options[key]).toBeUndefined();
		expect(options.title).toBe('A'); // per-track: from the first [data-track]
		expect(el.getAttribute('title')).toBe('Not a track'); // still the element's tooltip
	});
});

describe('events', () => {
	it('bubble from the element', async () => {
		const el = render();
		const heard = [];
		const listener = (e) => heard.push(e.target);
		document.addEventListener('waveformplayer:ready', listener);
		await new Promise((r) => setTimeout(r, 120)); // the mock's ready event, as the core's
		document.removeEventListener('waveformplayer:ready', listener);
		expect(heard).toHaveLength(1);
		expect(el.contains(heard[0])).toBe(true);
	});
});

describe('lifecycle', () => {
	it('a move within the DOM keeps the playlist and its playback', async () => {
		const el = render();
		const { playlist } = el;
		const player = playlist.player;
		player.resizeCanvas = vi.fn();
		player.play();
		const destroy = vi.spyOn(playlist, 'destroy');
		const other = document.createElement('section');
		document.body.appendChild(other);
		other.appendChild(el); // disconnect + connect in one task
		await settle();
		expect(el.playlist).toBe(playlist);
		expect(destroy).not.toHaveBeenCalled();
		expect(player.destroyed).toBeUndefined();
		expect(player.isPlaying).toBe(true);
		expect(player.resizeCanvas).toHaveBeenCalled();
	});

	it('removal destroys the playlist once the task is over; re-adding builds a new one', async () => {
		const el = render();
		const { playlist } = el;
		const player = playlist.player;
		el.remove();
		expect(el.playlist).toBe(playlist); // not yet: it may come back this task
		await settle();
		expect(el.playlist).toBeNull();
		expect(player.destroyed).toBe(true);
		expect(el.querySelector('.wp-player')).toBeNull();
		expect(el.querySelectorAll('[data-track]')).toHaveLength(3); // the markup stays

		document.body.appendChild(el);
		expect(el.playlist).toBeInstanceOf(WaveformPlaylist);
		expect(el.playlist).not.toBe(playlist);
		expect(live()).toHaveLength(1);
	});

	it('waits for DOMContentLoaded while the document is still parsing', () => {
		const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
		const el = document.createElement('waveform-playlist');
		document.body.appendChild(el); // the parser connects it at its start tag…
		el.innerHTML = TRACKS; // …then its children arrive
		expect(el.playlist).toBeNull();
		state.mockReturnValue('interactive');
		document.dispatchEvent(new Event('DOMContentLoaded'));
		expect(el.playlist.tracks).toHaveLength(3);
		expect(live()).toHaveLength(1);
	});

	it('changing option attributes rebuilds once, batched', async () => {
		const el = render('height="40"');
		const first = el.playlist;
		el.setAttribute('height', '90');
		el.setAttribute('data-layout', 'minimal');
		el.setAttribute('show-volume', '');
		await flush();
		expect(el.playlist).not.toBe(first);
		expect(first.player).toBeNull(); // destroyed
		expect(el.playlist.options.layout).toBe('minimal');
		expect(el.playlist.player.options).toMatchObject({ height: 90, showVolume: true });
		expect(live()).toHaveLength(1);
		expect(MockWaveformPlayer.instances).toHaveLength(2);
	});

	it('ignores unobserved attributes, unchanged values and its own generated UI', async () => {
		const el = render('layout="hero" height="40"');
		const first = el.playlist;
		el.setAttribute('class', el.className + ' mine');
		el.setAttribute('height', '40');
		el.setAttribute('aria-label', 'Episodes');
		first.updateHeroTime(12, 60); // the time readout changes every frame
		first.selectTrack(1); // restyles rows, swaps the hero art
		await rebuilt();
		expect(el.playlist).toBe(first);
		expect(el.classList.contains('mine')).toBe(true);
	});
});

describe('track markup changes', () => {
	it('adding, removing or changing a [data-track] rebuilds with the new list', async () => {
		const el = render();
		const first = el.playlist;
		el.insertAdjacentHTML('beforeend', '<div data-track data-url="/d.mp3" data-title="D"></div>');
		await rebuilt();
		expect(el.playlist).not.toBe(first);
		expect(el.playlist.tracks.map((t) => t.title)).toEqual(['A', 'B', 'C', 'D']);

		el.querySelector('[data-url="/a.mp3"]').remove();
		await rebuilt();
		expect(el.playlist.tracks.map((t) => t.title)).toEqual(['B', 'C', 'D']);

		el.querySelector('[data-url="/c.mp3"]').dataset.title = 'C (remastered)';
		await rebuilt();
		expect(el.playlist.tracks.map((t) => t.title)).toEqual(['B', 'C (remastered)', 'D']);

		el.querySelector('[data-url="/d.mp3"]').removeAttribute('data-track');
		await rebuilt();
		expect(el.playlist.tracks.map((t) => t.title)).toEqual(['B', 'C (remastered)']);
		expect(live()).toHaveLength(1);
	});

	it('chapters count as track markup: added, retimed or relabelled', async () => {
		const el = render();
		const track = el.querySelector('[data-url="/b.mp3"]');
		track.insertAdjacentHTML('beforeend', '<span data-chapter data-time="2:00">B outro</span>');
		await rebuilt();
		expect(el.playlist.tracks[1].chapters.map((c) => c.label)).toEqual(['B intro', 'B main', 'B outro']);

		track.querySelector('[data-time="1:00"]').dataset.time = '1:30';
		await rebuilt();
		expect(el.playlist.tracks[1].chapters[1].time).toBe(90);

		track.querySelector('[data-chapter]').firstChild.data = 'Cold open';
		await rebuilt();
		expect(el.playlist.tracks[1].chapters[0].label).toBe('Cold open');
	});

	it('a batch of changes is one rebuild', async () => {
		const el = render();
		el.insertAdjacentHTML('beforeend', '<div data-track data-url="/d.mp3"></div><div data-track data-url="/e.mp3"></div>');
		el.setAttribute('height', '70');
		el.querySelector('[data-track]').dataset.title = 'A!';
		await rebuilt();
		expect(MockWaveformPlayer.instances).toHaveLength(2);
		expect(el.playlist.tracks).toHaveLength(5);
	});

	it('keeps the current track playing, at its position, when it still exists', async () => {
		const el = render();
		el.playlist.selectTrack(1);
		await settle(); // track B loaded and (as a selection does) playing
		const before = el.playlist.player;
		before.audio.currentTime = 42;
		expect(before.isPlaying).toBe(true);

		el.insertAdjacentHTML('afterbegin', '<div data-track data-url="/z.mp3" data-title="Z"></div>');
		await rebuilt();
		await settle();
		const after = el.playlist.player;
		expect(after).not.toBe(before);
		expect(el.playlist.currentTrackIndex).toBe(2); // B moved down one
		expect(after.options.url).toBe('/b.mp3');
		expect(after.calls.seekTo).toEqual([42]);
		expect(after.audio.currentTime).toBe(42);
		expect(after.isPlaying).toBe(true);
	});

	it('a paused track comes back paused, at its position; the first track too', async () => {
		const el = render();
		el.playlist.selectTrack(2);
		await settle();
		el.playlist.player.pause();
		el.playlist.player.audio.currentTime = 30;
		el.setAttribute('height', '120');
		await rebuilt();
		await settle();
		expect(el.playlist.currentTrackIndex).toBe(2);
		expect(el.playlist.player.calls.loadTrack.at(-1).options.autoplay).toBe(false);
		expect(el.playlist.player.calls.seekTo).toEqual([30]);
		expect(el.playlist.player.isPlaying).toBe(false);

		// Track 0, playing: no second load, it seeks once the first load lands.
		el.playlist.selectTrack(0);
		await settle();
		el.playlist.player.audio.currentTime = 10;
		el.setAttribute('height', '130');
		await rebuilt();
		await settle();
		expect(el.playlist.currentTrackIndex).toBe(0);
		expect(el.playlist.player.calls.loadTrack).toHaveLength(0);
		expect(el.playlist.player.calls.seekTo).toEqual([10]);
		expect(el.playlist.player.isPlaying).toBe(true);
	});

	it('a removed current track leaves the new playlist on its first track, paused', async () => {
		const el = render();
		el.playlist.selectTrack(1);
		await settle();
		el.querySelector('[data-url="/b.mp3"]').remove();
		await rebuilt();
		await settle();
		expect(el.playlist.currentTrackIndex).toBe(0);
		expect(el.playlist.player.calls.play).toBe(0);
		expect(el.playlist.player.calls.loadTrack).toHaveLength(0);
	});

	it('a track appended to an empty element builds the playlist', async () => {
		const el = document.createElement('waveform-playlist');
		document.body.appendChild(el);
		expect(el.playlist.tracks).toHaveLength(0);
		expect(el.playlist.player).toBeNull();
		el.innerHTML = '<div data-track data-url="/a.mp3"></div>';
		await rebuilt();
		expect(el.playlist.player).toBeInstanceOf(MockWaveformPlayer);
	});
});

describe('forwarded methods', () => {
	it('play(), pause(), next() and previous() reach the playlist', () => {
		const el = render();
		el.play();
		expect(el.playlist.player.calls.play).toBe(1);
		el.pause();
		expect(el.playlist.player.calls.pause).toBe(1);
		el.next();
		el.next();
		expect(el.playlist.currentTrackIndex).toBe(2);
		el.previous();
		expect(el.playlist.currentTrackIndex).toBe(1);
	});

	it('are harmless while disconnected', () => {
		const el = document.createElement('waveform-playlist');
		expect(el.playlist).toBeNull();
		expect(() => { el.play(); el.pause(); el.next(); el.previous(); }).not.toThrow();
	});
});

describe('never initialised twice', () => {
	it('the [data-waveform-playlist] scan skips the element', () => {
		const el = render('data-waveform-playlist');
		WaveformPlaylist.init();
		expect(live()).toHaveLength(1);
		expect(el.dataset.waveformPlaylistInitialized).toBe('true');
	});

	it('the scan skips an element still waiting for DOMContentLoaded', () => {
		const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
		document.body.innerHTML = `<waveform-playlist data-waveform-playlist>${TRACKS}</waveform-playlist>`;
		WaveformPlaylist.init();
		expect(live()).toHaveLength(0);
		state.mockReturnValue('interactive');
		document.dispatchEvent(new Event('DOMContentLoaded'));
		expect(live()).toHaveLength(1);
	});

	it('an element upgraded after a scan replaces the scan\'s playlist with its own', () => {
		defineWaveformPlaylistElement('late-playlist');
		document.body.innerHTML = '<div id="host"></div>';
		const holder = document.createElement('div');
		holder.innerHTML = `<late-playlist data-waveform-playlist>${TRACKS}</late-playlist>`;
		const late = holder.firstElementChild; // not upgraded: not in the document yet
		const scanned = new WaveformPlaylist(late);
		const scannedPlayer = scanned.player;
		document.getElementById('host').appendChild(late); // connects → its own playlist
		expect(scannedPlayer.destroyed).toBe(true);
		expect(late.playlist).not.toBe(scanned);
		expect(live()).toEqual([late.playlist.player]);
	});
});

describe('defineWaveformPlaylistElement', () => {
	it('is idempotent and returns the registered constructor', () => {
		const ctor = customElements.get('waveform-playlist');
		expect(defineWaveformPlaylistElement()).toBe(ctor);
		expect(new ctor()).toBeInstanceOf(WaveformPlaylistElement);
	});

	it('registers the element under another name', () => {
		const ctor = defineWaveformPlaylistElement('my-playlist');
		expect(customElements.get('my-playlist')).toBe(ctor);
		document.body.innerHTML = `<my-playlist>${TRACKS}</my-playlist>`;
		expect(document.body.firstElementChild.playlist.tracks).toHaveLength(3);
	});
});

describe('stylesheet', () => {
	it('makes the element a block, sized before upgrade, its raw tracks hidden until built', () => {
		const css = readFileSync(resolve(process.cwd(), 'src/css/waveform-playlist.css'), 'utf8');
		expect(css).toMatch(/waveform-playlist\s*\{\s*display:\s*block;/);
		const before = css.match(/waveform-playlist:not\(:defined\)\s*\{([^}]*)\}/);
		expect(before).not.toBeNull();
		expect(before[1]).toMatch(/display:\s*block/);
		expect(before[1]).toMatch(/min-height:\s*var\(--wp-element-height,\s*90px\)/);
		expect(css).toMatch(/waveform-playlist:not\(\.waveform-playlist\) \[data-track\]\s*\{\s*display:\s*none;/);
	});
});
