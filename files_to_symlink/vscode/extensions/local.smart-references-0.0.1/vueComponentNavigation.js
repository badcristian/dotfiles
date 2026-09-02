'use strict';

// Vue component GO-TO-DEFINITION for `<DashboardPage />` and the identifier that registers it.
//
// Why this exists: TypeScript resolves a module specifier by trying .ts/.tsx/.d.ts/.js — never .vue,
// and no compiler option adds it. Vite does resolve it (`resolve.extensions` includes .vue), so
// `import("@/modules/.../DashboardPage")` builds fine and only the tooling is blind. In
// construction-frontend 1655 of 4319 component imports are written that way, so Cmd+B on the tag
// reports "No other references found" for roughly two in five components. Adding the extension to
// the source would fix it, and is the upstream advice, but that is 1655 edits in a shared repo.
//
// This resolves the same specifier the way the bundler does, from the editor side only: read the
// binding out of the file already on screen, append the extensions TypeScript refuses to try, and
// return whichever candidate exists on disk.
//
// Cost control, per the lesson recorded for the Laravel helpers: this provider never opens editor
// documents and never scans the workspace on a keystroke. It reads the current document's text,
// which is already in memory, and stats a handful of candidate paths. The one workspace lookup is a
// last-resort filename glob, and only runs when the file declares no matching binding at all.

const vscode = require('vscode');
const path = require('path');

// The order matters: a specifier that resolves to both `Foo.vue` and `Foo.js` is a component here,
// because the caller used it in a template. `/index.vue` covers directory-style component folders.
const CANDIDATE_SUFFIXES = ['.vue', '/index.vue', '.ts', '.js', '/index.ts', '/index.js'];

// --------------------------------------------------------------------------------------
// Pure helpers (exported as _internal for unit tests — no vscode dependency).
// --------------------------------------------------------------------------------------

// `<dashboard-page />` and `<DashboardPage />` are the same component. Templates may use either,
// while the binding in <script> is always the PascalCase one.
function toPascalCase(name) {
	return String(name)
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');
}

// A component reference is an identifier, so anything with a dot, slash or space is something else
// (`v-if`, an attribute value, a member expression) and must not be chased.
function isComponentLikeName(word) {
	return /^[A-Za-z][A-Za-z0-9_-]*$/.test(String(word || ''));
}

// The module specifier bound to `name` in this file. Covers the three ways a Vue 2 SFC names a
// component: a static import, an async arrow, and defineAsyncComponent.
function findImportSpecifier(source, name) {
	const text = String(source);
	const id = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const patterns = [
		// import DashboardPage from "@/..."
		new RegExp(`import\\s+${id}\\s*(?:,[^;]*?)?\\s+from\\s*["']([^"']+)["']`),
		// const DashboardPage = () => import("@/...")
		new RegExp(`\\b${id}\\s*=\\s*\\(\\s*\\)\\s*=>\\s*import\\s*\\(\\s*["']([^"']+)["']`),
		// const DashboardPage = defineAsyncComponent(() => import("@/..."))
		new RegExp(`\\b${id}\\s*=\\s*defineAsyncComponent\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*import\\s*\\(\\s*["']([^"']+)["']`),
	];

	for (const pattern of patterns) {
		const match = pattern.exec(text);
		if (match) {
			return match[1];
		}
	}

	return undefined;
}

// Absolute candidate paths for a specifier, most likely first. `@/` is the alias this project maps
// to src/ through tsconfig `paths`; anything not alias- or dot-prefixed is a package, not ours.
function resolveSpecifierCandidates(specifier, fileDir, srcRoot) {
	const spec = String(specifier || '');
	let base;

	if (spec.startsWith('@/')) {
		base = path.join(srcRoot, spec.slice(2));
	} else if (spec.startsWith('./') || spec.startsWith('../')) {
		base = path.resolve(fileDir, spec);
	} else {
		return [];
	}

	// An explicit extension is already resolvable by everything; offer it unchanged and stop.
	if (/\.(vue|ts|js|tsx|jsx|mjs|cjs)$/.test(base)) {
		return [base];
	}

	return CANDIDATE_SUFFIXES.map((suffix) => base + suffix);
}

// --------------------------------------------------------------------------------------
// vscode-coupled: the provider.
// --------------------------------------------------------------------------------------

async function firstExisting(candidates) {
	for (const candidate of candidates) {
		try {
			const uri = vscode.Uri.file(candidate);
			const stat = await vscode.workspace.fs.stat(uri);
			if (stat.type === vscode.FileType.File) {
				return uri;
			}
		} catch (error) {
			// not on disk — try the next candidate.
		}
	}
	return undefined;
}

const provider = {
	async provideDefinition(document, position) {
		const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9_-]*/);
		if (!wordRange) {
			return undefined;
		}

		const word = document.getText(wordRange);
		if (!isComponentLikeName(word)) {
			return undefined;
		}

		const source = document.getText();
		const folder = vscode.workspace.getWorkspaceFolder(document.uri);
		if (!folder) {
			return undefined;
		}

		const srcRoot = path.join(folder.uri.fsPath, 'src');
		const fileDir = path.dirname(document.uri.fsPath);

		// The binding may be written in either case; the template may use the other.
		const specifier = findImportSpecifier(source, word) || findImportSpecifier(source, toPascalCase(word));

		if (specifier) {
			const target = await firstExisting(resolveSpecifierCandidates(specifier, fileDir, srcRoot));
			if (target) {
				return new vscode.Location(target, new vscode.Position(0, 0));
			}
			return undefined;
		}

		// No binding in this file: the component is registered globally somewhere. A single filename
		// glob is cheap and is the only workspace lookup here.
		const pascal = toPascalCase(word);
		const found = await vscode.workspace.findFiles(`src/**/${pascal}.vue`, '**/node_modules/**', 2);
		if (found.length === 1) {
			return new vscode.Location(found[0], new vscode.Position(0, 0));
		}

		return undefined;
	},
};

function register(context) {
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			[
				{ language: 'vue', scheme: 'file' },
				{ language: 'javascript', scheme: 'file' },
				{ language: 'typescript', scheme: 'file' },
			],
			provider,
		),
	);
}

module.exports = {
	register,
	_internal: {
		toPascalCase,
		isComponentLikeName,
		findImportSpecifier,
		resolveSpecifierCandidates,
		CANDIDATE_SUFFIXES,
	},
};
