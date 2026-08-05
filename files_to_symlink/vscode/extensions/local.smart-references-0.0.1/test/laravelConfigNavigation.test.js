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

test('resolves a Log::channel name to its key under logging.channels', () => {
	const source = "$log = Log::channel('facebook_sync');";
	const offset = source.indexOf('facebook_sync') + 5;

	assert.equal(getLaravelConfigKeyAtOffset(source, offset), 'logging.channels.facebook_sync');
});

test('resolves a Log::channel name through a root-namespaced or fully qualified facade', () => {
	const rootNamespaced = "$log = \\Log::channel('facebook_sync');";
	const fullyQualified = "$log = \\Illuminate\\Support\\Facades\\Log::channel('facebook_sync');";

	for (const source of [rootNamespaced, fullyQualified]) {
		const offset = source.indexOf('facebook_sync') + 5;

		assert.equal(getLaravelConfigKeyAtOffset(source, offset), 'logging.channels.facebook_sync');
	}
});

test('does not treat another Log call or another class named channel as a config key', () => {
	for (const source of ["Log::info('facebook_sync');", "Audit::channel('facebook_sync');"]) {
		const offset = source.indexOf('facebook_sync') + 5;

		assert.equal(getLaravelConfigKeyAtOffset(source, offset), undefined);
	}
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
