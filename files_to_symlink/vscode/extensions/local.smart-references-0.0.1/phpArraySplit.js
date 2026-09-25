// PhpStorm's "Split array elements onto separate lines" intention, for a PHP array literal written
// on one line. Pure text in, pure text out, so the transformation is testable without a VS Code
// host; extension.js owns the document range and the code action.

const { scanPhpBalancedList } = require('./phpBalancedList');

const ELEMENT_INDENT = '    ';

// `[` after one of these reads as a value, not as a subscript on the word in front of it.
const VALUE_KEYWORDS = new Set(['return', 'yield', 'echo', 'print', 'case', 'default', 'and', 'or', 'xor']);

function isArrayLiteralOpen(lineText, index) {
	const before = lineText.slice(0, index).trimEnd();

	if (before === '') {
		return true;
	}

	const word = /[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.exec(before);

	if (word) {
		return VALUE_KEYWORDS.has(word[0].toLowerCase());
	}

	// `$a[0]`, `foo()[0]`, `$a[0][1]` and `{$k}[0]` all subscript what precedes them.
	return !/[$)\]}]$/.test(before);
}

function findArrayLiteralOpen(lineText) {
	let quote = '';
	let escaped = false;

	for (let index = 0; index < lineText.length; index++) {
		const character = lineText[index];

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === quote) {
				quote = '';
			}
			continue;
		}

		if (character === '\'' || character === '"') {
			quote = character;
			continue;
		}

		// A line comment ends the code. `#` also opens an attribute, and `#[Foo, Bar]` is a list of
		// attributes rather than an array.
		if (character === '#' || (character === '/' && lineText[index + 1] === '/')) {
			return -1;
		}

		if (character === '[' && isArrayLiteralOpen(lineText, index)) {
			return index;
		}
	}

	return -1;
}

function getPhpArraySplit(lineText) {
	const trimmed = lineText.trim();

	if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
		return undefined;
	}

	const openIndex = findArrayLiteralOpen(lineText);

	if (openIndex === -1) {
		return undefined;
	}

	const { closeIndex, commaIndexes } = scanPhpBalancedList(lineText, openIndex);

	// No closing bracket on this line means the array is already split.
	if (closeIndex === -1) {
		return undefined;
	}

	const elements = [];
	let start = openIndex + 1;

	for (const comma of commaIndexes) {
		elements.push(lineText.slice(start, comma).trim());
		start = comma + 1;
	}

	elements.push(lineText.slice(start, closeIndex).trim());

	// A trailing comma leaves an empty last entry, and `[]` leaves nothing but one. The split
	// re-emits every separator itself, so drop it either way.
	if (elements[elements.length - 1] === '') {
		elements.pop();
	}

	if (elements.length === 0) {
		return undefined;
	}

	const indent = lineText.match(/^\s*/)[0];

	return [
		lineText.slice(0, openIndex + 1).trimEnd(),
		// Trailing comma on the last element too, so adding the next one is a one-line diff.
		...elements.map((element) => `${indent}${ELEMENT_INDENT}${element},`),
		`${indent}${lineText.slice(closeIndex).trimEnd()}`,
	].join('\n');
}

module.exports = {
	getPhpArraySplit,
};
