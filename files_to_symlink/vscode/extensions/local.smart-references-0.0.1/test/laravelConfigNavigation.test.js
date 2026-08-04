const test = require('node:test');
const assert = require('node:assert/strict');

const {
	findLaravelConfigKeyRange,
	getLaravelConfigKeyAtOffset,
} = require('../laravelConfigNavigation');

test('recognizes a Laravel config key when the cursor is inside the first argument', () => {
	const source = "$raw = config('management.all_backend_vm_names');";
	const offset = source.indexOf('all_backend_vm_names') + 5;

	assert.equal(getLaravelConfigKeyAtOffset(source, offset), 'management.all_backend_vm_names');
});

test('does not treat an unrelated string as a Laravel config key', () => {
	const source = "$message = 'management.all_backend_vm_names';";
	const offset = source.indexOf('all_backend_vm_names') + 5;

	assert.equal(getLaravelConfigKeyAtOffset(source, offset), undefined);
});

test('finds the exact top-level key in a Laravel config file', () => {
	const source = `<?php

return [
	'all_backend_vm_names' => env('ALL_BACKEND_VM_NAMES'),
];
`;

	const range = findLaravelConfigKeyRange(source, ['all_backend_vm_names']);

	assert.deepEqual(source.slice(range.start, range.end), 'all_backend_vm_names');
});

test('follows nested dotted config keys without selecting a duplicate from another branch', () => {
	const source = `<?php

return [
	'first' => [
		'name' => 'wrong',
	],
	'second' => [
		'name' => 'right',
	],
];
`;

	const range = findLaravelConfigKeyRange(source, ['second', 'name']);

	assert.equal(source.slice(range.start, range.end), 'name');
	assert.equal(source.slice(range.end, range.end + 11), "' => 'right");
});

test('returns undefined when a dotted segment is not an array key', () => {
	const source = "<?php return ['mail' => ['host' => env('MAIL_HOST')]];";

	assert.equal(findLaravelConfigKeyRange(source, ['mail', 'missing']), undefined);
});
