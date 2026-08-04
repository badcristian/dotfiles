'use strict';

function normalizeMarkedUris(values) {
	const uniqueValues = new Set();

	for (const value of Array.isArray(values) ? values : []) {
		if (typeof value === 'string' && value.length > 0) {
			uniqueValues.add(value);
		}
	}

	return [...uniqueValues];
}

function isEqualOrDescendantUri(candidate, parent) {
	return candidate === parent || candidate.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
}

function toggleMarkedUris(currentMarkedUris, selectedUris) {
	const markedUris = new Set(normalizeMarkedUris(currentMarkedUris));
	const selections = normalizeMarkedUris(selectedUris);
	const shouldMark = selections.some((uri) => !markedUris.has(uri));
	const changedUris = [];

	for (const uri of selections) {
		if (shouldMark && !markedUris.has(uri)) {
			markedUris.add(uri);
			changedUris.push(uri);
		} else if (!shouldMark && markedUris.delete(uri)) {
			changedUris.push(uri);
		}
	}

	return {
		marked: shouldMark,
		markedUris: [...markedUris],
		changedUris,
	};
}

function remapMarkedUris(currentMarkedUris, renames) {
	const normalizedRenames = (Array.isArray(renames) ? renames : [])
		.filter((rename) => typeof rename?.oldUri === 'string' && typeof rename?.newUri === 'string');

	return normalizeMarkedUris(currentMarkedUris).map((markedUri) => {
		let nextUri = markedUri;

		for (const rename of normalizedRenames) {
			if (isEqualOrDescendantUri(nextUri, rename.oldUri)) {
				nextUri = rename.newUri + nextUri.slice(rename.oldUri.length);
			}
		}

		return nextUri;
	}).filter((uri, index, values) => values.indexOf(uri) === index);
}

function removeDeletedMarkedUris(currentMarkedUris, deletedUris) {
	const deletions = normalizeMarkedUris(deletedUris);

	return normalizeMarkedUris(currentMarkedUris).filter((markedUri) =>
		!deletions.some((deletedUri) => isEqualOrDescendantUri(markedUri, deletedUri)));
}

module.exports = {
	normalizeMarkedUris,
	removeDeletedMarkedUris,
	remapMarkedUris,
	toggleMarkedUris,
};
