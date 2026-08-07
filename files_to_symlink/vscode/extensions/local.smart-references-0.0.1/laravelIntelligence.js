'use strict';

// Laravel IDE-helper GENERATOR (command-driven, not a live provider).
//
// Why a command and not language providers: live Definition/Reference providers get auto-invoked by
// other features (e.g. the reference-count CodeLens) and, if they open documents or scan the
// workspace, trigger a global Intelephense re-analysis storm. This module never registers a
// provider. It runs ONLY when you invoke the command, reads files with vscode.workspace.fs
// (raw bytes — does NOT open editor documents, so Intelephense doesn't analyze them), and writes a
// single passive stub that Intelephense indexes like _ide_helper.php.
//
// What it generates into <root>/_ide_helper_manual.php:
//   1. @property-read tags for Eloquent accessors (getXAttribute / x(): Attribute) — so
//      $model->signature_count resolves WITHOUT editing model files (autosave can't revert it).
//   2. @method tags for Macroable registrations (Http::macro('facebookGraph', fn (): PendingRequest))
//      — so Http::facebookGraph() has a RETURN TYPE and the ->get() chained onto it resolves.
//   3. Restify fluent-builder return-type overrides (: self -> : static) — so usingRelation(),
//      description(), rules() etc. resolve through method chains (matches PhpStorm).
// Then it also refreshes the PhpStorm file icons (combining the two dev-helper commands).

const vscode = require('vscode');
const { findMacroRegistrations } = require('./laravelMacroNavigation');

const STUB_FILENAME = '_ide_helper_manual.php';
const MAX_FILES = 6000;
// Tests register macros too, but a macro that only exists inside a test case is not part of the
// application's surface and should not be offered everywhere in it.
const MACRO_SOURCE_GLOB = '{app,routes,bootstrap,database}/**/*.php';

// --------------------------------------------------------------------------------------
// Pure helpers (exported as _internal for unit tests — no vscode dependency).
// --------------------------------------------------------------------------------------

function ucfirst(value) {
	return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

function studlyToSnake(name) {
	return String(name)
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toLowerCase();
}

function getPhpNamespace(source) {
	return /^\s*namespace\s+([^;]+);/m.exec(source)?.[1]?.trim();
}

function getClassName(source) {
	return /\b(?:final\s+|abstract\s+|readonly\s+)*class\s+(\w+)/.exec(source)?.[1];
}

// Normalize a captured PHP return type into a valid PHPDoc type (drop leading backslash, keep ?).
function normalizeType(raw) {
	if (!raw) {
		return 'mixed';
	}
	const type = raw.trim().replace(/^\\/, '');
	return type || 'mixed';
}

// Extract Eloquent accessor magic-properties from a model's source. Returns [{name, type}].
// Handles classic getFooAttribute(): T and new-style foo(): Attribute.
function extractAccessorProperties(source) {
	const found = new Map();
	let match;

	// Classic accessor WITH a declared return type: public function getFooAttribute(): int
	const typedGetter = /function\s+get(\w+)Attribute\s*\([^)]*\)\s*:\s*(\??[A-Za-z0-9_\\|]+)/g;
	while ((match = typedGetter.exec(source)) !== null) {
		found.set(studlyToSnake(match[1]), normalizeType(match[2]));
	}

	// Classic accessor WITHOUT a return type: public function getFooAttribute()
	const untypedGetter = /function\s+get(\w+)Attribute\s*\(/g;
	while ((match = untypedGetter.exec(source)) !== null) {
		const name = studlyToSnake(match[1]);
		if (!found.has(name)) {
			found.set(name, 'mixed');
		}
	}

	// New-style Attribute accessor: public function displayName(): Attribute
	const attribute = /function\s+(\w+)\s*\([^)]*\)\s*:\s*\\?Attribute\b/g;
	while ((match = attribute.exec(source)) !== null) {
		const name = studlyToSnake(match[1]);
		if (!found.has(name)) {
			found.set(name, 'mixed');
		}
	}

	return [...found.entries()].map(([name, type]) => ({ name, type }));
}

// Render one model's partial-class stub block.
function renderModelBlock(namespace, className, properties) {
	const tags = properties.map((p) => ` * @property-read ${p.type} $${p.name}`).join('\n');
	return `namespace ${namespace} {\n    /**\n${tags}\n     */\n    class ${className} {}\n}`;
}

// --------------------------------------------------------------------------------------
// Macros: Http::macro('facebookGraph', fn (): PendingRequest => …) -> @method tags.
//
// A macro is installed on its class at runtime, so Intelephense types `Http::facebookGraph()` as
// nothing at all — and everything chained onto it, `->get('/me')` included, becomes unresolvable
// too. A `@method` tag on the receiving class restores the return type, which is what makes the rest
// of the chain navigable again.
// --------------------------------------------------------------------------------------

// `self`/`static`/`parent` in a macro closure name the class that REGISTERED the macro — usually a
// service provider — which is never what calling the macro returns. They degrade to mixed rather
// than pointing the IDE somewhere actively wrong.
const AMBIGUOUS_TYPES = new Set(['self', 'static', 'parent', '$this']);
const PHP_BUILTIN_TYPES = new Set([
	'array', 'bool', 'callable', 'false', 'float', 'int', 'iterable', 'mixed', 'never',
	'null', 'object', 'string', 'true', 'void',
]);

// Short name (lowercased) -> fully qualified name, from `use` statements. Grouped imports and
// aliases are both resolved; `use function` / `use const` are not class imports and are skipped.
function getPhpImports(source) {
	const imports = new Map();
	const pattern = /^[ \t]*use[ \t]+(?!function[ \t]|const[ \t])([^;]+);/gm;
	let match;

	while ((match = pattern.exec(String(source))) !== null) {
		const statement = match[1].replace(/\s+/g, ' ').trim();
		const grouped = /^(.+?)\\\{(.+)\}$/.exec(statement);
		const prefix = grouped ? grouped[1] : '';
		const entries = (grouped ? grouped[2] : statement).split(',');

		for (const entry of entries) {
			const aliased = /^(.+?)(?:\s+as\s+(\S+))?$/i.exec(entry.trim());

			if (!aliased) {
				continue;
			}

			const fqn = (prefix ? `${prefix}\\${aliased[1].trim()}` : aliased[1].trim()).replace(/^\\/, '');
			const alias = aliased[2] || fqn.split('\\').pop();

			if (fqn && alias) {
				imports.set(alias.toLowerCase(), fqn);
			}
		}
	}

	return imports;
}

// A class name as written in a file -> the fully qualified, leading-backslash form a stub in some
// other namespace can use. Builtin types are left alone; anything else falls back to the file's own
// namespace, which is how PHP resolves an unimported name.
function resolvePhpClassName(name, imports, namespace) {
	const trimmed = String(name).trim();

	if (trimmed.startsWith('\\')) {
		return trimmed;
	}

	if (PHP_BUILTIN_TYPES.has(trimmed.toLowerCase())) {
		return trimmed.toLowerCase();
	}

	if (AMBIGUOUS_TYPES.has(trimmed.toLowerCase())) {
		return 'mixed';
	}

	const [head, ...rest] = trimmed.split('\\');
	const imported = imports.get(head.toLowerCase());

	if (imported) {
		return `\\${[imported, ...rest].join('\\')}`;
	}

	return namespace ? `\\${namespace}\\${trimmed}` : `\\${trimmed}`;
}

// Resolve every member of a type expression — `?Foo`, `Foo|Bar`, `Foo&Bar` — independently.
function resolvePhpType(raw, imports, namespace) {
	if (!raw) {
		return 'mixed';
	}

	return String(raw)
		.split(/([|&])/)
		.map((part) => {
			if (part === '|' || part === '&') {
				return part;
			}

			const trimmed = part.trim();
			const nullable = trimmed.startsWith('?');

			return (nullable ? '?' : '') + resolvePhpClassName(nullable ? trimmed.slice(1) : trimmed, imports, namespace);
		})
		.join('');
}

// Split a parameter list on its top-level commas, so a default like `['a', 'b']` or `max(1, 2)`
// keeps its own.
function splitPhpParameters(parameters) {
	const text = String(parameters).trim();

	if (!text) {
		return [];
	}

	const parts = [];
	let depth = 0;
	let start = 0;

	for (let cursor = 0; cursor < text.length; cursor++) {
		const character = text[cursor];

		if (character === "'" || character === '"') {
			cursor++;
			while (cursor < text.length && text[cursor] !== character) {
				cursor += text[cursor] === '\\' ? 2 : 1;
			}
			continue;
		}

		if ('([{'.includes(character)) {
			depth++;
		} else if (')]}'.includes(character)) {
			depth--;
		} else if (character === ',' && depth === 0) {
			parts.push(text.slice(start, cursor));
			start = cursor + 1;
		}
	}

	parts.push(text.slice(start));

	return parts.map((part) => part.trim()).filter(Boolean);
}

const PARAMETER_PATTERN = /^(?:([?\\]*[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff\\|&?]*)\s+)?((?:&\s*)?(?:\.\.\.\s*)?\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)(?:\s*=\s*([\s\S]+))?$/;
const LITERAL_DEFAULT_PATTERN = /^(?:-?\d[\d_]*(?:\.\d+)?|'[^']*'|"[^"]*"|true|false|null|\[\s*\])$/i;

// One closure parameter, rewritten so it means the same thing inside the stub's namespace. A default
// that is not a literal — `MetaService::GRAPH_BASE`, say — would resolve against the STUB's namespace
// and name something that does not exist there, so only its optionality is kept.
function renderMacroParameter(parameter, imports, namespace) {
	const match = PARAMETER_PATTERN.exec(parameter);

	if (!match) {
		return undefined;
	}

	const type = match[1] ? `${resolvePhpType(match[1], imports, namespace)} ` : '';
	const variable = match[2].replace(/\s+/g, '');
	const rawDefault = match[3] && match[3].trim();
	const value = rawDefault === undefined || rawDefault === ''
		? ''
		: ` = ${LITERAL_DEFAULT_PATTERN.test(rawDefault) ? rawDefault : 'null'}`;

	return `${type}${variable}${value}`;
}

// A parameter list this transformer cannot read in full is replaced wholesale by a variadic, so the
// tag stays permissive instead of inventing an arity that would be reported as a wrong-argument-count
// error at every call site.
function renderMacroParameters(parameters, imports, namespace) {
	const rendered = splitPhpParameters(parameters).map((parameter) =>
		renderMacroParameter(parameter, imports, namespace));

	return rendered.every(Boolean) ? rendered.join(', ') : 'mixed ...$arguments';
}

// The macros one file registers, described in terms a stub can declare. Registrations whose receiver
// is a variable are skipped: `$factory->macro(…)` names no class to hang the tag on.
function extractMacroMethods(source) {
	const text = String(source);
	const imports = getPhpImports(text);
	const namespace = getPhpNamespace(text);

	return findMacroRegistrations(text)
		.filter((registration) => registration.receiver)
		.map((registration) => ({
			class: resolvePhpClassName(registration.receiver, imports, namespace).replace(/^\\/, ''),
			name: registration.name,
			returnType: registration.returnType
				? resolvePhpType(registration.returnType, imports, namespace)
				: 'mixed',
			parameters: registration.parameters === undefined
				? 'mixed ...$arguments'
				: renderMacroParameters(registration.parameters, imports, namespace),
		}))
		.filter((method) => method.class.includes('\\'));
}

// Render one macro receiver's partial-class stub block.
//
// Both call styles are declared for every macro because `Macroable` genuinely answers both:
// `__callStatic` forwards `Http::facebookGraph()` and `__call` forwards `$collection->pluckDeep()`,
// and which one a project uses depends on the class, not on the registration. Emitting one form
// would make the IDE guess, and guessing wrong reintroduces exactly the unresolved call this is
// meant to fix.
function renderMacroBlock(namespace, className, methods) {
	const tags = methods
		.flatMap((method) => [
			` * @method static ${method.returnType} ${method.name}(${method.parameters})`,
			` * @method ${method.returnType} ${method.name}(${method.parameters})`,
		])
		.join('\n');

	return `namespace ${namespace} {\n    /**\n${tags}\n     */\n    class ${className} {}\n}`;
}

// Group macros by the class they are installed on, keeping the first registration of each name so
// the stub matches where Cmd+B navigates.
function groupMacroMethods(methods) {
	const byClass = new Map();

	for (const method of methods) {
		const separator = method.class.lastIndexOf('\\');
		const key = method.class;

		if (!byClass.has(key)) {
			byClass.set(key, {
				namespace: method.class.slice(0, separator),
				className: method.class.slice(separator + 1),
				methods: [],
			});
		}

		const group = byClass.get(key);

		if (!group.methods.some((existing) => existing.name === method.name)) {
			group.methods.push(method);
		}
	}

	return [...byClass.values()];
}

// Curated Restify overrides: redeclare the fluent methods that vendor types as ` : self` (or
// @return self) with ` : static`, so the concrete filter/field type survives the chain. Partial
// classes/traits are merged with vendor per intelephense.com/docs; user decls win on clash.
const RESTIFY_OVERRIDES = `namespace Binaryk\\LaravelRestify\\Filters {
    abstract class Filter {
        public function setColumn(string $column): static { return $this; }
        public function setType(string $type): static { return $this; }
        public function setRelatedRepositoryKey(string $key): static { return $this; }
        public function setRelatedRepositoryTitle(string $title): static { return $this; }
        public function setRepository($repository): static { return $this; }
        public function setTitle(string $title): static { return $this; }
        public function setAdvanced(bool $advanced = true): static { return $this; }
        public function dd(): static { return $this; }
        public function setPlaceholder(string $placeholder): static { return $this; }
        public function setDescription(string $description): static { return $this; }
    }
}

namespace Binaryk\\LaravelRestify\\Fields {
    class Field {
        public function description(string|callable|\\Closure $callback): static { return $this; }
        public function toolSchema(callable|\\Closure $callback): static { return $this; }
    }
}

namespace Binaryk\\LaravelRestify\\Traits {
    trait ProxiesCanSeeToGate {
        public function canSeeWhen(string $ability, ?array $arguments = []): static { return $this; }
    }
}`;

function buildStubContent(models, macroMethods = []) {
	const header = `<?php

/**
 * AUTO-GENERATED IDE helper — do not edit by hand.
 *
 * Written by the "Laravel: Refresh IDE Helpers & Icons" command (local.smart-references).
 * IDE-ONLY: this file is never autoloaded or executed. It declares Eloquent accessor
 * magic-properties, Macroable macro signatures, and Restify fluent-builder return-type overrides so
 * Intelephense resolves them without editing your models or vendor code. Re-run the command after
 * adding an accessor or a macro.
 * Safe to delete: it only affects the editor. See https://intelephense.com/docs (symbol overrides).
 */`;

	const modelBlocks = models
		.filter((model) => model.properties.length)
		.map((model) => renderModelBlock(model.namespace, model.className, model.properties));

	const macroBlocks = groupMacroMethods(macroMethods)
		.map((group) => renderMacroBlock(group.namespace, group.className, group.methods));

	return [header, ...modelBlocks, ...macroBlocks, RESTIFY_OVERRIDES].join('\n\n') + '\n';
}

// --------------------------------------------------------------------------------------
// vscode-coupled: scanning + generation (uses workspace.fs — never opens editor documents).
// --------------------------------------------------------------------------------------

async function readFileText(uri) {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return Buffer.from(bytes).toString('utf8');
	} catch (error) {
		return undefined;
	}
}

// Scan app/ for Eloquent models exposing accessors. Returns [{namespace, className, properties}].
async function scanModelsForAccessors(progress) {
	const files = await vscode.workspace.findFiles(
		'app/**/*.php',
		'{**/vendor/**,**/node_modules/**,**/storage/**,**/bootstrap/cache/**}',
		MAX_FILES,
	);
	const models = [];
	let scanned = 0;
	for (const uri of files) {
		scanned++;
		if (scanned % 200 === 0 && progress) {
			progress.report({ message: `scanned ${scanned}/${files.length} files…` });
		}
		const source = await readFileText(uri);
		// Cheap pre-filter: only files that could contain an accessor.
		if (!source || !source.includes('Attribute')) {
			continue;
		}
		const properties = extractAccessorProperties(source);
		if (!properties.length) {
			continue;
		}
		const namespace = getPhpNamespace(source);
		const className = getClassName(source);
		if (namespace && className) {
			models.push({ namespace, className, properties });
		}
	}
	return models;
}

// Scan first-party source for Macroable registrations. Returns the flat method list, in file order,
// so the first registration of a name is the one that reaches the stub.
async function scanMacroRegistrations(progress) {
	const files = await vscode.workspace.findFiles(
		MACRO_SOURCE_GLOB,
		'{**/vendor/**,**/node_modules/**,**/storage/**,**/bootstrap/cache/**,**/_ide_helper*.php}',
		MAX_FILES,
	);
	const methods = [];
	let scanned = 0;

	for (const uri of files) {
		scanned++;
		if (scanned % 200 === 0 && progress) {
			progress.report({ message: `scanned ${scanned}/${files.length} files for macros…` });
		}
		const source = await readFileText(uri);
		// Cheap pre-filter: a registration always spells the method out.
		if (!source || !source.includes('macro')) {
			continue;
		}
		methods.push(...extractMacroMethods(source));
	}

	return methods;
}

async function generateHelperStub(progress) {
	const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	if (!folder) {
		throw new Error('Open a workspace folder first.');
	}
	const models = await scanModelsForAccessors(progress);
	progress?.report({ message: 'scanning for Macroable registrations…' });
	const macroMethods = await scanMacroRegistrations(progress);
	const content = buildStubContent(models, macroMethods);
	const stubUri = vscode.Uri.joinPath(folder.uri, STUB_FILENAME);
	await vscode.workspace.fs.writeFile(stubUri, Buffer.from(content, 'utf8'));

	const propertyCount = models.reduce((total, model) => total + model.properties.length, 0);
	const macroCount = groupMacroMethods(macroMethods)
		.reduce((total, group) => total + group.methods.length, 0);

	return { stubUri, modelCount: models.length, propertyCount, macroCount };
}

// --------------------------------------------------------------------------------------
// The command.
// --------------------------------------------------------------------------------------

async function refreshLaravelHelpers() {
	try {
		const result = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Refreshing Laravel IDE helpers', cancellable: false },
			async (progress) => {
				progress.report({ message: 'scanning models for accessors…' });
				const generated = await generateHelperStub(progress);

				// Combine with the existing PhpStorm icon refresh, if that extension is present.
				progress.report({ message: 'refreshing PhpStorm file icons…' });
				try {
					await vscode.commands.executeCommand('phpstormProjectIcons.refresh');
				} catch (error) {
					// icon extension not installed / command unavailable — ignore.
				}
				return generated;
			},
		);

		const choice = await vscode.window.showInformationMessage(
			`IDE helpers refreshed: ${result.propertyCount} accessor propert${result.propertyCount === 1 ? 'y' : 'ies'} across ${result.modelCount} model(s), ${result.macroCount} macro(s) + Restify type overrides → ${STUB_FILENAME}. Reload if types don't update.`,
			'Reload Window',
			'Open stub',
		);
		if (choice === 'Reload Window') {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		} else if (choice === 'Open stub') {
			await vscode.window.showTextDocument(result.stubUri);
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Laravel IDE helpers: ${error && error.message ? error.message : error}`);
	}
}

function register(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('smartReferences.refreshLaravelHelpers', refreshLaravelHelpers),
	);
}

module.exports = {
	register,
	// Exposed for unit tests (pure, no vscode dependency).
	_internal: {
		ucfirst,
		studlyToSnake,
		getPhpNamespace,
		getClassName,
		normalizeType,
		extractAccessorProperties,
		renderModelBlock,
		buildStubContent,
		getPhpImports,
		resolvePhpType,
		splitPhpParameters,
		renderMacroParameters,
		extractMacroMethods,
		groupMacroMethods,
		renderMacroBlock,
		RESTIFY_OVERRIDES,
	},
};
