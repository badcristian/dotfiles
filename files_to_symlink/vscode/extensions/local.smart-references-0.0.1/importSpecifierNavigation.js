'use strict';

const path = require('path');

// Static imports, re-exports, and `import(...)` expressions.
//
// Dynamic `import(...)` was excluded when this file was written, on the grounds that Cmd+B there is
// the language service's responsibility. That premise does not hold for a `.vue` target. Asked to
// resolve `@/layout/AppShell.vue` from `resources/js/App.vue`, the project's own TypeScript 6.0.3
// maps the alias correctly and then looks for `AppShell.d.vue.ts`, `AppShell.vue.ts`,
// `AppShell.vue.tsx` and `AppShell.vue.d.ts` — never the `.vue` file that is sitting there. The
// language service cannot answer, so declining to answer here left the key doing nothing at all.
//
// Package specifiers are still refused: those resolve through node_modules, which the language
// service does handle.
const STATIC_IMPORT_SPECIFIER_PATTERN = /\b(?:import|export)\s+(?:type\s+)?(?:(?:[\w*$\s{},]+?)\s+from\s+)?(['"])([^'"\r\n]+)\1/g;
// `\bimport\s*\(` keeps `importSomething(` out, since that has no parenthesis after `import`.
const DYNAMIC_IMPORT_SPECIFIER_PATTERN = /\bimport\s*\(\s*(['"`])([^'"`\r\n]+)\1/g;
const IMPORT_CANDIDATE_SUFFIXES = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.vue',
	'/index.ts',
	'/index.tsx',
	'/index.js',
	'/index.jsx',
	'/index.vue',
];

function findImportSpecifierAtOffset(source, offset) {
	const text = String(source || '');
	const position = Number(offset);

	if (!Number.isInteger(position) || position < 0 || position > text.length) {
		return undefined;
	}

	for (const pattern of [STATIC_IMPORT_SPECIFIER_PATTERN, DYNAMIC_IMPORT_SPECIFIER_PATTERN]) {
		for (const match of text.matchAll(pattern)) {
			const specifier = match[2];
			const start = match.index + match[0].lastIndexOf(specifier);
			const end = start + specifier.length;

			// Include both quote characters, because Cmd+B is often invoked immediately after the path.
			if (position >= start - 1 && position <= end) {
				return { specifier, start, end };
			}
		}
	}

	return undefined;
}

// A tsconfig is JSONC in practice — the one that prompted this carries a three-line comment above
// its `paths` — so it cannot go straight to JSON.parse.
function stripJsonComments(text) {
	let out = '';
	let i = 0;

	while (i < text.length) {
		const ch = text[i];

		if (ch === '"') {
			let end = i + 1;

			while (end < text.length) {
				if (text[end] === '\\') {
					end += 2;
					continue;
				}
				if (text[end] === '"') {
					end++;
					break;
				}
				end++;
			}

			out += text.slice(i, end);
			i = end;
			continue;
		}

		if (ch === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') {
				i++;
			}
			continue;
		}

		if (ch === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
				i++;
			}
			i += 2;
			continue;
		}

		out += ch;
		i++;
	}

	return out;
}

function parseJsonc(text) {
	try {
		return JSON.parse(stripJsonComments(String(text)).replace(/,(\s*[}\]])/g, '$1'));
	} catch (error) {
		return undefined;
	}
}

// The alias table from a tsconfig/jsconfig `compilerOptions.paths`, resolved to absolute
// directories. Without `baseUrl` the targets are relative to the config file, which is the TS 5+
// behaviour and what the project that prompted this relies on: TypeScript 6 deprecates `baseUrl`.
// `extends` is not followed - a project that inherits its `paths` from a preset falls back to the
// `src/` assumption, which is what this did for every project before.
function getPathAliases(configText, configDir) {
	const config = parseJsonc(configText);
	const options = config && config.compilerOptions;
	const paths = options && options.paths;

	if (!paths || typeof paths !== 'object') {
		return [];
	}

	const base = options.baseUrl ? path.resolve(configDir, options.baseUrl) : configDir;
	const aliases = [];

	for (const [key, targets] of Object.entries(paths)) {
		if (!Array.isArray(targets) || targets.length === 0) {
			continue;
		}

		const wildcard = key.endsWith('/*');
		const prefix = wildcard ? key.slice(0, -1) : key;
		const roots = targets
			.filter((target) => typeof target === 'string')
			.map((target) => path.resolve(base, wildcard ? target.replace(/\/\*$/, '') : target));

		if (roots.length > 0) {
			aliases.push({ prefix, roots, wildcard });
		}
	}

	// Longest prefix first, so `@/components/` is preferred over a broader `@/`.
	return aliases.sort((a, b) => b.prefix.length - a.prefix.length);
}

function resolveImportSpecifierCandidates(specifier, fileDir, srcRoot, aliases = []) {
	const spec = String(specifier || '');
	const bases = [];

	for (const alias of aliases) {
		if (alias.wildcard && spec.startsWith(alias.prefix)) {
			const rest = spec.slice(alias.prefix.length);
			bases.push(...alias.roots.map((root) => path.join(root, rest)));
			break;
		}

		if (!alias.wildcard && spec === alias.prefix) {
			bases.push(...alias.roots);
			break;
		}
	}

	if (bases.length === 0) {
		if (spec.startsWith('@/')) {
			bases.push(path.join(srcRoot, spec.slice(2)));
		} else if (spec.startsWith('./') || spec.startsWith('../')) {
			bases.push(path.resolve(fileDir, spec));
		} else {
			return [];
		}
	}

	const candidates = [];

	for (const base of bases) {
		if (/\.(?:vue|[cm]?[jt]sx?)$/.test(base)) {
			candidates.push(base);
			continue;
		}

		candidates.push(...IMPORT_CANDIDATE_SUFFIXES.map((suffix) => base + suffix));
	}

	return candidates;
}

module.exports = {
	findImportSpecifierAtOffset,
	resolveImportSpecifierCandidates,
	getPathAliases,
	parseJsonc,
};
