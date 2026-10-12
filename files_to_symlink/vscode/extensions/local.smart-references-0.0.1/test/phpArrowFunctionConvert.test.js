const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpArrowFunctionConversion: convert } = require('../phpArrowFunctionConvert');

function getPhpArrowFunctionConversion(text, cursor = 0) {
	const result = convert(text, cursor);

	return result && text.slice(0, result.start) + result.replacement + text.slice(result.end);
}

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

test('converts an arrow whose body continues on the next lines, dropping the trailing comma', () => {
	const text = [
		'    ): ?ContextCompartmentDTO {',
		'        return $this->compartments->first(fn (ContextCompartmentDTO $cp): bool => $cp->nomenclatorId === $nomenclator->nomenclatorId',
		'                && $cp->departmentId === $departmentId',
		'                && $cp->normalizedName === $normalizedName,',
		'        );',
		'    }',
	].join('\n');

	assert.equal(getPhpArrowFunctionConversion(text, text.indexOf('fn (')), [
		'    ): ?ContextCompartmentDTO {',
		'        return $this->compartments->first(function (ContextCompartmentDTO $cp) use (',
		'            $nomenclator,',
		'            $departmentId,',
		'            $normalizedName',
		'        ): bool {',
		'            return $cp->nomenclatorId === $nomenclator->nomenclatorId',
		'                && $cp->departmentId === $departmentId',
		'                && $cp->normalizedName === $normalizedName;',
		'        });',
		'    }',
	].join('\n'));
});

test('leaves an arrow with a comment in its body alone', () => {
	const text = '    $f = fn ($a) => $a // why\n        + $b;';

	assert.equal(getPhpArrowFunctionConversion(text, 8), undefined);
});

test('an array element keeps its trailing comma and the closing bracket its line', () => {
	const text = "    ->with([\n        'folders' => fn (Relation $f): Relation => $f->orderBy('id'),\n    ])";

	assert.equal(getPhpArrowFunctionConversion(text, text.indexOf('fn (')), [
		'    ->with([',
		"        'folders' => function (Relation $f): Relation {",
		"            return $f->orderBy('id');",
		'        },',
		'    ])',
	].join('\n'));
});
