const test = require('node:test');
const assert = require('node:assert/strict');

const {
	blankPhpCommentsAndStrings,
	findMacroCallRanges,
	findMacroRegistrationRange,
	getMacroCallNameAtOffset,
	getMacroRegistrationNameAtOffset,
} = require('../laravelMacroNavigation');

test('recognizes a static macro call when the cursor is on the method name', () => {
	const source = "Rule::uniqueCaseInsensitive('companies', 'identification_number')";
	const offset = source.indexOf('uniqueCaseInsensitive') + 5;

	assert.equal(getMacroCallNameAtOffset(source, offset), 'uniqueCaseInsensitive');
});

test('recognizes a macro call at either edge of the method name', () => {
	const source = 'Rule::uniqueCaseInsensitive($table, $column)';
	const start = source.indexOf('uniqueCaseInsensitive');

	assert.equal(getMacroCallNameAtOffset(source, start), 'uniqueCaseInsensitive');
	assert.equal(getMacroCallNameAtOffset(source, start + 'uniqueCaseInsensitive'.length), 'uniqueCaseInsensitive');
});

test('recognizes an instance macro call and one reached through a fully qualified class', () => {
	const instance = '$request->hasAdminPrefix()';
	const qualified = '\\Illuminate\\Validation\\Rule::uniqueCaseInsensitive($table, $column)';

	assert.equal(getMacroCallNameAtOffset(instance, instance.indexOf('hasAdminPrefix') + 3), 'hasAdminPrefix');
	assert.equal(getMacroCallNameAtOffset(qualified, qualified.indexOf('uniqueCaseInsensitive') + 3), 'uniqueCaseInsensitive');
});

test('tolerates whitespace around the call operator and the parenthesis', () => {
	const source = 'Rule ::  uniqueCaseInsensitive ($table, $column)';
	const offset = source.indexOf('uniqueCaseInsensitive') + 5;

	assert.equal(getMacroCallNameAtOffset(source, offset), 'uniqueCaseInsensitive');
});

test('ignores a plain function call, a bare identifier, and a property read', () => {
	const cases = [
		'uniqueCaseInsensitive($table, $column)',
		'$rule = uniqueCaseInsensitive;',
		'$request->prefix;',
	];

	for (const source of cases) {
		const name = source.includes('prefix') ? 'prefix' : 'uniqueCaseInsensitive';

		assert.equal(getMacroCallNameAtOffset(source, source.indexOf(name) + 2), undefined);
	}
});

test('ignores the macro registration method itself', () => {
	const source = "Rule::macro('uniqueCaseInsensitive', function () {});";

	assert.equal(getMacroCallNameAtOffset(source, source.indexOf('macro') + 2), undefined);
});

test('finds the macro registration and selects the name without its quotes', () => {
	const source = [
		'<?php',
		'',
		"Http::macro('vault', fn () => Http::acceptJson());",
		'',
		"Rule::macro('uniqueCaseInsensitive', function (string $table, string $column) {",
		'    return UniqueCaseInsensitiveRule::for($table, $column);',
		'});',
	].join('\n');

	const range = findMacroRegistrationRange(source, 'uniqueCaseInsensitive');

	assert.equal(source.slice(range.start, range.end), 'uniqueCaseInsensitive');
	assert.equal(source[range.start - 1], "'");
});

test('finds a registration written with double quotes, extra whitespace, or a static call', () => {
	const cases = [
		'Rule::macro("uniqueCaseInsensitive", $callback);',
		"Rule::macro(  'uniqueCaseInsensitive'  , $callback);",
		"static::macro('uniqueCaseInsensitive', $callback);",
		"$this->macro('uniqueCaseInsensitive', $callback);",
	];

	for (const source of cases) {
		const range = findMacroRegistrationRange(source, 'uniqueCaseInsensitive');

		assert.equal(source.slice(range.start, range.end), 'uniqueCaseInsensitive');
	}
});

test('finds a registration written with PHP 8 named arguments, on one line or several', () => {
	const inline = "Rule::macro(name: 'uniqueCaseInsensitive', macro: $callback);";
	const wrapped = [
		'Rule::macro(',
		"    name: 'uniqueCaseInsensitive',",
		'    macro: function (string $table, string $column): UniqueCaseInsensitiveRule {',
		'        return UniqueCaseInsensitiveRule::for($table, $column);',
		'    });',
	].join('\n');

	for (const source of [inline, wrapped]) {
		const range = findMacroRegistrationRange(source, 'uniqueCaseInsensitive');

		assert.equal(source.slice(range.start, range.end), 'uniqueCaseInsensitive');
		assert.equal(source[range.start - 1], "'");
		assert.equal(getMacroRegistrationNameAtOffset(source, range.start + 5), 'uniqueCaseInsensitive');
	}
});

test('does not read a name out of the closure when the macro argument comes first', () => {
	const source = "Rule::macro(macro: function () { return 'uniqueCaseInsensitive'; }, name: 'other');";

	assert.equal(findMacroRegistrationRange(source, 'uniqueCaseInsensitive'), undefined);
	assert.equal(getMacroRegistrationNameAtOffset(source, source.indexOf('uniqueCaseInsensitive') + 5), undefined);
});

test('does not mistake a call site or a similarly named macro for the registration', () => {
	const callSite = "Rule::uniqueCaseInsensitive('companies', 'identification_number');";
	const otherMacro = "Rule::macro('uniqueCaseInsensitiveOnJson', $callback);";

	assert.equal(findMacroRegistrationRange(callSite, 'uniqueCaseInsensitive'), undefined);
	assert.equal(findMacroRegistrationRange(otherMacro, 'uniqueCaseInsensitive'), undefined);
});

test('rejects a name that is not a PHP identifier', () => {
	assert.equal(findMacroRegistrationRange("Rule::macro('a.b', $callback);", 'a.b'), undefined);
	assert.equal(findMacroRegistrationRange('Rule::macro($name, $callback);', ''), undefined);
});

test('recognizes a registration when the cursor is inside the macro name literal', () => {
	const source = "Rule::macro('uniqueCaseInsensitive', function () {});";
	const offset = source.indexOf('uniqueCaseInsensitive') + 5;

	assert.equal(getMacroRegistrationNameAtOffset(source, offset), 'uniqueCaseInsensitive');
});

test('does not recognize a registration from the macro keyword, the callback, or a call site', () => {
	const registration = "Rule::macro('uniqueCaseInsensitive', $callback);";
	const callSite = "Rule::uniqueCaseInsensitive('companies', 'name');";

	assert.equal(getMacroRegistrationNameAtOffset(registration, registration.indexOf('macro') + 2), undefined);
	assert.equal(getMacroRegistrationNameAtOffset(registration, registration.indexOf('$callback') + 2), undefined);
	assert.equal(getMacroRegistrationNameAtOffset(callSite, callSite.indexOf('uniqueCaseInsensitive') + 5), undefined);
});

test('picks the registration the cursor is in when a file registers several macros', () => {
	const source = [
		"Http::macro('fs', $callback);",
		"Http::macro('vault', $callback);",
	].join('\n');

	assert.equal(getMacroRegistrationNameAtOffset(source, source.indexOf("'fs'") + 2), 'fs');
	assert.equal(getMacroRegistrationNameAtOffset(source, source.indexOf("'vault'") + 3), 'vault');
});

test('finds every static and instance call site of a macro', () => {
	const source = [
		'<?php',
		"Rule::uniqueCaseInsensitive('companies', 'identification_number'),",
		"    Rule::uniqueCaseInsensitive('companies', 'registration_number')->ignore($id),",
		'$rule->uniqueCaseInsensitive($table, $column);',
	].join('\n');

	const ranges = findMacroCallRanges(source, 'uniqueCaseInsensitive');

	assert.equal(ranges.length, 3);

	for (const range of ranges) {
		assert.equal(source.slice(range.start, range.end), 'uniqueCaseInsensitive');
	}
});

test('does not report a usage example in a comment or docblock as a call site', () => {
	const source = [
		'<?php',
		'',
		"// Rule::uniqueCaseInsensitive('admin_users', 'email')->where(...)->ignore($id)",
		'/**',
		" * Reach for it through Rule::uniqueCaseInsensitive('table', 'column').",
		' */',
		"# Rule::uniqueCaseInsensitive('legacy', 'email');",
		"Rule::macro('uniqueCaseInsensitive', $callback);",
	].join('\n');

	assert.deepEqual(findMacroCallRanges(source, 'uniqueCaseInsensitive'), []);
});

test('does not report a call named inside a string as a call site', () => {
	const source = "$hint = 'Rule::uniqueCaseInsensitive($table, $column)';";

	assert.deepEqual(findMacroCallRanges(source, 'uniqueCaseInsensitive'), []);
});

test('does not mistake a longer method name for the macro', () => {
	const source = 'Rule::uniqueCaseInsensitiveOnJson($table); $rule->notUniqueCaseInsensitive();';

	assert.deepEqual(findMacroCallRanges(source, 'uniqueCaseInsensitive'), []);
});

test('keeps code after a URL on the same line, and blanks nothing outside comments and strings', () => {
	const source = "$url = 'https://example.com'; Rule::uniqueCaseInsensitive($table, $column);";
	const ranges = findMacroCallRanges(source, 'uniqueCaseInsensitive');

	assert.equal(ranges.length, 1);
	assert.equal(source.slice(ranges[0].start, ranges[0].end), 'uniqueCaseInsensitive');
});

test('a heredoc body cannot run away and blank the code that follows it', () => {
	const source = [
		'$sql = <<<SQL',
		"    select * from companies where name = 'x'",
		'SQL;',
		'',
		'Rule::uniqueCaseInsensitive($table, $column);',
	].join('\n');

	const ranges = findMacroCallRanges(source, 'uniqueCaseInsensitive');

	assert.equal(ranges.length, 1);
	assert.equal(source.slice(ranges[0].start, ranges[0].end), 'uniqueCaseInsensitive');
});

test('blanking preserves every offset and newline, and leaves attributes as code', () => {
	const source = [
		'#[Attribute]',
		"$a = 'text'; // trailing",
		'/* block */ $b = 1;',
	].join('\n');

	const blanked = blankPhpCommentsAndStrings(source);

	assert.equal(blanked.length, source.length);
	assert.equal(blanked.split('\n').length, source.split('\n').length);
	assert.ok(blanked.includes('#[Attribute]'));
	assert.ok(blanked.includes('$a = '));
	assert.ok(blanked.includes('$b = 1;'));
	assert.ok(!blanked.includes('trailing'));
	assert.ok(!blanked.includes('block'));
	assert.ok(!blanked.includes('text'));
});
