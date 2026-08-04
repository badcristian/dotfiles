'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	normalizeMarkedUris,
	removeDeletedMarkedUris,
	remapMarkedUris,
	toggleMarkedUris,
} = require('../fileMarkers');

test('normalizes persisted marker values to unique URI strings', () => {
	assert.deepEqual(normalizeMarkedUris([
		'file:///workspace/app/A.php',
		undefined,
		'file:///workspace/app/A.php',
		42,
		'vscode-remote://ssh-remote%2Bserver/workspace/app/B.php',
	]), [
		'file:///workspace/app/A.php',
		'vscode-remote://ssh-remote%2Bserver/workspace/app/B.php',
	]);
});

test('marks every selected file when at least one is unmarked', () => {
	assert.deepEqual(toggleMarkedUris(
		['file:///workspace/A.php'],
		['file:///workspace/A.php', 'file:///workspace/B.php'],
	), {
		marked: true,
		markedUris: ['file:///workspace/A.php', 'file:///workspace/B.php'],
		changedUris: ['file:///workspace/B.php'],
	});
});

test('unmarks every selected file when all are already marked', () => {
	assert.deepEqual(toggleMarkedUris(
		['file:///workspace/A.php', 'file:///workspace/B.php', 'file:///workspace/C.php'],
		['file:///workspace/A.php', 'file:///workspace/B.php'],
	), {
		marked: false,
		markedUris: ['file:///workspace/C.php'],
		changedUris: ['file:///workspace/A.php', 'file:///workspace/B.php'],
	});
});

test('moves markers with renamed files and folders without touching similar prefixes', () => {
	assert.deepEqual(remapMarkedUris([
		'file:///workspace/app/Models/User.php',
		'file:///workspace/app/Models/Admin.php',
		'file:///workspace/app/ModelsOld/Legacy.php',
	], [{
		oldUri: 'file:///workspace/app/Models',
		newUri: 'file:///workspace/app/Domain',
	}]), [
		'file:///workspace/app/Domain/User.php',
		'file:///workspace/app/Domain/Admin.php',
		'file:///workspace/app/ModelsOld/Legacy.php',
	]);
});

test('removes markers for deleted files or folders', () => {
	assert.deepEqual(removeDeletedMarkedUris([
		'file:///workspace/app/Models/User.php',
		'file:///workspace/app/Models/Admin.php',
		'file:///workspace/app/Services/Billing.php',
	], ['file:///workspace/app/Models']), [
		'file:///workspace/app/Services/Billing.php',
	]);
});
