'use strict';

const assert = require('assert');
const { isTopLevelReference } = require('../referenceGrouping');

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

test('keeps imports and exports in the Top level usages group', () => {
	assert.strictEqual(isTopLevelReference('top level', "import { useTimeLog } from '@/modules/common/composables/useTimeLog'"), true);
	assert.strictEqual(isTopLevelReference('top level', 'export { useTimeLog }'), true);
});

test('treats a top-level composable invocation as an ordinary usage', () => {
	assert.strictEqual(isTopLevelReference('top level', '} = useTimeLog()'), false);
});

test('does not override a real enclosing function or method', () => {
	assert.strictEqual(isTopLevelReference('dismiss', 'closeTimeLog()'), false);
});

console.log(`\n${passed} passing`);
