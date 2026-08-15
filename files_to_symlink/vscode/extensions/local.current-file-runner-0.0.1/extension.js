const vscode = require("vscode");
const { createRunCurrentFileCommand } = require("./runCommand");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "currentFileRunner.run",
      createRunCurrentFileCommand(vscode),
    ),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
