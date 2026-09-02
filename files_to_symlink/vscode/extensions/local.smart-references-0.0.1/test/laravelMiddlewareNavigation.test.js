const test = require('node:test');
const assert = require('node:assert/strict');

const {
	findMiddlewareAliasClass,
	findPhpClassDeclarationRange,
	getMiddlewareAliasAtOffset,
} = require('../laravelMiddlewareNavigation');

function aliasAt(source, needle) {
	return getMiddlewareAliasAtOffset(source, source.indexOf(needle) + 2);
}

test('reads an alias from a single-argument middleware call', () => {
	for (const source of [
		"Route::middleware('frontend-vm-secret')->prefix('tls');",
		"Route::get('ping', $handler)->middleware('frontend-vm-secret');",
	]) {
		assert.equal(aliasAt(source, 'frontend-vm-secret'), 'frontend-vm-secret');
	}
});

test('reads an alias from any position in a middleware array', () => {
	const source = "Route::post('backup', $c)->middleware(['backup-secret', 'auth-admin', 'signed']);";

	assert.equal(aliasAt(source, 'backup-secret'), 'backup-secret');
	assert.equal(aliasAt(source, 'auth-admin'), 'auth-admin');
	assert.equal(aliasAt(source, 'signed'), 'signed');
});

test('drops the arguments a parameterised alias carries', () => {
	assert.equal(aliasAt("->middleware('throttle:60,1');", 'throttle'), 'throttle');
	assert.equal(aliasAt("->middleware(['auth:sanctum']);", 'auth:sanctum'), 'auth');
});

test('reads an alias out of withoutMiddleware too', () => {
	assert.equal(aliasAt("->withoutMiddleware('auth-admin');", 'auth-admin'), 'auth-admin');
});

test('leaves strings that are not middleware arguments alone', () => {
	const unrelated = [
		"Route::post('backup-status', $controller);",
		"$name = 'frontend-vm-secret';",
		"$this->log_middleware('frontend-vm-secret');",
		"Route::middleware($aliases)->name('frontend-vm-secret');",
	];

	for (const source of unrelated) {
		assert.equal(aliasAt(source, source.includes('frontend') ? 'frontend-vm-secret' : 'backup-status'), undefined, source);
	}
});

test('finds the class an alias maps to in a Kernel alias map', () => {
	const source = `<?php

    protected $middlewareAliases = [
        'backup-secret' => ValidateBackupSecret::class,
        'frontend-vm-secret' => ValidateFrontendVmSecret::class,
    ];
`;

	const registration = findMiddlewareAliasClass(source, 'frontend-vm-secret');

	assert.equal(registration.className, 'ValidateFrontendVmSecret');
	assert.equal(source.slice(registration.start, registration.end), 'ValidateFrontendVmSecret');
});

test('finds the class through a bootstrap/app.php alias call, fully qualified', () => {
	const source = `<?php

        $middleware->alias([
            'auth' => App\\Http\\Middleware\\Authenticate::class,
            'tenant.has' => App\\Http\\Middleware\\HasTenantMiddleware::class,
        ]);
`;

	const registration = findMiddlewareAliasClass(source, 'tenant.has');

	assert.equal(registration.className, 'App\\Http\\Middleware\\HasTenantMiddleware');
	assert.equal(source.slice(registration.start, registration.end), 'App\\Http\\Middleware\\HasTenantMiddleware');
});

test("reads the framework's own defaultAliases(), root-namespaced, and skips its ternary", () => {
	const source = `<?php

    protected function defaultAliases()
    {
        return [
            'signed' => \\Illuminate\\Routing\\Middleware\\ValidateSignature::class,
            'throttle' => $this->throttleWithRedis
                ? \\Illuminate\\Routing\\Middleware\\ThrottleRequestsWithRedis::class
                : \\Illuminate\\Routing\\Middleware\\ThrottleRequests::class,
        ];
    }
`;

	const signed = findMiddlewareAliasClass(source, 'signed');

	assert.equal(signed.className, '\\Illuminate\\Routing\\Middleware\\ValidateSignature');
	assert.equal(source.slice(signed.start, signed.end), '\\Illuminate\\Routing\\Middleware\\ValidateSignature');

	// A conditional value names two classes; jumping to either would be a guess.
	assert.equal(findMiddlewareAliasClass(source, 'throttle'), undefined);
});

test('returns undefined for an alias with no registration and for a non-class value', () => {
	const source = "<?php return ['auth' => Authenticate::class, 'label' => 'auth'];";

	assert.equal(findMiddlewareAliasClass(source, 'missing'), undefined);
	assert.equal(findMiddlewareAliasClass(source, 'label'), undefined);
});

test('locates the class declaration in the middleware file', () => {
	const source = "<?php\n\nnamespace App\\Http\\Middleware;\n\nfinal class ValidateFrontendVmSecret\n{\n}\n";

	const range = findPhpClassDeclarationRange(source, 'ValidateFrontendVmSecret');

	assert.equal(source.slice(range.start, range.end), 'ValidateFrontendVmSecret');
	assert.equal(findPhpClassDeclarationRange(source, 'Missing'), undefined);
});
