const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpCallArgumentJoin } = require('../phpCallArgumentJoin');

function join(text, cursorMarker) {
	const result = getPhpCallArgumentJoin(text, text.indexOf(cursorMarker));

	return result && { ...result, text: text.slice(0, result.start) + result.replacement + text.slice(result.end) };
}

const draft = [
	'        return new DraftDTO(',
	'            row: $row,',
	'            status: $status,',
	'            company: $resolvedCompany,',
	'            folder: $folder,',
	'            box: $box,',
	'            issues: $issues,',
	'        );',
].join('\n');

test('joins a split call and drops the argument names, from its first line', () => {
	const result = join(draft, 'DraftDTO');

	assert.equal(result.text, '        return new DraftDTO($row, $status, $resolvedCompany, $folder, $box, $issues);');
	assert.deepEqual(result.names, ['row', 'status', 'company', 'folder', 'box', 'issues']);
});

test('works from inside the arguments too', () => {
	assert.equal(join(draft, '$folder').text.split('\n').length, 1);
});

test('strips names on a one-line call, keeps nested calls, statics and ternaries', () => {
	const line = "$i->add(column: Enum::year, typed: trim($v), reason: $a ? 'x: y' : Enum::b);";

	assert.equal(join(line, 'add').text, "$i->add(Enum::year, trim($v), $a ? 'x: y' : Enum::b);");
});

test('joins a positional split call without names', () => {
	const result = join('foo(\n    $a,\n    $b\n);', 'foo');

	assert.equal(result.text, 'foo($a, $b);');
	assert.deepEqual(result.names, [undefined, undefined]);
});

test('innermost call around the cursor wins', () => {
	const text = 'outer(\n    inner(a: 1, b: 2),\n    $c\n);';

	assert.equal(join(text, '1').text, 'outer(\n    inner(1, 2),\n    $c\n);');
});

test('leaves alone a call with a comment, a multi-line argument, or nothing to change', () => {
	assert.equal(join('foo(\n    $a, // why\n    $b\n);', 'foo'), undefined);
	assert.equal(join('foo($a, function () {\n    return 1;\n});', 'foo'), undefined);
	assert.equal(join('foo($a, $b);', 'foo'), undefined);
	assert.equal(join("$s = 'foo(a: 1)';", 'foo'), undefined);
});
