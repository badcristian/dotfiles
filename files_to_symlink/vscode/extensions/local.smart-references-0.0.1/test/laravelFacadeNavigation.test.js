const test = require('node:test');
const assert = require('node:assert/strict');

const { getFacadeTargetClassName } = require('../laravelFacadeNavigation');

function facade(body, docblock = '') {
	return `<?php

namespace App\\Domains\\Accesses\\Facades;

use App\\Domains\\Accesses\\Services\\AccessChangeService as AccessChangeServiceRoot;
use Illuminate\\Support\\Facades\\Facade;

${docblock}
class AccessChangeService extends Facade
{
${body}
}
`;
}

test('reads the class getFacadeAccessor returns, fully qualified or imported', () => {
	assert.equal(
		getFacadeTargetClassName(facade(`	protected static function getFacadeAccessor(): string
	{
		return \\App\\Domains\\Accesses\\Services\\AccessChangeService::class;
	}`)),
		'\\App\\Domains\\Accesses\\Services\\AccessChangeService',
	);
	assert.equal(
		getFacadeTargetClassName(facade(`	protected static function getFacadeAccessor() { return AccessChangeServiceRoot::class; }`)),
		'AccessChangeServiceRoot',
	);
});

test('prefers the accessor over the mixin tag, and falls back to the tag for a string accessor', () => {
	const mixin = '/** @mixin \\App\\Domains\\Accesses\\Services\\LegacyService */';

	assert.equal(
		getFacadeTargetClassName(facade('	protected static function getFacadeAccessor(): string { return AccessChangeServiceRoot::class; }', mixin)),
		'AccessChangeServiceRoot',
	);
	assert.equal(
		getFacadeTargetClassName(facade("	protected static function getFacadeAccessor(): string { return 'access.change'; }", mixin)),
		'\\App\\Domains\\Accesses\\Services\\LegacyService',
	);
});

test('answers nothing for a string accessor with no mixin, or a class that is not a facade', () => {
	assert.equal(getFacadeTargetClassName(facade("	protected static function getFacadeAccessor() { return 'cache'; }")), undefined);
	assert.equal(
		getFacadeTargetClassName('<?php class AccessChangeService extends Model { public static function getFacadeAccessor() { return Foo::class; } }'),
		undefined,
	);
	assert.equal(getFacadeTargetClassName('<?php class AccessChangeService {}'), undefined);
});
