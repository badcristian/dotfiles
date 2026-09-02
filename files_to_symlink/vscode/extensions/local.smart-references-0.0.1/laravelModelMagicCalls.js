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

// Sticky, so the walk below can test one position without slicing the source at every `-`.
const CALL_AFTER_ARROW = /->\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/y;

// Skips strings and comments rather than scanning the raw text, so `'$x->increment('` in a message
// is not read as a call.
function getModelMagicMethodAtOffset(source, offset) {
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

		CALL_AFTER_ARROW.lastIndex = index;
		const call = source[index] === '-' ? CALL_AFTER_ARROW.exec(source) : null;

		if (!call) {
			index++;
			continue;
		}

		const nameStart = index + call[0].indexOf(call[1]);

		if (offset >= nameStart && offset <= nameStart + call[1].length) {
			return MODEL_MAGIC_METHODS.includes(call[1]) ? call[1] : undefined;
		}

		index += call[0].length;
	}

	return undefined;
}

module.exports = {
	MODEL_MAGIC_METHODS,
	getModelMagicMethodAtOffset,
};
