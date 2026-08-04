const test = require('node:test');
const assert = require('node:assert/strict');

const { getLaravelCollectionKeyTypeEdit } = require('../phpDocCollectionFix');

function applyEdit(source, edit) {
	return source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
}

test('adds an integer key type to an imported Laravel support collection', () => {
	const source = `<?php
use Illuminate\\Support\\Collection;

/** @var Collection<ProcessedPage> $mapped */
`;
	const edit = getLaravelCollectionKeyTypeEdit(source, source.indexOf('ProcessedPage'));

	assert.equal(
		applyEdit(source, edit),
		source.replace('Collection<ProcessedPage>', 'Collection<int, ProcessedPage>'),
	);
});

test('supports aliased and fully qualified Laravel collection types', () => {
	const aliased = `<?php
use Illuminate\\Database\\Eloquent\\Collection as ModelCollection;
/** @return ModelCollection<User> */
`;
	const qualified = `<?php
/** @return \\Illuminate\\Support\\Collection<string> */
`;

	const aliasEdit = getLaravelCollectionKeyTypeEdit(aliased, aliased.lastIndexOf('ModelCollection'));
	const qualifiedEdit = getLaravelCollectionKeyTypeEdit(qualified, qualified.indexOf('Support'));

	assert.match(applyEdit(aliased, aliasEdit), /ModelCollection<int, User>/);
	assert.match(applyEdit(qualified, qualifiedEdit), /Collection<int, string>/);
});

test('does not offer a fix when both collection template arguments already exist', () => {
	const source = `<?php
use Illuminate\\Support\\Collection;
/** @var Collection<int, ProcessedPage> $mapped */
`;

	assert.equal(getLaravelCollectionKeyTypeEdit(source, source.indexOf('ProcessedPage')), undefined);
});

test('does not change an unrelated project collection with one template argument', () => {
	const source = `<?php
use App\\Values\\Collection;
/** @var Collection<ProcessedPage> $mapped */
`;

	assert.equal(getLaravelCollectionKeyTypeEdit(source, source.indexOf('ProcessedPage')), undefined);
});

test('keeps commas inside a value array shape while adding the collection key type', () => {
	const source = `<?php
use Illuminate\\Support\\Collection;
/** @return Collection<array{name: string, count: int}> */
`;
	const edit = getLaravelCollectionKeyTypeEdit(source, source.indexOf('array{name'));

	assert.match(applyEdit(source, edit), /Collection<int, array\{name: string, count: int\}>/);
});

test('offers no action when the cursor is outside the matching PHPDoc line', () => {
	const source = `<?php
use Illuminate\\Support\\Collection;
/** @var Collection<ProcessedPage> $mapped */
$mapped = collect();
`;

	assert.equal(getLaravelCollectionKeyTypeEdit(source, source.lastIndexOf('$mapped')), undefined);
});
