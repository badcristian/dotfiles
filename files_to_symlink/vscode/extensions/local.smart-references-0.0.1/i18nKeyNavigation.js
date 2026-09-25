'use strict';

// Both directions for a vue-i18n key: Cmd+B on `"intro"` in a locale file lists the
// `t('interface.intro')` call sites, and Cmd+B inside that `t('...')` opens the key in each locale file.
//
// Why this exists: nothing registers a reference provider for JSON. VS Code's built-in JSON
// language service offers completion, validation and symbols, but no references, so the
// `editorHasReferenceProvider` clause on the Cmd+B binding is false and the key does nothing at
// all in a `.json` document — not "no results", no command. The extension's existing translation
// support runs the opposite direction and is Laravel-shaped: it recognises a key only inside
// `__()`, `trans()`, `trans_choice()` or `Lang::get()`, and it searches `**/lang/**`. A vue-i18n
// key living in `resources/js/i18n/locales/ro.json` is neither.
//
// The leaf name is not the key. `"intro"` appears twice in the file that prompted this, under
// `interface` and under `lab`, so the JSON ancestry has to be walked to build `interface.intro`
// before anything can be searched for. That walk is this file's real work.
//
// Cost control, per the lesson recorded for the Laravel helpers: the workspace scan runs only
// after a key path was resolved at the cursor, and reference providers are consulted on an
// explicit request rather than on a keystroke. A cursor sitting on a value, a bracket or
// whitespace resolves to nothing and returns before any file is opened.

const vscode = require('vscode');

const USAGE_GLOB = '**/*.{vue,ts,js,mts,cts,tsx,jsx}';
const USAGE_EXCLUDE = '{**/{.git,node_modules,vendor,dist,build,coverage,public/build}/**,**/*.d.ts}';
const MAX_USAGE_FILES = 2000;
const FILE_SCAN_BATCH_SIZE = 40;

// Measured across ~/dev: resources/js/i18n/locales, src/locales, src/i18n. Laravel's `lang/` belongs to
// `__()`, not `t()`.
const LOCALE_GLOB = '**/{locales,i18n}/**/*.json';
const MAX_LOCALE_FILES = 50;
const DEFINITION_LANGUAGES = ['vue', 'typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

// vue-i18n's call family - t, $t, tc, te, tm - bare or qualified like `i18n.global.t`. The leading
// boundary keeps `format(` from reading as `t(`.
const I18N_CALL_PREFIX = '(?:^|[^A-Za-z0-9_$])(?:[A-Za-z0-9_$]+\\s*\\.\\s*)*\\$?t[cem]?\\s*\\(\\s*';

// --------------------------------------------------------------------------------------
// Pure helpers (exported as _internal for unit tests — no vscode dependency).
// --------------------------------------------------------------------------------------

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whitespace plus both comment forms, so a .jsonc locale file walks the same as a .json one.
function skipTrivia(text, index) {
	let i = index;

	while (i < text.length) {
		const ch = text[i];

		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i++;
			continue;
		}

		if (ch === '/' && text[i + 1] === '/') {
			i += 2;
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

		break;
	}

	return i;
}

// `start` points at the opening quote. Returns the span including both quotes, so a cursor resting
// on a quote character still counts as being on the key.
function readJsonString(text, start) {
	let i = start + 1;

	while (i < text.length) {
		const ch = text[i];

		if (ch === '\\') {
			i += 2;
			continue;
		}

		if (ch === '"') {
			return { start, end: i + 1, raw: text.slice(start, i + 1) };
		}

		i++;
	}

	return undefined;
}

function decodeJsonString(raw) {
	try {
		return JSON.parse(raw);
	} catch (error) {
		return raw.slice(1, -1);
	}
}

// `visit(keyPath, literal)` per object key, in document order; a truthy return stops the walk. Array
// elements contribute their index to the path, which is how vue-i18n addresses list entries.
function walkJsonKeys(source, visit) {
	const text = String(source);
	const path = [];
	const stack = [];
	let pendingSegment;
	let i = 0;

	while (i < text.length) {
		i = skipTrivia(text, i);

		if (i >= text.length) {
			break;
		}

		const ch = text[i];

		if (ch === '{' || ch === '[') {
			stack.push({ kind: ch === '{' ? 'object' : 'array', index: 0, segment: pendingSegment });

			if (pendingSegment !== undefined) {
				path.push(pendingSegment);
			}

			pendingSegment = ch === '[' ? '0' : undefined;
			i++;
			continue;
		}

		if (ch === '}' || ch === ']') {
			const frame = stack.pop();

			if (frame && frame.segment !== undefined) {
				path.pop();
			}

			pendingSegment = undefined;
			i++;
			continue;
		}

		if (ch === ',') {
			const frame = stack[stack.length - 1];

			if (frame && frame.kind === 'array') {
				frame.index++;
				pendingSegment = String(frame.index);
			} else {
				pendingSegment = undefined;
			}

			i++;
			continue;
		}

		if (ch === '"') {
			const literal = readJsonString(text, i);

			if (!literal) {
				return;
			}

			const frame = stack[stack.length - 1];
			const isKey = Boolean(frame)
				&& frame.kind === 'object'
				&& text[skipTrivia(text, literal.end)] === ':';

			if (isKey) {
				const name = decodeJsonString(literal.raw);

				if (visit([...path, name].join('.'), literal)) {
					return;
				}

				pendingSegment = name;
			}

			i = literal.end;
			continue;
		}

		i++;
	}
}

// The dotted path of the key the offset falls on. Undefined for anything that is not a key — a value,
// a delimiter, whitespace.
function getJsonKeyPathAtOffset(source, offset) {
	const target = Number(offset);

	if (!Number.isFinite(target) || target < 0) {
		return undefined;
	}

	let found;

	// A key starting past the offset ends the search; a large locale file is not walked to its end.
	walkJsonKeys(source, (keyPath, literal) => {
		if (literal.start > target) {
			return true;
		}

		if (target <= literal.end) {
			found = keyPath;
			return true;
		}

		return false;
	});

	return found;
}

// Key-literal offsets, quotes excluded, wherever `keyPath` is declared. Joined-path equality matches
// nested `{"a": {"b"}}` and flat `{"a.b"}` alike, and vue-i18n reads both.
function getJsonKeyRanges(source, keyPath) {
	const ranges = [];

	walkJsonKeys(source, (candidate, literal) => {
		if (candidate === keyPath) {
			ranges.push({ start: literal.start + 1, end: literal.end - 1 });
		}
	});

	return ranges;
}

// Offsets of the key literal inside every translation call for `keyPath`, in single quotes, double
// quotes or backticks.
function getI18nUsageRanges(source, keyPath) {
	const text = String(source);
	const key = String(keyPath || '');

	if (!key) {
		return [];
	}

	const pattern = new RegExp(
		I18N_CALL_PREFIX
		+ '([\'"`])'
		+ escapeRegExp(key)
		+ '(?=\\1)',
		'g',
	);

	const ranges = [];
	let match;

	while ((match = pattern.exec(text)) !== null) {
		const end = match.index + match[0].length;
		ranges.push({ start: end - key.length, end });
	}

	return ranges;
}

// Key of the translation call whose literal holds `offset`, quotes included. A template literal with
// `${` is built at runtime, so no single locale entry defines it.
function getI18nKeyAtOffset(source, offset) {
	const text = String(source);
	const pattern = new RegExp(I18N_CALL_PREFIX + '([\'"`])((?:\\\\.|(?!\\1)[^\\\\\\n])*)\\1', 'g');
	let match;

	while ((match = pattern.exec(text)) !== null) {
		const end = match.index + match[0].length;

		if (offset < end - match[2].length - 2) {
			return undefined;
		}

		if (offset <= end) {
			return match[1] === '`' && match[2].includes('${')
				? undefined
				: match[2].replace(/\\(.)/g, '$1');
		}
	}

	return undefined;
}

// --------------------------------------------------------------------------------------
// vscode-coupled: the providers.
// --------------------------------------------------------------------------------------

function positionFromOffset(source, offset) {
	const before = source.slice(0, offset);
	const lines = before.split('\n');

	return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
}

function rangeFromOffsets(source, start, end) {
	return new vscode.Range(positionFromOffset(source, start), positionFromOffset(source, end));
}

async function tryReadWorkspaceText(uri) {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return Buffer.from(bytes).toString('utf8');
	} catch (error) {
		return undefined;
	}
}

const referenceProvider = {
	async provideReferences(document, position) {
		const keyPath = getJsonKeyPathAtOffset(document.getText(), document.offsetAt(position));

		if (!keyPath) {
			return undefined;
		}

		const files = await vscode.workspace.findFiles(USAGE_GLOB, USAGE_EXCLUDE, MAX_USAGE_FILES);
		const locations = [];

		for (let start = 0; start < files.length; start += FILE_SCAN_BATCH_SIZE) {
			const batch = files.slice(start, start + FILE_SCAN_BATCH_SIZE);
			const texts = await Promise.all(batch.map((uri) => tryReadWorkspaceText(uri)));

			for (let index = 0; index < batch.length; index++) {
				const text = texts[index];

				if (text === undefined) {
					continue;
				}

				for (const range of getI18nUsageRanges(text, keyPath)) {
					locations.push(new vscode.Location(
						batch[index],
						rangeFromOffsets(text, range.start, range.end),
					));
				}
			}
		}

		return locations;
	},
};

// Cmd+hover asks too, so the glob waits until the cursor is inside a `t('...')` literal.
const definitionProvider = {
	async provideDefinition(document, position) {
		const key = getI18nKeyAtOffset(document.getText(), document.offsetAt(position));
		const folder = key && vscode.workspace.getWorkspaceFolder(document.uri);

		if (!folder) {
			return undefined;
		}

		const files = await vscode.workspace.findFiles(
			new vscode.RelativePattern(folder, LOCALE_GLOB),
			USAGE_EXCLUDE,
			MAX_LOCALE_FILES,
		);
		// findFiles has no order. Sorted, the first definition - the one Cmd+B opens - is stable.
		files.sort((a, b) => a.path.localeCompare(b.path));

		const texts = await Promise.all(files.map((uri) => tryReadWorkspaceText(uri)));
		const locations = [];

		for (let index = 0; index < files.length; index++) {
			const text = texts[index];

			if (text === undefined) {
				continue;
			}

			for (const range of getJsonKeyRanges(text, key)) {
				locations.push(new vscode.Location(
					files[index],
					rangeFromOffsets(text, range.start, range.end),
				));
			}
		}

		return locations;
	},
};

function register(context) {
	context.subscriptions.push(
		vscode.languages.registerReferenceProvider(
			[
				{ language: 'json', scheme: 'file' },
				{ language: 'jsonc', scheme: 'file' },
			],
			referenceProvider,
		),
		vscode.languages.registerDefinitionProvider(
			DEFINITION_LANGUAGES.map((language) => ({ language, scheme: 'file' })),
			definitionProvider,
		),
	);
}

module.exports = {
	register,
	_internal: {
		skipTrivia,
		readJsonString,
		getJsonKeyPathAtOffset,
		getJsonKeyRanges,
		getI18nUsageRanges,
		getI18nKeyAtOffset,
	},
};
