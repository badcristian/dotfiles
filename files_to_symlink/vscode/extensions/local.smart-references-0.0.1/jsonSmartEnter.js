function lexicalStateAt(text, endOffset) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = 0; index < endOffset; index++) {
		const character = text[index];
		const next = text[index + 1];

		if (inLineComment) {
			if (character === '\n') {
				inLineComment = false;
			}
			continue;
		}

		if (inBlockComment) {
			if (character === '*' && next === '/') {
				inBlockComment = false;
				index++;
			}
			continue;
		}

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}

		if (character === '/' && next === '/') {
			inLineComment = true;
			index++;
		} else if (character === '/' && next === '*') {
			inBlockComment = true;
			index++;
		} else if (character === '"') {
			inString = true;
		} else if (character === '{' || character === '[') {
			depth++;
		} else if (character === '}' || character === ']') {
			depth = Math.max(0, depth - 1);
		}
	}

	return {
		depth,
		inString,
		inLineComment,
		inBlockComment,
	};
}

function hasCommentOutsideString(text) {
	let inString = false;
	let escaped = false;

	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		const next = text[index + 1];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}

		if (character === '"') {
			inString = true;
		} else if (character === '/' && (next === '/' || next === '*')) {
			return true;
		}
	}

	return false;
}

function shouldInsertJsonComma(documentText, offset) {
	if (offset < 0 || offset > documentText.length) {
		return false;
	}

	const lineStart = documentText.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
	const nextLineBreak = documentText.indexOf('\n', offset);
	const lineEnd = nextLineBreak === -1 ? documentText.length : nextLineBreak;
	const beforeCursor = documentText.slice(lineStart, offset);
	const afterCursor = documentText.slice(offset, lineEnd);
	const trimmed = beforeCursor.trimEnd();

	if (
		afterCursor.trim()
		|| !trimmed
		|| hasCommentOutsideString(beforeCursor)
		|| /[,{\[:]$/.test(trimmed)
	) {
		return false;
	}

	const state = lexicalStateAt(documentText, offset);

	return state.depth > 0
		&& !state.inString
		&& !state.inLineComment
		&& !state.inBlockComment;
}

module.exports = {
	shouldInsertJsonComma,
};
