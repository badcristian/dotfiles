'use strict';

// Unit tests for the PURE helpers in laravelIntelligence.js (no vscode dependency).
// Run: node test/laravelIntelligence.test.js

const assert = require('assert');
const Module = require('module');

// laravelIntelligence.js does `require('vscode')`, which only exists in the extension host.
// The PURE helpers under test never touch it, so a minimal stub lets the module load in plain node.
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
	if (request === 'vscode') {
		return {};
	}
	return originalLoad.call(this, request, parent, isMain);
};
const { _internal: h } = require('../laravelIntelligence');
Module._load = originalLoad;

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

// ---- case conversion ---------------------------------------------------------

test('studlyToSnake', () => {
	assert.strictEqual(h.studlyToSnake('SignatureCount'), 'signature_count');
	assert.strictEqual(h.studlyToSnake('HTTPStatus'), 'http_status');
	assert.strictEqual(h.studlyToSnake('Name'), 'name');
});

test('normalizeType', () => {
	assert.strictEqual(h.normalizeType('int'), 'int');
	assert.strictEqual(h.normalizeType('\\App\\Models\\User'), 'App\\Models\\User');
	assert.strictEqual(h.normalizeType('?int'), '?int');
	assert.strictEqual(h.normalizeType(''), 'mixed');
	assert.strictEqual(h.normalizeType(undefined), 'mixed');
});

// ---- namespace / class parsing ----------------------------------------------

const modelSource = `<?php
namespace App\\Domains\\Documents\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Casts\\Attribute;

class Document extends Model
{
    public function getSignatureCountAttribute(): int
    {
        return $this->resolveSignatureCount();
    }

    public function getStatusLabelAttribute()
    {
        return 'x';
    }

    public function displayName(): Attribute
    {
        return Attribute::make(get: fn () => $this->name);
    }

    // NOT an accessor — must be ignored:
    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }
}
`;

test('getPhpNamespace + getClassName', () => {
	assert.strictEqual(h.getPhpNamespace(modelSource), 'App\\Domains\\Documents\\Models');
	assert.strictEqual(h.getClassName(modelSource), 'Document');
});

// ---- accessor extraction -----------------------------------------------------

test('extractAccessorProperties finds classic (typed + untyped) and new-style', () => {
	const props = h.extractAccessorProperties(modelSource);
	const byName = Object.fromEntries(props.map((p) => [p.name, p.type]));
	assert.strictEqual(byName['signature_count'], 'int', 'typed getter → int');
	assert.strictEqual(byName['status_label'], 'mixed', 'untyped getter → mixed');
	assert.strictEqual(byName['display_name'], 'mixed', 'new-style Attribute → mixed');
	assert.ok(!('document_type' in byName), 'relation method must NOT be treated as accessor');
});

test('extractAccessorProperties returns empty for a non-model', () => {
	assert.deepStrictEqual(h.extractAccessorProperties('<?php class Plain { public function foo() {} }'), []);
});

// ---- stub rendering ----------------------------------------------------------

test('renderModelBlock produces a mergeable partial class with @property-read', () => {
	const block = h.renderModelBlock('App\\Models', 'User', [{ name: 'full_name', type: 'string' }]);
	assert.ok(block.includes('namespace App\\Models {'));
	assert.ok(block.includes('@property-read string $full_name'));
	assert.ok(/class User \{\}/.test(block), 'empty partial class body (merged with real one)');
	assert.ok(!/extends/.test(block), 'no extends clause (per Intelephense merge rules)');
});

test('buildStubContent assembles header + models + Restify overrides, valid open tag', () => {
	const content = h.buildStubContent([
		{ namespace: 'App\\Domains\\Documents\\Models', className: 'Document', properties: [{ name: 'signature_count', type: 'int' }] },
		{ namespace: 'App\\Models', className: 'Empty', properties: [] }, // filtered out
	]);
	assert.ok(content.startsWith('<?php'), 'starts with PHP open tag');
	assert.ok(content.includes('@property-read int $signature_count'));
	assert.ok(!content.includes('class Empty {}'), 'models with no accessors are skipped');
	// Restify overrides present and use : static
	assert.ok(content.includes('function setColumn(string $column): static'));
	assert.ok(content.includes('function canSeeWhen(string $ability'));
	assert.ok(content.includes('trait ProxiesCanSeeToGate'));
});

test('RESTIFY_OVERRIDES covers the known : self downcasters as : static', () => {
	const o = h.RESTIFY_OVERRIDES;
	for (const method of ['setColumn', 'setType', 'setTitle', 'setDescription', 'setAdvanced', 'dd']) {
		assert.ok(new RegExp(`function ${method}\\(.*\\): static`).test(o), `${method} → static`);
	}
	assert.ok(o.includes('function description(string|callable|\\Closure $callback): static'));
	assert.ok(o.includes('function canSeeWhen(string $ability, ?array $arguments = []): static'));
});

console.log(`\n${passed} passing`);
