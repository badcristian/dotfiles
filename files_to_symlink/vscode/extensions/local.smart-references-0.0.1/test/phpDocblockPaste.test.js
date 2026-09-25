const test = require('node:test');
const assert = require('node:assert/strict');

const { getDocblockPaste } = require('../phpDocblockPaste');

const ABOVE = ['         *', '        /**'];

test('every pasted line after the first gets the gutter of the line pasted into', () => {
	const pasted = '┌──────┐\n│ MÂNER│\n└──────┘\n';

	assert.equal(getDocblockPaste(ABOVE, '         *', 10, pasted), [
		' ┌──────┐',
		'         * │ MÂNER│',
		'         * └──────┘',
	].join('\n'));
});

test('no extra space after an existing one, blank lines keep a bare star', () => {
	assert.equal(getDocblockPaste(ABOVE, '         * ', 11, 'one\n\ntwo'), [
		'one',
		'         *',
		'         * two',
	].join('\n'));
});

test('common indentation is removed, relative indentation kept', () => {
	assert.equal(getDocblockPaste(ABOVE, '         * ', 11, 'if ($a) {\n        return;\n    }'), [
		'if ($a) {',
		'         *     return;',
		'         * }',
	].join('\n'));
});

test('text copied out of another docblock is not given a second gutter', () => {
	assert.equal(getDocblockPaste(ABOVE, '         * ', 11, ' * one\n * two\n *'), [
		'one',
		'         * two',
		'         *',
	].join('\n'));
});

test('pasting on the opening line continues below it', () => {
	assert.equal(getDocblockPaste([], '        /** ', 12, 'one\ntwo'), 'one\n         * two');
});

test('plain paste: one line, outside a docblock, or after one has closed', () => {
	assert.equal(getDocblockPaste(ABOVE, '         * ', 11, 'one line\n'), undefined);
	assert.equal(getDocblockPaste([], '        $a = 1;', 15, 'one\ntwo'), undefined);
	assert.equal(getDocblockPaste(['         */', '         * x', '        /**'], '         * ', 11, 'one\ntwo'), undefined);
	assert.equal(getDocblockPaste(['        $total = $a'], '            * $b;', 12, 'one\ntwo'), undefined);
	assert.equal(getDocblockPaste(ABOVE, '         */', 10, 'one\ntwo'), undefined);
});
