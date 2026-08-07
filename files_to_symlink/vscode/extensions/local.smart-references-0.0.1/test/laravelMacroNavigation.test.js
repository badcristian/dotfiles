const test = require('node:test');
const assert = require('node:assert/strict');

const {
	blankPhpCommentsAndStrings,
	findMacroCallRanges,
	findMacroRegistrations,
	getMacroCallNameAtOffset,
	getMacroRegistrationNameAtOffset,
} = require('../laravelMacroNavigation');

// The registration scan reports every macro in a file; these cases care about one name's offsets.
function findRegistrationRange(source, name) {
	const registration = findMacroRegistrations(source).find((entry) => entry.name === name);

	return registration && { start: registration.start, end: registration.end };
}

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

	const range = findRegistrationRange(source, 'uniqueCaseInsensitive');

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
		const range = findRegistrationRange(source, 'uniqueCaseInsensitive');

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
		const range = findRegistrationRange(source, 'uniqueCaseInsensitive');

		assert.equal(source.slice(range.start, range.end), 'uniqueCaseInsensitive');
		assert.equal(source[range.start - 1], "'");
		assert.equal(getMacroRegistrationNameAtOffset(source, range.start + 5), 'uniqueCaseInsensitive');
	}
});

test('does not read a name out of the closure when the macro argument comes first', () => {
	const source = "Rule::macro(macro: function () { return 'uniqueCaseInsensitive'; }, name: 'other');";

	assert.equal(findRegistrationRange(source, 'uniqueCaseInsensitive'), undefined);
	assert.equal(getMacroRegistrationNameAtOffset(source, source.indexOf('uniqueCaseInsensitive') + 5), undefined);
});

test('does not mistake a call site or a similarly named macro for the registration', () => {
	const callSite = "Rule::uniqueCaseInsensitive('companies', 'identification_number');";
	const otherMacro = "Rule::macro('uniqueCaseInsensitiveOnJson', $callback);";

	assert.equal(findRegistrationRange(callSite, 'uniqueCaseInsensitive'), undefined);
	assert.equal(findRegistrationRange(otherMacro, 'uniqueCaseInsensitive'), undefined);
});

test('rejects a name that is not a PHP identifier', () => {
	assert.equal(findRegistrationRange("Rule::macro('a.b', $callback);", 'a.b'), undefined);
	assert.equal(findRegistrationRange('Rule::macro($name, $callback);', ''), undefined);
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

// ---- whole-file registration scan (the index and the IDE-helper stub both read this) ----------

test('reads every registration in a file, with its receiver, parameters and return type', () => {
	const source = [
		'<?php',
		'',
		'namespace App\\Providers;',
		'',
		'use Illuminate\\Support\\Facades\\Http;',
		'',
		'class AppServiceProvider',
		'{',
		'    private function registerHttpMacros(): void',
		'    {',
		'        Http::macro(',
		"            'facebookGraph',",
		'            fn (): PendingRequest => Http::baseUrl(MetaService::GRAPH_BASE)->timeout(30),',
		'        );',
		'',
		"        Http::macro('instagramGraph', function (string $path, int $timeout = 30): PendingRequest {",
		'            return Http::baseUrl($path)->timeout($timeout);',
		'        });',
		'    }',
		'}',
	].join('\n');

	const registrations = findMacroRegistrations(source);

	assert.equal(registrations.length, 2);
	assert.equal(source.slice(registrations[0].start, registrations[0].end), 'facebookGraph');
	assert.deepEqual(
		registrations.map((registration) => ({
			name: registration.name,
			receiver: registration.receiver,
			isStatic: registration.isStatic,
			parameters: registration.parameters,
			returnType: registration.returnType,
		})),
		[
			{
				name: 'facebookGraph',
				receiver: 'Http',
				isStatic: true,
				parameters: '',
				returnType: 'PendingRequest',
			},
			{
				name: 'instagramGraph',
				receiver: 'Http',
				isStatic: true,
				parameters: 'string $path, int $timeout = 30',
				returnType: 'PendingRequest',
			},
		],
	);
});

test('a variable receiver is reported without a class name', () => {
	const source = "$factory->macro('withRetries', fn (): self => $this);";
	const [registration] = findMacroRegistrations(source);

	assert.equal(registration.name, 'withRetries');
	assert.equal(registration.isStatic, false);
	assert.equal(registration.receiver, undefined);
});

test('a namespaced or chained receiver is distinguished from a call result', () => {
	assert.equal(
		findMacroRegistrations("\\Illuminate\\Support\\Str::macro('slugify', fn () => 1);")[0].receiver,
		'\\Illuminate\\Support\\Str',
	);
	assert.equal(
		findMacroRegistrations("Http::factory()->macro('slugify', fn () => 1);")[0].receiver,
		undefined,
	);
});

test('parameter defaults keep their own parentheses, brackets and commas', () => {
	const source = "Rule::macro('unique', fn (array $columns = ['a', 'b'], string $glue = ', ') => 1);";

	assert.equal(
		findMacroRegistrations(source)[0].parameters,
		"array $columns = ['a', 'b'], string $glue = ', '",
	);
});

test('a macro bound to something other than a closure has no signature to report', () => {
	const [registration] = findMacroRegistrations("Http::macro('probe', [self::class, 'probe']);");

	assert.equal(registration.name, 'probe');
	assert.equal(registration.parameters, undefined);
	assert.equal(registration.returnType, undefined);
});

test('a named-argument registration is read like a positional one', () => {
	const source = "Rule::macro(name: 'uniqueCaseInsensitive', macro: fn (): Unique => new Unique());";
	const [registration] = findMacroRegistrations(source);

	assert.equal(registration.name, 'uniqueCaseInsensitive');
	assert.equal(registration.receiver, 'Rule');
	assert.equal(registration.returnType, 'Unique');
});

test('a union or nullable return type survives intact', () => {
	assert.equal(
		findMacroRegistrations("Http::macro('maybe', fn (): ?PendingRequest => null);")[0].returnType,
		'?PendingRequest',
	);
	assert.equal(
		findMacroRegistrations("Http::macro('either', fn (): PendingRequest|Response => null);")[0].returnType,
		'PendingRequest|Response',
	);
});
