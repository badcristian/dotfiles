// Turns a one-line `fn (…) => expr` into `function (…) use (…) { return expr; }`. The use list is
// what the arrow captured implicitly: every variable the body reads, minus its own parameters.
// Pure text in, pure text out; extension.js owns the document range and the code action.

const { scanPhpBalancedList } = require('./phpBalancedList');

const BODY_INDENT = '    ';
const VARIABLE = /(?<!::)\$([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)/g;
const NOT_CAPTURED = /^(this|GLOBALS|_[A-Z]+)$/;

// Where the arrow's expression ends: an unmatched closer, or `,` / `;` at its own depth.
// Single-quoted strings skipped whole; double-quoted ones kept, since they interpolate.
function findExpressionEnd(lineText, start) {
	let depth = 0;
	let quote = '';
	let escaped = false;

	for (let index = start; index < lineText.length; index++) {
		const character = lineText[index];

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
		} else if (character === '#' || (character === '/' && lineText[index + 1] === '/')) {
			return index;
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

	return lineText.length;
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

function findArrowFunctions(lineText) {
	return [...lineText.matchAll(/\bfn\s*\(/g)].map((match) => {
		const fnIndex = match.index;
		const openIndex = fnIndex + match[0].length - 1;
		const { closeIndex } = scanPhpBalancedList(lineText, openIndex);
		const arrow = closeIndex === -1 ? undefined : /^(\s*:\s*[^=]+?)?\s*=>\s*/.exec(lineText.slice(closeIndex + 1));

		if (!arrow) {
			return undefined;
		}

		const bodyStart = closeIndex + 1 + arrow[0].length;

		return {
			fnIndex,
			openIndex,
			closeIndex,
			returnType: arrow[1]?.trim(),
			bodyStart,
			bodyEnd: findExpressionEnd(lineText, bodyStart),
		};
	}).filter(Boolean);
}

// Innermost arrow around the cursor; else the first on the line.
function getPhpArrowFunctionConversion(lineText, cursor = 0) {
	const trimmed = lineText.trim();

	if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
		return undefined;
	}

	const arrows = findArrowFunctions(lineText);
	const arrow = arrows.filter((candidate) => candidate.fnIndex <= cursor && cursor <= candidate.bodyEnd).pop()
		?? arrows[0];

	if (!arrow) {
		return undefined;
	}

	const body = lineText.slice(arrow.bodyStart, arrow.bodyEnd).trim();

	if (body === '') {
		return undefined;
	}

	const parameters = lineText.slice(arrow.openIndex, arrow.closeIndex + 1);
	const ownParameters = [...parameters.matchAll(VARIABLE)].map((match) => match[1]);
	const captured = getCapturedVariables(body, ownParameters).map((name) => `$${name}`);
	const indent = lineText.match(/^\s*/)[0];
	const inner = `${indent}${BODY_INDENT}`;
	const returnType = arrow.returnType ?? '';
	let header;

	// One capture stays inline, as the use split leaves it; more go one per line.
	if (captured.length === 0) {
		header = [`${lineText.slice(0, arrow.fnIndex)}function ${parameters}${returnType} {`];
	} else if (captured.length === 1) {
		header = [`${lineText.slice(0, arrow.fnIndex)}function ${parameters} use (${captured[0]})${returnType} {`];
	} else {
		header = [
			`${lineText.slice(0, arrow.fnIndex)}function ${parameters} use (`,
			...captured.map((name, index) => `${inner}${name}${index < captured.length - 1 ? ',' : ''}`),
			`${indent})${returnType} {`,
		];
	}

	return [
		...header,
		`${inner}return ${body};`,
		`${indent}}${lineText.slice(arrow.bodyEnd).trimEnd()}`,
	].join('\n');
}

module.exports = {
	getPhpArrowFunctionConversion,
};
