'use strict';

// Unit tests for the PURE helpers in vueComponentNavigation.js (no vscode dependency).
// Run: node test/vueComponentNavigation.test.js

const assert = require('assert');
const path = require('path');
const Module = require('module');

// vueComponentNavigation.js does `require('vscode')`, which only exists in the extension host.
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
	if (request === 'vscode') {
		return {};
	}
	return originalLoad.call(this, request, parent, isMain);
};
const { _internal: h } = require('../vueComponentNavigation');
Module._load = originalLoad;

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

// The shape that started this: an async component whose specifier omits .vue, taken verbatim from
// construction-frontend's welcome.vue, where Cmd+B on <DashboardPage /> found nothing.
const WELCOME = `<template>
  <DashboardPage />
</template>
<script>
  import { ChevronRightIcon } from 'vue-feather-icons'
  import NavigationCardList from "@/modules/dashboard/components/NavigationCardList";

  const DashboardPage = () => import("@/modules/dashboard/components/dashboard/DashboardPage");

  export default {
    components: { DashboardPage, ChevronRightIcon, NavigationCardList },
  }
</script>`;

// ---- name normalisation ------------------------------------------------------

test('toPascalCase folds the kebab spelling templates may use', () => {
	assert.strictEqual(h.toPascalCase('dashboard-page'), 'DashboardPage');
	assert.strictEqual(h.toPascalCase('DashboardPage'), 'DashboardPage');
	assert.strictEqual(h.toPascalCase('base-avatar'), 'BaseAvatar');
});

test('isComponentLikeName accepts identifiers and rejects everything else', () => {
	assert.strictEqual(h.isComponentLikeName('DashboardPage'), true);
	assert.strictEqual(h.isComponentLikeName('dashboard-page'), true);
	// A member expression, a directive argument and a path are not component names.
	assert.strictEqual(h.isComponentLikeName('this.foo'), false);
	assert.strictEqual(h.isComponentLikeName('@/modules/x'), false);
	assert.strictEqual(h.isComponentLikeName(''), false);
});

// ---- finding the binding -----------------------------------------------------

test('findImportSpecifier reads an async arrow component', () => {
	assert.strictEqual(
		h.findImportSpecifier(WELCOME, 'DashboardPage'),
		'@/modules/dashboard/components/dashboard/DashboardPage',
	);
});

test('findImportSpecifier reads a static import', () => {
	assert.strictEqual(
		h.findImportSpecifier(WELCOME, 'NavigationCardList'),
		'@/modules/dashboard/components/NavigationCardList',
	);
});

test('findImportSpecifier reads defineAsyncComponent', () => {
	const src = `const Foo = defineAsyncComponent(() => import("@/components/Foo"))`;
	assert.strictEqual(h.findImportSpecifier(src, 'Foo'), '@/components/Foo');
});

test('findImportSpecifier does not match a different component with a shared prefix', () => {
	const src = `import DashboardPageHeader from "@/a/DashboardPageHeader";`;
	assert.strictEqual(h.findImportSpecifier(src, 'DashboardPage'), undefined);
});

test('findImportSpecifier returns undefined for a name this file never binds', () => {
	assert.strictEqual(h.findImportSpecifier(WELCOME, 'SomethingGlobal'), undefined);
});

// ---- specifier resolution ----------------------------------------------------

const SRC = '/repo/src';
const DIR = '/repo/src/modules/dashboard/pages';

test('resolveSpecifierCandidates maps the @/ alias onto src and tries .vue first', () => {
	const out = h.resolveSpecifierCandidates('@/modules/dashboard/components/dashboard/DashboardPage', DIR, SRC);

	assert.strictEqual(out[0], path.join(SRC, 'modules/dashboard/components/dashboard/DashboardPage.vue'));
	assert.strictEqual(out[1], path.join(SRC, 'modules/dashboard/components/dashboard/DashboardPage/index.vue'));
	// The extensions TypeScript would have tried are still offered, just after the Vue ones.
	assert.ok(out.some((p) => p.endsWith('.ts')));
	assert.ok(out.some((p) => p.endsWith('.js')));
});

test('resolveSpecifierCandidates resolves a relative specifier against the current file', () => {
	const out = h.resolveSpecifierCandidates('../components/Widget', DIR, SRC);
	assert.strictEqual(out[0], path.join(SRC, 'modules/dashboard/components/Widget.vue'));
});

test('resolveSpecifierCandidates leaves an explicit extension alone', () => {
	const out = h.resolveSpecifierCandidates('@/components/Foo.vue', DIR, SRC);
	assert.deepStrictEqual(out, [path.join(SRC, 'components/Foo.vue')]);
});

// A bare specifier is a package. Chasing it into src/ would invent files that do not exist and,
// worse, could shadow a real node_modules resolution the language server already handles.
test('resolveSpecifierCandidates ignores package specifiers', () => {
	assert.deepStrictEqual(h.resolveSpecifierCandidates('vue-feather-icons', DIR, SRC), []);
	assert.deepStrictEqual(h.resolveSpecifierCandidates('element-ui/lib/table', DIR, SRC), []);
});


console.log(`\n${passed} passing`);
