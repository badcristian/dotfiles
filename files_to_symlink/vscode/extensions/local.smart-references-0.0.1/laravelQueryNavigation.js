'use strict';

// Eloquent relation names written as strings: `Model::query()->with('metaToken')`.
//
// The relation is a method on the model, but `with()` receives its name as a string, so nothing in
// the call connects the two and Intelephense has no definition to offer — Cmd+B falls all the way
// through to "No other references found". A text search cannot answer it either: five models in one
// project declare a `metaToken()`, and only the type the chain started from says which is meant.
//
// So the receiver is what this module resolves, and it resolves it conservatively. Only a chain
// whose head is written as a class — `FacebookAdAccount::query()`, `Model::with(…)` — is answered.
// A chain starting from a variable is left alone rather than guessed at, which also happens to be
// what keeps `redirect()->with('status', …)` and `view($v)->with('name', $x)` out of this: they name
// session keys and view variables, not relations, and neither has a class at its head.

const { scanPhpString, skipPhpComment } = require('./laravelConfigNavigation');

// Which method arguments name what. Keys are lowercased because PHP method names are
// case-insensitive and `withCount` is written both ways in practice.
//
// These sets are curated rather than derived, and that is not laziness. "Any method starting with
// `where`" looks like the dynamic rule and is wrong: `whereStatus('active')` is Laravel's dynamic
// where, so its first argument is the VALUE and the column is in the method name. A blanket rule
// sends Cmd+B looking for a column called `active`. Everything downstream of these sets — which
// model, which column, which file — is inferred and needs no configuration.

// `with('a', 'b')` and `load('a', 'b')` take relations variadically, so every string argument names
// one.
const RELATION_IN_EVERY_ARGUMENT = new Set(['with', 'load', 'loadmissing']);

// The rest take one relation, first. A later argument is a closure, or a column on the related model
// — `withSum('lines', 'total')` — which is deliberately not resolved rather than resolved against
// the wrong model.
const RELATION_IN_FIRST_ARGUMENT = new Set([
	'has', 'orhas', 'doesnthave', 'ordoesnthave',
	'wherehas', 'orwherehas', 'wheredoesnthave', 'orwheredoesnthave', 'withwherehas',
	'whererelation', 'orwhererelation',
	'withcount', 'withexists', 'withsum', 'withmax', 'withmin', 'withavg',
	'loadcount', 'loadexists', 'loadsum', 'loadmax', 'loadmin', 'loadavg',
]);

// Column first. `whereRaw`, `havingRaw` and `whereExists` are absent on purpose — they take SQL and
// closures, not column names — and so is `whereKey`, whose argument is a key value.
const COLUMN_IN_FIRST_ARGUMENT = new Set([
	'where', 'orwhere', 'wherenot', 'orwherenot', 'firstwhere',
	'wherein', 'orwherein', 'wherenotin', 'orwherenotin',
	'wherenull', 'orwherenull', 'wherenotnull', 'orwherenotnull',
	'wherebetween', 'orwherebetween', 'wherenotbetween', 'orwherenotbetween',
	'wherebetweencolumns', 'wherenotbetweencolumns',
	'wheredate', 'orwheredate', 'wheremonth', 'orwheremonth', 'whereday', 'orwhereday',
	'whereyear', 'orwhereyear', 'wheretime', 'orwheretime', 'wherepast', 'wherefuture',
	'wherelike', 'orwherelike', 'wherenotlike', 'orwherenotlike',
	'wherejsoncontains', 'orwherejsoncontains', 'wherejsondoesntcontain',
	'wherejsoncontainskey', 'wherejsondoesntcontainkey', 'wherejsonlength',
	'wherefulltext', 'orwherefulltext',
	'orderby', 'orderbydesc', 'latest', 'oldest', 'having', 'orhaving', 'havingbetween',
	'havingnull', 'havingnotnull', 'pluck', 'value', 'sum', 'avg', 'average', 'min', 'max',
	'increment', 'decrement', 'incrementeach', 'decrementeach',
]);

// Column in every argument: `select('id', 'name')`, `groupBy('a', 'b')`. `whereColumn('a', '=', 'b')`
// belongs here too — its operator argument is not an identifier, so it declines on its own.
const COLUMN_IN_EVERY_ARGUMENT = new Set([
	'select', 'addselect', 'groupby', 'wherecolumn', 'orwherecolumn', 'distinct',
]);

// Methods taking column => value arrays, where the KEYS are columns and the values are not:
// `updateOrCreate(['facebook_business_id' => $id], [...])`. Both arrays of `updateOrCreate` and
// `firstOrCreate` qualify, which is why this is a method set and not an argument position.
const COLUMN_KEYS_IN_ARRAY = new Set([
	'where', 'orwhere', 'updateorcreate', 'firstorcreate', 'createorfirst', 'firstornew',
	'create', 'forcecreate', 'update', 'fill', 'forcefill', 'insert', 'insertorignore', 'upsert',
]);

// Methods that declare what a relation returns, read to follow a dotted path across models.
const RELATION_FACTORIES = [
	'belongsTo', 'belongsToMany',
	'hasOne', 'hasMany', 'hasOneThrough', 'hasManyThrough',
	'morphOne', 'morphMany', 'morphTo', 'morphToMany', 'morphedByMany',
].join('|');

// The head of a chain when it is written as a class: `FacebookAdAccount::query()->…`. A `return` and
// a leading assignment are stepped over; anything else means the expression did not start from a
// nameable class.
const CHAIN_HEAD_PATTERN = /^\s*(?:return\s+)?(?:\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*\s*=\s*)?\\?([A-Z][A-Za-z0-9_\x80-\xff\\]*)\s*::/;

// The head of a chain when it is `$this`, which is how a dedicated query-builder class writes it —
// and this codebase keeps named queries in a builder class rather than in model scopes, so it is the
// common shape, not the exotic one.
const THIS_HEAD_PATTERN = /^\s*(?:return\s+)?\$this\s*(?:->|$)/;

// Which model a builder class builds, read from the generic it already declares:
//
//   /** @extends Builder<FacebookAdAccount> */
//   class FacebookAdAccountQueryBuilder extends Builder
//
// This is the explicit answer rather than an inferred one. Stripping `QueryBuilder` off the class
// name would agree with it here and is still a guess — the two names are free to diverge, and a
// guess that opens the wrong model is worse than not navigating. The file is assumed to hold one
// class, which PSR-4 already requires of every file this could run on.
const BUILDER_MODEL_PATTERN = /@extends\s+\\?[A-Za-z0-9_\\]*Builder\s*<\s*\\?([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff\\]*)\s*>/;

const PHP_IDENTIFIER_BEFORE = /([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*$/;

// One forward pass that answers both questions at once: which call the offset sits inside, and where
// the expression holding that call began. Scanning backwards from the cursor is the obvious approach
// and the wrong one — whether a `)` closes anything depends on whether it is inside a string, and
// deciding that means having read forwards anyway.
//
// The stack holds one frame per open bracket:
//
//   start          where the current expression begins inside this frame. A comma resets it, so in
//                  `->when($flag, fn ($q) => $q->with('rel'))` the inner `with` is understood to
//                  hang off `fn ($q) => $q` rather than off whatever the statement started from.
//   callee         the identifier written immediately before this frame's `(`.
//   chainStart     the parent's `start` at the moment this frame opened — where the receiver of
//                  `callee` begins, which is the text the chain head is read out of.
//   argumentIndex  how many top-level commas have passed, which is what separates
//                  `where('status', $v)` from `withSum('lines', 'total')`.
//
// A `[` inherits all four and freezes the argument index, because the elements of
// `with(['a', 'b'])` are all still argument 0 of `with` — the brackets are not what they are
// arguments to.
function findCallContextAtOffset(source, offset) {
	const text = String(source);
	const stack = [{ start: 0, callee: undefined, calleeOffset: 0, chainStart: 0, argumentIndex: 0, isArray: false }];
	let index = 0;

	while (index < text.length) {
		const commentEnd = skipPhpComment(text, index);

		if (commentEnd !== undefined) {
			index = commentEnd;
			continue;
		}

		const character = text[index];

		if (character === "'" || character === '"') {
			const literal = scanPhpString(text, index);

			if (!literal) {
				return undefined;
			}

			if (offset >= literal.start && offset <= literal.end) {
				const frame = stack[stack.length - 1];

				return frame.callee
					? {
						callee: frame.callee,
						calleeOffset: frame.calleeOffset,
						chainStart: frame.chainStart,
						argumentIndex: frame.argumentIndex,
						isArrayElement: frame.isArray,
						// An array element followed by `=>` is a key, which is how a column => value
						// map spells a column.
						isArrayKey: frame.isArray && /^\s*=>/.test(text.slice(literal.nextOffset)),
						literal,
					}
					: undefined;
			}

			index = literal.nextOffset;
			continue;
		}

		if (character === '(' || character === '[') {
			const parent = stack[stack.length - 1];
			const before = character === '(' ? PHP_IDENTIFIER_BEFORE.exec(text.slice(0, index)) : null;

			stack.push(before
				? {
					start: index + 1,
					callee: before[1].toLowerCase(),
					calleeOffset: index - before[0].length,
					chainStart: parent.start,
					argumentIndex: 0,
					isArray: false,
				}
				: {
					start: index + 1,
					// A bare `(` groups an expression and is nobody's argument list; an inherited
					// callee there would read `('a')` as a call to whatever preceded the group.
					callee: character === '[' ? parent.callee : undefined,
					calleeOffset: parent.calleeOffset,
					chainStart: parent.chainStart,
					argumentIndex: parent.argumentIndex,
					isArray: character === '[',
				});

			index++;
			continue;
		}

		if (character === ')' || character === ']') {
			if (stack.length > 1) {
				stack.pop();
			}

			index++;
			continue;
		}

		if (',;{}'.includes(character)) {
			const frame = stack[stack.length - 1];

			frame.start = index + 1;

			if (character === ',' && !frame.isArray) {
				frame.argumentIndex++;
			}

			index++;
			continue;
		}

		index++;
	}

	return undefined;
}

// Whether the argument the cursor is in is one of the kind these two sets describe.
function argumentNamesOne(context, inEveryArgument, inFirstArgument) {
	return inEveryArgument.has(context.callee)
		|| (inFirstArgument.has(context.callee) && context.argumentIndex === 0);
}

const PHP_NAME_PATTERN = /^[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/;

// Whether the string the cursor is in names a column.
//
// Inside an array the positional rules do not apply, and dropping that distinction is how a column
// finder starts answering for values: the elements of `whereIn('status', ['active', 'paused'])` sit
// at the frozen argument index 0 just as `'status'` does, so a rule that only looked at position
// would call `'active'` a column. Inside an array a string is a column when the method takes arrays
// of columns — `select(['id', 'total'])` — or when it is a key in a column => value map.
function namesColumn(context) {
	if (context.isArrayElement) {
		return COLUMN_IN_EVERY_ARGUMENT.has(context.callee)
			|| (context.isArrayKey && COLUMN_KEYS_IN_ARRAY.has(context.callee));
	}

	return argumentNamesOne(context, COLUMN_IN_EVERY_ARGUMENT, COLUMN_IN_FIRST_ARGUMENT);
}

// The column the cursor names, and the class the chain started from. A `table.column` reference
// keeps only the column: the prefix names a table, which on a joined query need not be the head
// model's, and resolving it against that model anyway is the kind of confident wrong answer this
// module exists to avoid — but the common `where('own_table.col', …)` is worth answering.
function getEloquentColumnAtOffset(source, offset) {
	const text = String(source);
	const context = findCallContextAtOffset(text, offset);

	if (!context || !namesColumn(context)) {
		return undefined;
	}

	const segments = context.literal.value.split('.');
	const column = segments[segments.length - 1];

	if (segments.length > 2 || !PHP_NAME_PATTERN.test(column)) {
		return undefined;
	}

	const headClass = getChainHeadClass(text, text.slice(context.chainStart, context.calleeOffset));

	return headClass ? { headClass, column } : undefined;
}

// Where a model documents a column. These projects declare every column as `@property` on the model
// class, which puts the answer in first-party source next to the relations rather than spread over
// the migration history — `status` on facebook_ad_accounts is touched by four separate migrations,
// so "the migration that defines it" is not a single place to navigate to.
//
// `$casts` and `$guarded` are the second look, for a column real enough to be cast or guarded but
// not documented.
function findModelPropertyRange(source, column) {
	if (!PHP_NAME_PATTERN.test(String(column))) {
		return undefined;
	}

	const text = String(source);
	const documented = new RegExp(`@property(?:-read|-write)?\\s+[^\\n$]*\\$(${column})\\b`).exec(text);

	if (documented) {
		const start = documented.index + documented[0].lastIndexOf(documented[1]);

		return { start, end: start + column.length };
	}

	const declared = new RegExp(
		`\\$(?:casts|fillable|guarded|hidden|dates|appends)\\s*=\\s*\\[[^\\]]*?(['"])(${column})\\1`,
		's',
	).exec(text);

	if (!declared) {
		return undefined;
	}

	const start = declared.index + declared[0].lastIndexOf(declared[2]);

	return { start, end: start + column.length };
}

// The relation the cursor names, the dotted path it belongs to, and the class the chain started
// from. Undefined whenever any of the three cannot be established — a wrong model is worse than no
// navigation, because it silently opens the wrong file.
function getEloquentRelationAtOffset(source, offset) {
	const text = String(source);
	const context = findCallContextAtOffset(text, offset);

	if (!context || !argumentNamesOne(context, RELATION_IN_EVERY_ARGUMENT, RELATION_IN_FIRST_ARGUMENT)) {
		return undefined;
	}

	const headClass = getChainHeadClass(text, text.slice(context.chainStart, context.calleeOffset));

	if (!headClass) {
		return undefined;
	}

	const segments = context.literal.value.split('.');

	if (segments.some((segment) => !/^[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(segment))) {
		return undefined;
	}

	// Which dotted segment the cursor is actually on, so `with('token.user')` opens `user()` on the
	// token's model rather than always opening the first hop.
	const withinLiteral = Math.max(0, offset - context.literal.start);
	let consumed = 0;
	let segmentIndex = segments.length - 1;

	for (let index = 0; index < segments.length; index++) {
		consumed += segments[index].length;

		if (withinLiteral <= consumed) {
			segmentIndex = index;
			break;
		}

		consumed += 1;
	}

	return { headClass, segments, segmentIndex };
}

// The class a chain started from, by either route: written as a class name, or `$this` in a builder
// that declares which model it builds.
function getChainHeadClass(source, chainText) {
	const named = CHAIN_HEAD_PATTERN.exec(chainText);

	if (named) {
		return named[1];
	}

	if (!THIS_HEAD_PATTERN.test(chainText)) {
		return undefined;
	}

	const builderModel = BUILDER_MODEL_PATTERN.exec(String(source));

	return builderModel ? builderModel[1] : undefined;
}

// Where a relation method is declared, so navigation lands on the name rather than the file's top.
function findRelationMethodRange(source, methodName) {
	if (!/^[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*$/.test(String(methodName))) {
		return undefined;
	}

	const pattern = new RegExp(`\\bfunction\\s+&?\\s*(${methodName})\\s*\\(`, 'i');
	const match = pattern.exec(String(source));

	if (!match) {
		return undefined;
	}

	const start = match.index + match[0].indexOf(match[1]);

	return { start, end: start + match[1].length };
}

// The model on the far side of a relation, read from the factory call in its body, so a dotted path
// can be followed one hop at a time. `morphTo()` names no class and correctly yields nothing.
function getRelatedModelFromRelation(source, methodName) {
	const range = findRelationMethodRange(source, methodName);

	if (!range) {
		return undefined;
	}

	const body = String(source).slice(range.end);
	const factory = new RegExp(`->\\s*(?:${RELATION_FACTORIES})\\s*\\(\\s*\\\\?([A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff\\\\]*)\\s*::\\s*class`)
		.exec(body.slice(0, body.indexOf('function ') === -1 ? body.length : body.indexOf('function ')));

	return factory ? factory[1] : undefined;
}

module.exports = {
	findModelPropertyRange,
	findRelationMethodRange,
	getEloquentColumnAtOffset,
	getEloquentRelationAtOffset,
	getRelatedModelFromRelation,
	// Exposed for unit tests.
	_internal: { findCallContextAtOffset },
};
