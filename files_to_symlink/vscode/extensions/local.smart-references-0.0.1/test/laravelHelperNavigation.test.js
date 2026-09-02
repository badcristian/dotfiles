'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	getStubMethodName,
	getStubTypeDeclaration,
	isMatchingPhpTypeSource,
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

	assert.deepEqual(getStubTypeDeclaration(source, 6), {
		namespace: 'App\\Models',
		typeName: 'FacebookBusinessManager',
	});
});

test('does not treat an accessor property line as a class declaration', () => {
	const source = `namespace App\\Models {
    /**
 * @property-read int $ad_accounts_count
     */
    class FacebookBusinessManager {}
}`;

	assert.equal(getStubTypeDeclaration(source, 2), undefined);
});

test('does not cross into an earlier namespace block', () => {
	const source = `namespace App\\First {
    class FirstModel {}
}

class UnscopedModel {}
`;

	assert.equal(getStubTypeDeclaration(source, 4), undefined);
});

test('matches the real class source without being confused by later comments', () => {
	const source = `<?php
namespace App\\Models;

class FacebookBusinessManager extends Model
{
    // The child table kept the old class to FacebookBusinessManager mapping.
}
`;

	assert.equal(isMatchingPhpTypeSource(source, 'FacebookBusinessManager', 'App\\Models'), true);
	assert.equal(isMatchingPhpTypeSource(source, 'FacebookBusinessManager', 'Other\\Models'), false);
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

test('finds the real namespaced trait represented by a mixin stub line', () => {
	const source = `<?php

namespace App\\Shared\\Traits {
    use Illuminate\\Database\\Eloquent\\Model;

    /** @mixin Model */
    trait HasCreator {}
}
`;

	assert.deepEqual(getStubTypeDeclaration(source, 6), {
		namespace: 'App\\Shared\\Traits',
		typeName: 'HasCreator',
	});
});

test('matches a real trait source, which is what the workspace-symbol fallback reads', () => {
	const source = `<?php

namespace App\\Shared\\Traits;

use Illuminate\\Database\\Eloquent\\Model;

trait HasCreator
{
}
`;

	assert.equal(isMatchingPhpTypeSource(source, 'HasCreator', 'App\\Shared\\Traits'), true);
	assert.equal(isMatchingPhpTypeSource(source, 'HasCreator', 'App\\Models'), false);
});

test('does not read a use statement as the trait declaration', () => {
	const source = `namespace App\\Shared\\Traits {
    use Illuminate\\Database\\Eloquent\\Model;

    trait HasCreator {}
}`;

	assert.equal(getStubTypeDeclaration(source, 1), undefined);
});
