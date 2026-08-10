#!/usr/bin/env node
// Print what each snippet in a VS Code snippet file actually expands to.
//
// Snippet bodies fail silently and JSON validity proves nothing about them. An unescaped `$fail` is
// valid snippet syntax for an unknown variable, so VS Code drops the sigil and leaves a placeholder
// holding the word "fail"; a stray `}` closes a placeholder early and swallows the rest of the line.
// Both look correct in the source and are obvious in the output.
//
// Usage: node files_to_symlink/vscode/render_snippets.js User/snippets/php.json

const fs = require('fs');

const file = process.argv[2];

if (!file) {
	console.error('usage: render_snippets.js <snippets-file>');
	process.exit(2);
}

// Snippet files are JSONC. Strip line comments and trailing commas, leaving string literals alone.
function parse(source) {
	const withoutComments = source.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (match, string) => string || '');

	return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, '$1'));
}

// The subset of VS Code's snippet grammar that can change the emitted text: `\$`, `\}` and `\\` are
// escapes, `$n` and `${n}` are empty tabstops, and `${n:default}` and `${VAR:default}` render their
// default, which may itself be a snippet.
function render(text) {
	let out = '';
	let i = 0;

	while (i < text.length) {
		const char = text[i];

		if (char === '\\' && '$}\\'.includes(text[i + 1])) {
			out += text[i + 1];
			i += 2;
			continue;
		}

		if (char === '$' && text[i + 1] === '{') {
			let depth = 1;
			let j = i + 2;

			while (j < text.length && depth > 0) {
				if (text[j] === '\\') {
					j += 2;
					continue;
				}

				if (text[j] === '{') depth++;
				if (text[j] === '}') depth--;
				j++;
			}

			const inner = text.slice(i + 2, j - 1);
			const colon = inner.indexOf(':');

			out += colon === -1 ? '' : render(inner.slice(colon + 1));
			i = j;
			continue;
		}

		if (char === '$' && /\d/.test(text[i + 1] || '')) {
			i += 2;
			while (/\d/.test(text[i] || '')) i++;
			continue;
		}

		out += char;
		i++;
	}

	return out;
}

for (const [name, snippet] of Object.entries(parse(fs.readFileSync(file, 'utf8')))) {
	const body = render([].concat(snippet.body).join('\n')).replace(/^/gm, '    ');

	console.log(`${[].concat(snippet.prefix).join(' | ')}  (${name})`);
	console.log(`${body}\n`);
}
