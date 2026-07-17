const vscode = require('vscode');

let pinning = false;

function activate(context) {
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(async event => {
    if (pinning || event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
      return;
    }

    const editor = event.textEditor;

    if (!editor || editor.document.uri.scheme !== 'file' || vscode.window.activeTextEditor !== editor) {
      return;
    }

    pinning = true;

    try {
      await vscode.commands.executeCommand('workbench.action.keepEditor');
    } finally {
      setTimeout(() => {
        pinning = false;
      }, 0);
    }
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
