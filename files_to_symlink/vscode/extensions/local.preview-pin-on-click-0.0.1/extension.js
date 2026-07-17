const vscode = require('vscode');
const {
  MARKDOWN_PREVIEW_VIEW_TYPE,
  associationsForMode,
  describeMarkdownTab,
  modeChangeFromTransition,
  modeFromAssociations,
} = require('./markdown-shared-mode');

let pinning = false;
let lastActiveMarkdownTab;
let programmaticTransition;
let syncTimer;
let syncQueue = Promise.resolve();

function activeMarkdownTab() {
  return describeMarkdownTab(vscode.window.tabGroups.activeTabGroup.activeTab);
}

function globalEditorAssociations() {
  const inspected = vscode.workspace
    .getConfiguration('workbench')
    .inspect('editorAssociations');
  const globalValue = inspected && inspected.globalValue;

  return globalValue && typeof globalValue === 'object' && !Array.isArray(globalValue)
    ? globalValue
    : {};
}

function sharedMarkdownMode() {
  return modeFromAssociations(globalEditorAssociations());
}

async function setSharedMarkdownMode(mode) {
  const current = globalEditorAssociations();
  const next = associationsForMode(current, mode);

  if (current['*.md'] === next['*.md']) {
    return;
  }

  await vscode.workspace
    .getConfiguration('workbench')
    .update('editorAssociations', next, vscode.ConfigurationTarget.Global);
}

async function reopenActiveMarkdownTab(tab, mode) {
  programmaticTransition = {
    key: tab.key,
    mode,
  };

  try {
    await vscode.commands.executeCommand(
      'reopenActiveEditorWith',
      mode === 'preview' ? MARKDOWN_PREVIEW_VIEW_TYPE : 'default'
    );

    const reopened = activeMarkdownTab();

    if (!reopened || reopened.key !== tab.key || reopened.mode !== mode) {
      programmaticTransition = undefined;
    }

    scheduleMarkdownModeSync();
  } catch (error) {
    programmaticTransition = undefined;
    throw error;
  }
}

async function syncActiveMarkdownMode() {
  const current = activeMarkdownTab();

  if (!current) {
    return;
  }

  if (
    programmaticTransition
    && programmaticTransition.key === current.key
    && programmaticTransition.mode === current.mode
  ) {
    programmaticTransition = undefined;
    lastActiveMarkdownTab = current;
    return;
  }

  const changedMode = modeChangeFromTransition(
    lastActiveMarkdownTab,
    current,
    programmaticTransition
  );

  if (changedMode) {
    programmaticTransition = undefined;
    lastActiveMarkdownTab = current;
    await setSharedMarkdownMode(changedMode);
    return;
  }

  lastActiveMarkdownTab = current;

  const expectedMode = sharedMarkdownMode();

  if (current.mode !== expectedMode) {
    await reopenActiveMarkdownTab(current, expectedMode);
  }
}

function scheduleMarkdownModeSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = undefined;
    syncQueue = syncQueue
      .then(syncActiveMarkdownMode)
      .catch(error => console.error('[preview-pin-on-click] Markdown mode sync failed', error));
  }, 0);
}

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

  lastActiveMarkdownTab = activeMarkdownTab();

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(scheduleMarkdownModeSync),
    vscode.window.tabGroups.onDidChangeTabGroups(scheduleMarkdownModeSync),
    {
      dispose() {
        if (syncTimer) {
          clearTimeout(syncTimer);
        }
      },
    }
  );

  scheduleMarkdownModeSync();
}

function deactivate() {}

module.exports = { activate, deactivate };
