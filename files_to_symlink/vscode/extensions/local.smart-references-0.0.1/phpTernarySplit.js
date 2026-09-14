// PhpStorm's "Split ternary onto separate lines" intention, for a PHP ternary written on one line.
// Pure text in, pure text out, so the transformation is testable without a VS Code host;
// extension.js owns the document range and the code action.

const BRANCH_INDENT = '    ';

// Index of the top-level `?` that opens a ternary, or -1. Strings are tracked so a `?` inside one is
// text, and depth so a ternary passed as an argument stays put: this splits a statement, not a part.
function findTernaryQuestion(lineText) {
	let depth = 0;
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

		if (character === '#' || (character === '/' && lineText[index + 1] === '/')) {
			return -1;
		}

		if (character === '(' || character === '[' || character === '{') {
			depth++;
			continue;
		}

		if (character === ')' || character === ']' || character === '}') {
			depth--;
			continue;
		}

		if (character !== '?') {
			continue;
		}

		// `??` and `??=`: consumed whole, or the second mark reads as a ternary opening on the space
		// after it.
		if (lineText[index + 1] === '?') {
			index++;
			continue;
		}

		// `?->`, then `?string` / `?\Foo` — a nullable type puts a name against the mark, an
		// operator never does — then `?:`, which has no branch to split.
		if (lineText[index + 1] === '-' && lineText[index + 2] === '>') {
			index += 2;
			continue;
		}

		if (/[A-Za-z_\x80-\xff\\]/.test(lineText[index + 1] || '')) {
			continue;
		}

		if (lineText.slice(index + 1).trimStart()[0] === ':') {
			continue;
		}

		if (depth === 0) {
			return index;
		}
	}

	return -1;
}

// Index of the `:` that pairs with the `?` at questionIndex, or -1. PHP 8 makes an unparenthesised
// nested ternary a fatal error, so the first top-level `:` after the mark is always its pair.
function findTernaryColon(lineText, questionIndex) {
	let depth = 0;
	let quote = '';
	let escaped = false;

	for (let index = questionIndex + 1; index < lineText.length; index++) {
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

		if (character === '#' || (character === '/' && lineText[index + 1] === '/')) {
			return -1;
		}

		if (character === '(' || character === '[' || character === '{') {
			depth++;
			continue;
		}

		if (character === ')' || character === ']' || character === '}') {
			depth--;
			continue;
		}

		if (character === ':' && depth === 0) {
			// `Foo::BAR` in the true branch. A named argument's colon is inside the call's depth.
			if (lineText[index + 1] === ':') {
				index++;
				continue;
			}

			return index;
		}
	}

	return -1;
}

function getPhpTernarySplit(lineText) {
	const trimmed = lineText.trim();

	if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
		return undefined;
	}

	const questionIndex = findTernaryQuestion(lineText);

	if (questionIndex === -1) {
		return undefined;
	}

	const colonIndex = findTernaryColon(lineText, questionIndex);

	if (colonIndex === -1) {
		return undefined;
	}

	const condition = lineText.slice(0, questionIndex).trimEnd();
	const whenTrue = lineText.slice(questionIndex + 1, colonIndex).trim();
	const whenFalse = lineText.slice(colonIndex + 1).trim();

	// An empty part means this is a line the scan misread, not a ternary. Offer nothing rather than
	// write a `?` with nothing under it.
	if (condition.trim() === '' || whenTrue === '' || whenFalse === '') {
		return undefined;
	}

	const indent = lineText.match(/^\s*/)[0];

	return [
		condition,
		`${indent}${BRANCH_INDENT}? ${whenTrue}`,
		`${indent}${BRANCH_INDENT}: ${whenFalse}`,
	].join('\n');
}

module.exports = {
	getPhpTernarySplit,
};
