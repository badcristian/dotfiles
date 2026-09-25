// Which inlay hints inside a call belong to that call rather than to a call in one of its
// arguments. Pure text in, boolean out, so it is testable without a VS Code host;
// extension.js owns the document range and the hint provider.

// Text from the call's name through its closing parenthesis, and an offset into it. Depth 1 is
// between the call's own parentheses: `foo(` opens it, a nested `bar(` takes its arguments to 2.
// Strings and comments are tracked so a parenthesis written inside one stays text.
function isPhpDirectCallArgument(callText, offset) {
	let quote = '';
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	let depth = 0;

	for (let index = 0; index < offset && index < callText.length; index++) {
		const character = callText[index];
		const next = callText[index + 1];

		if (lineComment) {
			if (character === '\n') {
				lineComment = false;
			}
			continue;
		}

		if (blockComment) {
			if (character === '*' && next === '/') {
				blockComment = false;
				index++;
			}
			continue;
		}

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

		if (character === '/' && next === '/') {
			lineComment = true;
			index++;
			continue;
		}

		if (character === '/' && next === '*') {
			blockComment = true;
			index++;
			continue;
		}

		if (character === '\'' || character === '"') {
			quote = character;
			continue;
		}

		if (character === '(') {
			depth++;
			continue;
		}

		if (character === ')') {
			depth--;
		}
	}

	return depth === 1;
}

module.exports = {
	isPhpDirectCallArgument,
};
