const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('contributes global bottom spacing to the built-in Markdown preview', () => {
  const extensionRoot = path.join(__dirname, '..');
  const manifest = require('../package.json');
  const styles = manifest.contributes && manifest.contributes['markdown.previewStyles'];

  assert.deepEqual(styles, ['./markdown-preview.css']);

  const css = fs.readFileSync(path.join(extensionRoot, 'markdown-preview.css'), 'utf8');
  assert.match(css, /body\.vscode-body\s*\{/);
  assert.match(css, /padding-bottom:\s*64px/);
});
