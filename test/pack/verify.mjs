/**
 * End-to-end verification of the published package's entry points, modelled
 * on @arraypress/waveform-player's test/pack/verify.mjs.
 *
 * The vitest suite imports `src/`, so it stays green when the *shipped*
 * artifacts are wrong — a build aimed at the wrong file, a subpath missing
 * from `exports`, the shared chunk left out of the tarball. So this packs the
 * tarball, installs it beside the published `@arraypress/waveform-player@^2.0.0`
 * in a throwaway consumer, and drives it as a consumer would:
 *
 *   1. the tarball carries every file the exports map points at, and the
 *      shared ESM chunk both entries import;
 *   2. `.` and `/no-autoinit` load under plain Node with `import` and
 *      `require()`, resolve to different files, and export the SAME class;
 *   3. the installed bundles behave differently — the root scans and
 *      registers `<waveform-playlist>`, `/no-autoinit` does neither, and
 *      `<html data-waveform-autoinit="false">` turns the root's off;
 *   4. the CDN IIFE builds work from `<script>` tags (core first), the
 *      element upgrading included;
 *   5. the types resolve under `bundler` and `nodenext`.
 *
 * Nothing here reads this repo's `src/`.
 *
 *   npm run test:pack      (builds first)
 *
 * Exit code is 1 if any check fails. Needs the npm registry for the core.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const PKG_ROOT = path.resolve(import.meta.dirname, '..', '..');
const NAME = '@arraypress/waveform-playlist';

const results = [];
const check = (name, ok, detail = '') => {
	results.push({ name, ok, detail });
	console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
};
const run = (cmd, args, cwd) =>
	execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
	console.error(`Node ${process.versions.node}: require() of ES modules needs 22.12+`);
	process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waveform-playlist-pack-'));
const consumer = path.join(tmp, 'consumer');
fs.mkdirSync(consumer);

try {
	// ---- 1. Pack ------------------------------------------------------------
	console.log('\nPacking…');
	// npm <= 11 prints an array; npm 12 an object keyed by package name.
	const packJson = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', tmp], PKG_ROOT));
	const packed = Array.isArray(packJson) ? packJson[0] : (packJson[NAME] ?? Object.values(packJson)[0]);
	const tarball = path.join(tmp, packed.filename);
	const shipped = new Set(packed.files.map((f) => f.path));

	const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
	const targets = new Set(
		Object.values(pkg.exports)
			.flatMap((e) => (typeof e === 'string' ? [e] : Object.values(e)))
			.filter((t) => !t.includes('*'))
			.map((t) => t.replace(/^\.\//, ''))
	);
	targets.add('dist/waveform-playlist-shared.esm.js'); // imported by both ES entries
	targets.add('dist/waveform-playlist.js');
	targets.add('dist/waveform-playlist.min.js');
	console.log(`\nTarball (${packed.filename}, ${packed.files.length} files)`);
	for (const target of targets) check(`ships ${target}`, shipped.has(target), 'absent from the tarball');

	// ---- 2. Install ---------------------------------------------------------
	console.log('\nInstalling into a clean consumer (with the published core)…');
	fs.writeFileSync(
		path.join(consumer, 'package.json'),
		JSON.stringify({ name: 'consumer', version: '1.0.0', type: 'module', private: true }, null, 2)
	);
	run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball, '@arraypress/waveform-player@^2.0.0'], consumer);
	const coreVersion = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules/@arraypress/waveform-player/package.json'), 'utf8')).version;
	console.log(`  core ${coreVersion}`);

	// ---- 3. Resolution under plain Node -------------------------------------
	console.log('\nResolution (plain Node, no bundler)');
	const probe = path.join(consumer, 'probe.mjs');
	fs.writeFileSync(
		probe,
		`import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const out = {};
for (const spec of ['${NAME}', '${NAME}/no-autoinit']) {
	const esm = await import(spec);
	const cjs = require(spec);
	out[spec] = {
		esmDefault: typeof esm.default === 'function',
		esmNamed: typeof esm.WaveformPlaylist === 'function' && esm.default === esm.WaveformPlaylist,
		esmElement: typeof esm.WaveformPlaylistElement === 'function' && typeof esm.defineWaveformPlaylistElement === 'function',
		cjsDefault: typeof (cjs.default ?? cjs) === 'function',
		cjsSame: (cjs.default ?? cjs) === esm.default,
		esmPath: import.meta.resolve(spec),
		cjsPath: require.resolve(spec),
	};
}
const root = await import('${NAME}');
const bare = await import('${NAME}/no-autoinit');
out.sameClass = root.default === bare.default && root.WaveformPlaylistElement === bare.WaveformPlaylistElement;
console.log(JSON.stringify(out));
`
	);
	const resolved = JSON.parse(run('node', [probe], consumer).trim());
	check('the root and /no-autoinit export the same class and element (shared chunk)', resolved.sameClass === true);
	delete resolved.sameClass;
	for (const [spec, r] of Object.entries(resolved)) {
		check(`${spec} — import gives the class, named and default`, r.esmDefault && r.esmNamed);
		check(`${spec} — exports WaveformPlaylistElement and defineWaveformPlaylistElement`, r.esmElement);
		check(`${spec} — require() gives the same class`, r.cjsDefault && r.cjsSame);
	}
	for (const condition of ['esmPath', 'cjsPath']) {
		check(
			`the two subpaths resolve to different files (${condition === 'esmPath' ? 'import' : 'require'})`,
			resolved[NAME][condition] !== resolved[`${NAME}/no-autoinit`][condition],
			'both specifiers resolved to the same bundle'
		);
	}

	// ---- 4. Behaviour of the installed bundles ------------------------------
	console.log('\nBehaviour (installed bundles, under jsdom)');
	const probeBundle = path.join(PKG_ROOT, 'test', 'pack', 'probe-bundle.mjs');
	const evaluate = (target, mode, ...flags) => {
		let raw;
		try {
			raw = run('node', [probeBundle, consumer, target, mode, ...flags], PKG_ROOT).trim();
			return JSON.parse(raw);
		} catch (error) {
			throw new Error(`probe failed for ${target} ${mode}\n  stdout: ${raw ?? '(none)'}\n  stderr: ${error.stderr?.toString().trim() || '(none)'}`);
		}
	};

	for (const [label, spec, alive] of [['default entry', NAME, true], ['/no-autoinit', `${NAME}/no-autoinit`, false]]) {
		for (const condition of ['esmPath', 'cjsPath']) {
			const mode = condition === 'cjsPath' ? '--cjs' : '--esm';
			const r = evaluate(resolved[spec][condition], mode);
			check(`${label} (${r.format}) ${alive ? 'scans' : 'does NOT scan'} [data-waveform-playlist] on import`, r.scanned === alive, JSON.stringify(r));
			check(
				`${label} (${r.format}) ${alive ? 'registers <waveform-playlist>, which builds' : 'does NOT register <waveform-playlist>'}`,
				alive ? r.elementDefined && r.element : !r.elementDefined && !r.element,
				JSON.stringify(r)
			);
			check(`${label} (${r.format}) exports the class and the definer, sets window.WaveformPlaylist`, r.isClass && r.definer && r.global);
		}
	}
	const optedOut = evaluate(resolved[NAME].esmPath, '--esm', '--opt-out');
	check(
		'default entry on <html data-waveform-autoinit="false"> neither scans nor registers',
		!optedOut.scanned && !optedOut.elementDefined && !optedOut.element,
		JSON.stringify(optedOut)
	);

	// ---- 5. CDN builds ------------------------------------------------------
	const installed = path.join(consumer, 'node_modules', '@arraypress', 'waveform-playlist');
	for (const [label, file] of [['CDN build', 'dist/waveform-playlist.js'], ['CDN build (minified)', 'dist/waveform-playlist.min.js']]) {
		const r = evaluate(path.join(installed, file), '--iife');
		check(`${label} initialises [data-waveform-playlist] from a <script> tag`, r.scanned && r.global, JSON.stringify(r));
		check(`${label} registers <waveform-playlist>, which upgrades and builds`, r.elementDefined && r.element, JSON.stringify(r));
		const off = evaluate(path.join(installed, file), '--iife', '--opt-out');
		check(`${label} honours <html data-waveform-autoinit="false">`, !off.scanned && !off.elementDefined && off.global, JSON.stringify(off));
	}

	// ---- 6. Types -----------------------------------------------------------
	console.log('\nTypes (tsc, bundler and nodenext)');
	fs.writeFileSync(
		path.join(consumer, 'probe.ts'),
		`import Playlist, { WaveformPlaylist, WaveformPlaylistElement, type WaveformPlaylistOptions, type WaveformPlaylistTrack } from '${NAME}';
import NoInit, { WaveformPlaylist as NoInitNamed, defineWaveformPlaylistElement } from '${NAME}/no-autoinit';

// The subpath exposes the same class and option surface.
const a: typeof Playlist = NoInit;
const b: typeof WaveformPlaylist = NoInitNamed;
const opts: WaveformPlaylistOptions = { layout: 'hero', continuous: true, showVolume: true };
export const built = new NoInit(document.createElement('div'), opts);
export const tracks: WaveformPlaylistTrack[] = built.getTracks();
built.nextTrack();
export { a, b };

// The element: typed by tag name, definable from /no-autoinit.
const tag = document.createElement('waveform-playlist');
export const instance: WaveformPlaylist | null = tag.playlist;
export const isElement: boolean = tag instanceof WaveformPlaylistElement;
export const played: Promise<void> | undefined = tag.play();
tag.pause(); tag.next(); tag.previous();
export const found: WaveformPlaylistElement | null = document.querySelector('waveform-playlist');
export const defined: CustomElementConstructor | undefined = defineWaveformPlaylistElement('my-playlist');
`
	);
	const tsc = path.join(path.dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc');
	for (const moduleResolution of ['bundler', 'nodenext']) {
		const tsconfig = {
			compilerOptions: {
				strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM'], types: [],
				module: moduleResolution === 'nodenext' ? 'nodenext' : 'esnext', moduleResolution,
			},
			files: ['probe.ts'],
		};
		fs.writeFileSync(path.join(consumer, `tsconfig.${moduleResolution}.json`), JSON.stringify(tsconfig, null, 2));
		let ok = true;
		let detail = '';
		try {
			run('node', [tsc, '-p', `tsconfig.${moduleResolution}.json`], consumer);
		} catch (error) {
			ok = false;
			detail = (error.stdout?.toString() || error.stderr?.toString() || '').trim().split('\n').slice(0, 8).join('\n      ');
		}
		check(`both entry points typecheck under moduleResolution: ${moduleResolution}`, ok, detail);
	}
} finally {
	fs.rmSync(tmp, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? '✗' : '✓'} ${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
