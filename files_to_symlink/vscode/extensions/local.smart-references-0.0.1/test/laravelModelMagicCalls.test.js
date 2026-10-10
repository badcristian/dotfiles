const test = require('node:test');
const assert = require('node:assert/strict');

const { MODEL_MAGIC_METHODS, getModelMagicMethodAtOffset, getStaticCallAtOffset } = require('../laravelModelMagicCalls');

test('reads a magic model method the cursor sits on', () => {
	const source = "$record->increment('bundle_fetches', 1, ['served_at' => now()]);";
	const offset = source.indexOf('increment') + 3;

	assert.equal(getModelMagicMethodAtOffset(source, offset), 'increment');
});

test('covers every name the framework re-dispatches', () => {
	assert.deepEqual(MODEL_MAGIC_METHODS, ['increment', 'decrement', 'incrementQuietly', 'decrementQuietly']);

	for (const method of MODEL_MAGIC_METHODS) {
		const source = `$record->${method}('count');`;

		assert.equal(getModelMagicMethodAtOffset(source, source.indexOf(method) + 2), method);
	}
});

test('reads through a nullsafe call', () => {
	const source = "$record?->decrement('count');";
	const offset = source.indexOf('decrement') + 2;

	assert.equal(getModelMagicMethodAtOffset(source, offset), 'decrement');
});

test('reads the method a chain ends on, not an earlier one', () => {
	const source = "static::query()->updateOrCreate($keys)->increment('page_count');";

	assert.equal(getModelMagicMethodAtOffset(source, source.indexOf('updateOrCreate') + 3), undefined);
	assert.equal(getModelMagicMethodAtOffset(source, source.indexOf('increment') + 3), 'increment');
});

test('does not read a call written inside a string or a comment', () => {
	const inString = "$message = 'call $record->increment(1) instead';";
	const inComment = "// $record->increment('count');";

	assert.equal(getModelMagicMethodAtOffset(inString, inString.indexOf('increment') + 3), undefined);
	assert.equal(getModelMagicMethodAtOffset(inComment, inComment.indexOf('increment') + 3), undefined);
});

test('ignores a method that is merely named like one of them', () => {
	const source = '$counter->incrementBy(3);';

	assert.equal(getModelMagicMethodAtOffset(source, source.indexOf('incrementBy') + 3), undefined);
});

test('ignores a static call, which __call never sees', () => {
	const source = "TlsSyncRecord::increment('count');";

	assert.equal(getModelMagicMethodAtOffset(source, source.indexOf('increment') + 3), undefined);
});

test('returns undefined when the cursor is on the receiver rather than the method', () => {
	const source = "$record->increment('count');";

	assert.equal(getModelMagicMethodAtOffset(source, source.indexOf('$record') + 2), undefined);
});

test('reads the static call the cursor sits on, with its class as written', () => {
	const source = '$inserts[] = DraftDossier::make()->forceFill($row);';

	assert.deepEqual(getStaticCallAtOffset(source, source.indexOf('make') + 2), { method: 'make', className: 'DraftDossier' });
	assert.equal(getStaticCallAtOffset(source, source.indexOf('forceFill') + 2), undefined);
});

test('keeps a qualified class name and self / static as written', () => {
	const qualified = '\\App\\Models\\Box::firstOrCreate($keys);';
	const own = 'return static::whereKey($ids);';

	assert.equal(getStaticCallAtOffset(qualified, qualified.indexOf('firstOrCreate') + 2).className, '\\App\\Models\\Box');
	assert.equal(getStaticCallAtOffset(own, own.indexOf('whereKey') + 2).className, 'static');
});

test('ignores the class name, a constant, a variable receiver and strings', () => {
	const source = "Box::make(); Box::class; $x::make(); 'Box::make()';";

	assert.equal(getStaticCallAtOffset(source, source.indexOf('Box') + 1), undefined);
	assert.equal(getStaticCallAtOffset(source, source.indexOf('class') + 1), undefined);
	assert.equal(getStaticCallAtOffset(source, source.indexOf('make', source.indexOf('$x')) + 1), undefined);
	assert.equal(getStaticCallAtOffset(source, source.lastIndexOf('make') + 1), undefined);
});

test('does not read an arrow call as static, nor a static call as magic', () => {
	const source = "Box::increment('count'); $box->make();";

	assert.equal(getModelMagicMethodAtOffset(source, source.indexOf('increment') + 2), undefined);
	assert.equal(getStaticCallAtOffset(source, source.indexOf('make') + 2), undefined);
});
