const test = require('node:test');
const assert = require('node:assert/strict');

const { isPhpDirectCallArgument } = require('../phpCallArguments');

// The call the code action is invoked on, from its name through its closing parenthesis.
const whenCall = `when(
                $tenant?->isForGroupAdmin(),
                fn (self $query): Builder => $query->where('electronic_registers.group_id', $tenant->group_id),
                fn (self $query): Builder => $query->whereIn('electronic_registers.company_id', $actor
                    ->companies()
                    ->select('companies.id')
                ),
            )`;

test('accepts this call arguments and refuses the arguments of the calls inside them', () => {
	for (const argument of ['$tenant?->isForGroupAdmin()', 'fn (self $query): Builder => $query->where(', 'fn (self $query): Builder => $query->whereIn(']) {
		assert.equal(isPhpDirectCallArgument(whenCall, whenCall.indexOf(argument)), true, argument);
	}

	for (const nested of ["'electronic_registers.group_id'", "'electronic_registers.company_id'", "'companies.id'"]) {
		assert.equal(isPhpDirectCallArgument(whenCall, whenCall.indexOf(nested)), false, nested);
	}
});

test('a chained call inside an argument stays nested once its own parentheses close', () => {
	// `->companies()` closes, but the offset is still inside whereIn(, which is inside when(.
	assert.equal(isPhpDirectCallArgument(whenCall, whenCall.indexOf('->select(')), false);
});

test('an arrow function return type sits at argument depth', () => {
	const call = 'when($flag, fn (self $query) => $query->where(1))';

	assert.equal(isPhpDirectCallArgument(call, call.indexOf(') =>') + 1), true);
});

test('the name before the parenthesis and the closing parenthesis are not arguments', () => {
	const call = 'when($flag)';

	assert.equal(isPhpDirectCallArgument(call, 0), false);
	assert.equal(isPhpDirectCallArgument(call, call.length), false);
});

test('a parenthesis inside a string or a comment is text', () => {
	const stringCall = "when('a) b', bar(1))";

	assert.equal(isPhpDirectCallArgument(stringCall, stringCall.indexOf('bar')), true);
	assert.equal(isPhpDirectCallArgument(stringCall, stringCall.indexOf('1')), false);

	const commentCall = 'when(/* ) */ $flag, bar(1))';

	assert.equal(isPhpDirectCallArgument(commentCall, commentCall.indexOf('$flag')), true);
	assert.equal(isPhpDirectCallArgument(commentCall, commentCall.indexOf('bar')), true);

	const lineCommentCall = 'when(\n    $flag, // )\n    bar(1),\n)';

	assert.equal(isPhpDirectCallArgument(lineCommentCall, lineCommentCall.indexOf('bar')), true);
	assert.equal(isPhpDirectCallArgument(lineCommentCall, lineCommentCall.indexOf('1')), false);
});

test('an escaped quote does not end the string it is written in', () => {
	const call = "when('a\\') b', bar(1))";

	assert.equal(isPhpDirectCallArgument(call, call.indexOf('bar')), true);
});
