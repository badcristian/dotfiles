const vscode = require('vscode');

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('statusbar-toggle.toggle', () => {
    return vscode.commands.executeCommand('workbench.action.toggleStatusbarVisibility');
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
