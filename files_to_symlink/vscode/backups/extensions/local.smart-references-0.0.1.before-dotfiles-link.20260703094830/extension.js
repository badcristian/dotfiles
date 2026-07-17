const vscode = require('vscode');
const path = require('path');

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
		|| basename === '_ide_helper.php'
		|| basename === '_ide_helper_models.php'
		|| /^_ide_helper_models_.*\.php$/.test(basename);
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

function isClassLikeWord(word) {
	return /^[A-Z]/.test(word);
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

async function goToDefinition(uri, position) {
	const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, position);

	if (!Array.isArray(definitions) || definitions.length === 0) {
		return false;
	}

	const target = getDefinitionTarget(definitions[0]);

	if (!target) {
		return false;
	}

	await vscode.window.showTextDocument(target.uri, {
		selection: target.range,
		preserveFocus: false,
		preview: false,
	});

	return true;
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

async function showReferencesPicker(references) {
	const documentCache = new Map();
	const symbolCache = new Map();
	const items = await Promise.all(references.map(async (reference) => {
		const context = await getReferenceContext(reference, documentCache, symbolCache);
		const lineNumber = reference.range.start.line + 1;

		return {
			label: `$(file-code) ${getFileName(reference.uri)}  ${lineNumber}`,
			description: `${context.symbolKindLabel}: ${context.symbolName}`,
			detail: context.line,
			reference,
		};
	}));

	const selected = await vscode.window.showQuickPick(items, {
		matchOnDescription: true,
		matchOnDetail: true,
		placeHolder: 'Select a reference',
		title: 'References',
	});

	if (!selected) {
		return;
	}

	await vscode.window.showTextDocument(selected.reference.uri, {
		selection: selected.reference.range,
		preserveFocus: false,
		preview: false,
	});
}

async function goToSmartReference() {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		return;
	}

	const uri = editor.document.uri;
	const position = editor.selection.active;
	const word = getWordAtPosition(editor.document, position);

	if (isClassLikeWord(word) && await goToDefinition(uri, position)) {
		return;
	}

	const references = await vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, position);

	if (!Array.isArray(references) || references.length === 0) {
		vscode.window.showInformationMessage('No references found.');
		return;
	}

	const targets = references.filter((reference) => {
		return !isGeneratedLaravelHelper(reference) && !isCurrentLocation(reference, uri, position);
	});

	if (targets.length === 0) {
		vscode.window.showInformationMessage('No other references found.');
		return;
	}

	if (targets.length === 1 && sameUri(targets[0].uri, uri)) {
		const target = targets[0];
		await vscode.window.showTextDocument(target.uri, {
			selection: target.range,
			preserveFocus: false,
			preview: false,
		});
		return;
	}

	await showReferencesPicker(targets);
}

function hasSingleEmptySelection(editor) {
	return editor.selections.length === 1 && editor.selection.isEmpty;
}

function isPhpChainContinuation(document, position) {
	const line = document.lineAt(position.line).text;
	const beforeCursor = line.slice(0, position.character);
	const afterCursor = line.slice(position.character);

	return /^\s*$/.test(beforeCursor) && /^->\s*[$A-Za-z_]/.test(afterCursor);
}

async function smartBackspace() {
	const editor = vscode.window.activeTextEditor;

	if (!editor || !hasSingleEmptySelection(editor)) {
		await vscode.commands.executeCommand('deleteLeft');
		return;
	}

	const position = editor.selection.active;

	if (position.line > 0 && isPhpChainContinuation(editor.document, position)) {
		const previousLine = editor.document.lineAt(position.line - 1);
		const joinRange = new vscode.Range(previousLine.range.end, position);

		await editor.edit((editBuilder) => {
			editBuilder.delete(joinRange);
		});
		return;
	}

	await vscode.commands.executeCommand('deleteLeft');
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.go', goToSmartReference));
	context.subscriptions.push(vscode.commands.registerCommand('smartReferences.smartBackspace', smartBackspace));
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
