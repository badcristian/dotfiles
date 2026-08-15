const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { resolveRunPlan, shellQuote, unsupportedMessage } = require("../runner");

test("builds a project-relative TypeScript run command", () => {
  assert.deepEqual(
    resolveRunPlan({
      fileName: "/workspace/random/typescript-examples.ts",
      languageId: "typescript",
      workspacePath: "/workspace",
    }),
    {
      cwd: "/workspace",
      command: "npx --no-install tsx 'random/typescript-examples.ts'",
    },
  );
});

test("uses the file directory when there is no workspace", () => {
  assert.deepEqual(
    resolveRunPlan({
      fileName: "/tmp/play/example.ts",
      languageId: "typescript",
    }),
    {
      cwd: "/tmp/play",
      command: "npx --no-install tsx 'example.ts'",
    },
  );
});

test("does not treat declarations or other languages as runnable TypeScript", () => {
  assert.equal(
    resolveRunPlan({
      fileName: "/workspace/types.d.ts",
      languageId: "typescript",
      workspacePath: "/workspace",
    }),
    undefined,
  );
  assert.equal(
    resolveRunPlan({
      fileName: "/workspace/example.tsx",
      languageId: "typescriptreact",
      workspacePath: "/workspace",
    }),
    undefined,
  );
  assert.equal(
    resolveRunPlan({
      fileName: "/workspace/example.js",
      languageId: "javascript",
      workspacePath: "/workspace",
    }),
    undefined,
  );
});

test("quotes shell-sensitive file names", () => {
  assert.equal(shellQuote("examples/O'Brien.ts"), "'examples/O'\\''Brien.ts'");
});

test("describes unsupported files explicitly", () => {
  assert.equal(
    unsupportedMessage("/workspace/example.vue", "vue"),
    "I have not set up run logic for example.vue (vue) yet.",
  );
});
