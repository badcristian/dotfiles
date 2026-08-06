const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// extension.js exports only activate/deactivate, so the patterns are read out of the shipped
// source the same way phpDocSyntax.test.js reads the shipped grammar. This pins the behaviour that
// two earlier attempts got wrong: `@method static ... query()` on a model reported 943 references
// (every Model::query() in the workspace) and then 0 (file-scoped), when the answer is the number
// of `MetaToken::query(` call sites.
const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');

function extract(label, pattern) {
	const match = source.match(pattern);

	assert.ok(match, `could not find ${label} in extension.js — update this test if it was renamed`);

	return match[1];
}

const tagPattern = new RegExp(extract(
	'PHPDOC_STATIC_METHOD_TAG_PATTERN',
	/^const PHPDOC_STATIC_METHOD_TAG_PATTERN = \/(.*)\/;$/m,
));
const classAfterPattern = new RegExp(extract(
	'getPhpClassNameAfterOffset class pattern',
	/^\tconst classPattern = \/(\\b\(\?:abstract.*)\/;$/m,
));
const prefixTemplate = extract(
	'filterStaticCallReferences prefix pattern',
	/^\tconst prefixPattern = new RegExp\(`(.*)`\);$/m,
);

function prefixPatternFor(className) {
	return new RegExp(prefixTemplate.replace('${className}', className).replace(/\\\\/g, '\\'));
}

test('the static method tag pattern reads the method name, with or without a return type', () => {
	assert.equal(tagPattern.exec(' * @method static MetaTokenQueryBuilder query()')[1], 'query');
	assert.equal(tagPattern.exec(' * @method static query()')[1], 'query');
	assert.equal(tagPattern.exec(' * @method static Builder where(string $column)')[1], 'where');
	assert.equal(tagPattern.exec('/** @method static void flush() */')[1], 'flush');

	// Non-static @method and @property cannot be answered by a `Class::name(` scan, so they must
	// not match and must fall back to file scope.
	assert.equal(tagPattern.test(' * @method Builder scopeActive()'), false);
	assert.equal(tagPattern.test(' * @property-read ?User $user'), false);
	assert.equal(tagPattern.test('    public static function query(): Builder'), false);
});

test('the owning class is the one declared after the docblock, not before it', () => {
	const php = [
		'<?php',
		'',
		'class UnrelatedEarlierClass {}',
		'',
		'/**',
		' * @method static MetaTokenQueryBuilder query()',
		' */',
		'#[UseEloquentBuilder(MetaTokenQueryBuilder::class)]',
		'final class MetaToken extends Model',
		'{',
		'}',
	].join('\n');
	const tagOffset = php.indexOf(' * @method');

	assert.equal(classAfterPattern.exec(php.slice(tagOffset))[1], 'MetaToken');
	// Reading backwards from the tag would have found the wrong class entirely.
	assert.equal(classAfterPattern.exec(php.slice(0, tagOffset))[1], 'UnrelatedEarlierClass');
});

test('the prefix test keeps this class\'s static calls and rejects every other receiver', () => {
	const pattern = prefixPatternFor('MetaToken');
	const keeps = (line) => pattern.test(line.slice(0, line.indexOf('query(')));

	assert.ok(keeps('        $token = MetaToken::query()->first();'));
	assert.ok(keeps('MetaToken::query()'));
	assert.ok(keeps('        return \\App\\Models\\MetaToken::query();'), 'fully qualified call');
	assert.ok(keeps('        $due = MetaToken :: query();'), 'whitespace around ::');

	// The 943-reference problem in one line: these are all Model::query() references too.
	assert.equal(keeps('        $page = FacebookPage::query()->get();'), false);
	assert.equal(keeps('        $rows = $builder->query();'), false);
	assert.equal(keeps('        return self::query();'), false);
	// A longer class name that merely ends with the one we want must not match.
	assert.equal(keeps('        $x = LegacyMetaToken::query();'), false);
});
