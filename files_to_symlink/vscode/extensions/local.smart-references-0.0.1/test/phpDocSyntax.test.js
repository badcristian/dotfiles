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
