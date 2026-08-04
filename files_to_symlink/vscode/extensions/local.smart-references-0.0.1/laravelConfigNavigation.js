function decodePhpString(value) {
	return value.replace(/\\(.)/gs, '$1');
}

function scanPhpString(source, start) {
	const quote = source[start];
	let index = start + 1;

	while (index < source.length) {
		if (source[index] === '\\') {
			index += 2;
			continue;
		}

		if (source[index] === quote) {
			return {
				type: 'string',
				value: decodePhpString(source.slice(start + 1, index)),
				start: start + 1,
				end: index,
				nextOffset: index + 1,
			};
		}

		index++;
	}

	return undefined;
}

function skipPhpComment(source, start) {
	if (source.startsWith('//', start) || source[start] === '#') {
		const lineEnd = source.indexOf('\n', start + 1);
		return lineEnd === -1 ? source.length : lineEnd + 1;
	}

	if (source.startsWith('/*', start)) {
		const commentEnd = source.indexOf('*/', start + 2);
		return commentEnd === -1 ? source.length : commentEnd + 2;
	}

	return undefined;
}

function getLaravelConfigKeyAtOffset(source, offset) {
	let index = 0;

	while (index < source.length) {
		const commentEnd = skipPhpComment(source, index);
		if (commentEnd !== undefined) {
			index = commentEnd;
			continue;
		}

		if (source[index] !== "'" && source[index] !== '"') {
			index++;
			continue;
		}

		const literal = scanPhpString(source, index);
		if (!literal) {
			return undefined;
		}

		if (offset >= literal.start && offset <= literal.end) {
			const prefix = source.slice(0, index);
			return /(?:^|[^A-Za-z0-9_\\])config\s*\(\s*$/s.test(prefix)
				? literal.value
				: undefined;
		}

		index = literal.nextOffset;
	}

	return undefined;
}

function tokenizePhp(source) {
	const tokens = [];
	let index = 0;

	while (index < source.length) {
		const commentEnd = skipPhpComment(source, index);
		if (commentEnd !== undefined) {
			index = commentEnd;
			continue;
		}

		if (source[index] === "'" || source[index] === '"') {
			const literal = scanPhpString(source, index);
			if (!literal) {
				break;
			}

			tokens.push(literal);
			index = literal.nextOffset;
			continue;
		}

		if (source.startsWith('=>', index)) {
			tokens.push({ type: 'arrow' });
			index += 2;
			continue;
		}

		if ('[](),;'.includes(source[index])) {
			tokens.push({ type: source[index] });
			index++;
			continue;
		}

		const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identifier) {
			tokens.push({ type: 'identifier', value: identifier[0].toLowerCase() });
			index += identifier[0].length;
			continue;
		}

		index++;
	}

	return tokens;
}

function getClosingType(openingType) {
	return openingType === '[' ? ']' : ')';
}

function findContainerClose(tokens, openIndex, limit = tokens.length) {
	const stack = [getClosingType(tokens[openIndex].type)];

	for (let index = openIndex + 1; index < limit; index++) {
		const token = tokens[index];

		if (token.type === '[' || token.type === '(') {
			stack.push(getClosingType(token.type));
			continue;
		}

		if (token.type === stack.at(-1)) {
			stack.pop();
			if (stack.length === 0) {
				return index;
			}
		}
	}

	return undefined;
}

function findReturnArray(tokens) {
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index].type !== 'identifier' || tokens[index].value !== 'return') {
			continue;
		}

		if (tokens[index + 1]?.type === '[') {
			return index + 1;
		}

		if (
			tokens[index + 1]?.type === 'identifier'
			&& tokens[index + 1].value === 'array'
			&& tokens[index + 2]?.type === '('
		) {
			return index + 2;
		}
	}

	return undefined;
}

function findDirectArrayKey(tokens, openIndex, closeIndex, key) {
	const nestedClosings = [];

	for (let index = openIndex + 1; index < closeIndex; index++) {
		const token = tokens[index];

		if (token.type === '[' || token.type === '(') {
			nestedClosings.push(getClosingType(token.type));
			continue;
		}

		if (token.type === nestedClosings.at(-1)) {
			nestedClosings.pop();
			continue;
		}

		if (
			nestedClosings.length === 0
			&& token.type === 'string'
			&& token.value === key
			&& tokens[index + 1]?.type === 'arrow'
		) {
			return index;
		}
	}

	return undefined;
}

function getArrayValueOpen(tokens, keyIndex, closeIndex) {
	const valueIndex = keyIndex + 2;

	if (tokens[valueIndex]?.type === '[') {
		return valueIndex;
	}

	if (
		tokens[valueIndex]?.type === 'identifier'
		&& tokens[valueIndex].value === 'array'
		&& tokens[valueIndex + 1]?.type === '('
		&& valueIndex + 1 < closeIndex
	) {
		return valueIndex + 1;
	}

	return undefined;
}

function findLaravelConfigKeyRange(source, keySegments) {
	if (!Array.isArray(keySegments) || keySegments.length === 0 || keySegments.some((segment) => !segment)) {
		return undefined;
	}

	const tokens = tokenizePhp(source);
	let openIndex = findReturnArray(tokens);
	let closeIndex = openIndex === undefined ? undefined : findContainerClose(tokens, openIndex);

	if (openIndex === undefined || closeIndex === undefined) {
		return undefined;
	}

	for (let index = 0; index < keySegments.length; index++) {
		const keyIndex = findDirectArrayKey(tokens, openIndex, closeIndex, keySegments[index]);

		if (keyIndex === undefined) {
			return undefined;
		}

		if (index === keySegments.length - 1) {
			return { start: tokens[keyIndex].start, end: tokens[keyIndex].end };
		}

		openIndex = getArrayValueOpen(tokens, keyIndex, closeIndex);
		closeIndex = openIndex === undefined ? undefined : findContainerClose(tokens, openIndex, closeIndex);

		if (openIndex === undefined || closeIndex === undefined) {
			return undefined;
		}
	}

	return undefined;
}

module.exports = {
	findLaravelConfigKeyRange,
	getLaravelConfigKeyAtOffset,
};
