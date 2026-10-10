const { scanPhpString, skipPhpComment } = require('./laravelConfigNavigation');

// Laravel 12 declares these `protected` on Model and re-dispatches them from the first lines of
// Model::__call:
//
//     if (in_array($method, ['increment', 'decrement', 'incrementQuietly', 'decrementQuietly'])) {
//         return $this->$method(...$parameters);
//     }
//
// So `$record->increment('bundle_fetches')` runs Model::increment while reading, correctly, as a
// call to an inaccessible member. Intelephense resolves nothing and is not wrong to: there is no
// public declaration anywhere on the model to find. The protected one is the answer, and reading it
// is also what tells you the call is not the Builder's bulk `increment` a chain would have reached.
const MODEL_MAGIC_METHODS = ['increment', 'decrement', 'incrementQuietly', 'decrementQuietly'];

// Sticky, so the walk below can test one position without slicing the source at every `-` or name.
const CALL_AFTER_ARROW = /->\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/y;
const STATIC_CALL = /(\\?[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff\\]*)\s*::\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/y;
const NAME_CHAR = /[A-Za-z0-9_\x80-\xff\\$]/;

// Skips strings and comments rather than scanning the raw text, so `'$x->increment('` in a message
// is not read as a call. `className` is set only on a static call.
function getCallAtOffset(source, offset) {
	let index = 0;

	while (index < source.length) {
		const commentEnd = skipPhpComment(source, index);
		if (commentEnd !== undefined) {
			index = commentEnd;
			continue;
		}

		if (source[index] === "'" || source[index] === '"') {
			const literal = scanPhpString(source, index);
			if (!literal) {
				return undefined;
			}

			index = literal.nextOffset;
			continue;
		}

		let call = null;

		if (source[index] === '-') {
			CALL_AFTER_ARROW.lastIndex = index;
			call = CALL_AFTER_ARROW.exec(source);
		} else if (index === 0 || !NAME_CHAR.test(source[index - 1])) {
			STATIC_CALL.lastIndex = index;
			call = STATIC_CALL.exec(source);
		}

		if (!call) {
			index++;
			continue;
		}

		const method = call[2] ?? call[1];
		const nameStart = index + call[0].lastIndexOf(method, call[0].length - 1);

		if (offset >= nameStart && offset <= nameStart + method.length) {
			return { method, className: call[2] === undefined ? undefined : call[1] };
		}

		index += call[0].length;
	}

	return undefined;
}

function getModelMagicMethodAtOffset(source, offset) {
	const call = getCallAtOffset(source, offset);

	return call && !call.className && MODEL_MAGIC_METHODS.includes(call.method) ? call.method : undefined;
}

// `DraftDossier::make()`: Model::__callStatic -> __call -> Builder. Model carries no `@mixin`, so
// Intelephense finds nothing. Whether the class really is a model is the caller's check.
function getStaticCallAtOffset(source, offset) {
	const call = getCallAtOffset(source, offset);

	return call?.className ? call : undefined;
}

module.exports = {
	MODEL_MAGIC_METHODS,
	getModelMagicMethodAtOffset,
	getStaticCallAtOffset,
};
