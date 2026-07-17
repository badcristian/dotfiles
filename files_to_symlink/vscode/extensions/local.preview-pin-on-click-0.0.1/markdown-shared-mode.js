const MARKDOWN_PATTERN = '*.md';
const MARKDOWN_PREVIEW_VIEW_TYPE = 'vscode.markdown.preview.editor';

function isMarkdownUri(uri) {
  return Boolean(uri && typeof uri.path === 'string' && uri.path.toLowerCase().endsWith('.md'));
}

function describeMarkdownTab(tab) {
  const input = tab && tab.input;
  const uri = input && input.uri;

  if (!isMarkdownUri(uri)) {
    return undefined;
  }

  let mode;

  if (input.viewType === MARKDOWN_PREVIEW_VIEW_TYPE) {
    mode = 'preview';
  } else if (typeof input.viewType === 'undefined') {
    mode = 'source';
  } else {
    return undefined;
  }

  return {
    key: uri.toString(),
    mode,
    uri,
  };
}

function modeChangeFromTransition(previous, current, programmaticTransition) {
  if (!previous || !current) {
    return undefined;
  }

  if (
    programmaticTransition
    && programmaticTransition.key === current.key
    && programmaticTransition.mode === current.mode
  ) {
    return undefined;
  }

  if (previous.key !== current.key || previous.mode === current.mode) {
    return undefined;
  }

  return current.mode;
}

function modeFromAssociations(associations) {
  return associations && associations[MARKDOWN_PATTERN] === MARKDOWN_PREVIEW_VIEW_TYPE
    ? 'preview'
    : 'source';
}

function associationsForMode(associations, mode) {
  return {
    ...(associations || {}),
    [MARKDOWN_PATTERN]: mode === 'preview' ? MARKDOWN_PREVIEW_VIEW_TYPE : 'default',
  };
}

module.exports = {
  MARKDOWN_PATTERN,
  MARKDOWN_PREVIEW_VIEW_TYPE,
  associationsForMode,
  describeMarkdownTab,
  modeChangeFromTransition,
  modeFromAssociations,
};
