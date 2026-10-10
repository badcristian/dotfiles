// PhpStorm-style split of a one-line `if` / `elseif` / `while` condition at its top-level `&&` and
// `||`, operator leading each continuation line. Pure text in, pure text out, so the transformation
// is testable without a VS Code host; extension.js owns the document range and the code action.

const { scanPhpBalancedList } = require('./phpBalancedList');

const OPERAND_INDENT = '    ';

// Offsets of the `&&` / `||` sitting directly inside the condition's parentheses: a nested group's
// operators, and any written inside a string, belong to something else.
function findTopLevelOperators(lineText, openIndex, closeIndex) {
	const operators = [];
	let depth = 0;
	let quote = '';
	let escaped = false;

	for (let index = openIndex; index < closeIndex; index++) {
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
		} else if ('([{'.includes(character)) {
			depth++;
		} else if (')]}'.includes(character)) {
			depth--;
		} else if (depth === 1 && (lineText.startsWith('&&', index) || lineText.startsWith('||', index))) {
			operators.push(index);
			index++;
		}
	}

	return operators;
}

function getPhpConditionSplit(lineText) {
	const keyword = /^\s*(?:}\s*)?(?:if|elseif|else\s+if|while)\s*\(/.exec(lineText);

	if (!keyword) {
		return undefined;
	}

	const openIndex = keyword[0].length - 1;
	const { closeIndex } = scanPhpBalancedList(lineText, openIndex);

	// No closing parenthesis on this line means the condition is already split.
	if (closeIndex === -1) {
		return undefined;
	}

	const operators = findTopLevelOperators(lineText, openIndex, closeIndex);

	if (operators.length === 0) {
		return undefined;
	}

	const operands = [];
	let start = openIndex + 1;

	for (const operator of operators) {
		operands.push(lineText.slice(start, operator).trim());
		start = operator;
	}

	operands.push(lineText.slice(start, closeIndex).trim());

	const indent = lineText.match(/^\s*/)[0];

	return [
		lineText.slice(0, openIndex + 1).trimEnd(),
		...operands.map((operand) => `${indent}${OPERAND_INDENT}${operand.replace(/^(&&|\|\|)\s*/, '$1 ')}`),
		`${indent}${lineText.slice(closeIndex).trimEnd()}`,
	].join('\n');
}

module.exports = {
	getPhpConditionSplit,
};
