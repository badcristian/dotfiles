const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldInsertJsonComma } = require('../jsonSmartEnter');

function marked(source) {
	const offset = source.indexOf('|');

	assert.notEqual(offset, -1, 'Fixture must contain a cursor marker');

	return {
		text: source.slice(0, offset) + source.slice(offset + 1),
		offset,
	};
}

function shouldInsert(source) {
	const { text, offset } = marked(source);

	return shouldInsertJsonComma(text, offset);
}

test('adds a comma after a completed JSON property at the logical end of a line', () => {
	assert.equal(shouldInsert(`{
  "scripts": {
    "build:start": "npm run build && npm run start:prod"|
  }
}`), true);
});

test('does not duplicate an existing comma', () => {
	assert.equal(shouldInsert(`{
  "name": "example",|
  "private": true
}`), false);
});

test('does not add a comma in the middle of a line or after an opening token', () => {
	assert.equal(shouldInsert('{"name"|: "example"}'), false);
	assert.equal(shouldInsert(`{
  "scripts": {|
  }
}`), false);
});

test('adds commas to array items and nested closing containers', () => {
	assert.equal(shouldInsert(`[
  "first"|
]`), true);
	assert.equal(shouldInsert(`{
  "nested": {
    "enabled": true
  }|
}`), true);
});

test('does not add a comma after the root closing token', () => {
	assert.equal(shouldInsert(`{
  "name": "example"
}|`), false);
});

test('does not alter JSONC comment lines or values followed by comments', () => {
	assert.equal(shouldInsert(`{
  // explanation|
  "enabled": true
}`), false);
	assert.equal(shouldInsert(`{
  "enabled": true // explanation|
}`), false);
});

test('ignores braces and comment-like text inside strings', () => {
	assert.equal(shouldInsert(`{
  "url": "https://example.test/{id}"|
}`), true);
});
