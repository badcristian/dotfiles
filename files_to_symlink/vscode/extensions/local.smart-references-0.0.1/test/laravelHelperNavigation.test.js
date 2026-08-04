'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getStubClassDeclaration, isMatchingPhpClassSource } = require('../laravelHelperNavigation');

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
