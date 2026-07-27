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
//   2. Restify fluent-builder return-type overrides (: self -> : static) — so usingRelation(),
//      description(), rules() etc. resolve through method chains (matches PhpStorm).
// Then it also refreshes the PhpStorm file icons (combining the two dev-helper commands).

const vscode = require('vscode');

const STUB_FILENAME = '_ide_helper_manual.php';
const MAX_FILES = 6000;

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

function buildStubContent(models) {
	const header = `<?php

/**
 * AUTO-GENERATED IDE helper — do not edit by hand.
 *
 * Written by the "Laravel: Refresh IDE Helpers & Icons" command (local.smart-references).
 * IDE-ONLY: this file is never autoloaded or executed. It declares Eloquent accessor
 * magic-properties and Restify fluent-builder return-type overrides so Intelephense resolves them
 * without editing your models or vendor code. Re-run the command after adding accessors.
 * Safe to delete: it only affects the editor. See https://intelephense.com/docs (symbol overrides).
 */`;

	const modelBlocks = models
		.filter((model) => model.properties.length)
		.map((model) => renderModelBlock(model.namespace, model.className, model.properties));

	return [header, ...modelBlocks, RESTIFY_OVERRIDES].join('\n\n') + '\n';
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

async function generateHelperStub(progress) {
	const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	if (!folder) {
		throw new Error('Open a workspace folder first.');
	}
	const models = await scanModelsForAccessors(progress);
	const content = buildStubContent(models);
	const stubUri = vscode.Uri.joinPath(folder.uri, STUB_FILENAME);
	await vscode.workspace.fs.writeFile(stubUri, Buffer.from(content, 'utf8'));

	const propertyCount = models.reduce((total, model) => total + model.properties.length, 0);
	return { stubUri, modelCount: models.length, propertyCount };
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
			`IDE helpers refreshed: ${result.propertyCount} accessor propert${result.propertyCount === 1 ? 'y' : 'ies'} across ${result.modelCount} model(s) + Restify type overrides → ${STUB_FILENAME}. Reload if types don't update.`,
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
		RESTIFY_OVERRIDES,
	},
};
