const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpArrowFunctionConversion } = require('../phpArrowFunctionConvert');

test('converts an arrow, capturing what the body reads in order of appearance', () => {
	const line = '            ->sortByDesc(fn (ContextFolderDTO $f): float => $f->getSimilarity($summaryWords, $compartmentWords) + ($retention->isTermOf($f) ? 100 : 0))';

	assert.equal(getPhpArrowFunctionConversion(line, line.indexOf('fn')), [
		'            ->sortByDesc(function (ContextFolderDTO $f) use (',
		'                $summaryWords,',
		'                $compartmentWords,',
		'                $retention',
		'            ): float {',
		'                return $f->getSimilarity($summaryWords, $compartmentWords) + ($retention->isTermOf($f) ? 100 : 0);',
		'            })',
	].join('\n'));
});

test('no captures -> no use; one capture stays inline; no return type', () => {
	assert.equal(
		getPhpArrowFunctionConversion('    $ids = $boxes->map(fn ($box) => $box->getKey());'),
		'    $ids = $boxes->map(function ($box) {\n        return $box->getKey();\n    });',
	);
	assert.equal(
		getPhpArrowFunctionConversion('    $f = fn (int $x): int => $x * $factor;'),
		'    $f = function (int $x) use ($factor): int {\n        return $x * $factor;\n    };',
	);
});

test('ends the body at an argument comma and keeps what follows', () => {
	assert.equal(
		getPhpArrowFunctionConversion('    array_map(fn ($a) => [$a, $b], $items);'),
		'    array_map(function ($a) use ($b) {\n        return [$a, $b];\n    }, $items);',
	);
});

test('skips $this, statics, single-quoted text and nested arrow parameters', () => {
	const line = "    $f = fn ($a) => $this->x(self::$cache, '$notVar', \"$name\", fn ($inner) => $inner + $a);";

	assert.equal(getPhpArrowFunctionConversion(line).split('\n')[0], '    $f = function ($a) use ($name) {');
});

test('leaves a line without an arrow function alone', () => {
	assert.equal(getPhpArrowFunctionConversion('    $x = function ($a) { return $a; };'), undefined);
	assert.equal(getPhpArrowFunctionConversion('    // fn ($a) => $a'), undefined);
	assert.equal(getPhpArrowFunctionConversion('    $fnName = 1;'), undefined);
});
