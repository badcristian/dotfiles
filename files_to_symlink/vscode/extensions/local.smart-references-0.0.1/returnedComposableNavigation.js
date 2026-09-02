'use strict';

// TypeScript understands an exported factory such as `useTimeLog`, but it does not connect a local
// function returned by that factory (`return { closeTimeLog }`) to a consumer that destructures it.
// This module models just that missing link. It intentionally declines every other shape: the
// language server remains the source of truth for normal TypeScript and Vue references.

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWordAtOffset(source, offset) {
	const text = String(source);
	const index = Math.max(0, Math.min(Number(offset) || 0, text.length));
	const isIdentifier = (character) => /[A-Za-z0-9_$]/.test(character || '');
	let start = index;
	let end = index;

	while (start > 0 && isIdentifier(text[start - 1])) {
		start--;
	}

	while (end < text.length && isIdentifier(text[end])) {
		end++;
	}

	const word = text.slice(start, end);

	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(word) ? { word, start, end } : undefined;
}

function findMatchingBrace(source, openingOffset) {
	const text = String(source);
	let depth = 0;
	let quote;
	let lineComment = false;
	let blockComment = false;

	for (let index = openingOffset; index < text.length; index++) {
		const character = text[index];
		const next = text[index + 1];

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
			if (character === '\\') {
				index++;
			} else if (character === quote) {
				quote = undefined;
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

		if (character === '"' || character === "'" || character === '`') {
			quote = character;
			continue;
		}

		if (character === '{') {
			depth++;
		} else if (character === '}') {
			depth--;
			if (depth === 0) {
				return index;
			}
		}
	}

	return -1;
}

function hasLocalDeclaration(source, memberName, wordStart) {
	const declaration = new RegExp(`\\b(?:async\\s+)?(?:function|const|let|var)\\s+${escapeRegExp(memberName)}\\b`, 'g');
	let match;

	while ((match = declaration.exec(source))) {
		const nameStart = match.index + match[0].lastIndexOf(memberName);
		if (nameStart === wordStart) {
			return true;
		}
	}

	return false;
}

function exportedFactoryReturnsMember(source, memberName) {
	const factories = [
		/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g,
		/\bexport\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
	];

	for (const factory of factories) {
		let match;
		while ((match = factory.exec(source))) {
			const bodyStart = source.indexOf('{', match.index);
			const bodyEnd = findMatchingBrace(source, bodyStart);

			if (bodyEnd < 0) {
				continue;
			}

			const body = source.slice(bodyStart + 1, bodyEnd);
			const returns = /\breturn\s*\{/g;
			let returnMatch;

			while ((returnMatch = returns.exec(body))) {
				const objectStart = bodyStart + 1 + returnMatch.index + returnMatch[0].lastIndexOf('{');
				const objectEnd = findMatchingBrace(source, objectStart);
				if (objectEnd < 0 || objectEnd > bodyEnd) {
					continue;
				}

				const objectText = source.slice(objectStart + 1, objectEnd);
				const shorthand = new RegExp(`(?:^|,)\\s*${escapeRegExp(memberName)}\\s*(?=,|$)`);
				if (shorthand.test(objectText)) {
					return match[1];
				}
			}
		}
	}

	return undefined;
}

function findReturnedComposableMember(source, offset) {
	const word = getWordAtOffset(source, offset);
	if (!word || !hasLocalDeclaration(source, word.word, word.start)) {
		return undefined;
	}

	const factoryName = exportedFactoryReturnsMember(String(source), word.word);
	return factoryName ? { factoryName, memberName: word.word } : undefined;
}

function findNamedImportBindings(source, importedName) {
	const imports = /\bimport\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
	const bindings = [];
	let match;

	while ((match = imports.exec(source))) {
		for (const part of match[1].split(',')) {
			const binding = part.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/);
			if (binding?.[1] === importedName) {
				bindings.push({ localName: binding[2] || binding[1], specifier: match[2] });
			}
		}
	}

	return bindings;
}

function findReturnedMemberBindings(source, factoryName, memberName) {
	const calls = new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*${escapeRegExp(factoryName)}\\s*\\(`, 'g');
	const bindings = [];
	let match;

	while ((match = calls.exec(source))) {
		for (const part of match[1].split(',')) {
			const binding = part.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*))?$/);
			if (binding?.[1] === memberName) {
				bindings.push(binding[2] || binding[1]);
			}
		}
	}

	return [...new Set(bindings)];
}

function findBindingUsages(source, bindingName) {
	const expression = new RegExp(`\\b${escapeRegExp(bindingName)}\\b`, 'g');
	const offsets = [];
	let match;

	while ((match = expression.exec(source))) {
		offsets.push(match.index);
	}

	return offsets;
}

module.exports = {
	findReturnedComposableMember,
	findNamedImportBindings,
	findReturnedMemberBindings,
	findBindingUsages,
	_internal: {
		escapeRegExp,
		getWordAtOffset,
		findMatchingBrace,
		findReturnedComposableMember,
		findNamedImportBindings,
		findReturnedMemberBindings,
		findBindingUsages,
	},
};
