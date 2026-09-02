const test = require('node:test');
const assert = require('node:assert/strict');

const {
	findLaravelConfigKeyRange,
	findLaravelConfigKeyReadRanges,
	getLaravelConfigKeyAtOffset,
	getLaravelConfigKeyPathAtOffset,
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

test('recognizes a key read through the Config facade, typed readers included', () => {
	const calls = [
		"Config::integer('auth.passwords.users.expire', 60)",
		"Config::string('app.url')",
		"Config::array('horizon.authorized_emails')",
		"Config::boolean('app.debug')",
		"Config::collection('app.providers')",
		"Config::get('auth.passwords.users.expire')",
		"Config::has('auth.passwords.users.expire')",
		"Config::set('auth.passwords.users.expire', 15)",
	];

	for (const call of calls) {
		const source = `$value = ${call};`;
		const key = source.slice(source.indexOf("'") + 1, source.indexOf("'", source.indexOf("'") + 1));
		const offset = source.indexOf(key) + 5;

		assert.equal(getLaravelConfigKeyAtOffset(source, offset), key);
	}
});

test('recognizes a Config facade key through a root-namespaced or fully qualified facade', () => {
	const rootNamespaced = "$url = \\Config::string('app.url');";
	const fullyQualified = "$url = \\Illuminate\\Support\\Facades\\Config::string('app.url');";

	for (const source of [rootNamespaced, fullyQualified]) {
		const offset = source.indexOf('app.url') + 2;

		assert.equal(getLaravelConfigKeyAtOffset(source, offset), 'app.url');
	}
});

test('does not treat a Config::getMany element or a lookalike class as a config key', () => {
	for (const source of ["Config::getMany(['app.url']);", "AppConfig::string('app.url');"]) {
		const offset = source.indexOf('app.url') + 2;

		assert.equal(getLaravelConfigKeyAtOffset(source, offset), undefined);
	}
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

const TLS_CONFIG = `<?php

return [
	'common_name' => env('TLS_CSR_COMMON_NAME', '*.ribeitcloud.ro'),

	/** certSIGN allows 2048/3072/4096. */
	'key_bits' => (int) env('TLS_CSR_KEY_BITS', 2048),
];
`;

const LOGGING_CONFIG = `<?php

return [
	'default' => env('LOG_CHANNEL', 'stack'),

	'channels' => [
		'stack' => [
			'driver' => 'stack',
		],

		'single' => [
			'driver' => 'single',
		],
	],
];
`;

test('reads the key path of a top-level config key under the cursor', () => {
	const offset = TLS_CONFIG.indexOf('key_bits') + 3;

	assert.deepEqual(getLaravelConfigKeyPathAtOffset(TLS_CONFIG, offset), ['key_bits']);
});

test('reads a nested config key path one segment per enclosing array', () => {
	const offset = LOGGING_CONFIG.indexOf("'single' => [") + 3;

	assert.deepEqual(getLaravelConfigKeyPathAtOffset(LOGGING_CONFIG, offset), ['channels', 'single']);
});

test('does not read a config key path from a value literal', () => {
	const offset = TLS_CONFIG.indexOf('TLS_CSR_KEY_BITS') + 3;

	assert.equal(getLaravelConfigKeyPathAtOffset(TLS_CONFIG, offset), undefined);
});

test('finds every call site that reads a config key', () => {
	const source = [
		"$bits = (int) config('tls.key_bits');",
		"$same = Config::integer('tls.key_bits');",
		"$other = config('tls.common_name');",
		"$text = 'tls.key_bits';",
	].join('\n');

	const ranges = findLaravelConfigKeyReadRanges(source, 'tls.key_bits');

	assert.equal(ranges.length, 2);

	for (const range of ranges) {
		assert.equal(source.slice(range.start, range.end), 'tls.key_bits');
	}
});

test('finds a logging channel read as a reference to the channel key', () => {
	const source = "\\Log::channel('single')->info('hi');";

	const ranges = findLaravelConfigKeyReadRanges(source, 'logging.channels.single');

	assert.equal(ranges.length, 1);
	assert.equal(source.slice(ranges[0].start, ranges[0].end), 'single');
});
