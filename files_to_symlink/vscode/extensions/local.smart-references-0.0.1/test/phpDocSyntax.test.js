const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.join(__dirname, '..');

test('contributes a left-priority PHPDoc grammar injection to PHP', () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
	const contribution = manifest.contributes.grammars.find((grammar) =>
		grammar.scopeName === 'local.smart-references.phpdoc');

	assert.deepEqual(contribution.injectTo, ['source.php', 'text.html.php']);
	assert.equal(contribution.path, './syntaxes/phpdoc.tmLanguage.json');

	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	assert.equal(grammar.injectionSelector, 'L:comment.block.documentation.phpdoc.php');
	assert.ok(grammar.patterns.some((pattern) => pattern.include === '#generic-type'));
	assert.ok(grammar.patterns.some((pattern) => pattern.include === '#phpdoc-variable'));
	assert.ok(grammar.patterns.some((pattern) => pattern.include === '#nullable-marker'));

	// Code spans and inline tags must be offered before the bare-variable rule, or
	// `$e->response` inside backticks is torn into a variable plus grey prose.
	const order = grammar.patterns.map((pattern) => pattern.include);
	assert.ok(order.indexOf('#code-span') < order.indexOf('#phpdoc-variable'));
	assert.ok(order.indexOf('#inline-tag') < order.indexOf('#phpdoc-variable'));
});

test('backtick code spans are one atomic match, never a begin/end region', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	const span = grammar.repository['code-span'].patterns[0];

	assert.equal(span.name, 'markup.inline.raw.phpdoc.php');
	// The regression this pins: written as a begin/end pair, the closing backtick opened a
	// SECOND nested span instead of closing the first, because an L: injection is retried
	// inside its own region and wins over that region's end pattern. Everything after the
	// first backtick then rendered as code. A match consumes the span atomically.
	assert.equal(span.begin, undefined, 'a begin/end span re-enters itself under an L: injection');
	assert.equal(span.end, undefined, 'a begin/end span re-enters itself under an L: injection');
	// No inner patterns either: the span stays one colour instead of splitting on `$`.
	assert.equal(span.patterns, undefined);
	assert.equal(span.captures['1'].name, 'punctuation.definition.raw.phpdoc.php');
	assert.equal(span.captures['3'].name, 'punctuation.definition.raw.phpdoc.php');

	const pattern = new RegExp(span.match);

	// Stops at the first closing backtick; the prose after it is not consumed.
	assert.equal(pattern.exec(' * A `facebookLogin` credential parents entities')[0], '`facebookLogin`');
	// Two spans on one line stay two spans rather than merging through the gap.
	assert.deepEqual('a `one` and `two` end'.match(new RegExp(span.match, 'g')), ['`one`', '`two`']);
	// An unclosed backtick colours nothing, rather than the rest of the line.
	assert.equal(pattern.test(' * an `unclosed span'), false);
});

test('inline tags scope the tag, the reference, and the braces separately', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	const tag = grammar.repository['inline-tag'].patterns[0];
	const begin = new RegExp(tag.begin);

	assert.equal(begin.exec('{@see MetaLimitService}')[2], '@see');
	assert.equal(begin.exec('{@link Foo}')[2], '@link');
	assert.equal(tag.beginCaptures['1'].name, 'punctuation.definition.tag.begin.phpdoc.php');
	assert.equal(tag.beginCaptures['2'].name, 'keyword.other.phpdoc.php');
	assert.equal(tag.endCaptures['1'].name, 'punctuation.definition.tag.end.phpdoc.php');

	const body = grammar.repository['reference-body'].patterns;
	const qualifiedCall = new RegExp(body[0].match).exec('MetaErrorService::isRateLimited()');
	assert.equal(qualifiedCall[1], 'MetaErrorService');
	assert.equal(qualifiedCall[3], 'isRateLimited');
	assert.equal(body[0].captures['3'].name, 'entity.name.function.php');

	// A bare `method()` is a function, a bare `Name` is a class.
	assert.equal(new RegExp(body[2].match).exec('isAlreadyActioned()')[0], 'isAlreadyActioned');
	assert.equal(body[2].name, 'entity.name.function.php');
	assert.equal(new RegExp(body[3].match).exec('MetaErrorKindEnum')[0], 'MetaErrorKindEnum');
	assert.equal(body[3].name, 'entity.name.type.class.php');
});

test('generic and variable patterns cover spaced templates and PHPDoc properties', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	const classGeneric = grammar.repository['generic-type'].patterns
		.find((pattern) => pattern.name === 'meta.type.generic.class.phpdoc.php');
	const variable = grammar.repository['phpdoc-variable'].patterns[0];
	const nullable = grammar.repository['nullable-marker'].patterns[0];

	const genericMatch = new RegExp(classGeneric.begin, 'i').exec('Collection<int, ProcessedPage>');
	assert.equal(genericMatch[2], 'Collection');
	assert.equal(classGeneric.end, '>');
	assert.match('$mapped', new RegExp(variable.match));
	assert.match('?Carbon', new RegExp(nullable.match, 'i'));
	assert.equal(variable.captures['2'].name, 'variable.other.readwrite.php');
	assert.equal(classGeneric.beginCaptures['2'].name, 'entity.name.type.class.php');
});

test('every injected grammar regex compiles', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));

	function visit(value) {
		if (!value || typeof value !== 'object') {
			return;
		}

		for (const [key, child] of Object.entries(value)) {
			if (['begin', 'end', 'match'].includes(key)) {
				assert.doesNotThrow(() => new RegExp(child), `${key}: ${child}`);
			} else {
				visit(child);
			}
		}
	}

	visit(grammar);
});

test('static-analysis tags are phpdoc keywords, and their aliases are class names', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	const tag = grammar.repository['analysis-tag'].patterns[0];
	const alias = grammar.repository['type-alias'].patterns[0];

	// PHP's own grammar hard-codes a phpDocumentor-era tag list, so all of these were prose.
	assert.equal(tag.name, 'keyword.other.phpdoc.php');
	const keyword = new RegExp(tag.match);
	for (const line of ['@phpstan-type', '@phpstan-ignore-next-line', '@psalm-suppress', '@template-covariant', '@mixin', '@readonly']) {
		assert.match(line, keyword);
	}
	// `@uses` is already a built-in tag; `@use\b` must not claim its first four letters.
	assert.equal(keyword.test('@uses'), false);

	const declared = new RegExp(alias.match).exec('@phpstan-type ParsedFolder array{');
	assert.equal(declared[1], '@phpstan-type');
	assert.equal(declared[2], 'ParsedFolder');
	assert.equal(alias.captures['2'].name, 'entity.name.type.class.php');
	// The alias match stops before `array{`, or the shape rule never opens.
	assert.equal(declared[0], '@phpstan-type ParsedFolder');

	const imported = new RegExp(alias.match).exec('@phpstan-import-type ParsedFolder from NomenclatorImportDTO');
	assert.equal(imported[3], 'from');
	assert.equal(imported[4], 'NomenclatorImportDTO');

	// Listed before #analysis-tag, which would otherwise match the tag alone and drop the alias.
	const order = grammar.patterns.map((pattern) => pattern.include);
	assert.ok(order.indexOf('#type-alias') < order.indexOf('#analysis-tag'));
	assert.ok(order.indexOf('#tag-type') < order.indexOf('#analysis-tag'));
});

test('array shapes open on `array{` only, and close on their own brace', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	const shape = grammar.repository['array-shape'].patterns[0];
	const begin = new RegExp(shape.begin);

	assert.equal(begin.exec('array{indicative: string}')[2], 'array');
	assert.equal(begin.exec('?list{int}')[1], '?');
	// No whitespace before the brace: ` * mentioning array {like this}` is prose, not a type.
	assert.equal(begin.test('array {with a space}'), false);
	// An unclosed shape stops at the docblock rather than eating the file.
	assert.match('*/', new RegExp(shape.end));

	const key = grammar.repository['shape-body'].patterns
		.find((pattern) => pattern.captures && pattern.captures['1'].name === 'variable.other.property.php');
	assert.equal(new RegExp(key.match).exec('retention_years: ?int')[1], 'retention_years');
	assert.equal(new RegExp(key.match).exec("'b-c': int")[1], "'b-c'");
	// `a?: int` is an optional key, so the `?` belongs to the key, not to `int`.
	assert.equal(new RegExp(key.match).exec('a?: int')[2], '?');
});

test('no rule reachable from a shape can consume the closing brace', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));

	// The trap this pins: an L: injection is retried inside its own region and wins ties
	// against that region's end pattern. Any rule offered at a `}` therefore swallows the
	// brace that should close the shape, and the shape runs to the end of the docblock.
	const offered = [
		...grammar.patterns.map((pattern) => pattern.include),
		...grammar.repository['shape-body'].patterns.map((pattern) => pattern.include),
	].filter(Boolean);

	for (const include of offered) {
		const entry = grammar.repository[include.slice(1)];
		for (const rule of entry.patterns ?? [entry]) {
			const source = rule.begin ?? rule.match;
			assert.equal(new RegExp(source).test('}'), false, `${include}: ${source}`);
		}
	}
});

test('hyphenated PHPStan scalars are one type, not a prefix plus a class', () => {
	const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'syntaxes/phpdoc.tmLanguage.json'), 'utf8'));
	const scalar = new RegExp(grammar.repository['scalar-type'].match);

	// `\barray\b` matches inside `array-key`, because `-` closes a word: the longer names
	// have to come first in the alternation.
	assert.equal(scalar.exec('array-key')[0], 'array-key');
	assert.equal(scalar.exec('non-empty-string')[0], 'non-empty-string');
	assert.equal(scalar.exec('int')[0], 'int');
	assert.equal(scalar.exec('integer')[0], 'integer');

	// `non-empty-list<Foo>` used to match the class branch at `list<`, leaving `non-empty-` grey.
	const primitive = grammar.repository['generic-type'].patterns[0];
	assert.equal(new RegExp(primitive.begin).exec('non-empty-list<Foo>')[2], 'non-empty-list');
});
