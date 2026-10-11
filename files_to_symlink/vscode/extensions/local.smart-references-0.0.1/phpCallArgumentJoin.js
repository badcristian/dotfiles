// Inverse of the argument split: a call spread over lines goes back onto one, named arguments
// turned positional. Pure text in, pure text out; extension.js checks the names against the
// signature before any edit, since `f(b: 1, a: 2)` -> `f(1, 2)` swaps the values.

const { isCallOpen } = require('./phpCallArgumentSplit');

const NAMED_ARGUMENT = /^([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*:(?!:)\s*/;

// Every call in the text: its parentheses, its depth-1 commas, and whether a comment sits inside.
function scanCalls(text) {
	const calls = [];
	const stack = [];
	let quote = '';
	let escaped = false;

	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		const next = text[index + 1];

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

		const lineComment = (character === '/' && next === '/') || (character === '#' && next !== '[');

		if (lineComment || (character === '/' && next === '*')) {
			const end = lineComment ? text.indexOf('\n', index) : text.indexOf('*/', index + 2) + 1;
			stack.forEach((open) => { open.hasComment = true; });
			index = end <= 0 ? text.length : end;
			continue;
		}

		if (character === '\'' || character === '"') {
			quote = character;
		} else if ('([{'.includes(character)) {
			stack.push({
				openIndex: index,
				isCall: character === '(' && isCallOpen(text, index),
				commaIndexes: [],
				hasComment: false,
			});
		} else if (')]}'.includes(character)) {
			const open = stack.pop();

			if (open?.isCall) {
				calls.push({ ...open, closeIndex: index });
			}
		} else if (character === ',' && stack.length > 0) {
			stack[stack.length - 1].commaIndexes.push(index);
		}
	}

	return calls;
}

// Innermost call around the cursor; else the first opening on the cursor's line, so standing on
// `return new DraftDTO(` works.
function findCallAtCursor(text, cursor) {
	const calls = scanCalls(text);
	const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
	const lineEnd = text.indexOf('\n', cursor) === -1 ? text.length : text.indexOf('\n', cursor);
	const around = calls
		.filter((call) => call.openIndex < cursor && cursor <= call.closeIndex)
		.sort((a, b) => b.openIndex - a.openIndex);

	return around[0] ?? calls
		.filter((call) => call.openIndex >= lineStart && call.openIndex < lineEnd)
		.sort((a, b) => a.openIndex - b.openIndex)[0];
}

function getPhpCallArgumentJoin(text, cursor) {
	const call = findCallAtCursor(text, cursor);

	if (!call || call.hasComment) {
		return undefined;
	}

	const { openIndex, closeIndex, commaIndexes } = call;
	const parts = [];
	let start = openIndex + 1;

	for (const comma of [...commaIndexes, closeIndex]) {
		parts.push(text.slice(start, comma).trim());
		start = comma + 1;
	}

	if (parts[parts.length - 1] === '') {
		parts.pop();
	}

	// A closure or array spanning lines does not join into anything readable.
	if (parts.some((part) => part === '' || part.includes('\n'))) {
		return undefined;
	}

	const names = parts.map((part) => NAMED_ARGUMENT.exec(part)?.[1]);
	const replacement = parts.map((part) => part.replace(NAMED_ARGUMENT, '')).join(', ');

	if (replacement === text.slice(openIndex + 1, closeIndex)) {
		return undefined;
	}

	return { start: openIndex + 1, end: closeIndex, names, replacement };
}

module.exports = {
	getPhpCallArgumentJoin,
};
