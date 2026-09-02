'use strict';

const assert = require('assert');
const { _internal: h } = require('../returnedComposableNavigation');

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

const COMPOSABLE = `
function closeTimeLog() {
  drawerOpen.value = false
}

export function useTimeLog() {
  return {
    closeTimeLog,
  }
}
`;

const DRAWER = `<template>
  <div @mousedown.self.stop="closeTimeLog">
    <button @click="closeTimeLog" />
  </div>
</template>
<script setup lang="ts">
import { useTimeLog } from '@/modules/common/composables/useTimeLog'

const { closeTimeLog } = useTimeLog()

function dismiss() {
  closeTimeLog()
}
</script>`;

test('recognises a local function returned by an exported composable', () => {
	const offset = COMPOSABLE.indexOf('closeTimeLog()');
	assert.deepStrictEqual(h.findReturnedComposableMember(COMPOSABLE, offset), {
		factoryName: 'useTimeLog',
		memberName: 'closeTimeLog',
	});
});

test('does not treat the return shorthand itself as the declaration', () => {
	const offset = COMPOSABLE.lastIndexOf('closeTimeLog');
	assert.strictEqual(h.findReturnedComposableMember(COMPOSABLE, offset), undefined);
});

test('reads a named composable import and a destructured returned member', () => {
	assert.deepStrictEqual(h.findNamedImportBindings(DRAWER, 'useTimeLog'), [{
		localName: 'useTimeLog',
		specifier: '@/modules/common/composables/useTimeLog',
	}]);
	assert.deepStrictEqual(h.findReturnedMemberBindings(DRAWER, 'useTimeLog', 'closeTimeLog'), ['closeTimeLog']);
});

test('finds the destructure, template handlers, and script calls for a member binding', () => {
	const offsets = h.findBindingUsages(DRAWER, 'closeTimeLog');
	assert.deepStrictEqual(offsets.map((offset) => DRAWER.slice(offset, offset + 'closeTimeLog'.length)), [
		'closeTimeLog',
		'closeTimeLog',
		'closeTimeLog',
		'closeTimeLog',
	]);
	assert.deepStrictEqual(offsets.map((offset) => DRAWER.slice(0, offset).split('\n').length), [2, 3, 9, 12]);
});

console.log(`\n${passed} passing`);
