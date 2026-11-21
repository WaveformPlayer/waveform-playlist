import { describe, it, expect, afterEach, vi } from 'vitest';
import { MockWaveformPlayer } from './setup.js';

/**
 * Which entry point registers `<waveform-playlist>`. The registry can't be
 * cleared, so each case checks `customElements.define` calls on a fresh module
 * evaluation (vi.resetModules) instead of the registry's final state; the
 * first import in this file runs against an empty registry.
 */

const TRACKS = '<div data-track data-url="/a.mp3"></div><div data-track data-url="/b.mp3"></div>';

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

const fresh = async (specifier) => {
	vi.resetModules();
	return import(specifier);
};

describe('element registration', () => {
	it('/no-autoinit neither registers nor scans, but exports the definer', async () => {
		document.body.innerHTML = `<div data-waveform-playlist>${TRACKS}</div>`;
		MockWaveformPlayer.instances = [];
		const define = vi.spyOn(customElements, 'define');
		const mod = await fresh('../src/js/entry.js');
		expect(define).not.toHaveBeenCalled();
		expect(customElements.get('waveform-playlist')).toBeUndefined();
		expect(MockWaveformPlayer.instances).toHaveLength(0);
		expect(mod.defineWaveformPlaylistElement).toBeTypeOf('function');
		expect(mod.WaveformPlaylistElement).toBeTypeOf('function');
		expect(mod.default).toBe(mod.WaveformPlaylist);
		expect(window.WaveformPlaylist).toBe(mod.WaveformPlaylist);
	});

	it('the default entry registers <waveform-playlist>, which then initialises server-rendered markup', async () => {
		MockWaveformPlayer.instances = [];
		document.body.innerHTML = `<waveform-playlist layout="minimal">${TRACKS}</waveform-playlist>`;
		const define = vi.spyOn(customElements, 'define');
		const mod = await fresh('../src/js/index.js');
		expect(define).toHaveBeenCalledTimes(1);
		expect(define.mock.calls[0][0]).toBe('waveform-playlist');
		const el = document.querySelector('waveform-playlist');
		expect(el.playlist).toBeInstanceOf(mod.WaveformPlaylist);
		expect(el.playlist.options.layout).toBe('minimal');
		expect(MockWaveformPlayer.instances).toHaveLength(1);
	});

	it('the default entry leaves an existing definition alone', async () => {
		expect(customElements.get('waveform-playlist')).toBeTypeOf('function');
		const define = vi.spyOn(customElements, 'define');
		await fresh('../src/js/index.js');
		expect(define).not.toHaveBeenCalled();
	});

	it('the [data-waveform-playlist] scan does not double-initialise a <waveform-playlist data-waveform-playlist>', async () => {
		MockWaveformPlayer.instances = [];
		document.body.innerHTML = `<waveform-playlist data-waveform-playlist>${TRACKS}</waveform-playlist>`;
		// The registered element class came from an earlier module copy, as
		// with two bundled copies of the library on one page: the claim flag
		// still stops this copy's scan building a second playlist over it.
		await fresh('../src/js/index.js');
		expect(MockWaveformPlayer.instances).toHaveLength(1);
		expect(document.querySelector('waveform-playlist').playlist).toBeTruthy();
	});

	it('waits for the core before registering, as the scan does', async () => {
		vi.useFakeTimers();
		const core = window.WaveformPlayer;
		delete window.WaveformPlayer;
		try {
			const get = vi.spyOn(customElements, 'get');
			await fresh('../src/js/index.js');
			expect(get).not.toHaveBeenCalledWith('waveform-playlist');
			window.WaveformPlayer = core;
			vi.advanceTimersByTime(100);
			expect(get).toHaveBeenCalledWith('waveform-playlist');
		} finally {
			window.WaveformPlayer = core;
			vi.useRealTimers();
		}
	});
});
