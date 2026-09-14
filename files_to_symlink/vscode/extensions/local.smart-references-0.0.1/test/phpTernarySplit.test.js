const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpTernarySplit } = require('../phpTernarySplit');

test('splits a returned ternary, both branches one level deeper than the statement', () => {
	const split = getPhpTernarySplit(
		'        return $this->has($column) ? filter_var($this->get($column), FILTER_VALIDATE_BOOL) : $this->contract->exists && filter_var($this->contract->getAttribute($column), FILTER_VALIDATE_BOOL);'
	);

	assert.equal(split, [
		'        return $this->has($column)',
		'            ? filter_var($this->get($column), FILTER_VALIDATE_BOOL)',
		'            : $this->contract->exists && filter_var($this->contract->getAttribute($column), FILTER_VALIDATE_BOOL);',
	].join('\n'));
});

test('whatever trails the false branch stays on it', () => {
	const split = getPhpTernarySplit(
		"            'renewal_period_months' => $this->flag('auto_renewal') ? 'A renewing contract needs a renewal period.' : null,"
	);

	assert.equal(split, [
		"            'renewal_period_months' => $this->flag('auto_renewal')",
		"                ? 'A renewing contract needs a renewal period.'",
		'                : null,',
	].join('\n'));
});

test('the other question marks are other operators', () => {
	// ?? and ??= consume both marks: the second would otherwise read as a ternary on the space.
	assert.equal(getPhpTernarySplit('        $name = $request->name ?? $this->fallback();'), undefined);
	assert.equal(getPhpTernarySplit('        $this->cache ??= $this->build();'), undefined);
	assert.equal(getPhpTernarySplit('        $id = $order?->customer?->getKey();'), undefined);
	assert.equal(getPhpTernarySplit('        $label = $title ?: $slug;'), undefined);
});

test('a nullable type is not a ternary, and does not hide the one beside it', () => {
	assert.equal(getPhpTernarySplit('    private ?string $reason = null;'), undefined);
	assert.equal(getPhpTernarySplit('    public function find(?int $id): ?Contract'), undefined);

	assert.equal(getPhpTernarySplit("    private ?string $mode = self::STRICT ? 'strict' : 'loose';"), [
		'    private ?string $mode = self::STRICT',
		"        ? 'strict'",
		"        : 'loose';",
	].join('\n'));
});

test('a colon inside a string or a :: is not the pair', () => {
	assert.equal(getPhpTernarySplit("        $at = $known ? 'time: 10:30' : 'unknown';"), [
		'        $at = $known',
		"            ? 'time: 10:30'",
		"            : 'unknown';",
	].join('\n'));

	assert.equal(getPhpTernarySplit('        $type = $signed ? ContractTypeEnum::signed : ContractTypeEnum::draft;'), [
		'        $type = $signed',
		'            ? ContractTypeEnum::signed',
		'            : ContractTypeEnum::draft;',
	].join('\n'));
});

test('a ternary that is an argument stays where it is', () => {
	assert.equal(getPhpTernarySplit("        $fail($strict ? 'A strict failure.' : 'A loose one.');"), undefined);
	assert.equal(getPhpTernarySplit("        $rules = ['mode' => $strict ? 'a' : 'b'];"), undefined);
});

test('an arrow function keeps its return-type colon out of it', () => {
	assert.equal(getPhpTernarySplit('        $format = fn (bool $long): string => $long ? $this->full() : $this->short();'), [
		'        $format = fn (bool $long): string => $long',
		'            ? $this->full()',
		'            : $this->short();',
	].join('\n'));
});

test('nothing to offer on a comment, or on a ternary already split', () => {
	assert.equal(getPhpTernarySplit('        // $a = $b ? 1 : 2;'), undefined);
	assert.equal(getPhpTernarySplit('         * @return int|null $a ? 1 : 2'), undefined);
	assert.equal(getPhpTernarySplit('        return $this->has($column)'), undefined);
	assert.equal(getPhpTernarySplit('            ? filter_var($this->get($column), FILTER_VALIDATE_BOOL)'), undefined);
});
