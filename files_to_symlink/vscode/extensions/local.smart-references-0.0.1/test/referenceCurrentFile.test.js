'use strict';

const assert = require('assert');
const { isCurrentFileReference } = require('../referenceCurrentFile');

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

test('marks only a reference whose URI is the origin file', () => {
	assert.strictEqual(isCurrentFileReference('file:///repo/src/TimeLogDrawer.vue', 'file:///repo/src/TimeLogDrawer.vue'), true);
	assert.strictEqual(isCurrentFileReference('file:///repo/src/TimeLogButton.vue', 'file:///repo/src/TimeLogDrawer.vue'), false);
});

test('declines when the picker has no originating editor', () => {
	assert.strictEqual(isCurrentFileReference('file:///repo/src/TimeLogDrawer.vue', undefined), false);
});

console.log(`\n${passed} passing`);
