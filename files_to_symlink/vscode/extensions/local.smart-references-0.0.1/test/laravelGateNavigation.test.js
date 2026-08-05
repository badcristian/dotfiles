const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The gate/policy helpers are pure, but they live in `extension.js`, which requires `vscode` at the
// top and so cannot simply be required here. Evaluating the file in a VM context with every
// dependency stubbed makes its top-level function declarations reachable as context properties,
// which tests the shipping code rather than a copy of it. If these ever move to a module of their
// own, this harness collapses to an ordinary require.
function loadExtension() {
	const stub = new Proxy(function () {}, {
		get: (target, key) => (key === 'then' ? undefined : stub),
		apply: () => stub,
		construct: () => stub,
	});
	const sandbox = {
		require: () => stub,
		module: { exports: {} },
		exports: {},
		console, Buffer, RegExp, Math, JSON, Map, Set, Object, Array,
		String, Number, Boolean, Error, Promise, Symbol,
	};
	sandbox.globalThis = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(
		fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8'),
		sandbox,
		{ filename: 'extension.js' },
	);

	return sandbox;
}

const ext = loadExtension();

// Resolve the gate target for the first occurrence of `'ability'` in `source`.
function resolveTarget(source, ability) {
	const index = source.indexOf(`'${ability}'`);
	const startOffset = index + 1;

	return ext.getLaravelGateTargetModelName(source, {
		startOffset,
		endOffset: startOffset + ability.length,
	});
}

function mayTarget(source, ability, modelClassName) {
	const index = source.indexOf(`'${ability}'`);
	const startOffset = index + 1;

	return ext.gateCallMayTargetPolicyModel(source, startOffset, startOffset + ability.length, modelClassName);
}

test('resolves a gate target given as a class constant, a new expression, or an array', () => {
	assert.equal(resolveTarget("Gate::check('store', Service::class);", 'store'), 'Service');
	assert.equal(resolveTarget("Gate::check('store', new Service);", 'store'), 'Service');
	assert.equal(resolveTarget("Gate::check('update', [new Access, $clientUser]);", 'update'), 'Access');
});

test('resolves a type-hinted variable through the enclosing signature', () => {
	const source = [
		'<?php',
		'public function handle(ActionRequest $request, Company $model): JsonResponse',
		'{',
		"    forbid_unless(Gate::check('canGrantRibeitClassifiedAccess', $model));",
		'}',
	].join('\n');

	assert.equal(resolveTarget(source, 'canGrantRibeitClassifiedAccess'), 'Company');
});

test('resolves property access to the relation rather than to the variable', () => {
	const source = "return Gate::allows('uploadClassified', $document->company);";

	assert.equal(resolveTarget(source, 'uploadClassified'), 'Company');
	assert.equal(resolveTarget("Gate::allows('x', $this->company);", 'x'), 'Company');
	assert.equal(resolveTarget("Gate::allows('x', $a->b->parent_company);", 'x'), 'ParentCompany');
});

test('leaves a trailing method call unresolved rather than reading it as a relation', () => {
	assert.equal(resolveTarget("Gate::check('update', $service->first());", 'update'), undefined);
});

test('only the argument after the ability counts, not a later expression in the window', () => {
	// The old scan searched a 360-character window and picked up whatever came next in the file.
	const source = [
		"abort_unless(Gate::check('show', $company), 403, 'Denied.');",
		'',
		'$other = $unrelated->nomenclator;',
		'$more = new Nomenclator;',
	].join('\n');

	assert.equal(resolveTarget(source, 'show'), undefined, 'no type hint in scope, so unresolved');
	assert.equal(mayTarget(source, 'show', 'Company'), true, 'but $company still confirms the match');
	assert.equal(mayTarget(source, 'show', 'Nomenclator'), false);
});

test('an unresolved target still matches on a variable named for the model', () => {
	const source = "Gate::check('show', $company);";

	assert.equal(mayTarget(source, 'show', 'Company'), true);
});

test('a resolved target excludes every other policy', () => {
	const source = "forbid_unless(Gate::check('store', Service::class));";

	assert.equal(mayTarget(source, 'store', 'Service'), true);
	assert.equal(mayTarget(source, 'store', 'Group'), false);
});

test('a policy with no resolvable model keeps every call', () => {
	const source = "Gate::check('show', $whatever);";

	assert.equal(mayTarget(source, 'show', undefined), true);
});

test('ability ranges select the ability name and skip calls aimed at another model', () => {
	const source = [
		'<?php',
		"Gate::check('update', Service::class);",
		"Gate::check('update', $company);",
	].join('\n');

	const ranges = ext.getLaravelGateAbilityRanges(source, ['update'], 'Company');

	assert.equal(ranges.length, 1);
	assert.equal(source.slice(ranges[0].start, ranges[0].end), 'update');
	assert.equal(source[ranges[0].start - 1], "'");
});

test('gate ability prefixes cover the Gate facade methods and the helper forms', () => {
	for (const call of ['Gate::allows(', 'Gate::denies(', 'Gate::check(', 'forbid_unless(', '$user->can(']) {
		assert.equal(ext.isLaravelGateAbilityPrefix(call), true, call);
	}

	assert.equal(ext.isLaravelGateAbilityPrefix('someOtherCall('), false);
});
