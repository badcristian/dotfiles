'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	getStubClassDeclaration,
	getStubMethodName,
	isMatchingPhpClassSource,
} = require('../laravelHelperNavigation');

test('finds the real namespaced class represented by a manual helper stub line', () => {
	const source = `<?php

namespace App\\Models {
    /**
 * @property-read int $ad_accounts_count
     */
    class FacebookBusinessManager {}
}
`;

	assert.deepEqual(getStubClassDeclaration(source, 6), {
		namespace: 'App\\Models',
		className: 'FacebookBusinessManager',
	});
});

test('does not treat an accessor property line as a class declaration', () => {
	const source = `namespace App\\Models {
    /**
 * @property-read int $ad_accounts_count
     */
    class FacebookBusinessManager {}
}`;

	assert.equal(getStubClassDeclaration(source, 2), undefined);
});

test('does not cross into an earlier namespace block', () => {
	const source = `namespace App\\First {
    class FirstModel {}
}

class UnscopedModel {}
`;

	assert.equal(getStubClassDeclaration(source, 4), undefined);
});

test('matches the real class source without being confused by later comments', () => {
	const source = `<?php
namespace App\\Models;

class FacebookBusinessManager extends Model
{
    // The child table kept the old class to FacebookBusinessManager mapping.
}
`;

	assert.equal(isMatchingPhpClassSource(source, 'FacebookBusinessManager', 'App\\Models'), true);
	assert.equal(isMatchingPhpClassSource(source, 'FacebookBusinessManager', 'Other\\Models'), false);
});

test('reads the macro name out of a generated @method tag', () => {
	const source = `<?php

namespace Illuminate\\Support\\Facades {
    /**
 * @method static \\Illuminate\\Http\\Client\\PendingRequest facebookGraph()
 * @method \\Illuminate\\Http\\Client\\PendingRequest facebookGraph()
 * @method static \\Illuminate\\Http\\Client\\PendingRequest probe(mixed ...$arguments)
     */
    class Http {}
}
`;

	assert.equal(getStubMethodName(source, 4), 'facebookGraph');
	assert.equal(getStubMethodName(source, 5), 'facebookGraph');
	assert.equal(getStubMethodName(source, 6), 'probe');
	// Intelephense sometimes points at the docblock opener instead of the tag.
	assert.equal(getStubMethodName(source, 3), 'facebookGraph');
});

test('does not read a method name off an accessor property or a class line', () => {
	const source = `namespace App\\Models {
    /**
 * @property-read int $ad_accounts_count
     */
    class FacebookBusinessManager {}
}
`;

	assert.equal(getStubMethodName(source, 2), undefined);
	assert.equal(getStubMethodName(source, 4), undefined);
});
