// Where a bracketed list written on one line closes, and which of its commas separate its own
// entries. Shared by the signature, array and use splits: a nested list's commas, and any comma
// written inside a string, belong to something else.

function scanPhpBalancedList(lineText, openIndex) {
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

	return { closeIndex, commaIndexes };
}

module.exports = {
	scanPhpBalancedList,
};
