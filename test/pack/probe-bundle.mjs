/**
 * Evaluate ONE installed playlist bundle in a fresh process and report what it
 * did to the document.
 *
 * A child process per bundle because the thing under test — the scan and the
 * element registration — is a side effect that fires once, at import; a
 * second import in the same process is a cache hit that proves nothing.
 *
 *   node test/pack/probe-bundle.mjs <consumer-dir> <bundle> --esm|--cjs|--iife [--opt-out]
 *
 * The core comes from the consumer's install of the published
 * `@arraypress/waveform-player`: its `/no-autoinit` entry for --esm/--cjs (it
 * sets `window.WaveformPlayer` and scans nothing), its IIFE build in a
 * `<script>` tag for --iife. jsdom comes from this repo.
 *
 * Prints one line of JSON to stdout; diagnostics go to stderr.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [consumer, target, mode = '--esm', ...flags] = process.argv.slice(2);
if (!consumer || !target || !['--esm', '--cjs', '--iife'].includes(mode)) {
	console.error('usage: probe-bundle.mjs <consumer-dir> <bundle> [--esm|--cjs|--iife] [--opt-out]');
	process.exit(2);
}
const optOut = flags.includes('--opt-out');
const targetPath = target.startsWith('file:') ? fileURLToPath(target) : target;
const fromConsumer = createRequire(path.join(consumer, 'package.json'));

// Inline peaks and preload="none": the player builds without fetching or
// decoding anything, so a failure here is the bundle's, not jsdom's media stack.
const TRACKS = '<div data-track data-url="a.mp3" data-title="A" data-waveform="[0.5,0.8]"></div>'
	+ '<div data-track data-url="b.mp3" data-title="B" data-waveform="[0.3,0.6]"><span data-chapter data-time="0:05">Five</span></div>';
const MARKUP = `<div id="scan" data-waveform-playlist data-preload="none">${TRACKS}</div>`
	+ `<waveform-playlist layout="minimal" preload="none">${TRACKS}</waveform-playlist>`;

const isIife = mode === '--iife';
const { JSDOM, VirtualConsole } = await import('jsdom');
const dom = new JSDOM(`<!doctype html><html${optOut ? ' data-waveform-autoinit="false"' : ''}><body>${MARKUP}</body></html>`, {
	pretendToBeVisual: true,
	virtualConsole: new VirtualConsole(), // jsdom's "Not implemented" (canvas, media) is noise here
	runScripts: isIife ? 'dangerously' : 'outside-only',
});
const { window } = dom;

const noop = () => {};
window.HTMLCanvasElement.prototype.getContext = () => ({
	clearRect: noop, fillRect: noop, beginPath: noop, closePath: noop,
	rect: noop, roundRect: noop, clip: noop, save: noop, restore: noop,
	moveTo: noop, lineTo: noop, arc: noop, bezierCurveTo: noop,
	stroke: noop, fill: noop, scale: noop, translate: noop, setTransform: noop,
	createLinearGradient: () => ({ addColorStop: noop }),
	fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
	shadowBlur: 0, shadowColor: '', shadowOffsetY: 0,
});

// Project jsdom's window onto globalThis for the ESM/CJS bundles, skipping
// what jsdom implements by delegating to the global (timers, performance) —
// see @arraypress/waveform-player's test/pack/probe-bundle.mjs for why.
globalThis.window = window;
globalThis.document = window.document;
const SKIP = new Set([
	'window', 'document', 'globalThis', 'console', 'performance',
	'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
	'setImmediate', 'clearImmediate', 'queueMicrotask',
]);
for (const key of Object.getOwnPropertyNames(window)) {
	if (SKIP.has(key)) continue;
	try {
		Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
	} catch {}
}

const readyStateAtLoad = window.document.readyState;
let mod;
if (isIife) {
	// Two <script> tags, core first, as the CDN docs have it.
	const corePkg = path.dirname(fromConsumer.resolve('@arraypress/waveform-player/package.json'));
	for (const file of [path.join(corePkg, 'dist/waveform-player.min.js'), targetPath]) {
		const script = window.document.createElement('script');
		script.textContent = fs.readFileSync(file, 'utf8');
		window.document.head.appendChild(script);
	}
	mod = { default: window.WaveformPlaylist };
} else if (mode === '--cjs') {
	fromConsumer('@arraypress/waveform-player/no-autoinit');
	mod = createRequire(import.meta.url)(targetPath);
} else {
	await import(pathToFileURL(fromConsumer.resolve('@arraypress/waveform-player/no-autoinit')).href);
	mod = await import(pathToFileURL(targetPath).href);
}

// Measure once the document is ready (require() evaluates mid-parse and the
// scan defers to DOMContentLoaded), plus one macrotask for deferred work.
if (window.document.readyState === 'loading') {
	await new Promise((resolve) => window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}
await new Promise((resolve) => setImmediate(resolve));

const Playlist = mod.default ?? mod.WaveformPlaylist ?? mod;
const scan = window.document.getElementById('scan');
const tag = window.document.querySelector('waveform-playlist');
const report = JSON.stringify({
	format: mode.replace('--', ''),
	optOut,
	readyStateAtLoad,
	isClass: typeof Playlist === 'function',
	definer: typeof mod.defineWaveformPlaylistElement === 'function',
	scanned: scan.dataset.waveformPlaylistInitialized === 'true' && scan.querySelector('.waveform-player') !== null,
	elementDefined: !!window.customElements.get('waveform-playlist'),
	element: !!tag.playlist && tag.playlist instanceof Playlist && tag.playlist.tracks.length === 2
		&& tag.playlist.options.layout === 'minimal' && tag.querySelector('.wp-track-btn') !== null,
	global: window.WaveformPlaylist === Playlist,
}) + '\n';

dom.window.close();
process.stdout.write(report, () => process.exit(0));
