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

// The method named by an `@method` tag on or just after `targetLine`. Intelephense resolves a macro
// call to the generated tag, so this is what turns "the stub declares it" back into "the macro is
// registered here". The small forward window matches the @property lookup: the language server
// sometimes points at the docblock opener rather than the tag itself.
const STUB_METHOD_TAG = /@method\s+(?:static\s+)?(?:\S+\s+)?([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/;

function getStubMethodName(source, targetLine) {
	const lines = String(source).split('\n');

	for (let lineIndex = targetLine; lineIndex < Math.min(lines.length, targetLine + 3); lineIndex++) {
		const match = lines[lineIndex] && lines[lineIndex].match(STUB_METHOD_TAG);

		if (match) {
			return match[1];
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
	getStubMethodName,
	isMatchingPhpClassSource,
};
