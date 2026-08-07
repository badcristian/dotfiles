'use strict';

// Laravel registers macros at runtime — `Rule::macro('uniqueCaseInsensitive', fn () => …)` — so the
// call `Rule::uniqueCaseInsensitive('companies', 'name')` names a method that exists in no class
// body. Intelephense therefore has no definition to offer and Cmd+B stalls. These pure helpers
// recognize a macro-style call under the cursor and locate the `::macro('name', …)` registration
// that defines it, so navigation lands on the closure instead of nowhere.
//
// `findMacroRegistrations` reads the other half of the problem: the registration's receiver, its
// parameters, and its return type. Navigation uses the offsets to build the workspace index; the
// IDE-helper generator uses the signature to declare the macro, so a call has a TYPE and not only a
// destination — without one, everything chained onto the call is unresolvable in turn.

// A window this wide is enough to see the `::`/`->` before the name and the `(` after it, and keeps
// the lookaround off the whole file.
const CALL_CONTEXT_WINDOW = 16;

const NAME_START = /[A-Za-z_\x80-\xff]/;
const NAME_CHAR = /[A-Za-z0-9_\x80-\xff]/;

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPhpIdentifier(value) {
	return typeof value === 'string'
		&& new RegExp(`^${NAME_START.source}${NAME_CHAR.source}*$`).test(value);
}

// Replace every comment, string, and heredoc body with spaces, keeping every other character at its
// original offset. Call sites are then found in code alone: the usage example in a docblock above a
// registration is documentation, not a reference, and reporting it as one is worse than missing it.
// Strings are tracked because `'https://x'` would otherwise look like the start of a `//` comment.
function blankPhpCommentsAndStrings(source) {
	const text = String(source);
	const characters = text.split('');
	let index = 0;

	function blank(start, end) {
		for (let cursor = start; cursor < end && cursor < characters.length; cursor++) {
			if (characters[cursor] !== '\n') {
				characters[cursor] = ' ';
			}
		}
	}

	function endOfLine(start) {
		const lineEnd = text.indexOf('\n', start);

		return lineEnd === -1 ? text.length : lineEnd;
	}

	while (index < text.length) {
		const pair = text.slice(index, index + 2);

		// `#[` opens a PHP 8 attribute, which is code; a lone `#` is still a line comment.
		if (pair === '//' || (text[index] === '#' && pair !== '#[')) {
			const end = endOfLine(index);
			blank(index, end);
			index = end;
			continue;
		}

		if (pair === '/*') {
			const commentEnd = text.indexOf('*/', index + 2);
			const end = commentEnd === -1 ? text.length : commentEnd + 2;
			blank(index, end);
			index = end;
			continue;
		}

		// Heredoc and nowdoc bodies end at their label, so a quote inside raw SQL cannot run away
		// and blank the rest of the file.
		if (text[index] === '<' && pair === '<<') {
			const opener = /^<<<[ \t]*(['"]?)([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\1\r?\n/
				.exec(text.slice(index, index + 128));

			if (opener) {
				const bodyStart = index + opener[0].length;
				const closer = new RegExp(`^[ \\t]*${opener[2]}\\b`, 'm').exec(text.slice(bodyStart));
				const end = closer ? bodyStart + closer.index + closer[0].length : text.length;
				blank(bodyStart, end);
				index = end;
				continue;
			}
		}

		if (text[index] === "'" || text[index] === '"') {
			const quote = text[index];
			let cursor = index + 1;

			while (cursor < text.length && text[cursor] !== quote) {
				cursor += text[cursor] === '\\' ? 2 : 1;
			}

			const end = Math.min(cursor + 1, text.length);
			blank(index, end);
			index = end;
			continue;
		}

		index++;
	}

	return characters.join('');
}

// The identifier of a `Foo::bar(` / `$foo->bar(` call spanning `offset`, or undefined when the
// cursor is not on one. Plain function calls and bare identifiers are excluded: a macro is only ever
// reached through a static or instance call.
function getMacroCallNameAtOffset(source, offset) {
	const text = String(source);

	if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
		return undefined;
	}

	let start = offset;
	while (start > 0 && NAME_CHAR.test(text[start - 1])) {
		start--;
	}

	let end = offset;
	while (end < text.length && NAME_CHAR.test(text[end])) {
		end++;
	}

	const name = text.slice(start, end);

	if (!name || !NAME_START.test(name[0])) {
		return undefined;
	}

	// `macro` itself is a real Macroable method; navigating from it would only find the call the
	// cursor already sits on.
	if (name === 'macro') {
		return undefined;
	}

	if (!/^\s*\(/.test(text.slice(end, end + CALL_CONTEXT_WINDOW))) {
		return undefined;
	}

	return /(?:::|->)\s*$/.test(text.slice(Math.max(0, start - CALL_CONTEXT_WINDOW), start))
		? name
		: undefined;
}

// `Macroable::macro(string $name, object|callable $macro)` is called positionally and, since PHP 8,
// with named arguments — `macro(name: 'uniqueCaseInsensitive', macro: fn () => …)`. Anything may
// precede the name literal except quotes and parentheses, so a label is skipped while the scan can
// never cross into the closure or into some other string. A call that puts `macro:` first, closure
// and all, simply does not match and falls back to ordinary navigation.
function macroRegistrationPattern(namePattern) {
	return new RegExp(`(?:::|->)\\s*macro\\s*\\(\\s*(?:[^()'"]*?\\bname\\s*:\\s*)?(['"])(${namePattern})\\1`, 'g');
}

// The class a registration is attached to — `Http` in `Http::macro('facebookGraph', …)`. Namespace
// qualifiers are kept so the caller can resolve the name against the file's imports like any other
// class reference. A variable receiver (`$router->macro(…)`) names no class and yields undefined:
// only a statically named one can be described to a language server.
function getMacroRegistrationReceiver(source, operatorOffset) {
	const before = String(source).slice(0, operatorOffset).replace(/\s+$/, '');
	const match = /\\?(?:[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*\\)*[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/
		.exec(before);

	if (!match || before[match.index - 1] === '$') {
		return undefined;
	}

	return match[0];
}

// The offset of the `)` closing the `(` at `openOffset`, or -1. String bodies are stepped over so a
// parenthesis inside a default value cannot unbalance the count.
function findClosingParen(text, openOffset) {
	let depth = 0;

	for (let cursor = openOffset; cursor < text.length; cursor++) {
		const character = text[cursor];

		if (character === "'" || character === '"') {
			cursor++;
			while (cursor < text.length && text[cursor] !== character) {
				cursor += text[cursor] === '\\' ? 2 : 1;
			}
			continue;
		}

		if (character === '(') {
			depth++;
		} else if (character === ')') {
			depth--;

			if (depth === 0) {
				return cursor;
			}
		}
	}

	return -1;
}

// The parameter list and declared return type of the closure a registration binds, read from the
// argument that follows the name literal. A macro bound to something other than a closure — a
// callable array, a first-class callable — has neither, and both come back undefined.
function getMacroClosureSignature(source, afterNameOffset) {
	const text = String(source);
	const separator = /^['"]\s*,\s*(?:macro\s*:\s*)?/.exec(text.slice(afterNameOffset));

	if (!separator) {
		return undefined;
	}

	const head = /^\s*(?:static\s+)?(?:fn|function)\s*(?:&\s*)?\(/
		.exec(text.slice(afterNameOffset + separator[0].length));

	if (!head) {
		return undefined;
	}

	const openParen = afterNameOffset + separator[0].length + head[0].length - 1;
	const closeParen = findClosingParen(text, openParen);

	if (closeParen === -1) {
		return undefined;
	}

	// `: Type` runs to the arrow of an `fn` or the brace of a `function`; `=` is excluded from the
	// type so `=>` cannot be swallowed by it.
	const returnType = /^\s*:\s*([^={;]+?)\s*(?:=>|\{)/.exec(text.slice(closeParen + 1));

	return {
		parameters: text.slice(openParen + 1, closeParen).trim(),
		returnType: returnType ? returnType[1].trim() : undefined,
	};
}

// Every `X::macro('name', …)` / `$x->macro('name', …)` in one file, with the offsets of each name
// literal plus what is needed to describe the macro to a language server. One pass over the file
// answers both "where is this macro registered" and "what does calling it return", so a workspace
// scan never has to run twice.
function findMacroRegistrations(source) {
	const text = String(source);
	const registration = macroRegistrationPattern("[^'\"\\\\]*");
	const registrations = [];
	let match;

	while ((match = registration.exec(text)) !== null) {
		const name = match[2];

		if (!isPhpIdentifier(name)) {
			continue;
		}

		const start = match.index + match[0].lastIndexOf(name);
		const signature = getMacroClosureSignature(text, start + name.length);

		registrations.push({
			name,
			start,
			end: start + name.length,
			isStatic: text.startsWith('::', match.index),
			receiver: getMacroRegistrationReceiver(text, match.index),
			parameters: signature ? signature.parameters : undefined,
			returnType: signature ? signature.returnType : undefined,
		});
	}

	return registrations;
}

// The name being registered when the cursor sits inside the literal of `::macro('name', …)`, or
// undefined anywhere else. Only the literal counts: on the `macro` keyword itself Intelephense
// already resolves the real `Macroable::macro()`, and hijacking that would be a regression.
function getMacroRegistrationNameAtOffset(source, offset) {
	const text = String(source);

	if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
		return undefined;
	}

	const registration = macroRegistrationPattern("[^'\"\\\\]*");
	let match;

	while ((match = registration.exec(text)) !== null) {
		const name = match[2];

		if (!isPhpIdentifier(name)) {
			continue;
		}

		const start = match.index + match[0].lastIndexOf(name);

		if (offset >= start && offset <= start + name.length) {
			return name;
		}
	}

	return undefined;
}

// Offsets of every `::name(` / `->name(` call in one file's code, for the reverse direction: from a
// registration to the places that use it.
function findMacroCallRanges(source, name) {
	if (!isPhpIdentifier(name)) {
		return [];
	}

	const code = blankPhpCommentsAndStrings(source);
	const call = new RegExp(`(?:::|->)\\s*(${escapeRegExp(name)})\\s*\\(`, 'g');
	const ranges = [];
	let match;

	while ((match = call.exec(code)) !== null) {
		const start = match.index + match[0].indexOf(match[1]);

		ranges.push({ start, end: start + name.length });
	}

	return ranges;
}

module.exports = {
	blankPhpCommentsAndStrings,
	findMacroCallRanges,
	findMacroRegistrations,
	getMacroCallNameAtOffset,
	getMacroRegistrationNameAtOffset,
};
