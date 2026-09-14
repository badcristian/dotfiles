const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpArraySplit } = require('../phpArraySplit');

test('splits a returned array literal, one element per line, trailing comma included', () => {
	const split = getPhpArraySplit(
		"        return ['company_id' => 'integer', 'start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d'];"
	);

	assert.equal(split, [
		'        return [',
		"            'company_id' => 'integer',",
		"            'start_date' => 'date:Y-m-d',",
		"            'end_date' => 'date:Y-m-d',",
		'        ];',
	].join('\n'));
});

test('only the commas of this array are separators', () => {
	// A nested array, a call's arguments and a closure body all keep theirs.
	const split = getPhpArraySplit(
		"    $rules = ['name' => ['required', 'string'], 'age' => Rule::in(1, 2), 'fn' => fn($a, $b) => $a];"
	);

	assert.equal(split, [
		'    $rules = [',
		"        'name' => ['required', 'string'],",
		"        'age' => Rule::in(1, 2),",
		"        'fn' => fn($a, $b) => $a,",
		'    ];',
	].join('\n'));
});

test('a comma inside a string is text, not a separator', () => {
	const split = getPhpArraySplit("$x = ['a' => 'one, two', 'b' => \"three, four\"];");

	assert.equal(split.split('\n').length, 4);
	assert.equal(split.split('\n')[1], "    'a' => 'one, two',");
});

test('keeps whatever follows the closing bracket on the closing line', () => {
	const split = getPhpArraySplit('    $x = [1, 2] + $y;');

	assert.equal(split.split('\n').at(-1), '    ] + $y;');
});

test('a subscript is not an array literal', () => {
	// `$a[...]` reads what is in front of it; the split has to find the `[` that opens a value.
	assert.equal(getPhpArraySplit("        $name = $row['first'] . $row['last'];"), undefined);
	assert.equal(getPhpArraySplit("        $data['casts'] = ['a' => 1, 'b' => 2];"), [
		"        $data['casts'] = [",
		"            'a' => 1,",
		"            'b' => 2,",
		'        ];',
	].join('\n'));
});

test('leaves alone what has nothing to split', () => {
	// Empty, already split, a comment, and a PHP 8 attribute — `#[Foo, Bar]` is a list of
	// attributes, not an array.
	assert.equal(getPhpArraySplit('        return [];'), undefined);
	assert.equal(getPhpArraySplit('        return ['), undefined);
	assert.equal(getPhpArraySplit("        // return ['a' => 1, 'b' => 2];"), undefined);
	assert.equal(getPhpArraySplit('    #[Route, Middleware]'), undefined);
	assert.equal(getPhpArraySplit('        $this->run();'), undefined);
});

test('a single element still splits, and a trailing comma does not become a blank line', () => {
	assert.equal(getPhpArraySplit("        return ['company_id' => 'integer'];"), [
		'        return [',
		"            'company_id' => 'integer',",
		'        ];',
	].join('\n'));
	assert.equal(getPhpArraySplit('        return [1, 2, ];'), [
		'        return [',
		'            1,',
		'            2,',
		'        ];',
	].join('\n'));
});
