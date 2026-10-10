const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpConditionSplit } = require('../phpConditionSplit');

test('splits an if at its top-level &&, operator leading each line', () => {
	const line = "        if (preg_match('/^\\d{4}$/', $value) === 1 && (int) $value >= self::FIRST_YEAR && (int) $value <= $context->currentYear + 1) {";

	assert.equal(getPhpConditionSplit(line), [
		'        if (',
		"            preg_match('/^\\d{4}$/', $value) === 1",
		'            && (int) $value >= self::FIRST_YEAR',
		'            && (int) $value <= $context->currentYear + 1',
		'        ) {',
	].join('\n'));
});

test('keeps nested groups and strings whole, mixes && and ||', () => {
	const line = "    } elseif ($a || ($b && $c) || $s === 'x && y') {";

	assert.equal(getPhpConditionSplit(line), [
		'    } elseif (',
		'        $a',
		'        || ($b && $c)',
		"        || $s === 'x && y'",
		'    ) {',
	].join('\n'));
});

test('covers while', () => {
	assert.equal(getPhpConditionSplit('while ($a && $b) {'), 'while (\n    $a\n    && $b\n) {');
});

test('leaves a single condition, an already split if and a plain statement alone', () => {
	assert.equal(getPhpConditionSplit('    if ($a) {'), undefined);
	assert.equal(getPhpConditionSplit('    if (foo($a && $b)) {'), undefined);
	assert.equal(getPhpConditionSplit('    if ('), undefined);
	assert.equal(getPhpConditionSplit('    $ok = $a && $b;'), undefined);
	assert.equal(getPhpConditionSplit('    // if ($a && $b) {'), undefined);
});
