// Turns a one-line `fn (…) => expr` into `function (…) use (…) { return expr; }`. The use list is
// what the arrow captured implicitly: every variable the body reads, minus its own parameters.
// Pure text in, pure text out; extension.js owns the document range and the code action.

const { scanPhpBalancedList } = require('./phpBalancedList');

const BODY_INDENT = '    ';
const VARIABLE = /(?<!::)\$([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)/g;
const NOT_CAPTURED = /^(this|GLOBALS|_[A-Z]+)$/;

// Where the arrow's expression ends: an unmatched closer, or `,` / `;` at its own depth. Newlines
// are part of it. Single-quoted strings skipped whole; double-quoted kept, since they interpolate.
// A comment inside -> undefined: `return …;` would land after it.
function findExpressionEnd(text, start) {
	let depth = 0;
	let quote = '';
	let escaped = false;

	for (let index = start; index < text.length; index++) {
		const character = text[index];

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === quote) {
				quote = '';
			}
			continue;
		}

		if (character === '\'' || character === '"') {
			quote = character;
		} else if ((character === '#' && text[index + 1] !== '[') || (character === '/' && '/*'.includes(text[index + 1]))) {
			return undefined;
		} else if ('([{'.includes(character)) {
			depth++;
		} else if (')]}'.includes(character)) {
			if (depth === 0) {
				return index;
			}

			depth--;
		} else if (depth === 0 && (character === ',' || character === ';')) {
			return index;
		}
	}

	return text.length;
}

function getCapturedVariables(body, ownParameters) {
	const withoutSingleQuoted = body.replace(/'(?:\\.|[^'\\])*'/g, "''");
	// A nested arrow's parameters are its own, not captures.
	const nested = [...withoutSingleQuoted.matchAll(/\bfn\s*\(([^)]*)\)/g)]
		.flatMap((match) => [...match[1].matchAll(VARIABLE)].map((variable) => variable[1]));
	const excluded = new Set([...ownParameters, ...nested]);

	return [...new Set([...withoutSingleQuoted.matchAll(VARIABLE)].map((match) => match[1]))]
		.filter((name) => !excluded.has(name) && !NOT_CAPTURED.test(name));
}

function isInLineComment(text, index) {
	const lineBefore = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);

	return /\/\/|#(?!\[)/.test(lineBefore) || /^\s*\*/.test(lineBefore);
}

function findArrowFunctions(text) {
	return [...text.matchAll(/\bfn\s*\(/g)].map((match) => {
		const fnIndex = match.index;

		if (isInLineComment(text, fnIndex)) {
			return undefined;
		}

		const openIndex = fnIndex + match[0].length - 1;
		const { closeIndex } = scanPhpBalancedList(text, openIndex);
		const arrow = closeIndex === -1 ? undefined : /^(\s*:\s*[^=;{]+?)?\s*=>\s*/.exec(text.slice(closeIndex + 1));

		if (!arrow) {
			return undefined;
		}

		const bodyStart = closeIndex + 1 + arrow[0].length;
		const bodyEnd = findExpressionEnd(text, bodyStart);

		return bodyEnd === undefined ? undefined : {
			fnIndex,
			openIndex,
			closeIndex,
			returnType: arrow[1]?.trim(),
			bodyStart,
			bodyEnd,
		};
	}).filter(Boolean);
}

// Continuation lines keep their shape, re-based one level inside `return`.
function formatBody(body, inner) {
	const [first, ...rest] = body.split('\n');
	const shift = Math.min(...rest.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));

	return [
		`${inner}return ${first}`,
		...rest.map((line) => (line.trim() ? `${inner}${BODY_INDENT}${line.slice(shift)}` : '')),
	].join('\n');
}

// Innermost arrow around the cursor; else the first on the cursor's line.
function getPhpArrowFunctionConversion(text, cursor = 0) {
	const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
	const lineEnd = text.indexOf('\n', cursor) === -1 ? text.length : text.indexOf('\n', cursor);
	const arrows = findArrowFunctions(text);
	const arrow = arrows.filter((candidate) => candidate.fnIndex <= cursor && cursor <= candidate.bodyEnd).pop()
		?? arrows.find((candidate) => candidate.fnIndex >= lineStart && candidate.fnIndex < lineEnd);

	if (!arrow) {
		return undefined;
	}

	const body = text.slice(arrow.bodyStart, arrow.bodyEnd).trim();

	if (body === '') {
		return undefined;
	}

	const fnLineStart = text.lastIndexOf('\n', arrow.fnIndex - 1) + 1;
	// Last call argument `fn … => expr,\n)` -> `});`. An array element keeps its `,` and line.
	const tailStart = arrow.bodyEnd + (/^,\s*(?=\))/.exec(text.slice(arrow.bodyEnd))?.[0].length ?? 0);
	const tailEnd = text.indexOf('\n', tailStart) === -1 ? text.length : text.indexOf('\n', tailStart);
	const parameters = text.slice(arrow.openIndex, arrow.closeIndex + 1);
	const ownParameters = [...parameters.matchAll(VARIABLE)].map((match) => match[1]);
	const captured = getCapturedVariables(body, ownParameters).map((name) => `$${name}`);
	const indent = text.slice(fnLineStart).match(/^[ \t]*/)[0];
	const inner = `${indent}${BODY_INDENT}`;
	const returnType = arrow.returnType ?? '';
	const prefix = `${text.slice(fnLineStart, arrow.fnIndex)}function ${parameters}`;
	let header;

	// One capture stays inline, as the use split leaves it; more go one per line.
	if (captured.length === 0) {
		header = [`${prefix}${returnType} {`];
	} else if (captured.length === 1) {
		header = [`${prefix} use (${captured[0]})${returnType} {`];
	} else {
		header = [
			`${prefix} use (`,
			...captured.map((name, index) => `${inner}${name}${index < captured.length - 1 ? ',' : ''}`),
			`${indent})${returnType} {`,
		];
	}

	return {
		start: fnLineStart,
		end: tailEnd,
		replacement: [
			...header,
			`${formatBody(body, inner)};`,
			`${indent}}${text.slice(tailStart, tailEnd).trimEnd()}`,
		].join('\n'),
	};
}
module.exports = {
	getPhpArrowFunctionConversion,
};
