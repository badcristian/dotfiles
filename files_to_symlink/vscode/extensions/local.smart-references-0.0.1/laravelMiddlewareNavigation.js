// Laravel maps a middleware alias to a class at runtime, so `->middleware('frontend-vm-secret')`
// is a bare string to Intelephense. The registration lives in `app/Http/Kernel.php` before
// Laravel 11 and in `bootstrap/app.php` after it, but both write `'alias' => Class::class`, so one
// reader covers both.
const { scanPhpString, skipPhpComment } = require('./laravelConfigNavigation');

// `Route::middleware('x')`, `->middleware(['a', 'x'])`, and the withoutMiddleware pair. The
// optional run of finished elements is what lets the cursor sit on any entry of an array instead
// of only the first.
const MIDDLEWARE_CALL_PATTERN = /(?:^|[^A-Za-z0-9_$])(?:middleware|withoutMiddleware)\s*\(\s*(?:\[\s*(?:(?:'[^'\n]*'|"[^"\n]*")\s*,\s*)*)?$/s;

// Reads the text immediately after the alias literal, so it is anchored rather than scanning.
const ALIAS_CLASS_CONSTANT_PATTERN = /^\s*=>\s*(\\?(?:[A-Za-z_][A-Za-z0-9_]*\\)*[A-Za-z_][A-Za-z0-9_]*)\s*::\s*class/;

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function forEachPhpStringLiteral(source, visit) {
	let index = 0;

	while (index < source.length) {
		const commentEnd = skipPhpComment(source, index);
		if (commentEnd !== undefined) {
			index = commentEnd;
			continue;
		}

		if (source[index] !== "'" && source[index] !== '"') {
			index++;
			continue;
		}

		const literal = scanPhpString(source, index);
		if (!literal) {
			return undefined;
		}

		const result = visit(literal, index);

		if (result !== undefined) {
			return result;
		}

		index = literal.nextOffset;
	}

	return undefined;
}

function getMiddlewareAliasAtOffset(source, offset) {
	return forEachPhpStringLiteral(source, (literal, index) => {
		if (offset < literal.start || offset > literal.end) {
			return undefined;
		}

		if (!MIDDLEWARE_CALL_PATTERN.test(source.slice(0, index))) {
			return null;
		}

		// `throttle:60,1` and `auth:sanctum` name the alias before the colon; the rest is
		// arguments handed to the middleware's own handle().
		return literal.value.split(':')[0] || null;
	}) || undefined;
}

function findMiddlewareAliasClass(source, alias) {
	if (!alias) {
		return undefined;
	}

	return forEachPhpStringLiteral(source, (literal) => {
		if (literal.value !== alias) {
			return undefined;
		}

		const match = ALIAS_CLASS_CONSTANT_PATTERN.exec(source.slice(literal.nextOffset));

		if (!match) {
			return undefined;
		}

		const start = literal.nextOffset + match[0].indexOf(match[1]);

		return { className: match[1], start, end: start + match[1].length };
	});
}

function findPhpClassDeclarationRange(source, shortName) {
	if (!shortName) {
		return undefined;
	}

	const pattern = new RegExp(`\\b(?:abstract\\s+|final\\s+|readonly\\s+)*class\\s+(${escapeRegExp(shortName)})\\b`);
	const match = pattern.exec(source);

	if (!match) {
		return undefined;
	}

	const start = match.index + match[0].indexOf(match[1]);

	return { start, end: start + match[1].length };
}

module.exports = {
	findMiddlewareAliasClass,
	findPhpClassDeclarationRange,
	getMiddlewareAliasAtOffset,
};
