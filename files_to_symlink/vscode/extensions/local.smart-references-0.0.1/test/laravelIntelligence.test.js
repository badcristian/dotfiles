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

// ---- macros -----------------------------------------------------------------

test('getPhpImports resolves plain, aliased and grouped use statements', () => {
	const source = [
		'<?php',
		'namespace App\\Providers;',
		'',
		'use Illuminate\\Support\\Facades\\Http;',
		'use Illuminate\\Http\\Client\\PendingRequest as Pending;',
		'use Illuminate\\Support\\{Str, Collection};',
		'use function App\\Support\\slugify;',
		'',
	].join('\n');

	const imports = h.getPhpImports(source);

	assert.strictEqual(imports.get('http'), 'Illuminate\\Support\\Facades\\Http');
	assert.strictEqual(imports.get('pending'), 'Illuminate\\Http\\Client\\PendingRequest');
	assert.strictEqual(imports.get('str'), 'Illuminate\\Support\\Str');
	assert.strictEqual(imports.get('collection'), 'Illuminate\\Support\\Collection');
	assert.strictEqual(imports.get('slugify'), undefined, 'function imports are not class imports');
});

test('resolvePhpType qualifies imported names, leaves builtins, and degrades self/static', () => {
	const imports = new Map([['pendingrequest', 'Illuminate\\Http\\Client\\PendingRequest']]);

	assert.strictEqual(h.resolvePhpType('PendingRequest', imports, 'App\\Providers'), '\\Illuminate\\Http\\Client\\PendingRequest');
	assert.strictEqual(h.resolvePhpType('?PendingRequest', imports, 'App\\Providers'), '?\\Illuminate\\Http\\Client\\PendingRequest');
	assert.strictEqual(h.resolvePhpType('string', imports, 'App\\Providers'), 'string');
	assert.strictEqual(h.resolvePhpType('\\App\\Custom', imports, 'App\\Providers'), '\\App\\Custom');
	// Not imported: PHP would resolve it against the file's own namespace, and so does the stub.
	assert.strictEqual(h.resolvePhpType('Local', imports, 'App\\Providers'), '\\App\\Providers\\Local');
	// `static` names the provider that registered the macro, never what calling it returns.
	assert.strictEqual(h.resolvePhpType('static', imports, 'App\\Providers'), 'mixed');
	assert.strictEqual(h.resolvePhpType(undefined, imports, 'App\\Providers'), 'mixed');
});

test('resolvePhpType resolves each member of a union or intersection', () => {
	const imports = new Map([['response', 'Illuminate\\Http\\Client\\Response']]);

	assert.strictEqual(
		h.resolvePhpType('Response|string|null', imports, 'App'),
		'\\Illuminate\\Http\\Client\\Response|string|null',
	);
});

test('splitPhpParameters splits on top-level commas only', () => {
	assert.deepStrictEqual(
		h.splitPhpParameters("array $columns = ['a', 'b'], string $glue = ', ', int $max = max(1, 2)"),
		["array $columns = ['a', 'b']", "string $glue = ', '", 'int $max = max(1, 2)'],
	);
	assert.deepStrictEqual(h.splitPhpParameters(''), []);
});

test('renderMacroParameters qualifies types, keeps modifiers, and normalises non-literal defaults', () => {
	const imports = new Map([['pendingrequest', 'Illuminate\\Http\\Client\\PendingRequest']]);

	assert.strictEqual(
		h.renderMacroParameters('string $path, PendingRequest $request, int $timeout = 30, ...$rest', imports, 'App\\Providers'),
		'string $path, \\Illuminate\\Http\\Client\\PendingRequest $request, int $timeout = 30, ...$rest',
	);
	// A constant default would be looked up in the STUB's namespace and name nothing there, so only
	// the parameter's optionality survives.
	assert.strictEqual(
		h.renderMacroParameters('string $base = MetaService::GRAPH_BASE', imports, 'App\\Providers'),
		'string $base = null',
	);
});

test('renderMacroParameters falls back to a variadic rather than invent an arity', () => {
	assert.strictEqual(
		h.renderMacroParameters('#[SomeAttribute] readonly nonsense', new Map(), 'App'),
		'mixed ...$arguments',
	);
});

test('extractMacroMethods describes a facade macro by the class it is installed on', () => {
	const source = [
		'<?php',
		'',
		'namespace App\\Providers;',
		'',
		'use Illuminate\\Http\\Client\\PendingRequest;',
		'use Illuminate\\Support\\Facades\\Http;',
		'',
		'class AppServiceProvider',
		'{',
		'    private function registerHttpMacros(): void',
		'    {',
		'        Http::macro(',
		"            'facebookGraph',",
		'            fn (): PendingRequest => Http::baseUrl(MetaService::GRAPH_BASE)->timeout(30),',
		'        );',
		'    }',
		'}',
	].join('\n');

	assert.deepStrictEqual(h.extractMacroMethods(source), [{
		class: 'Illuminate\\Support\\Facades\\Http',
		name: 'facebookGraph',
		returnType: '\\Illuminate\\Http\\Client\\PendingRequest',
		parameters: '',
	}]);
});

test('extractMacroMethods skips a receiver that is not a nameable class', () => {
	const variableReceiver = "<?php\nnamespace App;\n$factory->macro('withRetries', fn () => 1);";
	// A receiver with no namespace of its own would declare a stub in the global namespace, which
	// cannot be merged with anything meaningful.
	const globalReceiver = "<?php\nHttp::macro('vault', fn () => 1);";

	assert.deepStrictEqual(h.extractMacroMethods(variableReceiver), []);
	assert.deepStrictEqual(h.extractMacroMethods(globalReceiver), []);
});

test('extractMacroMethods types an unreadable macro permissively instead of wrongly', () => {
	const source = "<?php\nnamespace App;\nuse Illuminate\\Support\\Facades\\Http;\nHttp::macro('probe', [self::class, 'probe']);";

	assert.deepStrictEqual(h.extractMacroMethods(source), [{
		class: 'Illuminate\\Support\\Facades\\Http',
		name: 'probe',
		returnType: 'mixed',
		parameters: 'mixed ...$arguments',
	}]);
});

test('groupMacroMethods groups by receiver and keeps the first registration of a name', () => {
	const groups = h.groupMacroMethods([
		{ class: 'Illuminate\\Support\\Facades\\Http', name: 'facebookGraph', returnType: '\\A', parameters: '' },
		{ class: 'Illuminate\\Support\\Collection', name: 'pluckDeep', returnType: '\\B', parameters: '' },
		{ class: 'Illuminate\\Support\\Facades\\Http', name: 'facebookGraph', returnType: '\\C', parameters: '' },
	]);

	assert.strictEqual(groups.length, 2);
	assert.deepStrictEqual(
		groups.map((group) => [group.namespace, group.className, group.methods.length]),
		[['Illuminate\\Support\\Facades', 'Http', 1], ['Illuminate\\Support', 'Collection', 1]],
	);
	assert.strictEqual(groups[0].methods[0].returnType, '\\A', 'first registration wins');
});

test('renderMacroBlock declares both call styles, because Macroable answers both', () => {
	const block = h.renderMacroBlock('Illuminate\\Support\\Facades', 'Http', [
		{ name: 'facebookGraph', returnType: '\\Illuminate\\Http\\Client\\PendingRequest', parameters: '' },
	]);

	assert.ok(block.includes('namespace Illuminate\\Support\\Facades {'));
	assert.ok(block.includes(' * @method static \\Illuminate\\Http\\Client\\PendingRequest facebookGraph()'));
	assert.ok(block.includes(' * @method \\Illuminate\\Http\\Client\\PendingRequest facebookGraph()'));
	assert.ok(block.includes('class Http {}'));
});

test('buildStubContent carries macro blocks alongside models and Restify overrides', () => {
	const content = h.buildStubContent(
		[{ namespace: 'App\\Models', className: 'User', properties: [{ name: 'avatar_url', type: 'string' }] }],
		[{ class: 'Illuminate\\Support\\Facades\\Http', name: 'facebookGraph', returnType: '\\Illuminate\\Http\\Client\\PendingRequest', parameters: '' }],
	);

	assert.ok(content.startsWith('<?php'));
	assert.ok(content.includes('@property-read string $avatar_url'));
	assert.ok(content.includes('@method static \\Illuminate\\Http\\Client\\PendingRequest facebookGraph()'));
	assert.ok(content.includes('trait ProxiesCanSeeToGate'));
});

test('buildStubContent is unchanged when a project registers no macros', () => {
	const models = [{ namespace: 'App\\Models', className: 'User', properties: [{ name: 'avatar_url', type: 'string' }] }];

	assert.strictEqual(h.buildStubContent(models, []), h.buildStubContent(models));
	assert.ok(!h.buildStubContent(models).includes('@method'));
});


console.log(`\n${passed} passing`);
