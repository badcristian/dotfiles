'use strict';

const assert = require('assert');
const path = require('path');
const {
	findImportSpecifierAtOffset,
	resolveImportSpecifierCandidates,
	getPathAliases,
} = require('../importSpecifierNavigation');

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

const SOURCE = `import { useTimeLog } from '@/modules/common/composables/useTimeLog'
import type { Frame } from './types'
export { helper } from '../helpers/helper'
import { ref } from 'vue'
`;

test('recognises a cursor inside a static import specifier', () => {
	const start = SOURCE.indexOf('@/modules/common/composables/useTimeLog');
	assert.deepStrictEqual(
		findImportSpecifierAtOffset(SOURCE, start + 12),
		{
			specifier: '@/modules/common/composables/useTimeLog',
			start,
			end: start + '@/modules/common/composables/useTimeLog'.length,
		},
	);
});

test('recognises type imports and re-exports but not imported bindings', () => {
	const typeStart = SOURCE.indexOf('./types');
	const exportStart = SOURCE.indexOf('../helpers/helper');
	const bindingOffset = SOURCE.indexOf('useTimeLog');

	assert.strictEqual(findImportSpecifierAtOffset(SOURCE, bindingOffset), undefined);
	assert.strictEqual(findImportSpecifierAtOffset(SOURCE, typeStart + 2).specifier, './types');
	assert.strictEqual(findImportSpecifierAtOffset(SOURCE, exportStart + 2).specifier, '../helpers/helper');
});

test('resolves alias and relative candidates while refusing package imports', () => {
	const srcRoot = '/repo/src';
	const fileDir = '/repo/src/modules/common/composables';

	assert.deepStrictEqual(
		resolveImportSpecifierCandidates('@/modules/common/composables/useTimeLog', fileDir, srcRoot).slice(0, 3),
		[
			path.join(srcRoot, 'modules/common/composables/useTimeLog.ts'),
			path.join(srcRoot, 'modules/common/composables/useTimeLog.tsx'),
			path.join(srcRoot, 'modules/common/composables/useTimeLog.js'),
		],
	);
	assert.strictEqual(resolveImportSpecifierCandidates('./types', fileDir, srcRoot)[0], path.join(fileDir, 'types.ts'));
	assert.deepStrictEqual(resolveImportSpecifierCandidates('vue', fileDir, srcRoot), []);
});


// Taken verbatim from ribeit-depozit's resources/js/App.vue, the line that reported this.
const DYNAMIC_SOURCE = `import LoadingBar from '@/layout/LoadingBar.vue';

const AppShell = defineAsyncComponent(() => import('@/layout/AppShell.vue'));
const Lazy = () => import(\`@/layout/Lazy.vue\`);
const other = importSomething('@/layout/NotAnImport.vue');
`;

test('recognises a cursor inside a dynamic import specifier', () => {
	const start = DYNAMIC_SOURCE.indexOf('@/layout/AppShell.vue');

	assert.deepStrictEqual(
		findImportSpecifierAtOffset(DYNAMIC_SOURCE, start + 4),
		{
			specifier: '@/layout/AppShell.vue',
			start,
			end: start + '@/layout/AppShell.vue'.length,
		},
	);
});

test('recognises a backtick specifier in a dynamic import', () => {
	const start = DYNAMIC_SOURCE.indexOf('@/layout/Lazy.vue');

	assert.strictEqual(findImportSpecifierAtOffset(DYNAMIC_SOURCE, start + 2).specifier, '@/layout/Lazy.vue');
});

// `importSomething(` contains `import` and a parenthesis, and must not be read as a dynamic import.
test('ignores a call whose name merely starts with import', () => {
	const start = DYNAMIC_SOURCE.indexOf('@/layout/NotAnImport.vue');

	assert.strictEqual(findImportSpecifierAtOffset(DYNAMIC_SOURCE, start + 2), undefined);
});

// The tsconfig that prompted this, comment included: JSON.parse alone would throw on it.
const TSCONFIG = `{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    // \`paths\` resolves relative to this file. Do not add \`baseUrl\`.
    "paths": {
      "@/*": ["./resources/js/*"]
    },
  }
}`;

test('reads the alias table out of a commented tsconfig', () => {
	assert.deepStrictEqual(getPathAliases(TSCONFIG, '/repo'), [
		{ prefix: '@/', roots: [path.join('/repo', 'resources/js')], wildcard: true },
	]);
});

test('resolves targets against baseUrl when one is set', () => {
	const config = '{"compilerOptions":{"baseUrl":"./app","paths":{"~/*":["shared/*"]}}}';

	assert.deepStrictEqual(getPathAliases(config, '/repo'), [
		{ prefix: '~/', roots: [path.join('/repo', 'app/shared')], wildcard: true },
	]);
});

test('returns no aliases when the config declares none', () => {
	assert.deepStrictEqual(getPathAliases('{"compilerOptions":{}}', '/repo'), []);
	assert.deepStrictEqual(getPathAliases('not json at all', '/repo'), []);
});

test('prefers the longest matching prefix', () => {
	const config = '{"compilerOptions":{"paths":{"@/*":["./src/*"],"@/ui/*":["./packages/ui/*"]}}}';
	const aliases = getPathAliases(config, '/repo');

	assert.strictEqual(aliases[0].prefix, '@/ui/');
	assert.deepStrictEqual(
		resolveImportSpecifierCandidates('@/ui/Button.vue', '/repo/src', '/repo/src', aliases),
		[path.join('/repo', 'packages/ui/Button.vue')],
	);
});

// The regression this fixes: `@` pointing somewhere other than src/.
test('uses the alias table in preference to the src fallback', () => {
	const aliases = getPathAliases(TSCONFIG, '/repo');

	assert.deepStrictEqual(
		resolveImportSpecifierCandidates('@/layout/AppShell.vue', '/repo/resources/js', '/repo/src', aliases),
		[path.join('/repo', 'resources/js/layout/AppShell.vue')],
	);
});

// With no config to read, every project resolved as before.
test('still falls back to src when no aliases are known', () => {
	assert.strictEqual(
		resolveImportSpecifierCandidates('@/layout/AppShell.vue', '/repo/src', '/repo/src', [])[0],
		path.join('/repo/src', 'layout/AppShell.vue'),
	);
});


console.log(`\n${passed} passing`);
