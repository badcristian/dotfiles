const path = require("node:path");
const { resolveRunPlan, unsupportedMessage } = require("./runner");

function createRunCurrentFileCommand(vscode) {
  let runnerTerminal;
  let runnerCwd;

  return async function runCurrentFile() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showInformationMessage(
        "I have not set up run logic for the current editor yet.",
      );
      return;
    }

    const { document } = editor;
    const fileName = document.uri.fsPath;

    if (document.isUntitled || !fileName) {
      vscode.window.showInformationMessage(
        `I have not set up run logic for an untitled ${document.languageId} file yet.`,
      );
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspacePath = workspaceFolder?.uri.fsPath;
    const plan = resolveRunPlan({
      fileName,
      languageId: document.languageId,
      workspacePath,
    });

    if (!plan) {
      vscode.window.showInformationMessage(
        unsupportedMessage(fileName, document.languageId),
      );
      return;
    }

    if (document.isDirty && !(await document.save())) {
      vscode.window.showWarningMessage(
        `Could not save ${path.basename(fileName)}; it was not run.`,
      );
      return;
    }

    if (
      !runnerTerminal ||
      runnerTerminal.exitStatus !== undefined ||
      runnerCwd !== plan.cwd
    ) {
      runnerTerminal = vscode.window.createTerminal({
        name: "Run Current File",
        cwd: plan.cwd,
      });
      runnerCwd = plan.cwd;
    }

    runnerTerminal.show(true);
    runnerTerminal.sendText(plan.command, true);
  };
}

module.exports = { createRunCurrentFileCommand };
