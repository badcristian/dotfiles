'use strict';

function getStubClassDeclaration(source, targetLine) {
	const lines = String(source).split('\n');
	const line = lines[targetLine];
	const classMatch = line && line.match(/\bclass\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/);

	if (!classMatch) {
		return undefined;
	}

	for (let lineIndex = targetLine - 1; lineIndex >= 0; lineIndex--) {
		const namespaceMatch = lines[lineIndex].match(/^\s*namespace\s+([^;{]+)\s*\{\s*$/);

		if (namespaceMatch) {
			return {
				namespace: namespaceMatch[1].trim(),
				className: classMatch[1],
			};
		}

		if (/^\s*}\s*$/.test(lines[lineIndex])) {
			return undefined;
		}
	}

	return undefined;
}

function isMatchingPhpClassSource(source, className, namespace) {
	const text = String(source);
	const declaredNamespace = text.match(/^\s*namespace\s+([^;]+);/m)?.[1]?.trim();
	const declaredClass = text.match(/^\s*(?:abstract\s+|final\s+|readonly\s+)*class\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/m)?.[1];

	return declaredNamespace === String(namespace).replace(/^\\/, '') && declaredClass === className;
}

module.exports = {
	getStubClassDeclaration,
	isMatchingPhpClassSource,
};
