// PhpStorm's "Split arguments onto separate lines" intention, for a PHP call written on one line.
// Pure text in, pure text out, so the transformation is testable without a VS Code host;
// extension.js owns the document range and the code action.

const { scanPhpBalancedList } = require('./phpBalancedList');

const ARGUMENT_INDENT = '    ';

// `(` after these is a construct, not a call. `function` / `fn` / `use` belong to the signature and
// use splits; `array(` stays, its elements split like arguments.
const NON_CALL_KEYWORDS = new Set([
	'if', 'elseif', 'while', 'for', 'foreach', 'switch', 'match', 'catch', 'function', 'fn', 'use',
	'return', 'echo', 'print', 'and', 'or', 'xor', 'list', 'isset', 'unset', 'empty',
]);

// Window, not the whole prefix: the join runs this over a full document.
function isCallOpen(text, index) {
	const before = text.slice(Math.max(0, index - 200), index).trimEnd();
	const word = /[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.exec(before);

	if (word) {
		// `function make(` declares; the name in front of the parenthesis is not the keyword.
		return !NON_CALL_KEYWORDS.has(word[0].toLowerCase())
			&& !/\bfunction\s+&?\s*$/i.test(before.slice(0, word.index));
	}

	// `$fn(...)`, `foo()(...)`, `$handlers['x'](...)`.
	return /[)\]]$/.test(before);
}

// Every call opening on the line, outside strings and line comments.
function findCallOpens(lineText) {
	const opens = [];
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
			break;
		}

		if (character === '(' && isCallOpen(lineText, index)) {
			opens.push(index);
		}
	}

	return opens;
}

// Innermost call around the cursor wins; cursor outside every call -> the first one on the line.
function getPhpCallArgumentSplit(lineText, cursor = 0) {
	const trimmed = lineText.trim();

	if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
		return undefined;
	}

	// One argument is left alone: splitting it lengthens the call without making anything readable.
	const calls = findCallOpens(lineText)
		.map((openIndex) => ({ openIndex, ...scanPhpBalancedList(lineText, openIndex) }))
		.filter((call) => call.closeIndex !== -1 && call.commaIndexes.length > 0);
	const call = calls.filter((candidate) => candidate.openIndex < cursor && cursor <= candidate.closeIndex).pop()
		?? calls[0];

	if (!call) {
		return undefined;
	}

	const { openIndex, closeIndex, commaIndexes } = call;
	const parts = [];
	let start = openIndex + 1;

	for (const comma of commaIndexes) {
		parts.push(lineText.slice(start, comma).trim());
		start = comma + 1;
	}

	parts.push(lineText.slice(start, closeIndex).trim());

	// A trailing comma leaves an empty last entry; the split re-emits every separator itself.
	if (parts[parts.length - 1] === '') {
		parts.pop();
	}

	if (parts.length < 2) {
		return undefined;
	}

	const indent = lineText.match(/^\s*/)[0];

	return [
		lineText.slice(0, openIndex + 1).trimEnd(),
		...parts.map((part, index) => `${indent}${ARGUMENT_INDENT}${part}${index < parts.length - 1 ? ',' : ''}`),
		`${indent}${lineText.slice(closeIndex).trimEnd()}`,
	].join('\n');
}

module.exports = {
	getPhpCallArgumentSplit,
	isCallOpen,
};
