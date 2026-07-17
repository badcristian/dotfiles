const vscode = require('vscode');

function variableAt(editor) {
  const doc = editor.document;
  const selection = editor.selection;

  if (!selection.isEmpty) {
    const selected = doc.getText(selection).trim();
    if (/^\$?[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(selected)) {
      return {
        name: selected.startsWith('$') ? selected : '$' + selected,
        line: selection.start.line,
      };
    }
  }

  const position = selection.active;
  const lineText = doc.lineAt(position.line).text;
  const variablePattern = /\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/g;
  let match;

  while ((match = variablePattern.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (position.character >= start && position.character <= end) {
      return { name: match[0], line: position.line };
    }
  }

  return null;
}

function variableAtDocument(document, position) {
  const lineText = document.lineAt(position.line).text;
  const variablePattern = /\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/g;
  let match;

  while ((match = variablePattern.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (position.character >= start && position.character <= end) {
      return {
        name: match[0],
        range: new vscode.Range(position.line, start, position.line, end),
      };
    }
  }

  return null;
}

function createVariableDocblockAction(document, range) {
  const found = variableAtDocument(document, range.start);

  if (!found) {
    return [];
  }

  const action = new vscode.CodeAction(`Add PHPDoc to variable ${found.name}`, vscode.CodeActionKind.QuickFix);
  action.command = {
    command: 'php-smart-docblock.generate',
    title: 'Add PHPDoc to variable',
  };
  action.isPreferred = true;

  return [action];
}

function escapeSnippetText(value) {
  return value.replace(/[\\$}]/g, '\\$&');
}

function definitionTarget(definition) {
  if (definition && definition.targetUri && definition.targetSelectionRange) {
    return {
      uri: definition.targetUri,
      range: definition.targetSelectionRange,
    };
  }

  if (definition && definition.uri && definition.range) {
    return definition;
  }

  return null;
}

function sameUri(a, b) {
  return a.toString() === b.toString();
}

function isCurrentDefinitionTarget(target, editor) {
  return sameUri(target.uri, editor.document.uri) && target.range.contains(editor.selection.active);
}

async function goToDefinition(editor) {
  const definitions = await vscode.commands.executeCommand(
    'vscode.executeDefinitionProvider',
    editor.document.uri,
    editor.selection.active
  );

  if (!Array.isArray(definitions) || definitions.length === 0) {
    return false;
  }

  const target = definitionTarget(definitions[0]);

  if (!target) {
    return false;
  }

  if (isCurrentDefinitionTarget(target, editor)) {
    await vscode.commands.executeCommand('smartReferences.go', { forcePicker: true });
    return true;
  }

  await vscode.window.showTextDocument(target.uri, {
    selection: target.range,
    preserveFocus: false,
    preview: false,
  });

  return true;
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('php-smart-docblock.navigate', async editor => {
    await goToDefinition(editor);
  }));

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('php-smart-docblock.generate', async editor => {
    const found = variableAt(editor);

    if (!found) {
      return;
    }

    const currentLine = editor.document.lineAt(found.line).text;
    const indent = (currentLine.match(/^\s*/) || [''])[0];
    const snippet = new vscode.SnippetString(indent + '/** @var \${1:TYPE_NAME} ' + escapeSnippetText(found.name) + ' */\n');
    await editor.insertSnippet(snippet, new vscode.Position(found.line, 0));
  }));

  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(
    [
      { language: 'php', scheme: 'file' },
      { language: 'hack', scheme: 'file' },
      { language: 'php' },
      { language: 'hack' },
    ],
    {
      provideCodeActions(document, range) {
        return createVariableDocblockAction(document, range);
      },
    },
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  ));
}

function deactivate() {}

module.exports = { activate, deactivate };
