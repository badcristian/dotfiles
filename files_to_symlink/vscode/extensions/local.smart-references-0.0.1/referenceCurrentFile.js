'use strict';

// Keep the origin comparison URI-based so local and Remote SSH references use the same rule.
function isCurrentFileReference(referenceUri, originUri) {
	return Boolean(originUri) && String(referenceUri) === String(originUri);
}

module.exports = { isCurrentFileReference };
