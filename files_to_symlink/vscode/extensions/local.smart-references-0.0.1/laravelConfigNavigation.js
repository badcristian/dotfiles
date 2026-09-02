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

const CONFIG_HELPER_PATTERN = /(?:^|[^A-Za-z0-9_\\])config\s*\(\s*$/s;

// The facades are matched imported, fully qualified, and root-namespaced, because all three appear
// in practice.
//
// `Config::` is the same Repository the helper returns, so its readers name a key just as directly.
// `getMany` is left out: its keys sit in an array literal, so the prefix never ends at the paren.
const CONFIG_FACADE_PATTERN = /(?:^|[^A-Za-z0-9_])\\?(?:[A-Za-z_][A-Za-z0-9_]*\\)*Config\s*::\s*(?:get|has|set|push|prepend|string|integer|float|boolean|array|collection)\s*\(\s*$/s;

// Laravel resolves Log::channel('name') through config('logging.channels.name'), so the literal
// names a config key exactly as directly as config() does.
const LOG_CHANNEL_PATTERN = /(?:^|[^A-Za-z0-9_])\\?(?:[A-Za-z_][A-Za-z0-9_]*\\)*Log\s*::\s*channel\s*\(\s*$/s;

/** Longest prefix that can match is a root-namespaced facade call, ~45 chars. */
const PREFIX_WINDOW = 160;

function resolveConfigKeyRead(prefix, value) {
	if (CONFIG_HELPER_PATTERN.test(prefix) || CONFIG_FACADE_PATTERN.test(prefix)) {
		return value;
	}

	return LOG_CHANNEL_PATTERN.test(prefix)
		? `logging.channels.${value}`
		: undefined;
}

// Every literal that names a config key, in source order. Both directions of the jump read this one
// walk, so a call site the forward jump follows is a call site the reverse search finds.
function forEachConfigKeyRead(source, visit) {
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
			return;
		}

		const key = resolveConfigKeyRead(source.slice(Math.max(0, index - PREFIX_WINDOW), index), literal.value);

		if (key !== undefined) {
			visit(key, literal);
		}

		index = literal.nextOffset;
	}
}

function getLaravelConfigKeyAtOffset(source, offset) {
	let found;

	forEachConfigKeyRead(source, (key, literal) => {
		if (offset >= literal.start && offset <= literal.end) {
			found = key;
		}
	});

	return found;
}

function findLaravelConfigKeyReadRanges(source, key) {
	const ranges = [];

	forEachConfigKeyRead(source, (candidate, literal) => {
		if (candidate === key) {
			ranges.push({ start: literal.start, end: literal.end });
		}
	});

	return ranges;
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

function* directArrayKeys(tokens, openIndex, closeIndex) {
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

		if (nestedClosings.length === 0 && token.type === 'string' && tokens[index + 1]?.type === 'arrow') {
			yield index;
		}
	}
}

function findDirectArrayKey(tokens, openIndex, closeIndex, key) {
	for (const index of directArrayKeys(tokens, openIndex, closeIndex)) {
		if (tokens[index].value === key) {
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

function findConfigKeyPath(tokens, openIndex, closeIndex, offset) {
	for (const keyIndex of directArrayKeys(tokens, openIndex, closeIndex)) {
		const key = tokens[keyIndex];

		if (offset >= key.start && offset <= key.end) {
			return [key.value];
		}

		const valueOpen = getArrayValueOpen(tokens, keyIndex, closeIndex);
		const valueClose = valueOpen === undefined ? undefined : findContainerClose(tokens, valueOpen, closeIndex);

		if (valueClose === undefined) {
			continue;
		}

		const nested = findConfigKeyPath(tokens, valueOpen, valueClose, offset);

		if (nested) {
			return [key.value, ...nested];
		}
	}

	return undefined;
}

// The reverse of findLaravelConfigKeyRange: the dotted path of the key under the cursor, minus the
// file name the caller already knows. One segment per enclosing array, so the cursor on `'single'`
// inside logging's `'channels'` answers `['channels', 'single']`.
function getLaravelConfigKeyPathAtOffset(source, offset) {
	const tokens = tokenizePhp(source);
	const openIndex = findReturnArray(tokens);
	const closeIndex = openIndex === undefined ? undefined : findContainerClose(tokens, openIndex);

	if (closeIndex === undefined) {
		return undefined;
	}

	return findConfigKeyPath(tokens, openIndex, closeIndex, offset);
}

module.exports = {
	findLaravelConfigKeyRange,
	findLaravelConfigKeyReadRanges,
	getLaravelConfigKeyAtOffset,
	getLaravelConfigKeyPathAtOffset,
	// Shared with laravelRelationNavigation, which walks the same string literals for a different
	// reason. Reading PHP text without them means re-deciding what is a comment and what is escaped.
	scanPhpString,
	skipPhpComment,
};
