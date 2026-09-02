const test = require('node:test');
const assert = require('node:assert/strict');

const { MODEL_MAGIC_METHODS, getModelMagicMethodAtOffset } = require('../laravelModelMagicCalls');

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
