const assert = require('node:assert/strict');
const test = require('node:test');

const {
	appendGitignoreEntries,
	getGitignoreEntry,
} = require('../gitignore');

test('builds a repository-relative gitignore entry', () => {
	assert.equal(
		getGitignoreEntry('/workspace/project', '/workspace/project/_ide_helper_manual.php'),
		'_ide_helper_manual.php'
	);
	assert.equal(
		getGitignoreEntry('/workspace/project', '/workspace/project/storage/debug.log'),
		'storage/debug.log'
	);
});

test('rejects resources outside the repository', () => {
	assert.equal(
		getGitignoreEntry('/workspace/project', '/workspace/other/debug.log'),
		undefined
	);
});

test('escapes an opening square bracket like the built-in Git action', () => {
	assert.equal(
		getGitignoreEntry('/workspace/project', '/workspace/project/report[old].txt'),
		'report\\[old].txt'
	);
});

test('appends new entries with a final newline', () => {
	assert.deepEqual(
		appendGitignoreEntries('vendor/\n', ['_ide_helper_manual.php']),
		{
			source: 'vendor/\n_ide_helper_manual.php\n',
			addedEntries: ['_ide_helper_manual.php'],
		}
	);
});

test('preserves CRLF and adds a separator after an unterminated line', () => {
	assert.deepEqual(
		appendGitignoreEntries('vendor/\r\nnode_modules/', ['storage/debug.log']),
		{
			source: 'vendor/\r\nnode_modules/\r\nstorage/debug.log\r\n',
			addedEntries: ['storage/debug.log'],
		}
	);
});

test('does not duplicate existing or repeated entries', () => {
	assert.deepEqual(
		appendGitignoreEntries('_ide_helper_manual.php\n', [
			'_ide_helper_manual.php',
			'_ide_helper_manual.php',
		]),
		{
			source: '_ide_helper_manual.php\n',
			addedEntries: [],
		}
	);
});
