'use strict';

// Unit tests for the PURE helpers in i18nKeyNavigation.js (no vscode dependency).
// Run: node test/i18nKeyNavigation.test.js

const assert = require('assert');
const Module = require('module');

// i18nKeyNavigation.js does `require('vscode')`, which only exists in the extension host.
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
	if (request === 'vscode') {
		return {};
	}
	return originalLoad.call(this, request, parent, isMain);
};
const { _internal: h } = require('../i18nKeyNavigation');
Module._load = originalLoad;

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

// Trimmed from ribeit-depozit's resources/js/i18n/locales/ro.json, the file that started this.
// Both `intro` keys are kept, because they are the reason a leaf name cannot be the lookup key.
const LOCALE = `{
  "interface": {
    "intro": "Fiecare control din aplicație, în toate variantele lui.",
    "buttons": "Butoane"
  },
  "lab": {
    "intro": "Variante de panou care nu au ajuns încă pe pagina principală.",
    "edges": "Cazuri limită"
  }
}`;

// Offset of the nth occurrence of `needle`, pointing just inside its opening quote.
function offsetOf(source, needle, occurrence = 1) {
	let index = -1;
	for (let n = 0; n < occurrence; n++) {
		index = source.indexOf(needle, index + 1);
	}
	assert.notStrictEqual(index, -1, `fixture is missing occurrence ${occurrence} of ${needle}`);
	return index + 1;
}

// --------------------------------------------------------------------------------------
// getJsonKeyPathAtOffset
// --------------------------------------------------------------------------------------

// The whole point: the same leaf name under two parents must resolve to two different keys.
test('resolves the dotted path from the JSON ancestry', () => {
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, offsetOf(LOCALE, '"intro"', 1)), 'interface.intro');
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, offsetOf(LOCALE, '"intro"', 2)), 'lab.intro');
});

test('resolves a sibling key after the first one closed', () => {
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, offsetOf(LOCALE, '"edges"')), 'lab.edges');
});

test('resolves a top-level key', () => {
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, offsetOf(LOCALE, '"interface"')), 'interface');
});

// A cursor on the quote itself is still a cursor on the key; requiring the caret to be strictly
// inside would make the feature feel broken at the edges.
test('counts the surrounding quotes as part of the key', () => {
	const open = LOCALE.indexOf('"intro"');
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, open), 'interface.intro');
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, open + '"intro"'.length), 'interface.intro');
});

// Values, punctuation and whitespace must resolve to nothing, because resolving is what gates the
// workspace scan.
test('returns undefined off a key', () => {
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, LOCALE.indexOf('Fiecare')), undefined);
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, 0), undefined);
	assert.strictEqual(h.getJsonKeyPathAtOffset(LOCALE, LOCALE.length - 1), undefined);
});

test('walks deeper nesting', () => {
	const source = '{"a": {"b": {"c": "value"}}}';
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, '"c"')), 'a.b.c');
});

// vue-i18n addresses list entries by index, so an array contributes its position to the path.
test('numbers array elements', () => {
	const source = '{"items": [{"label": "one"}, {"label": "two"}]}';
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, '"label"', 1)), 'items.0.label');
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, '"label"', 2)), 'items.1.label');
});

test('walks past comments in a jsonc document', () => {
	const source = '{\n  // a note\n  "a": {\n    /* another */\n    "b": "value"\n  }\n}';
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, '"b"')), 'a.b');
});

// A colon inside a value must not be mistaken for the one that marks a key.
test('does not treat a value containing a colon as a key', () => {
	const source = '{"a": "not: a key", "b": "value"}';
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, 'not: a key')), undefined);
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, '"b"')), 'b');
});

test('decodes escapes in a key name', () => {
	const source = '{"a\\"b": {"c": "value"}}';
	assert.strictEqual(h.getJsonKeyPathAtOffset(source, offsetOf(source, '"c"')), 'a"b.c');
});

// --------------------------------------------------------------------------------------
// getI18nUsageRanges
// --------------------------------------------------------------------------------------

test('finds every vue-i18n call shape', () => {
	const source = [
		"<p>{{ t('interface.intro') }}</p>",
		'<p>{{ $t("interface.intro") }}</p>',
		'const a = i18n.global.t(`interface.intro`);',
		"const b = te('interface.intro');",
	].join('\n');

	assert.strictEqual(h.getI18nUsageRanges(source, 'interface.intro').length, 4);
});

// The range must point at the key literal so the picker shows the key, not the whole expression.
test('ranges cover the key literal only', () => {
	const source = "const a = t('interface.intro');";
	const [range] = h.getI18nUsageRanges(source, 'interface.intro');

	assert.strictEqual(source.slice(range.start, range.end), 'interface.intro');
});

// Without the closing-quote lookahead, every longer key starting with this one would be a hit.
test('does not match a longer key with the same prefix', () => {
	const source = "t('interface.introduction')";
	assert.deepStrictEqual(h.getI18nUsageRanges(source, 'interface.intro'), []);
});

// `format(` ends in `t(`. Without the boundary guard it would look like a translation call.
test('does not match a call whose name merely ends in t', () => {
	const source = "format('interface.intro'); shout('interface.intro');";
	assert.deepStrictEqual(h.getI18nUsageRanges(source, 'interface.intro'), []);
});

test('returns nothing for an empty key', () => {
	assert.deepStrictEqual(h.getI18nUsageRanges("t('interface.intro')", ''), []);
});


console.log(`\n${passed} passing`);
