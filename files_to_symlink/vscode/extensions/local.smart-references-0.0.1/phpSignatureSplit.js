// PhpStorm's "Split parameters onto separate lines" intention, for PHP function and method
// declarations. Pure text in, pure text out, so the transformation is testable without a VS Code
// host; extension.js owns the document range and the code action.

const PARAMETER_INDENT = '    ';

function getPhpSignatureSplit(lineText, nextLineText) {
	const trimmed = lineText.trim();

	if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
		return undefined;
	}

	// `function` is what separates a declaration from a call on a single line, and it is the only
	// case this handles: a call's arguments close on `);` or `),` and joining a body brace onto
	// them would be wrong. `use function` has no parenthesis, so it falls out here.
	const keyword = /\bfunction\b/.exec(lineText);

	if (!keyword) {
		return undefined;
	}

	const openIndex = lineText.indexOf('(', keyword.index + keyword[0].length);

	if (openIndex === -1) {
		return undefined;
	}

	// Only the commas that separate parameters, so a default value's own commas — `array $x = [1, 2]`,
	// `Foo $y = new Foo(1, 2)` — stay where they are. Quotes are tracked for the same reason.
	const commaIndexes = [];
	let closeIndex = -1;
	let depth = 0;
	let quote = '';
	let escaped = false;

	for (let index = openIndex; index < lineText.length; index++) {
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

		if (character === '(' || character === '[' || character === '{') {
			depth++;
			continue;
		}

		if (character === ')' || character === ']' || character === '}') {
			depth--;

			if (depth === 0) {
				closeIndex = index;
				break;
			}

			continue;
		}

		if (character === ',' && depth === 1) {
			commaIndexes.push(index);
		}
	}

	// No closing parenthesis on this line means the signature is already split. One parameter is
	// left alone: splitting it lengthens the declaration without making anything readable.
	if (closeIndex === -1 || commaIndexes.length === 0) {
		return undefined;
	}

	const parameters = [];
	let start = openIndex + 1;

	for (const comma of commaIndexes) {
		parameters.push(lineText.slice(start, comma).trim());
		start = comma + 1;
	}

	parameters.push(lineText.slice(start, closeIndex).trim());

	// PHP 8.0 allows a trailing comma in a parameter list. It leaves an empty last entry here, and
	// the split re-emits separators itself, so drop it rather than printing a blank line.
	if (parameters[parameters.length - 1] === '') {
		parameters.pop();
	}

	const indent = lineText.match(/^\s*/)[0];
	let closing = `${indent}${lineText.slice(closeIndex).trimEnd()}`;

	// PSR-12 §4.5: the closing parenthesis and the opening brace share a line. The brace is on the
	// next line before the split and has to come up with it — but not for an abstract or interface
	// method, which ends the declaration at `;` and has no brace to take.
	const consumesNextLine = !/[{;]\s*$/.test(closing)
		&& nextLineText !== undefined
		&& nextLineText.trim() === '{';

	if (consumesNextLine) {
		closing += ' {';
	}

	const replacement = [
		lineText.slice(0, openIndex + 1).trimEnd(),
		...parameters.map((parameter, index) =>
			`${indent}${PARAMETER_INDENT}${parameter}${index < parameters.length - 1 ? ',' : ''}`),
		closing,
	].join('\n');

	return { replacement, consumesNextLine };
}

module.exports = {
	getPhpSignatureSplit,
};
