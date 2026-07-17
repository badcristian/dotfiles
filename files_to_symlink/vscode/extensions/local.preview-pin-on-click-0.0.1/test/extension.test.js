const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const MARKDOWN_PREVIEW_VIEW_TYPE = 'vscode.markdown.preview.editor';

function createEvent() {
  const listeners = new Set();

  return {
    event(listener) {
      listeners.add(listener);

      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    fire(value) {
      for (const listener of listeners) {
        listener(value);
      }
    },
  };
}

function uri(path) {
  return {
    path,
    toString() {
      return `file://${path}`;
    },
  };
}

function tab(path, mode) {
  const input = { uri: uri(path) };

  if (mode === 'preview') {
    input.viewType = MARKDOWN_PREVIEW_VIEW_TYPE;
  }

  return { input };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 500;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 5));
  }

  assert.fail(message);
}

test('carries explicit Markdown mode switches across subsequently activated Markdown tabs', async () => {
  const tabChanges = createEvent();
  const tabGroupChanges = createEvent();
  const selectionChanges = createEvent();
  let associations = { '*.csv': 'default' };

  const activeTabGroup = {
    activeTab: tab('/project/first.md', 'source'),
  };

  const vscode = {
    commands: {
      async executeCommand(command, override) {
        assert.equal(command, 'reopenActiveEditorWith');
        const currentUri = activeTabGroup.activeTab.input.uri.path;
        activeTabGroup.activeTab = tab(
          currentUri,
          override === MARKDOWN_PREVIEW_VIEW_TYPE ? 'preview' : 'source'
        );
        tabChanges.fire({ opened: [], closed: [], changed: [activeTabGroup.activeTab] });
      },
    },
    ConfigurationTarget: {
      Global: 1,
    },
    TextEditorSelectionChangeKind: {
      Mouse: 2,
    },
    window: {
      activeTextEditor: undefined,
      onDidChangeTextEditorSelection: selectionChanges.event,
      tabGroups: {
        activeTabGroup,
        onDidChangeTabs: tabChanges.event,
        onDidChangeTabGroups: tabGroupChanges.event,
      },
    },
    workspace: {
      getConfiguration(section) {
        assert.equal(section, 'workbench');

        return {
          inspect(setting) {
            assert.equal(setting, 'editorAssociations');
            return { globalValue: associations };
          },
          async update(setting, value, target) {
            assert.equal(setting, 'editorAssociations');
            assert.equal(target, 1);
            associations = value;
          },
        };
      },
    },
  };

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'vscode') {
      return vscode;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const extensionPath = require.resolve('../extension');
  delete require.cache[extensionPath];

  try {
    const extension = require('../extension');
    const context = { subscriptions: [] };
    extension.activate(context);

    activeTabGroup.activeTab = tab('/project/first.md', 'preview');
    tabChanges.fire({ opened: [], closed: [], changed: [activeTabGroup.activeTab] });

    await waitFor(
      () => associations['*.md'] === MARKDOWN_PREVIEW_VIEW_TYPE,
      'Preview mode was not saved globally'
    );
    assert.equal(associations['*.csv'], 'default');

    activeTabGroup.activeTab = tab('/project/second.md', 'source');
    tabChanges.fire({ opened: [], closed: [], changed: [activeTabGroup.activeTab] });

    await waitFor(
      () => activeTabGroup.activeTab.input.viewType === MARKDOWN_PREVIEW_VIEW_TYPE,
      'A subsequently activated Markdown source tab did not inherit Preview mode'
    );
    assert.equal(associations['*.md'], MARKDOWN_PREVIEW_VIEW_TYPE);

    activeTabGroup.activeTab = tab('/project/second.md', 'source');
    tabChanges.fire({ opened: [], closed: [], changed: [activeTabGroup.activeTab] });

    await waitFor(
      () => associations['*.md'] === 'default',
      'Source mode was not saved globally'
    );

    activeTabGroup.activeTab = tab('/project/first.md', 'preview');
    tabChanges.fire({ opened: [], closed: [], changed: [activeTabGroup.activeTab] });

    await waitFor(
      () => typeof activeTabGroup.activeTab.input.viewType === 'undefined',
      'A subsequently activated Markdown Preview tab did not inherit source mode'
    );

    for (const subscription of context.subscriptions) {
      subscription.dispose();
    }
  } finally {
    delete require.cache[extensionPath];
    Module._load = originalLoad;
  }
});
