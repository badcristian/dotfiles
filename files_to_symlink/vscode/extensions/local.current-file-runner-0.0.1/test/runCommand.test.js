const assert = require("node:assert/strict");
const test = require("node:test");
const { createRunCurrentFileCommand } = require("../runCommand");

function createVscode({
  fileName = "/workspace/random/example.ts",
  languageId = "typescript",
  isDirty = false,
  saveResult = true,
  workspacePath = "/workspace",
} = {}) {
  const events = [];
  const terminal = {
    exitStatus: undefined,
    show(preserveFocus) {
      events.push(["show", preserveFocus]);
    },
    sendText(command, addNewLine) {
      events.push(["sendText", command, addNewLine]);
    },
  };
  const document = {
    uri: { fsPath: fileName },
    languageId,
    isDirty,
    isUntitled: false,
    async save() {
      events.push(["save"]);
      return saveResult;
    },
  };
  const vscode = {
    window: {
      activeTextEditor: { document },
      createTerminal(options) {
        events.push(["createTerminal", options]);
        return terminal;
      },
      showInformationMessage(message) {
        events.push(["information", message]);
      },
      showWarningMessage(message) {
        events.push(["warning", message]);
      },
    },
    workspace: {
      getWorkspaceFolder() {
        return workspacePath ? { uri: { fsPath: workspacePath } } : undefined;
      },
    },
  };

  return { events, vscode };
}

test("saves and runs a dirty TypeScript file in a reusable terminal", async () => {
  const { events, vscode } = createVscode({ isDirty: true });
  const run = createRunCurrentFileCommand(vscode);

  await run();
  await run();

  assert.deepEqual(events, [
    ["save"],
    ["createTerminal", { name: "Run Current File", cwd: "/workspace" }],
    ["show", true],
    ["sendText", "npx --no-install tsx 'random/example.ts'", true],
    ["save"],
    ["show", true],
    ["sendText", "npx --no-install tsx 'random/example.ts'", true],
  ]);
});

test("shows the requested message for an unsupported active file", async () => {
  const { events, vscode } = createVscode({
    fileName: "/workspace/example.vue",
    languageId: "vue",
  });

  await createRunCurrentFileCommand(vscode)();

  assert.deepEqual(events, [
    ["information", "I have not set up run logic for example.vue (vue) yet."],
  ]);
});

test("does not run a dirty file when saving fails", async () => {
  const { events, vscode } = createVscode({ isDirty: true, saveResult: false });

  await createRunCurrentFileCommand(vscode)();

  assert.deepEqual(events, [
    ["save"],
    ["warning", "Could not save example.ts; it was not run."],
  ]);
});
