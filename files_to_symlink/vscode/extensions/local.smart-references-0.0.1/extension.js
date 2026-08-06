const vscode = require('vscode');
const path = require('path');
// Laravel IDE-helper generator — a single on-demand COMMAND (no live providers). Safe: it never
// registers a Definition/Reference provider, so it can't be auto-invoked into a re-analysis storm.
const laravelIntelligence = require('./laravelIntelligence');
const { getStubClassDeclaration, isMatchingPhpClassSource } = require('./laravelHelperNavigation');
const phpMove = require('./phpMove');
const { shouldInsertJsonComma } = require('./jsonSmartEnter');
const {
	findLaravelConfigKeyRange,
	getLaravelConfigKeyAtOffset,
} = require('./laravelConfigNavigation');
const {
	findMacroCallRanges,
	findMacroRegistrationRange,
	getMacroCallNameAtOffset,
	getMacroRegistrationNameAtOffset,
} = require('./laravelMacroNavigation');
const { getLaravelCollectionKeyTypeEdit } = require('./phpDocCollectionFix');
const { appendGitignoreEntries, getGitignoreEntry } = require('./gitignore');
const {
	normalizeMarkedUris,
	removeDeletedMarkedUris,
	remapMarkedUris,
	toggleMarkedUris,
} = require('./fileMarkers');

const PHP_SEARCH_EXCLUDE = '{**/{.git,vendor,node_modules,storage,tmp,bootstrap/cache}/**,**/.phpstorm.meta.php,**/_ide_helper*.php}';
const MARKED_FILES_STORAGE_KEY = 'smartReferences.markedFiles.v1';
let referencesPanel;

// Opt-in debug log (Output panel → "Smart References Debug"). Only written when the channel exists.
let smartRefDebugChannel = null;
function logDebug(message) {
	if (smartRefDebugChannel) {
		smartRefDebugChannel.appendLine(message);
	}
}

function sameUri(a, b) {
	return a.toString() === b.toString();
}

function isCurrentLocation(location, uri, position) {
	return sameUri(location.uri, uri) && location.range.contains(position);
}

function getUriPath(uri) {
	return (uri.scheme === 'file' ? uri.fsPath : uri.path).replace(/\\/g, '/');
}

function isGeneratedLaravelHelper(location) {
	const uriPath = getUriPath(location.uri);
	const basename = path.basename(uriPath);

	return uriPath.includes('/vendor/_laravel_idea/')
		|| uriPath.includes('/_laravel_ide/')
		|| basename === '.phpstorm.meta.php'
		|| basename === '_ide_helper.php'
		|| basename === '_ide_helper_models.php'
		|| /^_ide_helper_models_.*\.php$/.test(basename);
}

function isAllowedProviderLocation(location) {
	return !isGeneratedLaravelHelper(location);
}

function filterProviderLocations(locations) {
	return locations.filter(isAllowedProviderLocation);
}

function getLocationLineKey(location) {
	return [
		location.uri.toString(),
		location.range.start.line,
	].join(':');
}

async function readWorkspaceText(uri) {
	return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
}

function getWorkspaceFolderUri(uri) {
	return vscode.workspace.getWorkspaceFolder(uri)?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function pathExists(uri) {
	try {
		await vscode.workspace.fs.stat(uri);

		return true;
	} catch {
		return false;
	}
}

function positionFromOffset(source, offset) {
	const before = source.slice(0, offset);
	const lines = before.split('\n');

	return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
}

function rangeFromOffsets(source, start, end) {
	return new vscode.Range(positionFromOffset(source, start), positionFromOffset(source, end));
}

function getFileName(uri) {
	if (uri.scheme === 'file') {
		return path.basename(uri.fsPath);
	}

	return path.basename(uri.path);
}

function getWordAtPosition(document, position) {
	const range = document.getWordRangeAtPosition(position, /[$A-Za-z_][A-Za-z0-9_]*/);

	if (!range) {
		return '';
	}

	return document.getText(range);
}

function getPhpVariableAtPosition(document, position) {
	const line = document.lineAt(position.line).text;
	const variablePattern = /\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/g;
	let match;

	while ((match = variablePattern.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;

		if (position.character >= start && position.character <= end) {
			return match[0];
		}
	}

	return undefined;
}

function getPhpVariableRangeAtPosition(document, position) {
	const line = document.lineAt(position.line).text;
	const variablePattern = /\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/g;
	let match;

	while ((match = variablePattern.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;

		if (position.character >= start && position.character <= end) {
			return new vscode.Range(position.line, start, position.line, end);
		}
	}

	return undefined;
}

function getPhpVariableFromSelection(document, selection) {
	if (selection.isEmpty || selection.start.line !== selection.end.line) {
		return undefined;
	}

	const selected = document.getText(selection);

	if (/^\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(selected)) {
		return selected;
	}

	if (!/^[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(selected) || selection.start.character === 0) {
		return undefined;
	}

	const line = document.lineAt(selection.start.line).text;

	return line[selection.start.character - 1] === '$' ? `$${selected}` : undefined;
}

function getPhpVariableRangeFromSelection(document, selection) {
	if (selection.isEmpty || selection.start.line !== selection.end.line) {
		return undefined;
	}

	const selected = document.getText(selection);

	if (/^\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(selected)) {
		return selection;
	}

	if (!/^[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(selected) || selection.start.character === 0) {
		return undefined;
	}

	const line = document.lineAt(selection.start.line).text;

	return line[selection.start.character - 1] === '$'
		? new vscode.Range(selection.start.line, selection.start.character - 1, selection.end.line, selection.end.character)
		: undefined;
}

function normalizePhpClipboardExpression(text) {
	const trimmed = text.trim();

	if (!trimmed) {
		return undefined;
	}

	if (/^\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*(?:->[$A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)*\s*;?$/.test(trimmed)) {
		return trimmed.replace(/;\s*$/, '');
	}

	if (!/[;\n]/.test(trimmed) || !/^(?:\\?[A-Z][A-Za-z0-9_\\]*::|[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*\s*\(|new\s+|match\s*\(|\[[\s\S]*\]|\$[A-Za-z_\x80-\xff])/.test(trimmed)) {
		return undefined;
	}

	return trimmed.replace(/;\s*$/, '');
}

function getPhpSmartPasteRange(document, selection) {
	if (!selection.isEmpty) {
		return getPhpVariableRangeFromSelection(document, selection);
	}

	return getPhpVariableRangeAtPosition(document, selection.active);
}

function getPhpSmartPasteRanges(document, selections) {
	const ranges = selections.map((selection) => getPhpSmartPasteRange(document, selection));

	return ranges.every(Boolean) ? ranges : undefined;
}

function getPositionAfterInsertedText(start, text) {
	const lines = text.split('\n');

	if (lines.length === 1) {
		return new vscode.Position(start.line, start.character + text.length);
	}

	return new vscode.Position(start.line + lines.length - 1, lines[lines.length - 1].length);
}

async function smartCopy() {
	const editor = vscode.window.activeTextEditor;

	if (!editor || editor.selections.length !== 1) {
		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		return;
	}

	const variable = editor.selection.isEmpty
		? getPhpVariableAtPosition(editor.document, editor.selection.active)
		: getPhpVariableFromSelection(editor.document, editor.selection);

	if (!variable) {
		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		return;
	}

	await vscode.env.clipboard.writeText(variable);
}

async function smartPaste() {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		return;
	}

	const replacement = normalizePhpClipboardExpression(await vscode.env.clipboard.readText());
	const ranges = replacement ? getPhpSmartPasteRanges(editor.document, editor.selections) : undefined;

	if (!ranges) {
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		return;
	}

	await editor.edit((editBuilder) => {
		for (const range of ranges) {
			editBuilder.replace(range, replacement);
		}
	});

	editor.selections = ranges.map((range) => {
		const finalPosition = getPositionAfterInsertedText(range.start, replacement);

		return new vscode.Selection(finalPosition, finalPosition);
	});
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDefinitionTarget(definition) {
	if (definition && definition.targetUri && definition.targetSelectionRange) {
		return {
			uri: definition.targetUri,
			range: definition.targetSelectionRange,
		};
	}

	if (definition && definition.uri && definition.range) {
		return definition;
	}

	return undefined;
}

async function getDefinitionTargets(uri, position) {
	const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, position);

	if (!Array.isArray(definitions)) {
		return [];
	}

	return filterProviderLocations(definitions.map(getDefinitionTarget).filter(Boolean));
}

function isSameLocationLine(a, b) {
	return sameUri(a.uri, b.uri) && a.range.start.line === b.range.start.line;
}

function isDefinitionLocation(reference, definitions) {
	return definitions.some((definition) => isSameLocationLine(reference, definition));
}

function getPhpNamespace(source) {
	return source.match(/^namespace\s+([^;]+);/m)?.[1];
}

function getPhpClassNameBeforeOffset(source, offset) {
	const classPattern = /\b(?:abstract\s+|final\s+|readonly\s+)*class\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/g;
	let match;
	let className;

	while ((match = classPattern.exec(source.slice(0, offset))) !== null) {
		className = match[1];
	}

	return className;
}

function getPhpClassInfoBeforeOffset(source, offset) {
	const classPattern = /\b(?:abstract\s+|final\s+|readonly\s+)*class\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)(?:\s+extends\s+(\\?[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff\\]*))?/g;
	let match;
	let classInfo;

	while ((match = classPattern.exec(source.slice(0, offset))) !== null) {
		classInfo = {
			name: match[1],
			extendsName: match[2]?.replace(/^\\/, ''),
		};
	}

	return classInfo;
}

function getPhpClassInfo(source) {
	return getPhpClassInfoBeforeOffset(source, source.length);
}

// ---- Laravel manual-helper redirects ---------------------------------------------------
// The "Refresh IDE Helpers" generator writes _ide_helper_manual.php with @property-read tags so
// Intelephense resolves $model->signature_count without a squiggle. But Go-to-Definition then lands
// on the generated stub for both magic properties and sometimes the class itself. These helpers
// detect those cases and hop to the real class or Eloquent accessor method in the model file.
// Everything here runs ONLY on an explicit Cmd+B, reads via workspace.fs (never opens documents),
// and uses the workspace symbol index — so it can't trigger a re-analysis storm.

const ACCESSOR_STUB_BASENAME = '_ide_helper_manual.php';

async function tryReadWorkspaceText(uri) {
	try {
		return await readWorkspaceText(uri);
	} catch (error) {
		return undefined;
	}
}

function offsetToPosition(text, offset) {
	let line = 0;
	let lineStart = 0;

	for (let index = 0; index < offset; index++) {
		if (text.charCodeAt(index) === 10) {
			line++;
			lineStart = index + 1;
		}
	}

	return new vscode.Position(line, offset - lineStart);
}

function snakeToStudly(name) {
	return String(name)
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function studlyToSnake(name) {
	return String(name)
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toLowerCase();
}

function isAccessorStubUri(uri) {
	return Boolean(uri) && new RegExp(`(^|/)${escapeRegExp(ACCESSOR_STUB_BASENAME)}$`).test(uri.path);
}

async function findClassFileBySource(className, namespace) {
	const candidates = await vscode.workspace.findFiles(`**/${className}.php`, PHP_SEARCH_EXCLUDE, 100);

	for (const candidate of candidates) {
		const text = await tryReadWorkspaceText(candidate);

		if (text && isMatchingPhpClassSource(text, className, namespace)) {
			return candidate;
		}
	}

	return undefined;
}

// Locate the file that declares `className` in `namespace` using Intelephense's workspace symbol
// index (fast, no document opened). Intelephense doesn't reliably populate containerName or retain
// both halves of a merged helper class, so source filenames provide a bounded fallback.
async function findClassFileUri(className, namespace) {
	const symbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', className);

	if (!Array.isArray(symbols) || symbols.length === 0) {
		logDebug(`  findClassFileUri: no workspace symbols for "${className}"`);
		return findClassFileBySource(className, namespace);
	}

	const wantNamespace = (namespace || '').replace(/^\\/, '');
	const classKinds = [vscode.SymbolKind.Class, vscode.SymbolKind.Struct, vscode.SymbolKind.Interface];
	const classes = symbols.filter((symbol) =>
		symbol
		&& symbol.name === className
		&& classKinds.includes(symbol.kind)
		&& symbol.location
		&& symbol.location.uri
		// Exclude our own generated stub (it declares the same namespace\class) and vendor copies —
		// the real Eloquent model is always first-party source.
		&& !isAccessorStubUri(symbol.location.uri)
		&& !isGeneratedLaravelHelper({ uri: symbol.location.uri })
		&& !/\/(vendor|node_modules)\//.test(getUriPath(symbol.location.uri)));

	logDebug(`  findClassFileUri: ${classes.length} candidate file(s) for "${className}" (stub/vendor excluded)`);

	if (classes.length === 0) {
		return findClassFileBySource(className, namespace);
	}

	if (classes.length === 1) {
		return classes[0].location.uri;
	}

	// Multiple same-named classes: prefer containerName match, else verify the file's namespace.
	const byContainer = classes.find((symbol) =>
		(symbol.containerName || '').replace(/^\\/, '') === wantNamespace);

	if (byContainer) {
		return byContainer.location.uri;
	}

	for (const symbol of classes) {
		const text = await tryReadWorkspaceText(symbol.location.uri);
		if (text && getPhpNamespace(text)?.trim() === wantNamespace) {
			return symbol.location.uri;
		}
	}

	return findClassFileBySource(className, namespace);
}

// If `target` points inside our generated stub, return the matching real class or accessor method.
// Otherwise return undefined so the caller keeps the language provider's original target.
async function resolveLaravelHelperTarget(target) {
	if (!target || !isAccessorStubUri(target.uri)) {
		return undefined;
	}

	logDebug(`accessor redirect: target is stub ${target.uri.path}:${target.range.start.line + 1}`);

	const stubText = await tryReadWorkspaceText(target.uri);

	if (!stubText) {
		logDebug('  could not read stub text');
		return undefined;
	}

	const stubClass = getStubClassDeclaration(stubText, target.range.start.line);

	if (stubClass) {
		const classUri = await findClassFileUri(stubClass.className, stubClass.namespace);
		const classText = classUri && await tryReadWorkspaceText(classUri);
		const classPattern = new RegExp(`\\b(?:abstract\\s+|final\\s+|readonly\\s+)*class\\s+(${escapeRegExp(stubClass.className)})\\b`);
		const classMatch = classText && classText.match(classPattern);

		if (classUri && classText && classMatch) {
			const classNameOffset = classMatch.index + classMatch[0].lastIndexOf(classMatch[1]);
			const classPosition = offsetToPosition(classText, classNameOffset);
			logDebug(`  class redirect: ${stubClass.namespace}\\${stubClass.className} -> ${classUri.path}:${classPosition.line + 1}`);

			return {
				uri: classUri,
				range: new vscode.Range(
					classPosition,
					classPosition.translate(0, stubClass.className.length),
				),
			};
		}

		logDebug(`  real class not found for ${stubClass.namespace}\\${stubClass.className}`);
		return undefined;
	}

	const lines = stubText.split('\n');
	const startLine = target.range.start.line;
	// Intelephense usually points at the @property line; tolerate an off-by-one onto the /** opener.
	let propertyLine = lines[startLine];
	let propertyMatch = propertyLine && propertyLine.match(/@property(?:-read|-write)?\s+\S+\s+\$(\w+)/);
	if (!propertyMatch) {
		for (let index = startLine; index < Math.min(lines.length, startLine + 3); index++) {
			const candidate = lines[index] && lines[index].match(/@property(?:-read|-write)?\s+\S+\s+\$(\w+)/);
			if (candidate) {
				propertyLine = lines[index];
				propertyMatch = candidate;
				break;
			}
		}
	}

	if (!propertyMatch) {
		logDebug(`  no @property on/near line ${startLine + 1}: ${JSON.stringify(propertyLine)}`);
		return undefined;
	}

	const property = propertyMatch[1];

	// The class name appears just AFTER the property's docblock; the namespace just BEFORE it.
	let className;
	for (let index = startLine; index < lines.length; index++) {
		const match = lines[index].match(/\bclass\s+(\w+)/);
		if (match) {
			className = match[1];
			break;
		}
		if (index > startLine && /^\}/.test(lines[index])) {
			break;
		}
	}

	let namespace;
	for (let index = startLine; index >= 0; index--) {
		const match = lines[index].match(/\bnamespace\s+([^\s{;]+)/);
		if (match) {
			namespace = match[1];
			break;
		}
	}

	logDebug(`  property=${property} class=${className} namespace=${namespace}`);

	if (!className) {
		return undefined;
	}

	const modelUri = await findClassFileUri(className, namespace);

	if (!modelUri) {
		logDebug(`  could not locate file for ${namespace}\\${className}`);
		return undefined;
	}

	const modelText = await tryReadWorkspaceText(modelUri);

	if (!modelText) {
		logDebug(`  could not read model file ${modelUri.path}`);
		return undefined;
	}

	const studly = snakeToStudly(property);
	const camel = studly.charAt(0).toLowerCase() + studly.slice(1);
	// Classic accessor first (unambiguous getXAttribute), then new-style x(): Attribute.
	const candidates = [
		new RegExp(`\\bfunction\\s+(get${studly}Attribute)\\s*\\(`),
		new RegExp(`\\bfunction\\s+(${escapeRegExp(camel)})\\s*\\([^)]*\\)\\s*:\\s*\\\\?Attribute\\b`),
	];

	for (const pattern of candidates) {
		const match = pattern.exec(modelText);
		if (match) {
			const nameOffset = match.index + match[0].indexOf(match[1]);
			const position = offsetToPosition(modelText, nameOffset);
			logDebug(`  -> ${modelUri.path}:${position.line + 1} ${match[1]}()`);
			return { uri: modelUri, range: new vscode.Range(position, position) };
		}
	}

	logDebug(`  no accessor method (get${studly}Attribute / ${camel}(): Attribute) found in ${modelUri.path}`);
	return undefined;
}

// ---- Reverse direction: accessor method -> magic-property usages ------------------------------
// When Cmd+B is on an accessor method DECLARATION (getXAttribute / x(): Attribute), Intelephense
// finds no callers (the method is invoked magically). These helpers instead surface every
// $model->x usage, by (1) asking Intelephense for references to the stub's @property-read symbol —
// which it DOES resolve to real accesses — and (2) falling back to a textual `->x` scan of app
// source. Runs ONLY on an explicit Cmd+B (never in the auto CodeLens count), reads via workspace.fs.

function getStubUri(contextUri) {
	const folder = getWorkspaceFolderUri(contextUri);
	return folder ? vscode.Uri.joinPath(folder, ACCESSOR_STUB_BASENAME) : undefined;
}

// Locate the @property line for namespace\class::$property inside the generated stub.
function findStubPropertyPosition(stubText, namespace, className, property) {
	const lines = stubText.split('\n');
	const wantNamespace = (namespace || '').replace(/^\\/, '');
	let currentNamespace;

	for (let index = 0; index < lines.length; index++) {
		const namespaceMatch = lines[index].match(/\bnamespace\s+([^\s{;]+)/);
		if (namespaceMatch) {
			currentNamespace = namespaceMatch[1].replace(/^\\/, '');
			continue;
		}

		const propertyMatch = lines[index].match(
			new RegExp(`@property(?:-read|-write)?\\s+\\S+\\s+\\$(${escapeRegExp(property)})\\b`));

		if (!propertyMatch || currentNamespace !== wantNamespace) {
			continue;
		}

		let enclosingClass;
		for (let forward = index; forward < lines.length; forward++) {
			const classMatch = lines[forward].match(/\bclass\s+(\w+)/);
			if (classMatch) {
				enclosingClass = classMatch[1];
				break;
			}
			if (forward > index && /^\}/.test(lines[forward])) {
				break;
			}
		}

		if (enclosingClass === className) {
			const dollarIndex = lines[index].indexOf(`$${property}`);
			return new vscode.Position(index, dollarIndex >= 0 ? dollarIndex + 1 : 0);
		}
	}

	return undefined;
}

// If `position` sits on an accessor method declaration, return the stub position of its magic
// property (so a reference query there yields the property's real usages).
async function resolveStubPropertyPositionForAccessor(uri, position) {
	if (isAccessorStubUri(uri)) {
		return undefined;
	}

	const source = await tryReadWorkspaceText(uri);
	if (!source) {
		return undefined;
	}

	const lines = source.split('\n');
	const line = lines[position.line] || '';
	let property;

	const classic = line.match(/\bfunction\s+get(\w+)Attribute\s*\(/);
	if (classic) {
		property = studlyToSnake(classic[1]);
	} else {
		const newStyle = line.match(/\bfunction\s+(\w+)\s*\([^)]*\)\s*:\s*\??\\?Attribute\b/);
		if (newStyle) {
			property = studlyToSnake(newStyle[1]);
		}
	}

	if (!property) {
		return undefined;
	}

	const methodOffset = lines.slice(0, position.line).reduce((sum, text) => sum + text.length + 1, 0);
	const namespace = getPhpNamespace(source)?.trim();
	const className = getPhpClassNameBeforeOffset(source, methodOffset);

	if (!className) {
		return undefined;
	}

	const stubUri = getStubUri(uri);
	const stubText = stubUri && await tryReadWorkspaceText(stubUri);

	if (!stubText) {
		return undefined;
	}

	const stubPosition = findStubPropertyPosition(stubText, namespace, className, property);

	return stubPosition ? { stubUri, position: stubPosition, property } : undefined;
}

// Textual fallback: `->property` accesses across first-party source.
async function findPropertyUsagesByText(property) {
	const files = await vscode.workspace.findFiles(
		'{app,tests,database,routes,resources}/**/*.php',
		'{**/vendor/**,**/node_modules/**,**/_ide_helper*.php}',
		4000,
	);
	const results = [];

	for (const fileUri of files) {
		const text = await tryReadWorkspaceText(fileUri);
		if (!text || !text.includes(property)) {
			continue;
		}

		const usagePattern = new RegExp(`->\\s*${escapeRegExp(property)}\\b`, 'g');
		let match;
		while ((match = usagePattern.exec(text)) !== null) {
			const nameOffset = match.index + match[0].indexOf(property);
			const position = offsetToPosition(text, nameOffset);
			results.push(new vscode.Location(fileUri, new vscode.Range(position, position)));
		}
	}

	return results;
}

async function getAccessorPropertyReferences(uri, position) {
	let info;
	try {
		info = await resolveStubPropertyPositionForAccessor(uri, position);
	} catch (error) {
		logDebug(`accessor references threw: ${error && error.message ? error.message : error}`);
		return [];
	}

	if (!info) {
		return [];
	}

	logDebug(`accessor references: property=${info.property} via stub ${info.stubUri.path}:${info.position.line + 1}`);

	// Semantic first: Intelephense references on the magic-property symbol.
	let references = (await getLanguageProviderReferences(info.stubUri, info.position))
		.filter((reference) => !isAccessorStubUri(reference.uri));
	logDebug(`  semantic property refs: ${references.length}`);

	// Fallback: textual ->property scan, only if the semantic index yielded nothing.
	if (references.length === 0) {
		references = await findPropertyUsagesByText(info.property);
		logDebug(`  text-search property refs: ${references.length}`);
	}

	return references;
}

// Laravel resolves config('file.nested.key') dynamically, so Intelephense cannot connect the
// string literal to config/file.php. Resolve that convention only for an explicit Cmd+B and only
// when the cursor is inside config()'s first string argument; all other navigation stays native.
async function resolveLaravelConfigTarget(uri, position) {
	const document = await vscode.workspace.openTextDocument(uri);
	const configKey = getLaravelConfigKeyAtOffset(document.getText(), document.offsetAt(position));

	if (!configKey) {
		return undefined;
	}

	const [configFile, ...keySegments] = configKey.split('.');
	const workspaceFolderUri = getWorkspaceFolderUri(uri);

	if (!workspaceFolderUri || !/^[A-Za-z0-9_-]+$/.test(configFile) || keySegments.length === 0) {
		return undefined;
	}

	const configUri = vscode.Uri.joinPath(workspaceFolderUri, 'config', `${configFile}.php`);
	let configDocument;

	try {
		configDocument = await vscode.workspace.openTextDocument(configUri);
	} catch {
		return undefined;
	}

	const configSource = configDocument.getText();
	const targetRange = findLaravelConfigKeyRange(configSource, keySegments);

	if (!targetRange) {
		logDebug(`Laravel config target not found: ${configKey}`);
		return undefined;
	}

	logDebug(`Laravel config redirect: ${configKey} -> ${configUri.path}`);

	return {
		uri: configUri,
		range: rangeFromOffsets(configSource, targetRange.start, targetRange.end),
	};
}

// Laravel adds macros to a class at runtime, so Intelephense reports `Rule::uniqueCaseInsensitive()`
// as undefined and has no target to offer. Only once native resolution has come back empty do we
// scan first-party source for the matching `::macro('name', …)` registration — normal navigation
// never pays for this, and a macro call has nothing to lose by it.
async function resolveLaravelMacroTarget(uri, position) {
	const document = await vscode.workspace.openTextDocument(uri);
	const macroName = getMacroCallNameAtOffset(document.getText(), document.offsetAt(position));

	if (!macroName) {
		return undefined;
	}

	const files = await vscode.workspace.findFiles(
		'{app,routes,bootstrap,database,tests}/**/*.php',
		PHP_SEARCH_EXCLUDE,
		4000,
	);

	for (const fileUri of files) {
		const text = await tryReadWorkspaceText(fileUri);

		if (!text || !text.includes(macroName)) {
			continue;
		}

		const range = findMacroRegistrationRange(text, macroName);

		if (range) {
			logDebug(`Laravel macro redirect: ${macroName} -> ${fileUri.path}`);

			return { uri: fileUri, range: rangeFromOffsets(text, range.start, range.end) };
		}
	}

	logDebug(`Laravel macro registration not found: ${macroName}`);

	return undefined;
}

async function goToDefinition(uri, position) {
	try {
		const configTarget = await resolveLaravelConfigTarget(uri, position);

		if (configTarget && !isCurrentLocation(configTarget, uri, position)) {
			await vscode.window.showTextDocument(configTarget.uri, {
				selection: configTarget.range,
				preserveFocus: false,
				preview: false,
			});

			return 'opened';
		}
	} catch (error) {
		logDebug(`Laravel config redirect threw: ${error && error.message ? error.message : error}`);
	}

	const definitions = await getDefinitionTargets(uri, position);

	if (definitions.length === 0) {
		try {
			const macroTarget = await resolveLaravelMacroTarget(uri, position);

			if (macroTarget && !isCurrentLocation(macroTarget, uri, position)) {
				await vscode.window.showTextDocument(macroTarget.uri, {
					selection: macroTarget.range,
					preserveFocus: false,
					preview: false,
				});

				return 'opened';
			}
		} catch (error) {
			logDebug(`Laravel macro redirect threw: ${error && error.message ? error.message : error}`);
		}

		return false;
	}

	const target = definitions[0];

	if (!target) {
		return 'missing';
	}

	// If Intelephense resolved a class or magic property to our generated stub, hop to real source.
	// Wrapped so a redirect failure can NEVER break normal Go-to-Definition — it just falls back.
	let finalTarget = target;
	try {
		const redirected = await resolveLaravelHelperTarget(target);
		if (redirected) {
			finalTarget = redirected;
		}
	} catch (error) {
		logDebug(`accessor redirect threw: ${error && error.message ? error.message : error}`);
	}

	if (isCurrentLocation(finalTarget, uri, position)) {
		return 'current';
	}

	await vscode.window.showTextDocument(finalTarget.uri, {
		selection: finalTarget.range,
		preserveFocus: false,
		preview: false,
	});

	return 'opened';
}

function getSymbolKindLabel(kind) {
	switch (kind) {
		case vscode.SymbolKind.Class:
			return 'class';
		case vscode.SymbolKind.Constructor:
			return 'constructor';
		case vscode.SymbolKind.Function:
			return 'function';
		case vscode.SymbolKind.Interface:
			return 'interface';
		case vscode.SymbolKind.Method:
			return 'method';
		case vscode.SymbolKind.Struct:
			return 'struct';
		default:
			return 'reference';
	}
}

function getSymbolThemeIcon(kind) {
	switch (kind) {
		case vscode.SymbolKind.Class:
		case vscode.SymbolKind.Interface:
		case vscode.SymbolKind.Struct:
			return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('charts.blue'));
		case vscode.SymbolKind.Constructor:
		case vscode.SymbolKind.Method:
			return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.purple'));
		case vscode.SymbolKind.Function:
			return new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('charts.orange'));
		default:
			return new vscode.ThemeIcon('references', new vscode.ThemeColor('charts.green'));
	}
}

function getSymbolDisplayName(context) {
	if (context.symbolName === 'top level') {
		return '';
	}

	if (context.symbolName.includes('::')) {
		const [, methodName] = context.symbolName.split('::');

		return methodName || context.symbolName;
	}

	return context.symbolName;
}

function formatSymbolDescription(context) {
	if (context.symbolName === 'top level') {
		return '';
	}

	if (context.symbolName.includes('::')) {
		const [, methodName] = context.symbolName.split('::');
		return methodName ? `$(symbol-method) ${methodName}` : '';
	}

	switch (context.symbolKind) {
		case vscode.SymbolKind.Constructor:
		case vscode.SymbolKind.Method:
			return `$(symbol-method) ${context.symbolName}`;
		case vscode.SymbolKind.Function:
			return `$(symbol-function) ${context.symbolName}`;
		default:
			return '';
	}
}

function formatReferenceDetail(context) {
	return context.line ? `    | ${context.line}` : '    |';
}

function getWorkspaceRelativePath(uri) {
	return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
}

function getReferenceViewMode() {
	const mode = vscode.workspace.getConfiguration('smartReferences').get('referenceView', 'webview');

	return mode === 'quickPick' ? 'quickPick' : 'webview';
}

function getReferencesWebviewPlacement() {
	const placement = vscode.workspace.getConfiguration('smartReferences').get('webviewPlacement', 'active');

	return placement === 'beside' ? 'beside' : 'active';
}

function getReferencesWebviewColumn(originViewColumn) {
	return getReferencesWebviewPlacement() === 'beside'
		? vscode.ViewColumn.Beside
		: originViewColumn;
}

function symbolContains(symbol, position) {
	return symbol.range && symbol.range.contains(position);
}

function findSymbolPath(symbols, position, path = []) {
	for (const symbol of symbols || []) {
		if (!symbolContains(symbol, position)) {
			continue;
		}

		const nestedPath = findSymbolPath(symbol.children, position, [...path, symbol]);

		return nestedPath.length ? nestedPath : [...path, symbol];
	}

	return [];
}

function formatSymbolName(symbolPath) {
	const structural = symbolPath.filter((symbol) => [
		vscode.SymbolKind.Class,
		vscode.SymbolKind.Constructor,
		vscode.SymbolKind.Function,
		vscode.SymbolKind.Interface,
		vscode.SymbolKind.Method,
		vscode.SymbolKind.Struct,
	].includes(symbol.kind));

	if (structural.length === 0) {
		return 'top level';
	}

	const current = structural[structural.length - 1];
	const parent = structural.length > 1 ? structural[structural.length - 2] : null;

	if (parent && [vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Struct].includes(parent.kind)) {
		return `${parent.name}::${current.name}`;
	}

	return current.name;
}

async function getDocumentSymbols(document) {
	const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);

	return Array.isArray(symbols) ? symbols.filter((symbol) => symbol && Array.isArray(symbol.children)) : [];
}

async function getReferenceContext(reference, documentCache, symbolCache) {
	const uriKey = reference.uri.toString();
	let document = documentCache.get(uriKey);

	if (!document) {
		document = await vscode.workspace.openTextDocument(reference.uri);
		documentCache.set(uriKey, document);
	}

	let symbols = symbolCache.get(uriKey);

	if (!symbols) {
		symbols = await getDocumentSymbols(document);
		symbolCache.set(uriKey, symbols);
	}

	const line = document.lineAt(reference.range.start.line).text.trim();
	const symbolPath = findSymbolPath(symbols, reference.range.start);
	const currentSymbol = symbolPath[symbolPath.length - 1];

	return {
		line: line.replace(/\s+/g, ' '),
		symbolName: formatSymbolName(symbolPath),
		symbolKind: currentSymbol ? currentSymbol.kind : undefined,
		symbolKindLabel: currentSymbol ? getSymbolKindLabel(currentSymbol.kind) : 'reference',
	};
}

function isTestReferencePath(uriPath, fileName) {
	return /\/tests?\//i.test(uriPath) || /(?:Test|Spec)\.php$/i.test(fileName);
}

// Tests sort last, so a top-level reference that lives in a test file still belongs to Test usages.
function getReferenceGroup(sortKey) {
	if (sortKey.isTest) {
		return {
			index: 2,
			label: 'Test usages',
		};
	}

	if (sortKey.isTopLevel) {
		return {
			index: 1,
			label: 'Top level usages',
		};
	}

	return {
		index: 0,
		label: 'Usages',
	};
}

function compareReferenceItems(a, b) {
	if (a.sortKey.groupIndex !== b.sortKey.groupIndex) {
		return a.sortKey.groupIndex - b.sortKey.groupIndex;
	}

	return a.sortKey.fileName.localeCompare(b.sortKey.fileName)
		|| a.sortKey.symbolName.localeCompare(b.sortKey.symbolName)
		|| a.sortKey.uriPath.localeCompare(b.sortKey.uriPath)
		|| a.sortKey.lineNumber - b.sortKey.lineNumber;
}

// Each group is introduced by a header on a row of its own. A QuickPick separator cannot do this:
// VS Code renders a separator as part of the row that follows it unless the separator carries
// buttons, and the extension host drops `buttons` from separators on the way across. A header is
// therefore an ordinary item, which is also why navigation has to be walked past it below. The
// `blank` codicon draws nothing and gives the workbench stylesheet a class to recognise the row by.
const REFERENCE_HEADER_ICON = new vscode.ThemeIcon('blank');

function withReferenceHeaders(items) {
	const grouped = [];
	let previousGroupIndex = null;

	for (const item of items) {
		if (item.sortKey.groupIndex !== previousGroupIndex) {
			grouped.push({
				label: item.sortKey.groupLabel,
				iconPath: REFERENCE_HEADER_ICON,
				isReferenceHeader: true,
			});
			previousGroupIndex = item.sortKey.groupIndex;
		}

		grouped.push(item);
	}

	return grouped;
}

function findReferenceItem(items, startIndex, step) {
	for (let index = startIndex; index >= 0 && index < items.length; index += step) {
		if (!items[index].isReferenceHeader) {
			return items[index];
		}
	}

	return undefined;
}

function uniqueReferenceItems(items) {
	const seenLocations = new Set();
	const seenVisibleRows = new Set();

	return items.filter((item) => {
		const locationKey = [
			item.sortKey.uriPath,
			item.sortKey.lineNumber,
		].join(':');

		const visibleKey = [
			item.label,
			item.description ?? '',
			item.detail ?? '',
		].join(':');

		if (seenLocations.has(locationKey) || seenVisibleRows.has(visibleKey)) {
			return false;
		}

		seenLocations.add(locationKey);
		seenVisibleRows.add(visibleKey);

		return true;
	});
}

async function buildReferenceItems(references) {
	const documentCache = new Map();
	const symbolCache = new Map();
	let items = await Promise.all(references.map(async (reference) => {
		const context = await getReferenceContext(reference, documentCache, symbolCache);
		const lineNumber = reference.range.start.line + 1;
		const fileName = getFileName(reference.uri);
		const uriPath = getUriPath(reference.uri);
		const isTopLevel = context.symbolName === 'top level';
		const isTest = isTestReferencePath(uriPath, fileName);
		const group = getReferenceGroup({
			isTest,
			isTopLevel,
		});

		return {
			label: `${fileName}:${lineNumber}`,
			description: formatSymbolDescription(context),
			detail: formatReferenceDetail(context),
			fileName,
			lineNumber,
			methodName: getSymbolDisplayName(context),
			relativePath: getWorkspaceRelativePath(reference.uri),
			sourceLine: context.line,
			symbolKindLabel: context.symbolKindLabel,
			iconPath: isTest
				? new vscode.ThemeIcon('beaker', new vscode.ThemeColor('charts.green'))
				: getSymbolThemeIcon(context.symbolKind),
			reference,
			sortKey: {
				fileName: fileName.toLocaleLowerCase(),
				groupIndex: group.index,
				groupLabel: group.label,
				isTest,
				isTopLevel,
				lineNumber,
				symbolName: context.symbolName.toLocaleLowerCase(),
				uriPath: uriPath.toLocaleLowerCase(),
			},
		};
	}));

	items.sort(compareReferenceItems);

	return uniqueReferenceItems(items);
}

async function showReferencesPicker(references) {
	const referenceItems = await buildReferenceItems(references);
	const groupedItems = withReferenceHeaders(referenceItems);
	const picker = vscode.window.createQuickPick();

	picker.title = 'References';
	picker.placeholder = 'Select a reference';
	picker.matchOnDescription = true;
	picker.matchOnDetail = true;
	picker.items = groupedItems;

	// Headers exist only in the unfiltered list. Left in, a header would survive a query that its
	// own group has no match for, and the skip below could target a row that is no longer visible.
	let showingHeaders = true;
	picker.onDidChangeValue((value) => {
		const shouldShowHeaders = value.length === 0;

		if (shouldShowHeaders !== showingHeaders) {
			showingHeaders = shouldShowHeaders;
			picker.items = shouldShowHeaders ? groupedItems : referenceItems;
		}
	});

	// Nothing in the QuickPick API marks a row unfocusable, so keyboard navigation is walked past a
	// header in whichever direction it arrived from, and falls back the other way at either end.
	let previousIndex = -1;
	picker.onDidChangeActive((active) => {
		const current = active[0];

		if (!current) {
			return;
		}

		const index = picker.items.indexOf(current);

		if (!current.isReferenceHeader) {
			previousIndex = index;

			return;
		}

		const step = index >= previousIndex ? 1 : -1;
		const next = findReferenceItem(picker.items, index + step, step)
			|| findReferenceItem(picker.items, index - step, -step);

		if (next) {
			picker.activeItems = [next];
		}
	});

	const selected = await new Promise((resolve) => {
		picker.onDidAccept(() => {
			resolve(picker.selectedItems[0]);
			picker.hide();
		});
		picker.onDidHide(() => {
			resolve(undefined);
			picker.dispose();
		});
		picker.show();
	});

	if (!selected || !selected.reference) {
		return;
	}

	await vscode.window.showTextDocument(selected.reference.uri, {
		selection: selected.reference.range,
		preserveFocus: false,
		preview: false,
	});
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (let index = 0; index < 32; index++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

function getWebviewIconLetter(symbolKindLabel) {
	switch (symbolKindLabel) {
		case 'class':
			return 'C';
		case 'constructor':
			return 'I';
		case 'function':
			return 'F';
		case 'interface':
			return 'I';
		case 'method':
			return 'M';
		case 'struct':
			return 'S';
		default:
			return 'R';
	}
}

function getWebviewReferenceRows(items) {
	return items.map((item, index) => ({
		id: String(index),
		fileName: item.fileName,
		lineNumber: item.lineNumber,
		methodName: item.methodName,
		relativePath: item.relativePath,
		sourceLine: item.sourceLine,
		symbolKindLabel: item.symbolKindLabel,
		iconLetter: getWebviewIconLetter(item.symbolKindLabel),
		groupLabel: item.sortKey.groupLabel,
		groupIndex: item.sortKey.groupIndex,
		uri: item.reference.uri.toString(),
		range: {
			start: {
				line: item.reference.range.start.line,
				character: item.reference.range.start.character,
			},
			end: {
				line: item.reference.range.end.line,
				character: item.reference.range.end.character,
			},
		},
	}));
}

function getReferencesWebviewHtml(webview, rows) {
	const nonce = getNonce();
	const payload = JSON.stringify(rows).replace(/</g, '\\u003c');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Smart References</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: dark light;
			--row-height: 31px;
			--grid-template: 28px minmax(170px, 0.95fr) 54px minmax(280px, 2.1fr) minmax(140px, 0.8fr);
		}

		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			background: var(--vscode-editor-background);
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}

		.shell {
			display: flex;
			flex-direction: column;
			height: 100vh;
			min-width: 680px;
		}

		.toolbar {
			display: grid;
			grid-template-columns: 1fr auto auto;
			gap: 8px;
			align-items: center;
			padding: 9px 10px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}

		.search {
			width: 100%;
			height: 30px;
			padding: 0 10px;
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: 4px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			outline: none;
		}

		.search:focus {
			border-color: var(--vscode-focusBorder);
		}

		.button {
			height: 30px;
			padding: 0 10px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 4px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			cursor: pointer;
			font: inherit;
		}

		.button:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.header,
		.reference-row {
			display: grid;
			grid-template-columns: var(--grid-template);
			align-items: center;
			column-gap: 10px;
		}

		.header {
			height: 32px;
			padding: 0 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
			color: var(--vscode-descriptionForeground);
			background: var(--vscode-editorGroupHeader-tabsBackground);
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0;
		}

		.list {
			overflow: auto;
			flex: 1;
		}

		.group {
			position: sticky;
			top: 0;
			z-index: 1;
			padding: 7px 12px 5px 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0;
		}

		.reference-row {
			min-height: var(--row-height);
			padding: 4px 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
			cursor: pointer;
		}

		.reference-row:nth-child(even) {
			background: var(--vscode-editorWidget-background, transparent);
		}

		.reference-row:hover,
		.reference-row.selected {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}

		.icon {
			width: 18px;
			height: 18px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			border: 1px solid currentColor;
			border-radius: 50%;
			color: var(--vscode-charts-purple);
			font-size: 10px;
			font-weight: 700;
		}

		.icon.class,
		.icon.interface,
		.icon.struct {
			color: var(--vscode-charts-blue);
		}

		.icon.function {
			color: var(--vscode-charts-orange);
		}

		.icon.reference {
			color: var(--vscode-charts-green);
		}

		.file {
			min-width: 0;
			font-weight: 650;
		}

		.path {
			margin-left: 6px;
			color: var(--vscode-descriptionForeground);
			font-weight: 400;
		}

		.line {
			text-align: right;
			color: var(--vscode-descriptionForeground);
			font-variant-numeric: tabular-nums;
		}

		.code {
			min-width: 0;
			color: var(--vscode-foreground);
			font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
		}

		.method {
			min-width: 0;
			color: var(--vscode-symbolIcon-methodForeground, var(--vscode-charts-purple));
			font-weight: 650;
			text-align: left;
		}

		.truncate {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.empty {
			padding: 30px 12px;
			color: var(--vscode-descriptionForeground);
			text-align: center;
		}
	</style>
</head>
<body>
	<div class="shell">
		<div class="toolbar">
			<input id="search" class="search" type="search" placeholder="Filter references" autofocus>
			<button id="quickpick" class="button" type="button">QuickPick</button>
			<button id="close" class="button" type="button">Close</button>
		</div>
		<div class="header">
			<div></div>
			<div>File</div>
			<div class="line">Line</div>
			<div>Usage</div>
			<div>Method</div>
		</div>
		<div id="list" class="list"></div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const rows = ${payload};
		const list = document.getElementById('list');
		const search = document.getElementById('search');
		const quickpick = document.getElementById('quickpick');
		const closeButton = document.getElementById('close');
		let visibleRows = rows;
		let selectedIndex = 0;

		function appendText(parent, className, text, title) {
			const element = document.createElement('div');
			element.className = className;
			element.textContent = text || '';
			if (title || text) {
				element.title = title || text;
			}
			parent.appendChild(element);
			return element;
		}

		function matchesFilter(row, query) {
			if (!query) {
				return true;
			}

			const haystack = [
				row.fileName,
				row.lineNumber,
				row.methodName,
				row.relativePath,
				row.sourceLine,
				row.groupLabel,
			].join(' ').toLowerCase();

			return haystack.includes(query);
		}

		function selectRow(index) {
			const rowElements = [...list.querySelectorAll('.reference-row')];
			if (rowElements.length === 0) {
				selectedIndex = 0;
				return;
			}

			selectedIndex = Math.max(0, Math.min(index, rowElements.length - 1));
			rowElements.forEach((element, elementIndex) => {
				element.classList.toggle('selected', elementIndex === selectedIndex);
			});
			rowElements[selectedIndex].scrollIntoView({ block: 'nearest' });
		}

		function openSelectedRow() {
			const row = visibleRows[selectedIndex];

			if (row) {
				vscode.postMessage({ type: 'openReference', id: row.id });
			}
		}

		function render() {
			const query = search.value.trim().toLowerCase();
			visibleRows = rows.filter((row) => matchesFilter(row, query));
			list.replaceChildren();

			if (visibleRows.length === 0) {
				appendText(list, 'empty', 'No references match the current filter.');
				return;
			}

			let previousGroup = '';

			for (const row of visibleRows) {
				if (row.groupLabel !== previousGroup) {
					appendText(list, 'group', row.groupLabel);
					previousGroup = row.groupLabel;
				}

				const element = document.createElement('div');
				element.className = 'reference-row';
				element.dataset.id = row.id;
				element.title = row.relativePath;

				const icon = document.createElement('div');
				icon.className = 'icon ' + row.symbolKindLabel;
				icon.textContent = row.iconLetter;
				element.appendChild(icon);

				const fileCell = document.createElement('div');
				fileCell.className = 'file truncate';
				fileCell.textContent = row.fileName;
				if (row.relativePath && row.relativePath !== row.fileName) {
					const pathHint = document.createElement('span');
					pathHint.className = 'path';
					pathHint.textContent = row.relativePath.replace('/' + row.fileName, '');
					fileCell.appendChild(pathHint);
				}
				element.appendChild(fileCell);

				appendText(element, 'line', String(row.lineNumber));
				appendText(element, 'code truncate', row.sourceLine);
				appendText(element, 'method truncate', row.methodName || 'top level');

				element.addEventListener('mouseenter', () => {
					const rowElements = [...list.querySelectorAll('.reference-row')];
					selectRow(rowElements.indexOf(element));
				});
				element.addEventListener('click', () => vscode.postMessage({ type: 'openReference', id: row.id }));

				list.appendChild(element);
			}

			selectRow(Math.min(selectedIndex, visibleRows.length - 1));
		}

		search.addEventListener('input', () => {
			selectedIndex = 0;
			render();
		});

		document.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				selectRow(selectedIndex + 1);
			}

			if (event.key === 'ArrowUp') {
				event.preventDefault();
				selectRow(selectedIndex - 1);
			}

			if (event.key === 'Enter') {
				event.preventDefault();
				openSelectedRow();
			}

			if (event.key === 'Escape') {
				event.preventDefault();
				vscode.postMessage({ type: 'close' });
			}
		});

		quickpick.addEventListener('click', () => vscode.postMessage({ type: 'quickPick' }));
		closeButton.addEventListener('click', () => vscode.postMessage({ type: 'close' }));

		render();
	</script>
</body>
</html>`;
}

async function openReferenceLocation(reference, viewColumn) {
	await vscode.window.showTextDocument(reference.uri, {
		selection: reference.range,
		preserveFocus: false,
		preview: false,
		viewColumn,
	});
}

async function showReferencesWebview(references) {
	const items = await buildReferenceItems(references);
	const rows = getWebviewReferenceRows(items);
	const referenceById = new Map(items.map((item, index) => [String(index), item.reference]));
	const originViewColumn = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

	if (referencesPanel) {
		referencesPanel.dispose();
	}

	referencesPanel = vscode.window.createWebviewPanel(
		'smartReferences.references',
		`References (${items.length})`,
		getReferencesWebviewColumn(originViewColumn),
		{
			enableScripts: true,
			retainContextWhenHidden: false,
		}
	);

	referencesPanel.webview.html = getReferencesWebviewHtml(referencesPanel.webview, rows);
	referencesPanel.onDidDispose(() => {
		referencesPanel = undefined;
	});
	referencesPanel.webview.onDidReceiveMessage(async (message) => {
		if (!message || typeof message.type !== 'string') {
			return;
		}

		if (message.type === 'close') {
			referencesPanel?.dispose();
			return;
		}

		if (message.type === 'quickPick') {
			referencesPanel?.dispose();
			await showReferencesPicker(references);
			return;
		}

		if (message.type === 'openReference') {
			const reference = referenceById.get(String(message.id));

			if (!reference) {
				return;
			}

			referencesPanel?.dispose();
			await openReferenceLocation(reference, originViewColumn);
		}
	});
}

async function showReferences(references) {
	if (getReferenceViewMode() === 'quickPick') {
		await showReferencesPicker(references);
		return;
	}

	await showReferencesWebview(references);
}

function getRouteControllerClassRanges(routeSource, controllerFqn, controllerClassName) {
	const ranges = [];
	const namespace = getPhpNamespace(routeSource);
	const controllerNamespace = controllerFqn.split('\\').slice(0, -1).join('\\');
	const hasImport = new RegExp(`^use\\s+${escapeRegExp(controllerFqn)}\\s*;`, 'm').test(routeSource);
	const classPattern = new RegExp(`(?<![A-Za-z0-9_\\\\])(?:\\\\?${escapeRegExp(controllerFqn)}|${escapeRegExp(controllerClassName)})::class`, 'g');
	let match;

	while ((match = classPattern.exec(routeSource)) !== null) {
		const matchedClass = match[0].slice(0, -'::class'.length).replace(/^\\/, '');
		const isShortClass = matchedClass === controllerClassName;

		if (isShortClass && !hasImport && namespace !== controllerNamespace) {
			continue;
		}

		ranges.push({
			start: match.index,
			end: match.index + matchedClass.length,
		});
	}

	return ranges;
}

async function getInvokeRouteReferences(uri, position) {
	const document = await vscode.workspace.openTextDocument(uri);
	const line = document.lineAt(position.line).text;

	if (!/\bfunction\s+__invoke\s*\(/.test(line)) {
		return [];
	}

	const source = document.getText();
	const controllerClassName = getPhpClassNameBeforeOffset(source, document.offsetAt(position));

	if (!controllerClassName) {
		return [];
	}

	const namespace = getPhpNamespace(source);
	const controllerFqn = namespace ? `${namespace}\\${controllerClassName}` : controllerClassName;
	const files = await vscode.workspace.findFiles('**/{routes,nova-components}/**/*.php', PHP_SEARCH_EXCLUDE, 2000);
	const references = [];

	for (const routeUri of files) {
		const routeSource = await readWorkspaceText(routeUri);

		if (!routeSource.includes(`${controllerClassName}::class`)) {
			continue;
		}

		for (const range of getRouteControllerClassRanges(routeSource, controllerFqn, controllerClassName)) {
			references.push({
				uri: routeUri,
				range: rangeFromOffsets(routeSource, range.start, range.end),
			});
		}
	}

	return references;
}

function isLaravelPolicyDocument(uri) {
	const uriPath = getUriPath(uri);

	return /\/Policies\/[^/]+Policy\.php$/.test(uriPath);
}

function getFunctionDeclarationNameAtPosition(document, position) {
	const line = document.lineAt(position.line).text;
	const match = line.match(/\bfunction\s+&?\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/);

	if (!match || match.index === undefined) {
		return undefined;
	}

	const nameStart = line.indexOf(match[1], match.index);
	const nameEnd = nameStart + match[1].length;

	if (position.character > nameEnd) {
		return undefined;
	}

	return match[1];
}

function getLaravelGateAbilityNames(methodName) {
	const kebabName = methodName
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase();

	return [...new Set([methodName, kebabName])];
}

function getLaravelPolicyMethodNameFromAbility(ability) {
	return ability.replace(/[-_\s]+([A-Za-z0-9])/g, (_, character) => character.toUpperCase());
}

function isLaravelGateAbilityPrefix(prefix) {
	const gateCallPattern = /(?:\b\\?Gate::(?:check|allows|denies|authorize|inspect|any|none)|\b(?:can|cannot|cant|authorize|authorizeForUser|forbid_if|forbid_unless))\s*\(\s*$/s;

	return gateCallPattern.test(prefix);
}

function lowerFirst(value) {
	return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function getPolicyModelClassName(policySource, policyClassName) {
	const modelClassName = policyClassName?.replace(/Policy$/, '');

	if (!modelClassName) {
		return undefined;
	}

	const modelImportPattern = new RegExp(`^use\\s+[^;\\\\]+(?:\\\\[^;\\\\]+)*\\\\Models\\\\${escapeRegExp(modelClassName)}\\s*;`, 'm');
	const importPattern = new RegExp(`^use\\s+[^;\\\\]+(?:\\\\[^;\\\\]+)*\\\\${escapeRegExp(modelClassName)}\\s*;`, 'm');

	return modelImportPattern.test(policySource) || importPattern.test(policySource)
		? modelClassName
		: undefined;
}

// Whether a gate call could be asking about this policy's model. Ability names collide heavily —
// `show` is declared in every policy in a Laravel app of any size, `update` and `delete` in most —
// so a call is kept only when its target resolves to this model, or cannot be resolved at all but
// still names it.
//
// The resolver is shared with the definition direction and understands `Model::class`, `new Model`,
// a type-hinted variable, and property access. That last pair is what a policy delegating to another
// policy looks like — `Gate::allows('uploadClassified', $document->company)` targets Company, not
// the Document whose policy the call sits in — and a typed `Company $model` is extremely common in
// Restify actions and repositories, where the variable is named for its role rather than its class.
function gateCallMayTargetPolicyModel(source, abilityStartOffset, abilityEndOffset, modelClassName) {
	if (!modelClassName) {
		return true;
	}

	const targetModelName = getLaravelGateTargetModelName(source, {
		startOffset: abilityStartOffset,
		endOffset: abilityEndOffset,
	});

	if (targetModelName) {
		return targetModelName === modelClassName;
	}

	// Nothing resolvable: keep the older textual signal, which can only ever confirm a match.
	const callTail = source.slice(abilityEndOffset, Math.min(source.length, abilityEndOffset + 360));

	return new RegExp(`\\$${escapeRegExp(lowerFirst(modelClassName))}\\b`).test(callTail);
}

function getLaravelGateAbilityRanges(source, abilities, modelClassName) {
	const ranges = [];
	const quotedAbilityPattern = new RegExp(`(['"])(${abilities.map(escapeRegExp).join('|')})\\1`, 'g');
	let match;

	while ((match = quotedAbilityPattern.exec(source)) !== null) {
		const prefix = source.slice(Math.max(0, match.index - 160), match.index);

		if (!isLaravelGateAbilityPrefix(prefix)) {
			continue;
		}

		const abilityStartOffset = match.index + 1;
		const abilityEndOffset = abilityStartOffset + match[2].length;

		if (!gateCallMayTargetPolicyModel(source, abilityStartOffset, abilityEndOffset, modelClassName)) {
			continue;
		}

		ranges.push({
			start: abilityStartOffset,
			end: abilityEndOffset,
		});
	}

	return ranges;
}

function getLaravelGateAbilityAtPosition(document, position) {
	const literal = getPhpStringLiteralAtPosition(document, position);

	if (!literal) {
		return undefined;
	}

	const source = document.getText();
	const startOffset = document.offsetAt(new vscode.Position(position.line, literal.startCharacter + 1));
	const endOffset = document.offsetAt(new vscode.Position(position.line, literal.endCharacter - 1));
	const prefix = source.slice(Math.max(0, startOffset - 160), startOffset - 1);

	if (!isLaravelGateAbilityPrefix(prefix)) {
		return undefined;
	}

	return {
		ability: literal.value,
		methodName: getLaravelPolicyMethodNameFromAbility(literal.value),
		startOffset,
		endOffset,
	};
}

function getPhpParameterTypeBeforeOffset(source, variableName, offset) {
	const functionPattern = /\bfunction\s+[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*\s*\(([^)]*)\)/g;
	let match;
	let typeName;

	while ((match = functionPattern.exec(source)) !== null) {
		if (match.index > offset) {
			break;
		}

		const params = match[1].split(',');

		for (const param of params) {
			const paramPattern = new RegExp(`(?:^|\\s)(\\\\?[A-Z][A-Za-z0-9_\\\\]*)\\s+&?\\s*\\$${escapeRegExp(variableName)}\\b`);
			const paramMatch = param.match(paramPattern);

			if (paramMatch) {
				typeName = paramMatch[1].replace(/^\\/, '');
			}
		}
	}

	return typeName;
}

const PHP_NAME = '[A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff]*';

// The model a gate call is asking about, or undefined when the call site does not say.
//
// Only the argument immediately after the ability is considered. Searching the window for a shape
// that looks like a target reads whatever expression happens to come next in the file — against this
// repository that resolved `Gate::check('show', $company)` to `Nomenclator` and
// `Gate::check('process', $document)` to `Use`, both from unrelated lines further down.
function getLaravelGateTargetModelName(source, abilityInfo) {
	const callTail = source.slice(abilityInfo.endOffset, Math.min(source.length, abilityInfo.endOffset + 360));
	// Closing quote, comma, then the argument — optionally the first element of an array target.
	const argument = callTail.match(/^['"]\s*,\s*(?:\[\s*)?([^,;)\]]+)/);

	if (!argument) {
		return undefined;
	}

	const expression = argument[1].trim();
	const classTarget = expression.match(new RegExp(`^\\\\?([A-Z][A-Za-z0-9_\\\\]*)::class$`));

	if (classTarget) {
		return getShortClassName(classTarget[1]);
	}

	const newTarget = expression.match(/^new\s+\\?([A-Z][A-Za-z0-9_\\]*)/);

	if (newTarget) {
		return getShortClassName(newTarget[1]);
	}

	// `$document->company` and `$this->company` name the model through the relation rather than
	// through the variable, and are checked before the bare variable below — otherwise `$document`
	// resolves first and sends an ability belonging to Company off to DocumentPolicy. The chain
	// resolves to the segment it ends at. A trailing call is left alone: `->company()` on an Eloquent
	// model is the relation object, not the model.
	const propertyTarget = expression.match(new RegExp(`^\\$${PHP_NAME}((?:\\s*->\\s*${PHP_NAME})+)$`));

	if (propertyTarget) {
		const segments = propertyTarget[1].split('->').map((segment) => segment.trim()).filter(Boolean);

		return snakeToStudly(segments[segments.length - 1]);
	}

	const variableTarget = expression.match(new RegExp(`^\\$(${PHP_NAME})$`));

	if (!variableTarget) {
		return undefined;
	}

	// An untyped variable says nothing about the model; report that as unresolved rather than as an
	// empty name, so callers can tell "no answer" from "answered".
	const parameterType = getPhpParameterTypeBeforeOffset(source, variableTarget[1], abilityInfo.startOffset);

	return parameterType ? getShortClassName(parameterType) : undefined;
}

function getPhpMethodDeclarationRanges(source, methodName) {
	const ranges = [];
	const methodPattern = new RegExp(`\\bfunction\\s+&?\\s*${escapeRegExp(methodName)}\\s*\\(`, 'g');
	let match;

	while ((match = methodPattern.exec(source)) !== null) {
		const nameStart = match.index + match[0].indexOf(methodName);

		ranges.push({
			start: nameStart,
			end: nameStart + methodName.length,
		});
	}

	return ranges;
}

function getPhpMethodDeclarations(source) {
	const declarations = [];
	const methodPattern = /\bfunction\s+&?\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/g;
	let match;

	while ((match = methodPattern.exec(source)) !== null) {
		const methodName = match[1];
		const nameStart = match.index + match[0].indexOf(methodName);

		declarations.push({
			name: methodName,
			range: rangeFromOffsets(source, nameStart, nameStart + methodName.length),
		});
	}

	return declarations;
}

async function getLaravelGatePolicyMethodReferences(uri, position) {
	const document = await vscode.workspace.openTextDocument(uri);
	const abilityInfo = getLaravelGateAbilityAtPosition(document, position);

	if (!abilityInfo) {
		return [];
	}

	const source = document.getText();
	const modelName = getLaravelGateTargetModelName(source, abilityInfo);
	const globPattern = modelName ? `**/Policies/${modelName}Policy.php` : '**/Policies/*Policy.php';
	const files = await vscode.workspace.findFiles(globPattern, PHP_SEARCH_EXCLUDE, modelName ? 20 : 500);
	const references = [];

	for (const policyUri of files) {
		const policySource = await readWorkspaceText(policyUri);

		if (!policySource.includes(`function ${abilityInfo.methodName}`)) {
			continue;
		}

		for (const range of getPhpMethodDeclarationRanges(policySource, abilityInfo.methodName)) {
			references.push({
				uri: policyUri,
				range: rangeFromOffsets(policySource, range.start, range.end),
			});
		}
	}

	return references;
}

async function getLaravelGatePolicyReferenceCounts(document, declarations) {
	if (!isLaravelPolicyDocument(document.uri) || declarations.length === 0) {
		return new Map();
	}

	const policySource = document.getText();
	const policyClassName = getPhpClassNameBeforeOffset(policySource, policySource.length);
	const modelClassName = getPolicyModelClassName(policySource, policyClassName);
	const methodAbilities = declarations.map((declaration) => ({
		name: declaration.name,
		abilities: getLaravelGateAbilityNames(declaration.name),
	}));
	const allAbilities = [...new Set(methodAbilities.flatMap((method) => method.abilities))];
	const counts = new Map(declarations.map((declaration) => [declaration.name, 0]));
	const files = await vscode.workspace.findFiles('**/*.php', PHP_SEARCH_EXCLUDE, 5000);

	for (const fileUri of files) {
		if (sameUri(fileUri, document.uri)) {
			continue;
		}

		const source = await readWorkspaceText(fileUri);

		if (!allAbilities.some((ability) => source.includes(ability))) {
			continue;
		}

		for (const method of methodAbilities) {
			const referenceCount = getLaravelGateAbilityRanges(source, method.abilities, modelClassName).length;

			if (referenceCount > 0) {
				counts.set(method.name, (counts.get(method.name) || 0) + referenceCount);
			}
		}
	}

	return counts;
}

async function getLaravelGatePolicyReferences(uri, position) {
	if (!isLaravelPolicyDocument(uri)) {
		return [];
	}

	const document = await vscode.workspace.openTextDocument(uri);
	const ability = getFunctionDeclarationNameAtPosition(document, position);
	const policySource = document.getText();
	const policyClassName = getPhpClassNameBeforeOffset(policySource, document.offsetAt(position));
	const modelClassName = getPolicyModelClassName(policySource, policyClassName);

	if (!ability) {
		return [];
	}

	const abilities = getLaravelGateAbilityNames(ability);
	const files = await vscode.workspace.findFiles('**/*.php', PHP_SEARCH_EXCLUDE, 5000);
	const references = [];

	for (const fileUri of files) {
		const source = await readWorkspaceText(fileUri);

		if (!abilities.some((name) => source.includes(name))) {
			continue;
		}

		for (const range of getLaravelGateAbilityRanges(source, abilities, modelClassName)) {
			references.push({
				uri: fileUri,
				range: rangeFromOffsets(source, range.start, range.end),
			});
		}
	}

	return references;
}

function createLaravelPolicyCodeLensProvider() {
	return {
		async provideCodeLenses(document) {
			if (!isLaravelPolicyDocument(document.uri)) {
				return [];
			}

			const declarations = getPhpMethodDeclarations(document.getText());
			const counts = await getLaravelGatePolicyReferenceCounts(document, declarations);

			return declarations
				.map((declaration) => {
					const count = counts.get(declaration.name) || 0;

					if (count === 0) {
						return undefined;
					}

					return new vscode.CodeLens(declaration.range, {
						title: `${count} Laravel reference${count === 1 ? '' : 's'}`,
						command: 'smartReferences.showReferencesAt',
						arguments: [document.uri, declaration.range.start],
					});
				})
				.filter(Boolean);
		},
	};
}

function getPhpStringLiteralAtPosition(document, position) {
	const line = document.lineAt(position.line).text;

	for (let index = 0; index < line.length; index++) {
		const quote = line[index];

		if (quote !== '\'' && quote !== '"') {
			continue;
		}

		let end = index + 1;
		let escaped = false;

		for (; end < line.length; end++) {
			const character = line[end];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (character === '\\') {
				escaped = true;
				continue;
			}

			if (character === quote) {
				break;
			}
		}

		if (end >= line.length) {
			continue;
		}

		if (position.character >= index + 1 && position.character <= end) {
			return {
				value: line.slice(index + 1, end),
				startCharacter: index,
				endCharacter: end + 1,
			};
		}

		index = end;
	}

	return undefined;
}

function getLaravelTranslationKeyAtPosition(document, position) {
	const literal = getPhpStringLiteralAtPosition(document, position);

	if (!literal) {
		return undefined;
	}

	const source = document.getText();
	const literalOffset = document.offsetAt(new vscode.Position(position.line, literal.startCharacter));
	const prefix = source.slice(Math.max(0, literalOffset - 160), literalOffset);
	const translationCallPattern = /(?:^|[^A-Za-z0-9_\\])(?:__|trans|trans_choice)\s*\(\s*$/s;
	const langCallPattern = /(?:^|[^A-Za-z0-9_\\])\\?Lang::(?:get|choice)\s*\(\s*$/s;

	return translationCallPattern.test(prefix) || langCallPattern.test(prefix)
		? literal.value
		: undefined;
}

function getJsonTranslationKeyRanges(source, key) {
	const ranges = [];
	const encodedKey = JSON.stringify(key).slice(1, -1);
	const keyPattern = new RegExp(`"${escapeRegExp(encodedKey)}"\\s*:`, 'g');
	let match;

	while ((match = keyPattern.exec(source)) !== null) {
		ranges.push({
			start: match.index + 1,
			end: match.index + 1 + encodedKey.length,
		});
	}

	return ranges;
}

function getPhpTranslationKeyRanges(source, key, filePath) {
	const parts = key.split('.');
	const fileBaseName = path.basename(filePath, '.php');
	const lookupKey = parts.length > 1 && parts[0] === fileBaseName
		? parts[parts.length - 1]
		: key;
	const ranges = [];
	const keyPattern = new RegExp(`(['"])${escapeRegExp(lookupKey)}\\1\\s*=>`, 'g');
	let match;

	while ((match = keyPattern.exec(source)) !== null) {
		ranges.push({
			start: match.index + 1,
			end: match.index + 1 + lookupKey.length,
		});
	}

	return ranges;
}

async function getLaravelTranslationReferences(uri, position) {
	const document = await vscode.workspace.openTextDocument(uri);
	const key = getLaravelTranslationKeyAtPosition(document, position);

	if (!key) {
		return [];
	}

	const files = await vscode.workspace.findFiles('**/lang/**/*.{json,php}', PHP_SEARCH_EXCLUDE, 2000);
	const references = [];

	for (const fileUri of files) {
		const source = await readWorkspaceText(fileUri);
		const filePath = getUriPath(fileUri);
		const ranges = filePath.endsWith('.json')
			? getJsonTranslationKeyRanges(source, key)
			: getPhpTranslationKeyRanges(source, key, filePath);

		for (const range of ranges) {
			references.push({
				uri: fileUri,
				range: rangeFromOffsets(source, range.start, range.end),
			});
		}
	}

	return references;
}

// The reverse of the macro definition jump: from the name in `Rule::macro('uniqueCaseInsensitive', …)`
// find everywhere it is called. Intelephense relates neither side to the other — it sees an ordinary
// `macro()` call here and undefined methods there. Every reference request runs this, so the cursor
// check comes first and the workspace is touched only once it matches. Views are included because a
// Request or Blueprint macro is reachable from Blade, unlike a registration.
async function getLaravelMacroCallReferences(uri, position) {
	const document = await vscode.workspace.openTextDocument(uri);
	const macroName = getMacroRegistrationNameAtOffset(document.getText(), document.offsetAt(position));

	if (!macroName) {
		return [];
	}

	const files = await vscode.workspace.findFiles(
		'{app,routes,bootstrap,database,tests,resources}/**/*.php',
		PHP_SEARCH_EXCLUDE,
		4000,
	);
	const references = [];

	for (const fileUri of files) {
		const text = await tryReadWorkspaceText(fileUri);

		if (!text || !text.includes(macroName)) {
			continue;
		}

		for (const range of findMacroCallRanges(text, macroName)) {
			references.push({
				uri: fileUri,
				range: rangeFromOffsets(text, range.start, range.end),
			});
		}
	}

	logDebug(`Laravel macro references: ${macroName} -> ${references.length} call site(s)`);

	return references;
}

function getPhpClassMethodSymbols(symbols) {
	const methods = [];

	function visit(symbol, parentClass) {
		const isClassSymbol = [
			vscode.SymbolKind.Class,
			vscode.SymbolKind.Interface,
			vscode.SymbolKind.Struct,
		].includes(symbol.kind);
		const currentClass = isClassSymbol ? symbol : parentClass;

		if (currentClass && [
			vscode.SymbolKind.Constructor,
			vscode.SymbolKind.Method,
		].includes(symbol.kind)) {
			methods.push(symbol);
		}

		for (const child of symbol.children || []) {
			visit(child, currentClass);
		}
	}

	for (const symbol of symbols || []) {
		visit(symbol, undefined);
	}

	return methods;
}

function getPhpMethodLocationInSource(source, uri, methodName) {
	const ranges = getPhpMethodDeclarationRanges(source, methodName);
	const firstRange = ranges[0];

	return firstRange
		? {
			uri,
			range: rangeFromOffsets(source, firstRange.start, firstRange.end),
		}
		: undefined;
}

function getPhpTraitNames(source) {
	const traitNames = [];
	const traitUsePattern = /^\s+use\s+([^;{]+)\s*;/gm;
	let match;

	while ((match = traitUsePattern.exec(source)) !== null) {
		for (const name of match[1].split(',')) {
			const normalizedName = name.trim().replace(/^\\/, '');

			if (normalizedName) {
				traitNames.push(normalizedName);
			}
		}
	}

	return traitNames;
}

async function getPhpTraitMethodLocation(source, methodName, workspaceFolderUri, seen) {
	for (const traitName of getPhpTraitNames(source)) {
		const traitFqn = resolvePhpClassName(source, traitName);

		if (!traitFqn || seen.has(`trait:${traitFqn}`)) {
			continue;
		}

		seen.add(`trait:${traitFqn}`);

		const traitUri = await getPhpClassUriFromFqn(traitFqn, workspaceFolderUri);

		if (!traitUri) {
			continue;
		}

		const traitSource = await readWorkspaceText(traitUri);
		const directLocation = getPhpMethodLocationInSource(traitSource, traitUri, methodName);

		if (directLocation) {
			return directLocation;
		}

		const nestedTraitLocation = await getPhpTraitMethodLocation(traitSource, methodName, workspaceFolderUri, seen);

		if (nestedTraitLocation) {
			return nestedTraitLocation;
		}
	}

	return undefined;
}

async function findParentPhpMethodLocationFromSource(source, uri, methodName, workspaceFolderUri, seen = new Set()) {
	const classInfo = getPhpClassInfo(source);
	const parentFqn = resolvePhpClassName(source, classInfo?.extendsName);

	if (!parentFqn || seen.has(parentFqn)) {
		return undefined;
	}

	seen.add(parentFqn);

	const parentUri = await getPhpClassUriFromFqn(parentFqn, workspaceFolderUri);

	if (!parentUri) {
		return undefined;
	}

	const parentSource = await readWorkspaceText(parentUri);
	const directLocation = getPhpMethodLocationInSource(parentSource, parentUri, methodName);

	if (directLocation) {
		return directLocation;
	}

	const traitLocation = await getPhpTraitMethodLocation(parentSource, methodName, workspaceFolderUri, seen);

	if (traitLocation) {
		return traitLocation;
	}

	return findParentPhpMethodLocationFromSource(parentSource, parentUri, methodName, workspaceFolderUri, seen);
}

async function getParentPhpMethodLocation(document, methodName) {
	const workspaceFolderUri = getWorkspaceFolderUri(document.uri);

	if (!workspaceFolderUri) {
		return undefined;
	}

	return findParentPhpMethodLocationFromSource(document.getText(), document.uri, methodName, workspaceFolderUri);
}

async function openLocationDirectly(location) {
	if (!location?.uri || !location?.range) {
		return;
	}

	await vscode.window.showTextDocument(location.uri, {
		selection: location.range,
		preserveFocus: false,
		preview: false,
	});
}

function createPhpParentCodeLensProvider() {
	return {
		async provideCodeLenses(document) {
			const symbols = await getDocumentSymbols(document);
			const methodSymbols = getPhpClassMethodSymbols(symbols);
			const parentLocationCache = new Map();
			const lenses = [];

			for (const method of methodSymbols) {
				if (!parentLocationCache.has(method.name)) {
					parentLocationCache.set(method.name, getParentPhpMethodLocation(document, method.name));
				}

				const parentLocation = await parentLocationCache.get(method.name);

				if (!parentLocation) {
					continue;
				}

				lenses.push(new vscode.CodeLens(method.selectionRange || method.range, {
					title: 'Parent',
					command: 'smartReferences.openLocation',
					arguments: [parentLocation],
				}));
			}

			return lenses;
		},
	};
}

const PHP_REFERENCE_CODE_LENS_SYMBOL_KINDS = new Set([
	vscode.SymbolKind.Class,
	vscode.SymbolKind.Constructor,
	vscode.SymbolKind.Enum,
	vscode.SymbolKind.Function,
	vscode.SymbolKind.Interface,
	vscode.SymbolKind.Method,
	vscode.SymbolKind.Struct,
]);

function getPhpReferenceCodeLensSymbols(symbols) {
	const result = [];

	function visit(symbol) {
		if (PHP_REFERENCE_CODE_LENS_SYMBOL_KINDS.has(symbol.kind)) {
			result.push(symbol);
		}

		for (const child of symbol.children || []) {
			visit(child);
		}
	}

	for (const symbol of symbols || []) {
		visit(symbol);
	}

	return result;
}

// Intelephense reports `@method` and `@property` docblock tags as ordinary document symbols,
// then resolves them to whatever really declares them — for a Laravel model, the Eloquent base
// class. Asking about those positions workspace-wide answers about the PARENT, not the annotated
// class: `@method static MetaTokenQueryBuilder query()` on MetaToken reported 943, which is every
// Model::query() call in the project and says nothing about MetaToken.
const PHPDOC_TAG_LINE_PATTERN = /^\s*(?:\/\*\*)?\s*\*?\s*@(?:method|property(?:-read|-write)?)\b/;

// `@method static <type> name(...)`. The lazy `.*?` skips an optional return type, so both
// `@method static query()` and `@method static MetaTokenQueryBuilder query()` capture `query`.
const PHPDOC_STATIC_METHOD_TAG_PATTERN = /^\s*(?:\/\*\*)?\s*\*?\s*@method\s+static\s+.*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

// Cleared on save, because that is when call sites in this workspace actually change. A scan is
// otherwise repeated for every CodeLens refresh, which means every keystroke in the model file.
const staticCallReferenceCache = new Map();

function getPhpClassNameAfterOffset(source, offset) {
	const classPattern = /\b(?:abstract\s+|final\s+|readonly\s+)*class\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/;

	return classPattern.exec(source.slice(offset))?.[1];
}

// A `@method static` tag documents calls written literally as `Class::name(`, so the owning class
// is the one declared after the docblock, not whatever the tag resolves to.
function getPhpDocStaticCallScope(document, line) {
	if (line >= document.lineCount) {
		return undefined;
	}

	const match = PHPDOC_STATIC_METHOD_TAG_PATTERN.exec(document.lineAt(line).text);

	if (!match) {
		return undefined;
	}

	const className = getPhpClassNameAfterOffset(document.getText(), document.offsetAt(new vscode.Position(line, 0)));

	return className ? { className, methodName: match[1] } : undefined;
}

// Intelephense resolves a `@method static` tag to the base class, so its reference list is every
// model's call at once — 943 for `query()`. The ones that belong to this class are the locations
// whose line reads `Class::` immediately before the match, which costs one read per distinct file.
// Read through workspace.fs rather than openTextDocument: opening documents is what floods
// Intelephense with diagnostics work and made the picker crawl.
async function filterStaticCallReferences(references, className) {
	const linesByUri = new Map();
	// A backslash counts as a boundary, so `\App\Models\MetaToken::` and `\MetaToken::` match while
	// `LegacyMetaToken::` does not.
	const prefixPattern = new RegExp(`(?:^|[^A-Za-z0-9_])${className}\\s*::\\s*$`);
	const matches = [];

	for (const reference of references) {
		const key = reference.uri.toString();

		if (!linesByUri.has(key)) {
			linesByUri.set(key, (await readWorkspaceText(reference.uri)).split('\n'));
		}

		const line = linesByUri.get(key)[reference.range.start.line];

		if (line && prefixPattern.test(line.slice(0, reference.range.start.character))) {
			matches.push(reference);
		}
	}

	return matches;
}

async function getPhpDocStaticCallReferences(document, line, languageProviderReferences) {
	const scope = getPhpDocStaticCallScope(document, line);

	if (!scope) {
		return undefined;
	}

	const cacheKey = `${scope.className}::${scope.methodName}`;
	let references = staticCallReferenceCache.get(cacheKey);

	if (references === undefined) {
		references = await filterStaticCallReferences(languageProviderReferences, scope.className);
		staticCallReferenceCache.set(cacheKey, references);
	}

	return references;
}

async function getPhpReferenceCodeLensCount(document, position, isDocTagLine) {
	const [definitions, references] = await Promise.all([
		getDefinitionTargets(document.uri, position),
		getLanguageProviderReferences(document.uri, position),
	]);

	if (isDocTagLine) {
		const staticCalls = await getPhpDocStaticCallReferences(document, position.line, references);

		if (staticCalls) {
			return staticCalls.length;
		}
	}

	const documentKey = document.uri.toString();

	return references.filter((reference) => {
		if (isDefinitionLocation(reference, definitions)) {
			return false;
		}

		if (!isDocTagLine) {
			return true;
		}

		// A tag we cannot answer exactly — non-static `@method`, `@property` — falls back to the
		// open file, where at least the number is about this class. The tag line is the
		// declaration, not a usage of what it declares.
		return reference.uri.toString() === documentKey
			&& reference.range.start.line !== position.line;
	}).length;
}

function createPhpReferenceCodeLensProvider() {
	const countCache = new Map();

	return {
		async provideCodeLenses(document) {
			const symbols = getPhpReferenceCodeLensSymbols(await getDocumentSymbols(document));
			const lenses = [];

			for (const symbol of symbols) {
				const range = symbol.selectionRange || symbol.range;
				// Symbols were fetched asynchronously, so the document may already be shorter;
				// an out-of-range lineAt would reject the whole batch and blank every lens.
				const isDocTagLine = range.start.line < document.lineCount
					&& PHPDOC_TAG_LINE_PATTERN.test(document.lineAt(range.start.line).text);
				const cacheKey = [
					document.uri.toString(),
					document.version,
					range.start.line,
					range.start.character,
				].join(':');

				let count = countCache.get(cacheKey);

				if (count === undefined) {
					count = await getPhpReferenceCodeLensCount(document, range.start, isDocTagLine);
					countCache.set(cacheKey, count);
				}

				if (count === 0) {
					continue;
				}

				lenses.push(new vscode.CodeLens(range, {
					title: `${count} Reference${count === 1 ? '' : 's'}`,
					command: 'smartReferences.showReferencesAt',
					arguments: [document.uri, range.start, isDocTagLine],
				}));
			}

			return lenses;
		},
	};
}

async function getLanguageProviderReferences(uri, position) {
	const references = await vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, position);

	return Array.isArray(references) ? filterProviderLocations(references) : [];
}

async function getReferenceTargets(uri, position, options = {}) {
	const [definitions, invokeRouteReferences, gatePolicyReferences, gatePolicyMethodReferences, languageProviderReferences, translationReferences, accessorPropertyReferences, macroCallReferences] = await Promise.all([
		getDefinitionTargets(uri, position),
		getInvokeRouteReferences(uri, position),
		getLaravelGatePolicyReferences(uri, position),
		getLaravelGatePolicyMethodReferences(uri, position),
		options.includeLanguageProviderReferences ? getLanguageProviderReferences(uri, position) : [],
		getLaravelTranslationReferences(uri, position),
		getAccessorPropertyReferences(uri, position),
		getLaravelMacroCallReferences(uri, position),
	]);
	// On a docblock tag the provider's answer is about the base class, so it is either narrowed to
	// this class's `Class::name(` call sites or, when the tag cannot be answered exactly, to the
	// open file. Both happen before the merge so the rejected locations never reach
	// showReferences, which opens a document per row.
	let providerReferences = languageProviderReferences;
	let sameFileOnly = false;

	if (options.docTagScoped) {
		const document = await vscode.workspace.openTextDocument(uri);
		const staticCalls = await getPhpDocStaticCallReferences(document, position.line, languageProviderReferences);

		if (staticCalls) {
			providerReferences = staticCalls;
		} else {
			sameFileOnly = true;
		}
	}

	const customReferences = [
		...providerReferences,
		...invokeRouteReferences,
		...gatePolicyReferences,
		...gatePolicyMethodReferences,
		...translationReferences,
		...accessorPropertyReferences,
		...macroCallReferences,
	];

	if (customReferences.length === 0) {
		return [];
	}

	const seen = new Set();

	return customReferences.filter((reference) => {
		if (isGeneratedLaravelHelper(reference) || isCurrentLocation(reference, uri, position) || isDefinitionLocation(reference, definitions)) {
			return false;
		}

		if (sameFileOnly && !sameUri(reference.uri, uri)) {
			return false;
		}

		const key = getLocationLineKey(reference);

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);

		return true;
	});
}

async function showReferencesAtLocation(uri, position, options = {}) {
	const targets = await getReferenceTargets(uri, position, {
		includeLanguageProviderReferences: Boolean(options.includeLanguageProviderReferences),
		docTagScoped: Boolean(options.docTagScoped),
	});

	if (targets.length === 0) {
		vscode.window.showInformationMessage('No other references found.');
		return;
	}

	if (!options.forcePicker && targets.length === 1 && sameUri(targets[0].uri, uri)) {
		const target = targets[0];
		await vscode.window.showTextDocument(target.uri, {
			selection: target.range,
			preserveFocus: false,
			preview: false,
		});
		return;
	}

	await showReferences(targets);
}

async function goToSmartReference(options = {}) {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		return;
	}

	const uri = editor.document.uri;
	const position = editor.selection.active;
	const forcePicker = Boolean(options.forcePicker);

	if (!forcePicker) {
		const definitionResult = await goToDefinition(uri, position);

		if (definitionResult === 'opened') {
			return;
		}

		if (definitionResult === 'current') {
			options = { ...options, forcePicker: true };
		}
	}

	const shouldForcePicker = Boolean(options.forcePicker);
	await showReferencesAtLocation(uri, position, {
		forcePicker: shouldForcePicker,
		includeLanguageProviderReferences: true,
		docTagScoped: PHPDOC_TAG_LINE_PATTERN.test(editor.document.lineAt(position.line).text),
	});
}

function hasSingleEmptySelection(editor) {
	return editor.selections.length === 1 && editor.selection.isEmpty;
}

function getPhpContinuationTokenInfo(document, position) {
	const line = document.lineAt(position.line).text;
	const beforeCursor = line.slice(0, position.character);

	if (!/^\s*$/.test(beforeCursor)) {
		return undefined;
	}

	const afterCursor = line.slice(position.character);
	const match = afterCursor.match(/^(\s*)(\S[\s\S]*)$/);

	if (!match) {
		return undefined;
	}

	return {
		text: match[2],
		position: new vscode.Position(position.line, position.character + match[1].length),
	};
}

function getPhpContinuationTokenPosition(document, position) {
	const token = getPhpContinuationTokenInfo(document, position);

	return token ? token.position : position;
}

function isPhpBooleanContinuation(document, position) {
	if (position.line === 0) {
		return false;
	}

	const token = getPhpContinuationTokenInfo(document, position);
	const previousLine = document.lineAt(position.line - 1).text.trimEnd();

	return Boolean(token)
		&& /^(?:&&|\|\|)\s+\S/.test(token.text)
		&& /\S/.test(previousLine)
		&& !/(?:&&|\|\||[([{,])\s*$/.test(previousLine);
}

function isPhpTernaryContinuation(document, position) {
	if (position.line === 0) {
		return false;
	}

	const token = getPhpContinuationTokenInfo(document, position);
	const previousLine = document.lineAt(position.line - 1).text.trimEnd();

	return Boolean(token)
		&& /^[?:]\s+\S/.test(token.text)
		&& /\S/.test(previousLine);
}

function isPhpArrowFunctionContinuation(document, position) {
	if (position.line === 0) {
		return false;
	}

	const token = getPhpContinuationTokenInfo(document, position);
	const previousLine = document.lineAt(position.line - 1).text.trimEnd();

	return Boolean(token)
		&& /=>\s*$/.test(previousLine);
}

function getPhpEmptyLineBackspaceInfo(document, position) {
	if (position.line === 0) {
		return undefined;
	}

	const line = document.lineAt(position.line).text;

	if (line.trim()) {
		return undefined;
	}

	const previousLine = document.lineAt(position.line - 1);
	const previousText = previousLine.text;
	const previousCodeEnd = previousText.trim() ? previousText.trimEnd().length : 0;
	const target = new vscode.Position(position.line - 1, previousCodeEnd);

	return {
		range: new vscode.Range(previousLine.range.end, document.lineAt(position.line).range.end),
		target,
	};
}

async function smartBackspace() {
	const editor = vscode.window.activeTextEditor;

	if (!editor || !hasSingleEmptySelection(editor)) {
		await vscode.commands.executeCommand('deleteLeft');
		return;
	}

	const position = editor.selection.active;
	const emptyLineInfo = getPhpEmptyLineBackspaceInfo(editor.document, position);

	if (emptyLineInfo) {
		await editor.edit((editBuilder) => {
			editBuilder.delete(emptyLineInfo.range);
		});

		editor.selection = new vscode.Selection(emptyLineInfo.target, emptyLineInfo.target);
		return;
	}

	// Operators that have to breathe once the wrap is undone: `=>`, `&&`/`||`, and the `?`/`:` arms
	// of a ternary all read as one token glued to the line above without the space.
	if (isPhpArrowFunctionContinuation(editor.document, position)
		|| isPhpBooleanContinuation(editor.document, position)
		|| isPhpTernaryContinuation(editor.document, position)) {
		const previousLine = editor.document.lineAt(position.line - 1);
		const joinRange = new vscode.Range(previousLine.range.end, getPhpContinuationTokenPosition(editor.document, position));

		await editor.edit((editBuilder) => {
			editBuilder.replace(joinRange, ' ');
		});
		return;
	}

	// Anything else, with the caret on the first non-whitespace character of an indented line: one
	// press does what repeated presses already ended in. `deleteLeft` walks left one tab stop at a
	// time and joins the lines only once it reaches column 0, so the indentation had to be chewed
	// through before the text moved anywhere — and moving the text up is almost always the intent.
	// Nothing is inserted, which is exactly what `deleteLeft` does when it finally joins.
	//
	// This replaces three earlier branches, for `->` chains, lines opened by `(`/`[`/`,`, and
	// closing delimiters. Each computed this identical edit, and each only recognised one shape of
	// wrap; string concatenation onto a `.` at line start, the case this was reported for, matched
	// none of them and fell through to the outdent.
	if (position.line > 0 && getPhpContinuationTokenInfo(editor.document, position)) {
		const previousLine = editor.document.lineAt(position.line - 1);
		const joinRange = new vscode.Range(previousLine.range.end, getPhpContinuationTokenPosition(editor.document, position));

		await editor.edit((editBuilder) => {
			editBuilder.delete(joinRange);
		});
		return;
	}

	await vscode.commands.executeCommand('deleteLeft');
}

function findOutsideString(text, matcher) {
	let quote = '';
	let escaped = false;

	for (let index = 0; index < text.length; index++) {
		const char = text[index];

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = '';
			}
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			continue;
		}

		const result = matcher(text, index);
		if (result !== undefined) {
			return result;
		}
	}

	return undefined;
}

function getPhpObjectOperatorPositions(text) {
	const operators = [];
	let quote = '';
	let escaped = false;
	let depth = 0;

	for (let index = 0; index < text.length - 1; index++) {
		const char = text[index];

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = '';
			}
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			continue;
		}

		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}

		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			continue;
		}

		if (char === '-' && text[index + 1] === '>') {
			const memberMatch = text.slice(index + 2).match(/^\s*[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/);

			if (memberMatch) {
				const memberEnd = index + 2 + memberMatch[0].length;
				const nextNonWhitespace = text.slice(memberEnd).match(/\S/);

				if (nextNonWhitespace && nextNonWhitespace[0] === '(') {
					operators.push({ depth, position: index });
				}
			}

			index++;
		}
	}

	return operators;
}

function getFirstParenPosition(text) {
	return findOutsideString(text, (value, index) => value[index] === '(' ? index : undefined);
}

function hasStaticCallBeforeOperator(text, position) {
	return /::\s*[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*\s*\([\s\S]*\)\s*$/.test(text.slice(0, position));
}

function getPhpChainLayout(text) {
	const arrowOperators = getPhpObjectOperatorPositions(text);

	if (arrowOperators.length === 0) {
		return undefined;
	}

	const chainDepth = Math.min(...arrowOperators.map((operator) => operator.depth));
	const splitPositions = arrowOperators
		.filter((operator) => operator.depth === chainDepth)
		.map((operator) => operator.position);

	if (splitPositions.length < 2 && !hasStaticCallBeforeOperator(text, splitPositions[0])) {
		return undefined;
	}

	return {
		arrowPositions: arrowOperators.map((operator) => operator.position),
		continuationColumn: splitPositions[0],
		splitPositions,
	};
}

function getPhpArrowBreakInfo(document, position) {
	const line = document.lineAt(position.line).text;
	const afterCursor = line.slice(position.character);
	const afterMatch = afterCursor.match(/^(\s*)->/);

	if (!afterMatch) {
		return undefined;
	}

	const arrowColumn = position.character + afterMatch[1].length;
	const layout = getPhpChainLayout(line);

	if (!layout || !layout.splitPositions.includes(arrowColumn)) {
		return undefined;
	}

	return {
		arrowColumn,
		deleteWhitespace: afterMatch[1].length,
		indent: `${getLineIndent(line)}    `,
	};
}

function getPhpEmptyArrayEnterInfo(document, position) {
	const line = document.lineAt(position.line).text;
	const beforeCursor = line.slice(0, position.character);
	const afterCursor = line.slice(position.character);
	const afterMatch = afterCursor.match(/^(\s*)\](\s*;)?\s*$/);

	if (!/\[\s*$/.test(beforeCursor) || !afterMatch) {
		return undefined;
	}

	const baseIndent = getLineIndent(line);

	return {
		replaceRange: new vscode.Range(position, position.translate(0, afterMatch[1].length + 1 + (afterMatch[2] ? afterMatch[2].length : 0))),
		snippet: new vscode.SnippetString(`\n${baseIndent}    $0\n${baseIndent}];`),
	};
}

function getPhpArrayKeyEqualsInfo(document, position) {
	const line = document.lineAt(position.line).text;
	const beforeCursor = line.slice(0, position.character);
	const afterCursor = line.slice(position.character);
	const keyMatch = beforeCursor.match(/^(\s*)(?:(?:'[^'\\]*(?:\\.[^'\\]*)*')|(?:"[^"\\]*(?:\\.[^"\\]*)*")|(?:[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)|(?:\d+))(\s*)$/);

	if (!keyMatch || /\S/.test(afterCursor)) {
		return undefined;
	}

	return {
		replaceRange: new vscode.Range(position.translate(0, -keyMatch[2].length), position),
		text: ' => ',
	};
}

function getLineIndent(text) {
	return text.match(/^\s*/)[0];
}

function getPhpStatementRange(document, lineNumber) {
	const text = document.getText();
	const lineStartOffset = document.offsetAt(new vscode.Position(lineNumber, 0));
	let startOffset = 0;
	let endOffset;
	let quote = '';
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	let groupingDepth = 0;

	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		const next = text[index + 1];

		if (lineComment) {
			if (char === '\n') {
				lineComment = false;
			}
			continue;
		}

		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				index++;
			}
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = '';
			}
			continue;
		}

		if (char === '/' && next === '/') {
			lineComment = true;
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			blockComment = true;
			index++;
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			continue;
		}

		if (char === '(' || char === '[') {
			groupingDepth++;
			continue;
		}

		if (char === ')' || char === ']') {
			groupingDepth = Math.max(0, groupingDepth - 1);
		}

		if (index < lineStartOffset && (char === '{' || char === '}')) {
			startOffset = index + 1;
			groupingDepth = 0;
			continue;
		}

		if (index < lineStartOffset && groupingDepth === 0 && char === ';') {
			startOffset = index + 1;
			continue;
		}

		if (index >= lineStartOffset && endOffset === undefined && groupingDepth === 0 && char === ';') {
			endOffset = index + 1;
			break;
		}
	}

	while (startOffset < text.length && (text[startOffset] === '\n' || text[startOffset] === '\r')) {
		startOffset++;
	}

	if (endOffset === undefined || endOffset <= startOffset) {
		const line = document.lineAt(lineNumber);
		return line.range;
	}

	return new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset));
}

function reindentPhpChainChunk(chunk, continuationIndent) {
	const lines = chunk.trimEnd().split('\n');
	const output = [`${continuationIndent}${lines[0].trim()}`];
	const childLines = lines.slice(1);
	const childIndent = childLines
		.filter((line) => line.trim())
		.reduce((minimum, line) => Math.min(minimum, line.match(/^\s*/)[0].length), Infinity);

	for (const line of childLines) {
		if (!line.trim()) {
			output.push('');
			continue;
		}

		if (Number.isFinite(childIndent)) {
			output.push(`${continuationIndent}${line.slice(childIndent).trimEnd()}`);
			continue;
		}

		output.push(`${continuationIndent}${line.trim()}`);
	}

	return output.join('\n');
}

function splitPhpChainText(text) {
	const layout = getPhpChainLayout(text);

	if (!layout || layout.splitPositions.length === 0) {
		return undefined;
	}

	const baseIndent = getLineIndent(text);
	const indent = `${baseIndent}    `;
	const lines = [];
	let start = 0;

	for (const [index, position] of layout.splitPositions.entries()) {
		const chunk = text.slice(start, position);
		lines.push(index === 0 ? chunk.trimEnd() : reindentPhpChainChunk(chunk, indent));
		start = position;
	}

	lines.push(reindentPhpChainChunk(text.slice(start), indent));

	return lines.join('\n');
}

function splitPhpChainLine(text) {
	return splitPhpChainText(text);
}

function getSplitPhpChainEdit(document, lineNumber) {
	const range = getPhpStatementRange(document, lineNumber);
	const text = document.getText(range);
	const replacement = splitPhpChainText(text);

	if (!replacement || replacement === text) {
		return undefined;
	}

	return { range, replacement };
}

async function smartEnter() {
	const editor = vscode.window.activeTextEditor;

	if (!editor || !hasSingleEmptySelection(editor)) {
		await vscode.commands.executeCommand('default:type', { text: '\n' });
		return;
	}

	const position = editor.selection.active;

	if (editor.document.languageId === 'json' || editor.document.languageId === 'jsonc') {
		const offset = editor.document.offsetAt(position);

		if (shouldInsertJsonComma(editor.document.getText(), offset)) {
			await vscode.commands.executeCommand('default:type', { text: ',' });
		}

		await vscode.commands.executeCommand('default:type', { text: '\n' });
		return;
	}

	const arrayInfo = getPhpEmptyArrayEnterInfo(editor.document, position);

	if (arrayInfo) {
		await editor.insertSnippet(arrayInfo.snippet, arrayInfo.replaceRange);
		return;
	}

	const breakInfo = getPhpArrowBreakInfo(editor.document, position);

	if (!breakInfo) {
		await vscode.commands.executeCommand('default:type', { text: '\n' });
		return;
	}

	const deleteEnd = position.translate(0, breakInfo.deleteWhitespace);

	await editor.edit((editBuilder) => {
		editBuilder.replace(new vscode.Range(position, deleteEnd), `\n${breakInfo.indent}`);
	});
}

async function smartEquals() {
	const editor = vscode.window.activeTextEditor;

	if (!editor || !hasSingleEmptySelection(editor)) {
		await vscode.commands.executeCommand('default:type', { text: '=' });
		return;
	}

	const equalsInfo = getPhpArrayKeyEqualsInfo(editor.document, editor.selection.active);

	if (!equalsInfo) {
		await vscode.commands.executeCommand('default:type', { text: '=' });
		return;
	}

	await editor.edit((editBuilder) => {
		editBuilder.replace(equalsInfo.replaceRange, equalsInfo.text);
	});
}

function getPreviousNonEmptyLine(document, lineNumber) {
	for (let index = lineNumber; index >= 0; index--) {
		const line = document.lineAt(index).text;

		if (line.trim()) {
			return line;
		}
	}

	return undefined;
}

function getNextNonEmptyLine(document, lineNumber) {
	for (let index = lineNumber; index < document.lineCount; index++) {
		const line = document.lineAt(index).text;

		if (line.trim()) {
			return line;
		}
	}

	return undefined;
}

function getPhpBlankLineArrayIndent(document, lineNumber) {
	const line = document.lineAt(lineNumber).text;

	if (line.trim()) {
		return undefined;
	}

	const previousLine = getPreviousNonEmptyLine(document, lineNumber - 1);
	const nextLine = getNextNonEmptyLine(document, lineNumber + 1);

	if (nextLine && /^\s*\]/.test(nextLine)) {
		return `${getLineIndent(nextLine)}    `;
	}

	if (previousLine && /\[\s*$/.test(previousLine.trimEnd())) {
		return `${getLineIndent(previousLine)}    `;
	}

	return undefined;
}

async function smartCursorUp() {
	// A navigation key must NEVER mutate the document. The previous implementation
	// rewrote the blank line above with indentation whitespace (editBuilder.replace)
	// purely to pre-position the caret at the "smart" indent column. Combined with
	// `files.autoSave: afterDelay`, merely pressing Up persisted phantom trailing
	// whitespace into files and polluted the undo stack. Fall back to a plain,
	// non-destructive cursor move; VS Code's on-type auto-indent handles indentation
	// when the user actually starts typing on that line.
	await vscode.commands.executeCommand('cursorUp');
}

async function splitPhpChainAtSelection() {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		return;
	}

	const edit = getSplitPhpChainEdit(editor.document, editor.selection.active.line);

	if (!edit) {
		return;
	}

	await editor.edit((editBuilder) => {
		editBuilder.replace(edit.range, edit.replacement);
	});
}

function getInlayHintLabelText(label) {
	if (Array.isArray(label)) {
		return label.map((part) => typeof part === 'string' ? part : part.value).join('');
	}

	return typeof label === 'string' ? label : '';
}

function isParameterInlayHint(hint, label) {
	return hint.kind === vscode.InlayHintKind.Parameter || label.trim().endsWith(':');
}

function isTypeInlayHint(hint, label) {
	return hint.kind === vscode.InlayHintKind.Type || label.trim().startsWith(':');
}

function getShortClassName(className) {
	return className.replace(/^\\/, '').split('\\').pop();
}

function offsetAt(source, position) {
	const lines = source.split('\n');
	let offset = 0;

	for (let lineNumber = 0; lineNumber < Math.min(position.line, lines.length); lineNumber++) {
		offset += lines[lineNumber].length + 1;
	}

	return offset + position.character;
}

function getPhpDeclaredTypeFqnAtOffset(source, offset) {
	const declarationPattern = /\b(?:class|interface|trait|enum)\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/g;
	const namespace = getPhpNamespace(source);
	let match;
	let nearest;

	while ((match = declarationPattern.exec(source)) !== null) {
		const start = match.index + match[0].lastIndexOf(match[1]);
		const end = start + match[1].length;

		if (start <= offset && offset <= end) {
			nearest = match[1];
			break;
		}

		if (start <= offset) {
			nearest = match[1];
		}
	}

	return nearest ? (namespace ? `${namespace}\\${nearest}` : nearest) : undefined;
}

async function getInlayHintLabelClassFqns(hint) {
	if (!Array.isArray(hint.label)) {
		return new Map();
	}

	const classFqns = new Map();

	for (const part of hint.label) {
		if (!part || typeof part === 'string' || !part.location?.uri || !part.location?.range) {
			continue;
		}

		let source;

		try {
			source = await readWorkspaceText(part.location.uri);
		} catch {
			continue;
		}

		const fqn = getPhpDeclaredTypeFqnAtOffset(source, offsetAt(source, part.location.range.start));

		if (fqn) {
			classFqns.set(getShortClassName(fqn), fqn);
		}
	}

	return classFqns;
}

function getPhpInlayHintClassImports(document, text, knownClassFqns = new Map()) {
	const imports = [];
	const source = document.getText();
	let replacement = text;
	const classPattern = /\\?[A-Z][A-Za-z0-9_\x80-\xff]*(?:\\[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)+/g;
	const matches = [...text.matchAll(classPattern)]
		.map((match) => match[0].replace(/^\\/, ''));

	for (const fqn of [...new Set(matches)]) {
		const shortName = getShortClassName(fqn);

		if (!shortName || hasConflictingPhpImport(document, shortName, fqn)) {
			continue;
		}

		if (resolvePhpClassName(source, shortName) !== fqn && !hasExactPhpImport(document, fqn)) {
			imports.push(fqn);
		}

		replacement = replacement.replace(new RegExp(`\\\\?${escapeRegExp(fqn)}`, 'g'), shortName);
	}

	for (const [shortName, fqn] of knownClassFqns) {
		if (!shortName || !fqn || !new RegExp(`(^|[^A-Za-z0-9_\\\\])${escapeRegExp(shortName)}([^A-Za-z0-9_]|$)`).test(replacement)) {
			continue;
		}

		if (hasConflictingPhpImport(document, shortName, fqn)) {
			continue;
		}

		if (resolvePhpClassName(source, shortName) !== fqn && !hasExactPhpImport(document, fqn)) {
			imports.push(fqn);
		}
	}

	return {
		text: replacement,
		imports,
	};
}

function formatInlayHintInsertion(document, hint) {
	const label = getInlayHintLabelText(hint.label);

	if (!label.trim()) {
		return {
			text: '',
			imports: [],
		};
	}

	let text = '';

	if (isParameterInlayHint(hint, label)) {
		text = /\s$/.test(label) ? label : `${label} `;

		return {
			text,
			imports: [],
		};
	}

	if (isTypeInlayHint(hint, label)) {
		if (/^\s*:/.test(label)) {
			text = label;

			return getPhpInlayHintClassImports(document, text);
		}

		const line = document.lineAt(hint.position.line).text;
		const before = line.slice(0, hint.position.character);
		const after = line.slice(hint.position.character);

		if (/\)\s*$/.test(before) && /^\s*=>/.test(after)) {
			text = `: ${label.trim()}`;

			return getPhpInlayHintClassImports(document, text);
		}

		text = `${label.trim()} `;

		return getPhpInlayHintClassImports(document, text);
	}

	return {
		text: '',
		imports: [],
	};
}

function containsPosition(range, position) {
	return (position.line > range.start.line || (position.line === range.start.line && position.character >= range.start.character))
		&& (position.line < range.end.line || (position.line === range.end.line && position.character <= range.end.character));
}

function getPhpCallRangeAtPosition(document, position) {
	const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/);

	if (!wordRange) {
		return undefined;
	}

	const statementRange = getPhpStatementRange(document, position.line);
	const statementText = document.getText(statementRange);
	const statementStartOffset = document.offsetAt(statementRange.start);
	const wordEndOffset = document.offsetAt(wordRange.end) - statementStartOffset;
	const afterWord = statementText.slice(wordEndOffset);
	const openMatch = afterWord.match(/^\s*\(/);

	if (!openMatch) {
		return undefined;
	}

	const openOffset = wordEndOffset + openMatch[0].length - 1;
	let quote = '';
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	let depth = 0;

	for (let index = openOffset; index < statementText.length; index++) {
		const char = statementText[index];
		const next = statementText[index + 1];

		if (lineComment) {
			if (char === '\n') {
				lineComment = false;
			}
			continue;
		}

		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				index++;
			}
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = '';
			}
			continue;
		}

		if (char === '/' && next === '/') {
			lineComment = true;
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			blockComment = true;
			index++;
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			continue;
		}

		if (char === '(') {
			depth++;
			continue;
		}

		if (char === ')') {
			depth--;

			if (depth === 0) {
				return new vscode.Range(wordRange.start, document.positionAt(statementStartOffset + index + 1));
			}
		}
	}

	return undefined;
}

async function getPhpInlayHintEdits(document, target) {
	const hintRange = typeof target === 'number' ? document.lineAt(target).range : target;
	const hints = await vscode.commands.executeCommand('vscode.executeInlayHintProvider', document.uri, hintRange);

	if (!Array.isArray(hints)) {
		return [];
	}

	const edits = await Promise.all(hints
		.filter((hint) => hint && hint.position && containsPosition(hintRange, hint.position))
		.map(async (hint) => {
			const insertion = formatInlayHintInsertion(document, hint);
			const classFqns = await getInlayHintLabelClassFqns(hint);
			const withImports = getPhpInlayHintClassImports(document, insertion.text, classFqns);

			return {
				position: hint.position,
				text: withImports.text,
				imports: [...insertion.imports, ...withImports.imports],
			};
		}));

	return edits
		.filter((edit) => edit.text)
		.sort((a, b) => b.position.line - a.position.line || b.position.character - a.position.character);
}

function addPhpInlayHintImportsToWorkspaceEdit(document, workspaceEdit, edits) {
	const importPosition = getPhpImportInsertionPosition(document);
	const imports = [...new Set(edits.flatMap((edit) => edit.imports || []))]
		.filter((fqn) => !hasExactPhpImport(document, fqn))
		.sort((a, b) => a.localeCompare(b));

	if (imports.length > 0) {
		workspaceEdit.insert(document.uri, importPosition, imports.map((fqn) => `use ${fqn};`).join('\n') + '\n');
	}
}

async function applyPhpInlayHintsAtSelection() {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		return;
	}

	const callRange = getPhpCallRangeAtPosition(editor.document, editor.selection.active);
	const edits = await getPhpInlayHintEdits(editor.document, callRange ?? editor.selection.active.line);

	if (edits.length === 0) {
		return;
	}

	const workspaceEdit = new vscode.WorkspaceEdit();
	addPhpInlayHintImportsToWorkspaceEdit(editor.document, workspaceEdit, edits);

	for (const edit of edits) {
		workspaceEdit.insert(editor.document.uri, edit.position, edit.text);
	}

	await vscode.workspace.applyEdit(workspaceEdit);
}

async function createApplyPhpInlayHintsAction(document, range) {
	const callRange = getPhpCallRangeAtPosition(document, range.start);
	const edits = await getPhpInlayHintEdits(document, callRange ?? range.start.line);

	if (edits.length === 0) {
		return undefined;
	}

	const action = new vscode.CodeAction(
		callRange ? 'Add parameter names and return type hints to this call' : 'Add parameter names and return type hints to this line',
		vscode.CodeActionKind.QuickFix
	);
	action.edit = new vscode.WorkspaceEdit();
	addPhpInlayHintImportsToWorkspaceEdit(document, action.edit, edits);

	for (const edit of edits) {
		action.edit.insert(document.uri, edit.position, edit.text);
	}

	return action;
}

function createSplitPhpChainAction(document, range) {
	const edit = getSplitPhpChainEdit(document, range.start.line);

	if (!edit) {
		return undefined;
	}

	const action = new vscode.CodeAction('Split chained -> calls onto separate lines', vscode.CodeActionKind.QuickFix);
	action.edit = new vscode.WorkspaceEdit();
	action.edit.replace(document.uri, edit.range, edit.replacement);
	action.isPreferred = true;

	return action;
}

function getLaravelQueryModelName(statementText, beforeOffset) {
	const queryPattern = /((?:\\?[A-Z][A-Za-z0-9_]*)(?:\\[A-Z][A-Za-z0-9_]*)*)::query\s*\(/g;
	let match;
	let modelName;

	while ((match = queryPattern.exec(statementText)) !== null) {
		if (match.index > beforeOffset) {
			break;
		}

		modelName = getShortClassName(match[1]);
	}

	return modelName;
}

function getLastMethodNameBefore(text, offset) {
	const methodPattern = /->\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/g;
	let match;
	let methodName;

	while ((match = methodPattern.exec(text.slice(0, offset))) !== null) {
		methodName = match[1];
	}

	return methodName;
}

function findLaravelWhenCallbackParameter(document, statementRange, range) {
	const statementText = document.getText(statementRange);
	const statementStartOffset = document.offsetAt(statementRange.start);
	const cursorOffset = document.offsetAt(range.start) - statementStartOffset;
	const callbackPattern = /\bfn\s*\(\s*(\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\)\s*=>/g;
	const callbacks = [];
	let match;

	while ((match = callbackPattern.exec(statementText)) !== null) {
		if (!['when', 'unless'].includes(getLastMethodNameBefore(statementText, match.index))) {
			continue;
		}

		const variableOffset = match.index + match[0].indexOf(match[1]);
		const variableStart = document.positionAt(statementStartOffset + variableOffset);
		const variableEnd = document.positionAt(statementStartOffset + variableOffset + match[1].length);

		callbacks.push({
			startOffset: match.index,
			variableRange: new vscode.Range(variableStart, variableEnd),
		});
	}

	if (callbacks.length === 0) {
		return undefined;
	}

	let selected = callbacks
		.filter((callback, index) => callback.startOffset <= cursorOffset
			&& cursorOffset < (callbacks[index + 1]?.startOffset ?? statementText.length))
		.pop();

	if (!selected) {
		selected = callbacks.find((callback) => callback.variableRange.start.line === range.start.line);
	}

	if (!selected) {
		return undefined;
	}

	return {
		...selected,
		modelName: getLaravelQueryModelName(statementText, selected.startOffset),
	};
}

function getBuilderTypeFromModelSource(source) {
	const methodMatch = source.match(/@method\s+static\s+([\\A-Za-z_\x80-\xff][\\A-Za-z0-9_\x80-\xff]*)\s+query\s*\(/);

	if (methodMatch) {
		return methodMatch[1].replace(/^\\/, '');
	}

	const attributeMatch = source.match(/UseEloquentBuilder\(\s*([\\A-Za-z_\x80-\xff][\\A-Za-z0-9_\x80-\xff]*)::class\s*\)/);

	return attributeMatch ? attributeMatch[1].replace(/^\\/, '') : undefined;
}

function getImportedFqn(source, shortName) {
	const escapedShortName = escapeRegExp(shortName);
	const aliasedImportPattern = new RegExp(`^use\\s+([^;]+)\\s+as\\s+${escapedShortName}\\s*;`, 'mi');
	const aliasedMatch = source.match(aliasedImportPattern);

	if (aliasedMatch) {
		return aliasedMatch[1].replace(/^\\/, '');
	}

	const importPattern = new RegExp(`^use\\s+([^;]+\\\\${escapedShortName})\\s*;`, 'm');
	const match = source.match(importPattern);

	return match ? match[1].replace(/^\\/, '') : undefined;
}

function getPhpClassFqn(source, className) {
	const namespace = getPhpNamespace(source);

	return namespace ? `${namespace}\\${className}` : className;
}

function resolvePhpClassName(source, className) {
	if (!className) {
		return undefined;
	}

	const normalizedClassName = className.replace(/^\\/, '');

	if (normalizedClassName.includes('\\')) {
		return normalizedClassName;
	}

	const imported = getImportedFqn(source, normalizedClassName);

	if (imported) {
		return imported;
	}

	const namespace = getPhpNamespace(source);

	return namespace ? `${namespace}\\${normalizedClassName}` : normalizedClassName;
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
				namespacePrefix,
				basePath,
			}));
		});
}

async function getComposerJson(workspaceFolderUri) {
	if (!workspaceFolderUri) {
		return undefined;
	}

	try {
		return JSON.parse(await readWorkspaceText(vscode.Uri.joinPath(workspaceFolderUri, 'composer.json')));
	} catch {
		return undefined;
	}
}

async function getPhpClassUriFromFqn(fqn, workspaceFolderUri) {
	if (!fqn || !workspaceFolderUri) {
		return undefined;
	}

	const composerJson = await getComposerJson(workspaceFolderUri);

	for (const mapping of getComposerPsr4Mappings(composerJson)) {
		if (!fqn.startsWith(mapping.namespacePrefix)) {
			continue;
		}

		const relativeClassPath = fqn
			.slice(mapping.namespacePrefix.length)
			.replace(/\\/g, '/');
		const candidate = vscode.Uri.joinPath(workspaceFolderUri, mapping.basePath, `${relativeClassPath}.php`);

		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	const vendorComposer = vscode.Uri.joinPath(workspaceFolderUri, 'vendor/composer/autoload_psr4.php');

	if (await pathExists(vendorComposer)) {
		const autoloadSource = await readWorkspaceText(vendorComposer);
		const prefixPattern = /'((?:\\\\|[^'])+\\\\)'\s*=>\s*array\s*\(([\s\S]*?)\),/g;
		let match;

		while ((match = prefixPattern.exec(autoloadSource)) !== null) {
			const namespacePrefix = match[1].replace(/\\\\/g, '\\');

			if (!fqn.startsWith(namespacePrefix)) {
				continue;
			}

			const relativeClassPath = fqn
				.slice(namespacePrefix.length)
				.replace(/\\/g, '/');
			const dirPattern = /(\$vendorDir|\$baseDir|__DIR__)\s*\.\s*'([^']+)'/g;
			let dirMatch;

			while ((dirMatch = dirPattern.exec(match[2])) !== null) {
				const baseRoot = dirMatch[1] === '$vendorDir'
					? 'vendor'
					: dirMatch[1] === '$baseDir'
						? ''
						: 'vendor/composer';
				const basePath = dirMatch[2].replace(/^\//, '');
				const candidate = vscode.Uri.joinPath(workspaceFolderUri, baseRoot, basePath, `${relativeClassPath}.php`);

				if (await pathExists(candidate)) {
					return candidate;
				}
			}
		}
	}

	return undefined;
}

async function getFqnFromPhpClassFile(shortName, globPattern) {
	const files = await vscode.workspace.findFiles(globPattern, PHP_SEARCH_EXCLUDE, 10);

	for (const uri of files) {
		const source = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

		if (!new RegExp(`\\bclass\\s+${escapeRegExp(shortName)}\\b`).test(source)) {
			continue;
		}

		const namespace = source.match(/^namespace\s+([^;]+);/m)?.[1];

		if (namespace) {
			return `${namespace}\\${shortName}`;
		}
	}

	return undefined;
}

async function findLaravelModelBuilderType(modelName) {
	const modelFiles = await vscode.workspace.findFiles(`**/app/Models/${modelName}.php`, PHP_SEARCH_EXCLUDE, 10);

	for (const uri of modelFiles) {
		const source = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

		if (!new RegExp(`\\bclass\\s+${escapeRegExp(modelName)}\\b`).test(source)) {
			continue;
		}

		const builderType = getBuilderTypeFromModelSource(source);

		if (!builderType) {
			continue;
		}

		const builderShortName = getShortClassName(builderType);
		const builderFqn = builderType.includes('\\')
			? builderType
			: getImportedFqn(source, builderShortName)
				?? await getFqnFromPhpClassFile(builderShortName, `**/app/Builders/${builderShortName}.php`)
				?? `App\\Builders\\${builderShortName}`;

		return {
			fqn: builderFqn,
			shortName: builderShortName,
		};
	}

	return undefined;
}

function hasExactPhpImport(document, fqn) {
	const escapedFqn = escapeRegExp(fqn.replace(/^\\/, ''));

	return new RegExp(`^use\\s+\\\\?${escapedFqn}\\s*;`, 'm').test(document.getText());
}

function hasConflictingPhpImport(document, shortName, fqn) {
	const escapedShortName = escapeRegExp(shortName);
	const imports = document.getText().match(/^use\s+[^;]+;$/gm) || [];

	return imports.some((importLine) => importLine.endsWith(`\\${shortName};`) && importLine !== `use ${fqn};`);
}

function getPhpImportInsertionPosition(document) {
	let namespaceLine = -1;
	let lastUseLine = -1;

	for (let lineNumber = 0; lineNumber < Math.min(document.lineCount, 200); lineNumber++) {
		const trimmed = document.lineAt(lineNumber).text.trim();

		if (/^namespace\s+[^;]+;/.test(trimmed)) {
			namespaceLine = lineNumber;
			continue;
		}

		if (/^use\s+[^;]+;/.test(trimmed)) {
			lastUseLine = lineNumber;
			continue;
		}

		if (/^(?:abstract\s+|final\s+|readonly\s+)*(?:class|interface|trait|enum)\s+/.test(trimmed)) {
			break;
		}
	}

	if (lastUseLine >= 0) {
		return new vscode.Position(lastUseLine + 1, 0);
	}

	if (namespaceLine >= 0) {
		let lineNumber = namespaceLine + 1;

		while (lineNumber < document.lineCount && document.lineAt(lineNumber).text.trim() === '') {
			lineNumber++;
		}

		return new vscode.Position(lineNumber, 0);
	}

	return new vscode.Position(0, 0);
}

async function createLaravelBuilderCallbackTypeAction(document, range) {
	const statementRange = getPhpStatementRange(document, range.start.line);
	const callback = findLaravelWhenCallbackParameter(document, statementRange, range);

	if (!callback || !callback.modelName) {
		return undefined;
	}

	const builder = await findLaravelModelBuilderType(callback.modelName);

	if (!builder) {
		return undefined;
	}

	const action = new vscode.CodeAction('Add custom builder type to Laravel callback', vscode.CodeActionKind.QuickFix);
	action.edit = new vscode.WorkspaceEdit();

	if (hasConflictingPhpImport(document, builder.shortName, builder.fqn)) {
		action.edit.replace(document.uri, callback.variableRange, `\\${builder.fqn} ${document.getText(callback.variableRange)}`);

		return action;
	}

	if (!hasExactPhpImport(document, builder.fqn)) {
		action.edit.insert(document.uri, getPhpImportInsertionPosition(document), `use ${builder.fqn};\n`);
	}

	action.edit.replace(document.uri, callback.variableRange, `${builder.shortName} ${document.getText(callback.variableRange)}`);

	return action;
}

function getUriDirectory(uri) {
	return uri.with({
		path: path.posix.dirname(uri.path),
		query: '',
		fragment: '',
	});
}

function isUriInsideFolder(uri, folderUri) {
	if (uri.scheme !== folderUri.scheme || uri.authority !== folderUri.authority) {
		return false;
	}

	const relativePath = path.posix.relative(folderUri.path, uri.path);

	return relativePath !== '..'
		&& !relativePath.startsWith('../')
		&& !path.posix.isAbsolute(relativePath);
}

async function getComposerContextForPhpUri(uri) {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

	if (!workspaceFolder) {
		return undefined;
	}

	let directoryUri = getUriDirectory(uri);

	while (isUriInsideFolder(directoryUri, workspaceFolder.uri)) {
		const composerUri = vscode.Uri.joinPath(directoryUri, 'composer.json');

		if (await pathExists(composerUri)) {
			try {
				const composerJson = JSON.parse(await readWorkspaceText(composerUri));
				const namespace = phpMove.resolvePsr4Namespace(composerJson, directoryUri.path, uri.path);

				if (namespace) {
					return {
						composerUri,
						namespace,
					};
				}
			} catch (error) {
				logDebug(`Unable to read ${composerUri.toString()}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (directoryUri.path === workspaceFolder.uri.path) {
			break;
		}

		const parentUri = getUriDirectory(directoryUri);

		if (parentUri.path === directoryUri.path) {
			break;
		}

		directoryUri = parentUri;
	}

	return undefined;
}

function getOpenDocument(uri) {
	return vscode.workspace.textDocuments.find((document) => sameUri(document.uri, uri));
}

async function readCurrentWorkspaceText(uri) {
	return getOpenDocument(uri)?.getText() ?? await readWorkspaceText(uri);
}

function getFullSourceRange(source) {
	return new vscode.Range(
		new vscode.Position(0, 0),
		positionFromOffset(source, source.length)
	);
}

async function findPhpTypeUriByFqn(fqn, workspaceFolder) {
	const shortName = fqn.split('\\').pop();
	const candidates = await vscode.workspace.findFiles(
		new vscode.RelativePattern(workspaceFolder, `**/${shortName}.php`),
		PHP_SEARCH_EXCLUDE,
		50
	);

	for (const uri of candidates) {
		const source = await readCurrentWorkspaceText(uri);
		const namespace = phpMove.getPhpNamespace(source);
		const declaresType = phpMove.getPhpDeclaredTypes(source)
			.some((declaration) => declaration.name === shortName);

		if (declaresType && `${namespace}\\${shortName}` === fqn) {
			return uri;
		}
	}

	return undefined;
}

async function getMovedPhpDependencyImports(source, oldNamespace, workspaceFolder) {
	if (!oldNamespace) {
		return [];
	}

	const imports = [];

	for (const typeName of phpMove.getPhpPotentialTypeNames(source)) {
		const fqn = `${oldNamespace}\\${typeName}`;

		if (await findPhpTypeUriByFqn(fqn, workspaceFolder)) {
			imports.push(fqn);
		}
	}

	return imports;
}

async function applyPhpMoveRefactor(oldUri, newUri) {
	if (path.posix.extname(newUri.path).toLowerCase() !== '.php') {
		return undefined;
	}

	const movedSource = await readCurrentWorkspaceText(newUri);
	const oldNamespace = phpMove.getPhpNamespace(movedSource);
	const composerContext = await getComposerContextForPhpUri(newUri);

	if (!composerContext) {
		if (oldNamespace) {
			vscode.window.showWarningMessage(
				`Moved ${getFileName(newUri)}, but no Composer PSR-4 mapping matched its new directory. The namespace was not changed.`
			);
		}

		return undefined;
	}

	if (/^namespace\s+/m.test(movedSource) && !oldNamespace) {
		vscode.window.showWarningMessage(
			`Moved ${getFileName(newUri)}, but its namespace syntax is not supported. Only semicolon-style PHP namespaces are updated automatically.`
		);

		return undefined;
	}

	if (oldNamespace === composerContext.namespace) {
		return {
			changedFiles: 0,
			namespace: composerContext.namespace,
		};
	}

	const plan = phpMove.buildPhpMovePlan(movedSource, composerContext.namespace);

	if (plan.declarations.length === 0) {
		vscode.window.showWarningMessage(
			`Moved ${getFileName(newUri)}, but no class, interface, trait, or enum declaration was found.`
		);

		return undefined;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(newUri);

	if (!workspaceFolder) {
		return undefined;
	}

	const movedDependencyImports = await getMovedPhpDependencyImports(
		movedSource,
		plan.oldNamespace,
		workspaceFolder
	);
	const movedSourceWithNamespace = phpMove.addPhpUseImports(
		plan.updatedSource,
		movedDependencyImports
	);
	const phpFiles = await vscode.workspace.findFiles(
		new vscode.RelativePattern(workspaceFolder, '**/*.php'),
		PHP_SEARCH_EXCLUDE
	);
	const filesByUri = new Map(phpFiles.map((uri) => [uri.toString(), uri]));
	filesByUri.set(newUri.toString(), newUri);
	const edit = new vscode.WorkspaceEdit();
	let changedFiles = 0;

	for (const uri of filesByUri.values()) {
		const source = await readCurrentWorkspaceText(uri);
		const sourceWithNamespace = sameUri(uri, newUri) ? movedSourceWithNamespace : source;
		const sourceWithReferences = phpMove.replacePhpTypeReferences(sourceWithNamespace, plan.replacements);
		const updatedSource = sameUri(uri, newUri)
			? sourceWithReferences
			: phpMove.ensureMovedTypeImports(sourceWithReferences, plan.oldNamespace, plan.replacements);

		if (updatedSource === source) {
			continue;
		}

		edit.replace(uri, getFullSourceRange(source), updatedSource);
		changedFiles++;
	}

	if (changedFiles === 0) {
		return {
			changedFiles,
			namespace: composerContext.namespace,
		};
	}

	if (!await vscode.workspace.applyEdit(edit)) {
		throw new Error(`VS Code could not apply namespace updates for ${getFileName(newUri)}.`);
	}

	vscode.window.showInformationMessage(
		`Moved ${getFileName(oldUri)} to ${composerContext.namespace}; updated ${changedFiles} PHP ${changedFiles === 1 ? 'file' : 'files'}.`
	);

	return {
		changedFiles,
		namespace: composerContext.namespace,
	};
}

const phpMoveRefactors = new Map();

function runPhpMoveRefactor(oldUri, newUri) {
	const key = `${oldUri.toString()} -> ${newUri.toString()}`;
	const existing = phpMoveRefactors.get(key);

	if (existing) {
		return existing;
	}

	const refactor = applyPhpMoveRefactor(oldUri, newUri)
		.finally(() => phpMoveRefactors.delete(key));

	phpMoveRefactors.set(key, refactor);

	return refactor;
}

function getPhpMoveSourceUri(resourceUri) {
	if (resourceUri && path.posix.extname(resourceUri.path).toLowerCase() === '.php') {
		return resourceUri;
	}

	const editorUri = vscode.window.activeTextEditor?.document.uri;

	return editorUri && path.posix.extname(editorUri.path).toLowerCase() === '.php'
		? editorUri
		: undefined;
}

const commandedPhpMoveTargets = new Set();

async function movePhpClassFile(resourceUri) {
	const sourceUri = getPhpMoveSourceUri(resourceUri);

	if (!sourceUri) {
		vscode.window.showWarningMessage('Open or select a PHP file to move.');
		return;
	}

	const destinationFolders = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		defaultUri: getUriDirectory(sourceUri),
		openLabel: 'Move Here',
		title: `Move ${getFileName(sourceUri)} to a directory`,
	});

	if (!destinationFolders?.length) {
		return;
	}

	const destinationFolder = destinationFolders[0];
	const sourceWorkspace = vscode.workspace.getWorkspaceFolder(sourceUri);
	const destinationWorkspace = vscode.workspace.getWorkspaceFolder(destinationFolder);

	if (!sourceWorkspace || !destinationWorkspace || !sameUri(sourceWorkspace.uri, destinationWorkspace.uri)) {
		vscode.window.showWarningMessage('The PHP file must stay inside the same workspace folder.');
		return;
	}

	const destinationUri = vscode.Uri.joinPath(destinationFolder, getFileName(sourceUri));

	if (sameUri(sourceUri, destinationUri)) {
		return;
	}

	if (await pathExists(destinationUri)) {
		vscode.window.showErrorMessage(`${getFileName(destinationUri)} already exists in that directory.`);
		return;
	}

	const targetKey = destinationUri.toString();
	const renameEdit = new vscode.WorkspaceEdit();
	renameEdit.renameFile(sourceUri, destinationUri, { overwrite: false });
	commandedPhpMoveTargets.add(targetKey);

	try {
		if (!await vscode.workspace.applyEdit(renameEdit)) {
			throw new Error(`VS Code could not move ${getFileName(sourceUri)}.`);
		}

		await runPhpMoveRefactor(sourceUri, destinationUri);
	} finally {
		commandedPhpMoveTargets.delete(targetKey);
	}
}

function createMovePhpClassFileAction(document, range) {
	const source = document.getText();
	const offset = document.offsetAt(range.start);
	const declaration = phpMove.getPhpDeclaredTypes(source)
		.find((candidate) => offset >= candidate.start && offset <= candidate.end);

	if (!declaration) {
		return undefined;
	}

	const action = new vscode.CodeAction(
		`Move PHP ${declaration.kind} file…`,
		vscode.CodeActionKind.Refactor.append('move')
	);
	action.command = {
		command: 'smartReferences.movePhpClassFile',
		title: 'Move PHP class file',
		arguments: [document.uri],
	};

	return action;
}

function createLaravelCollectionKeyTypeAction(document, range) {
	const source = document.getText();
	const edit = getLaravelCollectionKeyTypeEdit(source, document.offsetAt(range.start));

	if (!edit) {
		return undefined;
	}

	const action = new vscode.CodeAction('Add missing Collection key type (int)', vscode.CodeActionKind.QuickFix);
	action.edit = new vscode.WorkspaceEdit();
	action.edit.replace(document.uri, rangeFromOffsets(source, edit.start, edit.end), edit.replacement);
	action.isPreferred = true;

	return action;
}

function createPhpCodeActionProvider() {
	return {
		async provideCodeActions(document, range) {
			const actions = [];
			const collectionKeyTypeAction = createLaravelCollectionKeyTypeAction(document, range);

			if (collectionKeyTypeAction) {
				actions.push(collectionKeyTypeAction);
			}

			const moveClassFileAction = createMovePhpClassFileAction(document, range);

			if (moveClassFileAction) {
				actions.push(moveClassFileAction);
			}

			const splitChainAction = createSplitPhpChainAction(document, range);

			if (splitChainAction) {
				actions.push(splitChainAction);
			}

			const inlayHintsAction = await createApplyPhpInlayHintsAction(document, range);

			if (inlayHintsAction) {
				actions.push(inlayHintsAction);
			}

			const builderCallbackAction = await createLaravelBuilderCallbackTypeAction(document, range);

			if (builderCallbackAction) {
				actions.push(builderCallbackAction);
			}

			return actions;
		},
	};
}

async function setReferenceViewMode(mode) {
	await vscode.workspace.getConfiguration('smartReferences').update(
		'referenceView',
		mode,
		vscode.ConfigurationTarget.Global
	);
	vscode.window.showInformationMessage(`Smart References will use ${mode === 'quickPick' ? 'QuickPick' : 'Webview'} references.`);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExplorerAutoRevealRestoreTarget(config) {
	const inspected = config.inspect('autoReveal');

	if (inspected?.workspaceValue !== undefined) {
		return {
			target: vscode.ConfigurationTarget.Workspace,
			value: inspected.workspaceValue,
		};
	}

	return {
		target: vscode.ConfigurationTarget.Global,
		value: inspected?.globalValue,
	};
}

async function executeWithExplorerAutoRevealDisabled(command) {
	const config = vscode.workspace.getConfiguration('explorer');
	const restore = getExplorerAutoRevealRestoreTarget(config);

	await config.update('autoReveal', false, restore.target);

	try {
		await vscode.commands.executeCommand(command);
		await delay(1500);
	} finally {
		await vscode.workspace.getConfiguration('explorer').update('autoReveal', restore.value, restore.target);
	}
}

async function deleteFileWithoutAutoReveal() {
	await executeWithExplorerAutoRevealDisabled('moveFileToTrash');
}

async function getGitRepositoryRootFromExtension(resourceUri) {
	try {
		const extension = vscode.extensions.getExtension('vscode.git');

		if (!extension) {
			return undefined;
		}

		const git = extension.isActive ? extension.exports : await extension.activate();
		const repositories = git?.getAPI?.(1)?.repositories ?? [];

		return repositories
			.map((repository) => repository.rootUri)
			.filter((rootUri) => rootUri && isUriInsideFolder(resourceUri, rootUri))
			.sort((left, right) => right.path.length - left.path.length)[0];
	} catch (error) {
		logDebug(`Unable to query the VS Code Git extension: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

async function findGitRepositoryRoot(resourceUri) {
	const knownRoot = await getGitRepositoryRootFromExtension(resourceUri);

	if (knownRoot) {
		return knownRoot;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(resourceUri);

	if (!workspaceFolder) {
		return undefined;
	}

	let directoryUri = getUriDirectory(resourceUri);

	while (isUriInsideFolder(directoryUri, workspaceFolder.uri)) {
		if (await pathExists(vscode.Uri.joinPath(directoryUri, '.git'))) {
			return directoryUri;
		}

		if (directoryUri.path === workspaceFolder.uri.path) {
			break;
		}

		const parentUri = getUriDirectory(directoryUri);

		if (parentUri.path === directoryUri.path) {
			break;
		}

		directoryUri = parentUri;
	}

	return undefined;
}

function getExplorerResourceUris(resourceUri, selectedResourceUris) {
	const resources = Array.isArray(selectedResourceUris) && selectedResourceUris.length > 0
		? selectedResourceUris
		: [resourceUri];
	const uniqueResources = new Map();

	for (const resource of resources) {
		if (resource?.scheme && resource?.path) {
			uniqueResources.set(resource.toString(), resource);
		}
	}

	return [...uniqueResources.values()];
}

async function updateGitignoreFile(gitignoreUri, entries) {
	if (!await pathExists(gitignoreUri)) {
		const createEdit = new vscode.WorkspaceEdit();
		createEdit.createFile(gitignoreUri, { ignoreIfExists: true });

		if (!await vscode.workspace.applyEdit(createEdit)) {
			throw new Error(`VS Code could not create ${gitignoreUri.path}.`);
		}
	}

	const document = await vscode.workspace.openTextDocument(gitignoreUri);
	const result = appendGitignoreEntries(document.getText(), entries);

	if (result.addedEntries.length === 0) {
		return result;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.replace(gitignoreUri, getFullSourceRange(document.getText()), result.source);

	if (!await vscode.workspace.applyEdit(edit)) {
		throw new Error(`VS Code could not update ${gitignoreUri.path}.`);
	}

	if (!await document.save()) {
		throw new Error(`VS Code could not save ${gitignoreUri.path}.`);
	}

	return result;
}

async function addExplorerFilesToGitignore(resourceUri, selectedResourceUris) {
	const resources = getExplorerResourceUris(resourceUri, selectedResourceUris);

	if (resources.length === 0) {
		vscode.window.showWarningMessage('Select a file in the Explorer to add to .gitignore.');
		return;
	}

	const repositories = new Map();

	for (const resource of resources) {
		const stat = await vscode.workspace.fs.stat(resource);

		if ((stat.type & vscode.FileType.Directory) !== 0) {
			continue;
		}

		const rootUri = await findGitRepositoryRoot(resource);

		if (!rootUri) {
			vscode.window.showWarningMessage(`Could not find a Git repository for ${getFileName(resource)}.`);
			continue;
		}

		const key = rootUri.toString();
		const repository = repositories.get(key) ?? { rootUri, resources: [] };
		repository.resources.push(resource);
		repositories.set(key, repository);
	}

	let addedCount = 0;
	let unchangedCount = 0;

	for (const { rootUri, resources: repositoryResources } of repositories.values()) {
		const entries = repositoryResources
			.map((resource) => getGitignoreEntry(rootUri.path, resource.path))
			.filter(Boolean);
		const gitignoreUri = vscode.Uri.joinPath(rootUri, '.gitignore');
		const result = await updateGitignoreFile(gitignoreUri, entries);

		if (result.addedEntries.length === 0) {
			unchangedCount += entries.length;
			continue;
		}

		addedCount += result.addedEntries.length;
		unchangedCount += entries.length - result.addedEntries.length;
	}

	if (addedCount > 0) {
		const suffix = unchangedCount > 0 ? `; ${unchangedCount} already present` : '';
		vscode.window.showInformationMessage(
			`Added ${addedCount} ${addedCount === 1 ? 'path' : 'paths'} to .gitignore${suffix}.`
		);
	} else if (unchangedCount > 0) {
		vscode.window.showInformationMessage(
			`${unchangedCount === 1 ? 'That path is' : 'Those paths are'} already present in .gitignore.`
		);
	}
}

function createFileMarkerController(context) {
	let markedUris = new Set(normalizeMarkedUris(
		context.workspaceState.get(MARKED_FILES_STORAGE_KEY, [])
	));
	const decorationEmitter = new vscode.EventEmitter();
	const markedDecoration = new vscode.FileDecoration(
		'⚑',
		'Marked file — use Toggle File Marker to remove',
		new vscode.ThemeColor('smartReferences.fileMarkerForeground')
	);
	markedDecoration.propagate = false;

	async function replaceMarkedUris(nextMarkedUris, changedUris) {
		await context.workspaceState.update(MARKED_FILES_STORAGE_KEY, nextMarkedUris);
		markedUris = new Set(nextMarkedUris);

		if (changedUris === undefined) {
			decorationEmitter.fire(undefined);
		} else if (changedUris.length > 0) {
			decorationEmitter.fire(changedUris);
		}
	}

	async function getSelectedFileUris(resourceUri, selectedResourceUris) {
		const resources = getExplorerResourceUris(resourceUri, selectedResourceUris);
		const files = [];

		for (const resource of resources) {
			const stat = await vscode.workspace.fs.stat(resource);
			if ((stat.type & vscode.FileType.Directory) === 0) {
				files.push(resource);
			}
		}

		return files;
	}

	return {
		dispose() {
			decorationEmitter.dispose();
		},
		provider: {
			onDidChangeFileDecorations: decorationEmitter.event,
			provideFileDecoration(uri) {
				return markedUris.has(uri.toString()) ? markedDecoration : undefined;
			},
		},
		async toggle(resourceUri, selectedResourceUris) {
			const files = await getSelectedFileUris(resourceUri, selectedResourceUris);

			if (files.length === 0) {
				vscode.window.showWarningMessage('Select a file in the Explorer to toggle its marker.');
				return;
			}

			const result = toggleMarkedUris(
				[...markedUris],
				files.map((uri) => uri.toString())
			);
			await replaceMarkedUris(
				result.markedUris,
				result.changedUris.map((uri) => vscode.Uri.parse(uri))
			);
		},
		async handleRenames(files) {
			const nextMarkedUris = remapMarkedUris(
				[...markedUris],
				files.map((file) => ({
					oldUri: file.oldUri.toString(),
					newUri: file.newUri.toString(),
				}))
			);

			if (nextMarkedUris.join('\n') === [...markedUris].join('\n')) {
				return;
			}

			await replaceMarkedUris(
				nextMarkedUris,
				files.flatMap((file) => [file.oldUri, file.newUri])
			);
		},
		async handleDeletes(uris) {
			const nextMarkedUris = removeDeletedMarkedUris(
				[...markedUris],
				uris.map((uri) => uri.toString())
			);

			if (nextMarkedUris.length === markedUris.size) {
				return;
			}

			await replaceMarkedUris(nextMarkedUris, uris);
		},
	};
}

function activate(context) {
	smartRefDebugChannel = vscode.window.createOutputChannel('Smart References Debug');
	context.subscriptions.push(smartRefDebugChannel);

	laravelIntelligence.register(context); // registers the "Refresh Laravel IDE Helpers" command only
	const fileMarkers = createFileMarkerController(context);
	context.subscriptions.push(
		fileMarkers,
		vscode.window.registerFileDecorationProvider(fileMarkers.provider)
	);

	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.go', goToSmartReference));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.showReferencesAt', async (uri, position, docTagScoped) => {
		await showReferencesAtLocation(uri, position, {
			forcePicker: true,
			includeLanguageProviderReferences: true,
			docTagScoped: Boolean(docTagScoped),
		});
	}));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((saved) => {
		if (saved.languageId === 'php') {
			staticCallReferenceCache.clear();
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.useQuickPickReferences', async () => {
		await setReferenceViewMode('quickPick');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.useWebviewReferences', async () => {
		await setReferenceViewMode('webview');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.openLocation', openLocationDirectly));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartBackspace', smartBackspace));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartEnter', smartEnter));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartCopy', smartCopy));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartPaste', smartPaste));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartEquals', smartEquals));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartCursorUp', smartCursorUp));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.splitPhpChain', splitPhpChainAtSelection));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.applyPhpInlayHints', applyPhpInlayHintsAtSelection));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.deleteFileWithoutAutoReveal', deleteFileWithoutAutoReveal));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.toggleFileMarker', async (resourceUri, selectedResourceUris) => {
		try {
			await fileMarkers.toggle(resourceUri, selectedResourceUris);
		} catch (error) {
			vscode.window.showErrorMessage(
				`Could not toggle the selected file marker: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.addToGitignore', async (resourceUri, selectedResourceUris) => {
		try {
			await addExplorerFilesToGitignore(resourceUri, selectedResourceUris);
		} catch (error) {
			vscode.window.showErrorMessage(
				`Could not add the selected file to .gitignore: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.movePhpClassFile', async (resourceUri) => {
		try {
			await movePhpClassFile(resourceUri);
		} catch (error) {
			vscode.window.showErrorMessage(
				`Could not move PHP class file: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidRenameFiles((event) => {
		void fileMarkers.handleRenames(event.files).catch((error) => {
			vscode.window.showErrorMessage(
				`Could not preserve file markers after a rename: ${error instanceof Error ? error.message : String(error)}`
			);
		});

		for (const file of event.files) {
			if (path.posix.extname(file.oldUri.path).toLowerCase() !== '.php'
				|| path.posix.extname(file.newUri.path).toLowerCase() !== '.php'
				|| commandedPhpMoveTargets.has(file.newUri.toString())) {
				continue;
			}

			void runPhpMoveRefactor(file.oldUri, file.newUri).catch((error) => {
				vscode.window.showErrorMessage(
					`Moved ${getFileName(file.newUri)}, but could not update its PHP namespace: ${error instanceof Error ? error.message : String(error)}`
				);
			});
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidDeleteFiles((event) => {
		void fileMarkers.handleDeletes(event.files).catch((error) => {
			vscode.window.showErrorMessage(
				`Could not remove deleted file markers: ${error instanceof Error ? error.message : String(error)}`
			);
		});
	}));
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider(
		[
			{ language: 'php', scheme: 'file' },
			{ language: 'hack', scheme: 'file' },
			{ language: 'php' },
			{ language: 'hack' },
		],
		createPhpCodeActionProvider(),
		{
			providedCodeActionKinds: [
				vscode.CodeActionKind.QuickFix,
				vscode.CodeActionKind.Refactor,
			],
		}
	));
	context.subscriptions.push(vscode.languages.registerCodeLensProvider(
		[
			{ language: 'php', scheme: 'file' },
			{ language: 'hack', scheme: 'file' },
			{ language: 'php' },
			{ language: 'hack' },
		],
		createLaravelPolicyCodeLensProvider()
	));
	context.subscriptions.push(vscode.languages.registerCodeLensProvider(
		[
			{ language: 'php', scheme: 'file' },
			{ language: 'hack', scheme: 'file' },
			{ language: 'php' },
			{ language: 'hack' },
		],
		createPhpReferenceCodeLensProvider()
	));
	context.subscriptions.push(vscode.languages.registerCodeLensProvider(
		[
			{ language: 'php', scheme: 'file' },
			{ language: 'hack', scheme: 'file' },
			{ language: 'php' },
			{ language: 'hack' },
		],
		createPhpParentCodeLensProvider()
	));
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
