const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MARKDOWN_PREVIEW_VIEW_TYPE,
  associationsForMode,
  describeMarkdownTab,
  modeChangeFromTransition,
  modeFromAssociations,
} = require('../markdown-shared-mode');

function uri(path) {
  return {
    path,
    toString() {
      return `file://${path}`;
    },
  };
}

test('describes Markdown source and preview tabs', () => {
  const markdownUri = uri('/project/README.md');

  assert.deepEqual(describeMarkdownTab({ input: { uri: markdownUri } }), {
    key: 'file:///project/README.md',
    mode: 'source',
    uri: markdownUri,
  });

  assert.deepEqual(describeMarkdownTab({
    input: {
      uri: markdownUri,
      viewType: MARKDOWN_PREVIEW_VIEW_TYPE,
    },
  }), {
    key: 'file:///project/README.md',
    mode: 'preview',
    uri: markdownUri,
  });
});

test('ignores non-Markdown and unrelated custom editor tabs', () => {
  assert.equal(describeMarkdownTab({ input: { uri: uri('/project/app.js') } }), undefined);
  assert.equal(describeMarkdownTab({
    input: {
      uri: uri('/project/README.md'),
      viewType: 'vscode.markdown.editor',
    },
  }), undefined);
});

test('changes the shared mode only when the same file is explicitly reopened in another mode', () => {
  const firstSource = describeMarkdownTab({ input: { uri: uri('/project/first.md') } });
  const firstPreview = describeMarkdownTab({
    input: {
      uri: uri('/project/first.md'),
      viewType: MARKDOWN_PREVIEW_VIEW_TYPE,
    },
  });
  const secondSource = describeMarkdownTab({ input: { uri: uri('/project/second.md') } });

  assert.equal(modeChangeFromTransition(firstSource, firstPreview), 'preview');
  assert.equal(modeChangeFromTransition(firstPreview, firstSource), 'source');
  assert.equal(modeChangeFromTransition(firstPreview, secondSource), undefined);
  assert.equal(modeChangeFromTransition(firstSource, firstPreview, {
    key: firstPreview.key,
    mode: 'preview',
  }), undefined);
});

test('stores the shared mode in the global Markdown editor association without losing other associations', () => {
  const existing = {
    '*.csv': 'default',
  };

  assert.deepEqual(associationsForMode(existing, 'preview'), {
    '*.csv': 'default',
    '*.md': MARKDOWN_PREVIEW_VIEW_TYPE,
  });
  assert.deepEqual(associationsForMode(existing, 'source'), {
    '*.csv': 'default',
    '*.md': 'default',
  });
  assert.equal(modeFromAssociations({ '*.md': MARKDOWN_PREVIEW_VIEW_TYPE }), 'preview');
  assert.equal(modeFromAssociations({ '*.md': 'default' }), 'source');
  assert.equal(modeFromAssociations({}), 'source');
});
