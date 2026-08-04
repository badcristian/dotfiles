const LARAVEL_COLLECTION_FQNS = new Set([
	'Illuminate\\Support\\Collection',
	'Illuminate\\Database\\Eloquent\\Collection',
]);

function getPhpDocRangeAtOffset(source, offset) {
	const start = source.lastIndexOf('/**', offset);
	const previousEnd = source.lastIndexOf('*/', offset);

	if (start === -1 || previousEnd > start) {
		return undefined;
	}

	const end = source.indexOf('*/', offset);

	return end === -1 ? undefined : { start, end: end + 2 };
}

function getLaravelCollectionAliases(source) {
	const aliases = new Map();
	const importPattern = /^use\s+(\\?Illuminate\\(?:Support|Database\\Eloquent)\\Collection)(?:\s+as\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*))?\s*;/gmi;
	let match;

	while ((match = importPattern.exec(source)) !== null) {
		const fqn = match[1].replace(/^\\/, '');
		const alias = match[2] || 'Collection';
		aliases.set(alias.toLowerCase(), fqn);
	}

	return aliases;
}

function resolveLaravelCollectionFqn(typeName, aliases) {
	const normalized = typeName.replace(/^\\/, '');

	if (LARAVEL_COLLECTION_FQNS.has(normalized)) {
		return normalized;
	}

	if (normalized.includes('\\')) {
		return undefined;
	}

	return aliases.get(normalized.toLowerCase());
}

function findGenericClose(source, openOffset, limit) {
	let depth = 1;

	for (let index = openOffset + 1; index < limit; index++) {
		if (source[index] === '<') {
			depth++;
		} else if (source[index] === '>') {
			depth--;

			if (depth === 0) {
				return index;
			}
		}
	}

	return undefined;
}

function hasTopLevelComma(value) {
	const closings = [];
	let quote;
	let escaped = false;
	const closingFor = {
		'<': '>',
		'(': ')',
		'[': ']',
		'{': '}',
	};

	for (const character of value) {
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === quote) {
				quote = undefined;
			}

			continue;
		}

		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}

		if (closingFor[character]) {
			closings.push(closingFor[character]);
			continue;
		}

		if (character === closings.at(-1)) {
			closings.pop();
			continue;
		}

		if (character === ',' && closings.length === 0) {
			return true;
		}
	}

	return false;
}

function getLaravelCollectionKeyTypeEdit(source, offset) {
	const phpDocRange = getPhpDocRangeAtOffset(source, offset);

	if (!phpDocRange) {
		return undefined;
	}

	const aliases = getLaravelCollectionAliases(source.slice(0, phpDocRange.start));
	const phpDoc = source.slice(phpDocRange.start, phpDocRange.end);
	const typePattern = /\\?[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*(?:\\[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)*\s*</g;
	const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
	const lineBreak = source.indexOf('\n', offset);
	const lineEnd = lineBreak === -1 ? source.length : lineBreak;
	const candidates = [];
	let match;

	while ((match = typePattern.exec(phpDoc)) !== null) {
		const rawMatch = match[0];
		const typeName = rawMatch.slice(0, rawMatch.lastIndexOf('<')).trim();

		if (!resolveLaravelCollectionFqn(typeName, aliases)) {
			continue;
		}

		const typeStart = phpDocRange.start + match.index;
		const openOffset = phpDocRange.start + typePattern.lastIndex - 1;
		const closeOffset = findGenericClose(source, openOffset, phpDocRange.end);

		if (closeOffset === undefined) {
			continue;
		}

		const valueType = source.slice(openOffset + 1, closeOffset).trim();

		if (!valueType || hasTopLevelComma(valueType)) {
			continue;
		}

		const containsOffset = offset >= typeStart && offset <= closeOffset;
		const isOnlyCandidateLine = typeStart >= lineStart && closeOffset <= lineEnd;

		if (containsOffset || isOnlyCandidateLine) {
			candidates.push({
				containsOffset,
				start: openOffset + 1,
				end: closeOffset,
				replacement: `int, ${valueType}`,
				typeLength: closeOffset - typeStart,
			});
		}
	}

	const selected = candidates
		.sort((left, right) => Number(right.containsOffset) - Number(left.containsOffset) || left.typeLength - right.typeLength)[0];

	if (!selected) {
		return undefined;
	}

	return {
		start: selected.start,
		end: selected.end,
		replacement: selected.replacement,
	};
}

module.exports = {
	getLaravelCollectionKeyTypeEdit,
};
