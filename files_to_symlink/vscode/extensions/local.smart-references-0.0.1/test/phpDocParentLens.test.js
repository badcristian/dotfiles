const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// extension.js exports only activate/deactivate, so the provider is pinned by reading the shipped
// source, the same way phpDocStaticCalls.test.js reads its patterns. What this guards: Intelephense
// reports `@method int getKey()` as a method symbol on the tag's own line, so the Parent lens
// rendered between two `*` lines in the middle of a model's docblock.
const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');

function extract(label, pattern) {
	const match = source.match(pattern);

	assert.ok(match, `could not find ${label} in extension.js — update this test if it was renamed`);

	return match[1];
}

const tagLinePattern = new RegExp(extract(
	'PHPDOC_TAG_LINE_PATTERN',
	/^const PHPDOC_TAG_LINE_PATTERN = \/(.*)\/;$/m,
));

const parentProviderBody = extract(
	'createPhpParentCodeLensProvider',
	/^function createPhpParentCodeLensProvider\(\) \{\n([\s\S]*?)^\}$/m,
);

test('the docblock tag pattern matches the lines Intelephense reports as symbols', () => {
	const tagLines = [
		' * @method int getKey()',
		' * @method static MetaTokenQueryBuilder query()',
		' * @property string $name',
		' * @property-read int $count',
		' * @property-write string $password',
		'/** @method int getKey() */',
	];

	for (const line of tagLines) {
		assert.ok(tagLinePattern.test(line), line);
	}
});

test('the docblock tag pattern leaves real declarations and other tags alone', () => {
	const otherLines = [
		'    public function getKey(): int',
		' * @param int $id',
		' * @return array<string, string>',
		' * @use HasFactory<UserFactory>',
		' * @methodical',
	];

	for (const line of otherLines) {
		assert.equal(tagLinePattern.test(line), false, line);
	}
});

test('the Parent lens provider skips a symbol reported on a docblock tag line', () => {
	assert.match(parentProviderBody, /PHPDOC_TAG_LINE_PATTERN\.test\(document\.lineAt\(range\.start\.line\)\.text\)/);
	assert.match(parentProviderBody, /range\.start\.line < document\.lineCount/);
});

test('the Parent lens is anchored to the range the guard tested', () => {
	assert.match(parentProviderBody, /new vscode\.CodeLens\(range, \{\n\t*title: 'Parent',/);
});
