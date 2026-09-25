// Pasting several lines into a `/** … */` block keeps them inside it: every line after the first
// gets the ` * ` gutter of the line pasted into. Pure text in, pure text out; extension.js owns
// the clipboard and the edit.

// `linesAbove` nearest first. Returns the text to insert, or undefined for a plain paste.
function getDocblockPaste(linesAbove, lineText, character, clipboard) {
	const beforeCursor = lineText.slice(0, character);
	// Whole line, not beforeCursor: the `/` after `*` decides whether this is `*/`.
	const opener = /^(\s*)\/\*\*/.exec(lineText);
	const gutterLine = /^(\s*)\*(?!\/)/.exec(lineText);

	const marker = opener || gutterLine;

	if (!marker || marker[0].length > character) {
		return undefined;
	}

	// A `*` line is only a docblock line if a `/**` above opens it before any `*/` closes one.
	if (!opener && !isInsideDocblock(linesAbove)) {
		return undefined;
	}

	let lines = String(clipboard).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');

	if (lines.length < 2) {
		return undefined;
	}

	// Copied out of another docblock -> drop its gutter rather than stack a second one.
	if (lines.every((line) => !line.trim() || /^\s*\*(?!\/)(?: |$)/.test(line))) {
		lines = lines.map((line) => line.replace(/^\s*\*(?: |$)/, ''));
	}

	const indent = Math.min(...lines.slice(1).filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length), Infinity);
	const cut = Number.isFinite(indent) ? indent : 0;
	const gutter = `${marker[1]}${opener ? ' ' : ''}* `;
	const lead = /\*$/.test(beforeCursor) ? ' ' : '';

	return [
		lead + lines[0].trimStart().trimEnd(),
		...lines.slice(1).map((line) => (line.trim() ? `${gutter}${line.slice(cut).trimEnd()}` : gutter.trimEnd())),
	].join('\n');
}

function isInsideDocblock(linesAbove) {
	for (const line of linesAbove) {
		if (line.includes('*/')) {
			return false;
		}

		if (/^\s*\/\*\*/.test(line)) {
			return true;
		}

		if (!/^\s*\*/.test(line)) {
			return false;
		}
	}

	return false;
}

module.exports = { getDocblockPaste };
