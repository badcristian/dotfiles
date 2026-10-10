const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpCallArgumentSplit } = require('../phpCallArgumentSplit');

test('splits named arguments, closing back at the statement indent', () => {
	const line = '        $issues->addIssue(column: DossierColumnEnum::retentionPeriod, type: ImportIssueEnum::invalid, typed: $value, reason: ImportIssueReasonEnum::notATerm);';

	assert.equal(getPhpCallArgumentSplit(line, 20), [
		'        $issues->addIssue(',
		'            column: DossierColumnEnum::retentionPeriod,',
		'            type: ImportIssueEnum::invalid,',
		'            typed: $value,',
		'            reason: ImportIssueReasonEnum::notATerm',
		'        );',
	].join('\n'));
});

test('keeps nested calls, arrays and strings whole', () => {
	const line = "    $x = sprintf('%s, %s', implode(', ', [$a, $b]), trim($c));";

	assert.equal(getPhpCallArgumentSplit(line, 0), [
		'    $x = sprintf(',
		"        '%s, %s',",
		"        implode(', ', [$a, $b]),",
		'        trim($c)',
		'    );',
	].join('\n'));
});

test('splits the innermost call around the cursor', () => {
	const line = '    return new Box(Str::of($a, $b), $c);';

	assert.equal(getPhpCallArgumentSplit(line, line.indexOf('$a')), [
		'    return new Box(Str::of(',
		'        $a,',
		'        $b',
		'    ), $c);',
	].join('\n'));
	assert.equal(getPhpCallArgumentSplit(line, line.indexOf('$c')).split('\n')[0], '    return new Box(');
});

test('drops a trailing comma and covers a static call', () => {
	assert.equal(getPhpCallArgumentSplit('Box::create($a, $b,);'), 'Box::create(\n    $a,\n    $b\n);');
});

test('leaves single-argument calls, constructs, declarations and already-split calls alone', () => {
	assert.equal(getPhpCallArgumentSplit('    foo($a);'), undefined);
	assert.equal(getPhpCallArgumentSplit('    if ($a, $b) {'), undefined);
	assert.equal(getPhpCallArgumentSplit('    public function make(int $a, int $b): void'), undefined);
	assert.equal(getPhpCallArgumentSplit('    $f = fn ($a, $b) => $a;'), undefined);
	assert.equal(getPhpCallArgumentSplit('    $issues->addIssue('), undefined);
	assert.equal(getPhpCallArgumentSplit('    // foo($a, $b);'), undefined);
	assert.equal(getPhpCallArgumentSplit("    $s = 'foo($a, $b)';"), undefined);
});
