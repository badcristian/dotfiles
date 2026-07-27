'use strict';

const path = require('node:path');

function normalizePath(value) {
	return path.posix.normalize(value.replace(/\\/g, '/'));
}

function getComposerPsr4Mappings(composerJson) {
	return [
		composerJson?.autoload?.['psr-4'],
		composerJson?.['autoload-dev']?.['psr-4'],
	]
		.filter(Boolean)
		.flatMap((mapping) => Object.entries(mapping))
		.flatMap(([namespacePrefix, paths]) => {
			const pathList = Array.isArray(paths) ? paths : [paths];

			return pathList.map((basePath) => ({
				namespacePrefix: namespacePrefix.replace(/^\\+|\\+$/g, ''),
				basePath: normalizePath(String(basePath)),
			}));
		});
}

function resolvePsr4Namespace(composerJson, composerDirectory, filePath) {
	const normalizedComposerDirectory = normalizePath(composerDirectory);
	const normalizedFilePath = normalizePath(filePath);
	const mappings = getComposerPsr4Mappings(composerJson)
		.map((mapping) => ({
			...mapping,
			absoluteBasePath: path.posix.resolve(normalizedComposerDirectory, mapping.basePath),
		}))
		.sort((a, b) => b.absoluteBasePath.length - a.absoluteBasePath.length);

	for (const mapping of mappings) {
		const relativePath = path.posix.relative(mapping.absoluteBasePath, normalizedFilePath);

		if (relativePath === '..' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
			continue;
		}

		const relativeDirectory = path.posix.dirname(relativePath);
		const namespaceSuffix = relativeDirectory === '.'
			? ''
			: relativeDirectory.split('/').filter(Boolean).join('\\');

		return [mapping.namespacePrefix, namespaceSuffix].filter(Boolean).join('\\');
	}

	return undefined;
}

function getPhpNamespace(source) {
	return source.match(/^namespace\s+([^;{]+);/m)?.[1].trim();
}

function maskPhpCommentsAndStrings(source, preserveDocBlocks = false) {
	const masked = source.split('');
	let index = 0;

	function maskCharacter(position) {
		if (masked[position] !== '\n' && masked[position] !== '\r') {
			masked[position] = ' ';
		}
	}

	while (index < source.length) {
		const character = source[index];
		const nextCharacter = source[index + 1];

		if (character === '/' && nextCharacter === '/') {
			while (index < source.length && source[index] !== '\n') {
				maskCharacter(index++);
			}
			continue;
		}

		if (character === '#' && nextCharacter !== '[') {
			while (index < source.length && source[index] !== '\n') {
				maskCharacter(index++);
			}
			continue;
		}

		if (character === '/' && nextCharacter === '*') {
			if (preserveDocBlocks && source[index + 2] === '*') {
				index += 3;

				while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
					index++;
				}

				index += 2;
				continue;
			}

			maskCharacter(index++);
			maskCharacter(index++);

			while (index < source.length) {
				const atCommentEnd = source[index] === '*' && source[index + 1] === '/';

				maskCharacter(index++);

				if (atCommentEnd) {
					maskCharacter(index++);
					break;
				}
			}
			continue;
		}

		if (character === '\'' || character === '"' || character === '`') {
			const quote = character;
			maskCharacter(index++);

			while (index < source.length) {
				const atEscape = source[index] === '\\';
				const atQuoteEnd = source[index] === quote;

				maskCharacter(index++);

				if (atEscape && index < source.length) {
					maskCharacter(index++);
					continue;
				}

				if (atQuoteEnd) {
					break;
				}
			}
			continue;
		}

		index++;
	}

	return masked.join('');
}

function getPhpDeclaredTypes(source) {
	const declarations = [];
	const declarationPattern = /\b(?:abstract\s+|final\s+|readonly\s+)*(class|interface|trait|enum)\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/g;
	const searchableSource = maskPhpCommentsAndStrings(source);
	let match;

	while ((match = declarationPattern.exec(searchableSource)) !== null) {
		const beforeDeclaration = searchableSource.slice(Math.max(0, match.index - 32), match.index);

		if (match[1] === 'class' && /\bnew\s*$/.test(beforeDeclaration)) {
			continue;
		}

		const nameOffset = match.index + match[0].lastIndexOf(match[2]);

		declarations.push({
			kind: match[1],
			name: match[2],
			start: nameOffset,
			end: nameOffset + match[2].length,
		});
	}

	return declarations;
}

function replacePhpNamespace(source, newNamespace) {
	const namespacePattern = /^namespace\s+([^;{]+);/m;

	if (namespacePattern.test(source)) {
		return source.replace(namespacePattern, `namespace ${newNamespace};`);
	}

	const openTagMatch = source.match(/^<\?php\b/);

	if (!openTagMatch) {
		return source;
	}

	const eol = source.includes('\r\n') ? '\r\n' : '\n';
	const afterOpenTag = source.slice(openTagMatch[0].length);
	const declareMatch = afterOpenTag.match(/^\s*declare\s*\([^;]+\);/);
	const insertionOffset = openTagMatch[0].length + (declareMatch?.[0].length ?? 0);

	return `${source.slice(0, insertionOffset)}${eol}${eol}namespace ${newNamespace};${source.slice(insertionOffset)}`;
}

function buildPhpMovePlan(source, newNamespace) {
	const oldNamespace = getPhpNamespace(source);
	const declarations = getPhpDeclaredTypes(source);
	const replacements = oldNamespace
		? declarations.map((declaration) => ({
			oldFqn: `${oldNamespace}\\${declaration.name}`,
			newFqn: `${newNamespace}\\${declaration.name}`,
		}))
		: [];

	return {
		oldNamespace,
		newNamespace,
		declarations,
		replacements,
		updatedSource: replacePhpNamespace(source, newNamespace),
	};
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceGroupedPhpUseReference(source, oldFqn, newFqn) {
	const oldParts = oldFqn.split('\\');
	const oldName = oldParts.pop();
	const oldPrefix = oldParts.join('\\');
	const eol = source.includes('\r\n') ? '\r\n' : '\n';
	const groupUsePattern = /^([ \t]*)use\s+([^;{]+)\\\{([^}]+)\};[ \t]*\r?$/gm;

	return source.replace(groupUsePattern, (line, indentation, prefix, entriesSource) => {
		if (prefix.replace(/^\\/, '').trim() !== oldPrefix) {
			return line;
		}

		const entries = entriesSource.split(',').map((entry) => entry.trim()).filter(Boolean);
		const movedEntries = entries.filter((entry) => entry.split(/\s+as\s+/i)[0].trim() === oldName);

		if (movedEntries.length === 0) {
			return line;
		}

		const remainingEntries = entries.filter((entry) => !movedEntries.includes(entry));
		const aliasMatch = movedEntries[0].match(/\s+as\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)$/i);
		const movedUse = `${indentation}use ${newFqn}${aliasMatch ? ` as ${aliasMatch[1]}` : ''};`;

		if (remainingEntries.length === 0) {
			return movedUse;
		}

		return `${indentation}use ${prefix.trim()}\\{${remainingEntries.join(', ')}};${eol}${movedUse}`;
	});
}

function replaceExactPhpTypeReference(source, oldFqn, newFqn) {
	const pattern = new RegExp(
		`(^|[^A-Za-z0-9_\\\\])((?:\\\\)?${escapeRegExp(oldFqn)})(?![A-Za-z0-9_\\\\])`,
		'gm'
	);

	return source.replace(pattern, (match, prefix, reference) => {
		const leadingSlash = reference.startsWith('\\') ? '\\' : '';

		return `${prefix}${leadingSlash}${newFqn}`;
	});
}

function replacePhpTypeReferences(source, replacements) {
	return replacements.reduce(
		(updated, replacement) => replaceExactPhpTypeReference(
			replaceGroupedPhpUseReference(updated, replacement.oldFqn, replacement.newFqn),
			replacement.oldFqn,
			replacement.newFqn
		),
		source
	);
}

function getPhpUseImports(source) {
	const imports = new Map();
	const directUsePattern = /^use\s+(?!function\b|const\b)([^;{]+?)(?:\s+as\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*))?;[ \t]*\r?$/gm;
	let match;

	while ((match = directUsePattern.exec(source)) !== null) {
		const fqn = match[1].trim().replace(/^\\/, '');
		const shortName = match[2] ?? fqn.split('\\').pop();
		imports.set(shortName, fqn);
	}

	const groupUsePattern = /^use\s+([^;{]+)\\\{([^}]+)\};[ \t]*\r?$/gm;

	while ((match = groupUsePattern.exec(source)) !== null) {
		const prefix = match[1].trim().replace(/^\\/, '');

		for (const entry of match[2].split(',')) {
			const [name, alias] = entry.trim().split(/\s+as\s+/i);

			if (!name) {
				continue;
			}

			imports.set(alias ?? name, `${prefix}\\${name}`);
		}
	}

	return imports;
}

function getPhpPotentialTypeNames(source) {
	let searchableSource = maskPhpCommentsAndStrings(source, true);

	searchableSource = searchableSource
		.replace(/^namespace\s+[^;]+;/gm, (statement) => ' '.repeat(statement.length))
		.replace(/^use\s+[^;]+;/gm, (statement) => ' '.repeat(statement.length));

	const excludedNames = new Set([
		...getPhpDeclaredTypes(source).map((declaration) => declaration.name),
		...getPhpUseImports(source).keys(),
		'Self',
		'Static',
		'Parent',
	]);
	const typePattern = /(?<![A-Za-z0-9_\\$])([A-Z][A-Za-z0-9_]*)(?![A-Za-z0-9_\\])/g;
	const names = [];
	let match;

	while ((match = typePattern.exec(searchableSource)) !== null) {
		if (excludedNames.has(match[1]) || names.includes(match[1])) {
			continue;
		}

		names.push(match[1]);
	}

	return names;
}

function addPhpUseImports(source, fqns) {
	const existingImports = getPhpUseImports(source);
	const imports = [...new Set(fqns)]
		.filter((fqn) => {
			const shortName = fqn.split('\\').pop();

			return !existingImports.has(shortName);
		});

	if (imports.length === 0) {
		return source;
	}

	const eol = source.includes('\r\n') ? '\r\n' : '\n';
	const importBlock = imports.map((fqn) => `use ${fqn};`).join(eol);
	const usePattern = /^use\s+[^;]+;[ \t]*(?:\r?\n)?/gm;
	let lastUseMatch;
	let match;

	while ((match = usePattern.exec(source)) !== null) {
		lastUseMatch = match;
	}

	if (lastUseMatch) {
		const insertionOffset = lastUseMatch.index + lastUseMatch[0].length;

		return `${source.slice(0, insertionOffset)}${importBlock}${eol}${source.slice(insertionOffset)}`;
	}

	const namespaceMatch = /^namespace\s+[^;]+;[ \t]*(?:\r?\n)?/m.exec(source);

	if (!namespaceMatch) {
		return source;
	}

	const insertionOffset = namespaceMatch.index + namespaceMatch[0].length;

	return `${source.slice(0, insertionOffset)}${eol}${importBlock}${eol}${source.slice(insertionOffset)}`;
}

function ensureMovedTypeImports(source, oldNamespace, replacements) {
	if (getPhpNamespace(source) !== oldNamespace) {
		return source;
	}

	const potentialTypes = new Set(getPhpPotentialTypeNames(source));
	const imports = getPhpUseImports(source);
	const neededImports = [];

	for (const replacement of replacements) {
		const shortName = replacement.oldFqn.split('\\').pop();

		if (!potentialTypes.has(shortName)) {
			continue;
		}

		const existingImport = imports.get(shortName);

		if (existingImport && existingImport !== replacement.newFqn) {
			continue;
		}

		if (!existingImport) {
			neededImports.push(replacement.newFqn);
		}
	}

	return addPhpUseImports(source, neededImports);
}

module.exports = {
	addPhpUseImports,
	buildPhpMovePlan,
	ensureMovedTypeImports,
	getComposerPsr4Mappings,
	getPhpDeclaredTypes,
	getPhpNamespace,
	getPhpPotentialTypeNames,
	getPhpUseImports,
	replacePhpNamespace,
	replacePhpTypeReferences,
	resolvePsr4Namespace,
};
