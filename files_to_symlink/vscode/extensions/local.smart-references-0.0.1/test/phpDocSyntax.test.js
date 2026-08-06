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
