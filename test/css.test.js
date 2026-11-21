import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contrast guard for the glyph-over-cover overlays (hero transport, grid item).
 *
 * jsdom does no layout or cascade, so nothing else in the suite exercises the
 * stylesheet. These overlays put a light glyph on top of an ARBITRARY cover
 * image, so their legibility rests entirely on the scrim being dark enough —
 * which is a number, and therefore checkable. It shipped wrong once: the hero
 * overlay rested at rgba(0,0,0,0.22), i.e. 1.69:1 on a light cover, legible
 * only once you hovered it.
 *
 * Worst case is a pure-white cover; every darker cover only improves the ratio.
 *
 * @see ../src/css/waveform-playlist.css
 * @see @arraypress/waveform-player test/css.test.js — same guard, same reason.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/css/waveform-playlist.css'), 'utf8');

/** WCAG 1.4.11 non-text contrast minimum for UI components. */
const MIN_RATIO = 3;

/**
 * Read a CSS custom property's declared value out of the stylesheet.
 *
 * @param {string} name - Custom property name.
 * @returns {string} The declared value.
 */
function cssVar(name) {
	const match = CSS.match(new RegExp(`${name}:\\s*([^;]+);`));
	if (!match) throw new Error(`${name} is not declared in waveform-playlist.css`);
	return match[1].trim();
}

/**
 * Parse `#fff`, `rgb()` or `rgba()` into normalised channels.
 *
 * @param {string} value - A colour string.
 * @returns {{r: number, g: number, b: number, a: number}} Channels in 0..1.
 */
function parseColor(value) {
	if (value.startsWith('#')) {
		const hex = value.slice(1);
		const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
		return {
			r: parseInt(full.slice(0, 2), 16) / 255,
			g: parseInt(full.slice(2, 4), 16) / 255,
			b: parseInt(full.slice(4, 6), 16) / 255,
			a: 1,
		};
	}
	const [r, g, b, a = 1] = value.match(/[\d.]+/g).map(Number);
	return { r: r / 255, g: g / 255, b: b / 255, a };
}

/**
 * Composite a translucent colour over an opaque backdrop, the way the browser
 * does it — in gamma (sRGB) space, not linear.
 *
 * @param {{r: number, g: number, b: number, a: number}} fg - Foreground.
 * @param {{r: number, g: number, b: number}} bg - Backdrop.
 * @returns {{r: number, g: number, b: number}} The composited colour.
 */
function over(fg, bg) {
	return {
		r: fg.r * fg.a + bg.r * (1 - fg.a),
		g: fg.g * fg.a + bg.g * (1 - fg.a),
		b: fg.b * fg.a + bg.b * (1 - fg.a),
	};
}

/**
 * WCAG relative luminance.
 *
 * @param {{r: number, g: number, b: number}} c - An opaque colour, channels 0..1.
 * @returns {number} Relative luminance, 0..1.
 */
function luminance(c) {
	const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG contrast ratio between two opaque colours.
 *
 * @param {{r: number, g: number, b: number}} a - First colour.
 * @param {{r: number, g: number, b: number}} b - Second colour.
 * @returns {number} Contrast ratio, 1..21.
 */
function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Worst-case glyph contrast for a given scrim: white cover, glyph on top.
 *
 * @param {string} scrimValue - The scrim colour as declared.
 * @returns {number} Contrast ratio against the scrimmed cover.
 */
function glyphRatioOverWhiteCover(scrimValue) {
	const WHITE_COVER = { r: 1, g: 1, b: 1 };
	const scrimmed = over(parseColor(scrimValue), WHITE_COVER);
	return contrast(over(parseColor(cssVar('--wp-cover-overlay-color')), scrimmed), scrimmed);
}

describe('cover overlay contrast', () => {
	it('keeps the resting glyph over 3:1 against a white cover', () => {
		// The resting state is what everyone sees — it carries the guarantee,
		// rather than relying on hover to rescue it.
		expect(glyphRatioOverWhiteCover(cssVar('--wp-cover-overlay-scrim')))
			.toBeGreaterThanOrEqual(MIN_RATIO);
	});

	it('keeps the hovered glyph over 3:1, deepening rather than lifting', () => {
		const rest = glyphRatioOverWhiteCover(cssVar('--wp-cover-overlay-scrim'));
		const hover = glyphRatioOverWhiteCover(cssVar('--wp-cover-overlay-scrim-hover'));

		expect(hover).toBeGreaterThanOrEqual(MIN_RATIO);
		expect(hover).toBeGreaterThan(rest);
	});

	it('routes both cover overlays through the vars, not literals', () => {
		// The hero transport and the grid item both sit a glyph on arbitrary
		// artwork; a literal here is how the 0.22 resting scrim got in.
		for (const sel of ['.wp-hero-overlay', '.wp-grid-ov']) {
			const block = CSS.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))[1];
			expect(block).toMatch(/background:\s*var\(--wp-cover-overlay-scrim/);
			expect(block).toMatch(/color:\s*var\(--wp-cover-overlay-color\)/);
		}
	});
});

describe('vendor prefixes', () => {
	it('keeps -webkit-backdrop-filter beside every backdrop-filter', () => {
		// Safari and iOS Safari ship backdrop-filter unprefixed only from 18;
		// the 2.0 floor is 16.4, where only the prefixed form exists (MDN
		// browser-compat-data). Chromium-based checks can't see this, so the
		// prefix is easy to "modernise" away. Drop this guard with the floor.
		const plain = [...CSS.matchAll(/(?<!-webkit-)backdrop-filter:\s*([^;]+);/g)].map((m) => m[1]);
		const prefixed = [...CSS.matchAll(/-webkit-backdrop-filter:\s*([^;]+);/g)].map((m) => m[1]);
		expect(plain.length).toBeGreaterThan(0);
		expect(prefixed).toEqual(plain);
	});
});

describe('compact density on narrow screens', () => {
	// .waveform-playlist and .wp-density-compact sit on the same element with
	// equal specificity, so the phone rule's --wp-thumb-size beat compact's 28px
	// (2.0 fix). Compact's override must come after it inside the media query.
	it('re-applies the compact lead column after the narrow-screen default', () => {
		const media = CSS.match(/@media \(max-width: 480px\) \{([\s\S]*)\}\s*$/)?.[1] ?? '';
		const base = media.search(/\.waveform-playlist\s*\{[^}]*--wp-thumb-size/);
		const compact = media.search(/\.wp-density-compact\s*\{[^}]*--wp-thumb-size:\s*28px/);
		expect(base).toBeGreaterThan(-1);
		expect(compact).toBeGreaterThan(base);
	});
});
