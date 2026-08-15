const path = require("node:path");

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function targetFromWorkspace(fileName, workspacePath) {
  if (!workspacePath) {
    return path.basename(fileName);
  }

  const relativePath = path.relative(workspacePath, fileName);

  if (
    relativePath &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }

  return fileName;
}

function resolveRunPlan({ fileName, languageId, workspacePath }) {
  const normalizedName = String(fileName).toLowerCase();

  if (
    languageId !== "typescript" ||
    !normalizedName.endsWith(".ts") ||
    normalizedName.endsWith(".d.ts")
  ) {
    return undefined;
  }

  const cwd = workspacePath || path.dirname(fileName);
  const target = targetFromWorkspace(fileName, workspacePath);

  return {
    cwd,
    command: `npx --no-install tsx ${shellQuote(target)}`,
  };
}

function unsupportedMessage(fileName, languageId) {
  return `I have not set up run logic for ${path.basename(fileName)} (${languageId}) yet.`;
}

module.exports = {
  resolveRunPlan,
  shellQuote,
  targetFromWorkspace,
  unsupportedMessage,
};
