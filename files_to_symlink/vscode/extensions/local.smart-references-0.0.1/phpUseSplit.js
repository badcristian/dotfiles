// Splits a closure's `use` variables onto separate lines — the one list the signature split leaves
// behind, since it only ever looks at the parameters. Pure text in, pure text out, so the
// transformation is testable without a VS Code host; extension.js owns the range and the action.

const { scanPhpBalancedList } = require('./phpBalancedList');

const VARIABLE_INDENT = '    ';

function getPhpUseSplit(lineText) {
	const trimmed = lineText.trim();

	if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
		return undefined;
	}

	// The parameter list's `)` in front is what makes this a closure's use list. An import and a
	// trait `use` are both followed by a name, never by a parenthesis.
	const keyword = /\)\s*use\s*\(/.exec(lineText);

	if (!keyword) {
		return undefined;
	}

	const openIndex = keyword.index + keyword[0].length - 1;
	const { closeIndex, commaIndexes } = scanPhpBalancedList(lineText, openIndex);

	// No closing parenthesis on this line means the list is already split. One variable is left
	// alone: it costs two extra lines and reads no better.
	if (closeIndex === -1 || commaIndexes.length === 0) {
		return undefined;
	}

	const variables = [];
	let start = openIndex + 1;

	for (const comma of commaIndexes) {
		variables.push(lineText.slice(start, comma).trim());
		start = comma + 1;
	}

	variables.push(lineText.slice(start, closeIndex).trim());

	// PHP 8.0 allows a trailing comma here. It leaves an empty last entry, and the split re-emits
	// every separator itself.
	if (variables[variables.length - 1] === '') {
		variables.pop();
	}

	const indent = lineText.match(/^\s*/)[0];

	// PSR-12 §6 keeps a closure's brace on the same line as the list, so unlike the signature split
	// there is never a following line to collect.
	return [
		lineText.slice(0, openIndex + 1).trimEnd(),
		...variables.map((variable, index) =>
			`${indent}${VARIABLE_INDENT}${variable}${index < variables.length - 1 ? ',' : ''}`),
		`${indent}${lineText.slice(closeIndex).trimEnd()}`,
	].join('\n');
}

module.exports = {
	getPhpUseSplit,
};
