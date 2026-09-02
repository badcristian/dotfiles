'use strict';

// `class` and `trait` both, because the generator emits both: a model gets a partial class carrying
// @property-read tags, a model concern gets a partial trait carrying @mixin Model. Only the class
// half was ever read back, so Cmd+B on `use HasCreator;` landed on the empty stub instead of on the
// trait — the one dead end this redirect exists to prevent.
const STUB_TYPE_DECLARATION = /\b(?:class|interface|trait)\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/;

function getStubTypeDeclaration(source, targetLine) {
	const lines = String(source).split('\n');
	const line = lines[targetLine];
	const typeMatch = line && line.match(STUB_TYPE_DECLARATION);

	if (!typeMatch) {
		return undefined;
	}

	for (let lineIndex = targetLine - 1; lineIndex >= 0; lineIndex--) {
		const namespaceMatch = lines[lineIndex].match(/^\s*namespace\s+([^;{]+)\s*\{\s*$/);

		if (namespaceMatch) {
			return {
				namespace: namespaceMatch[1].trim(),
				typeName: typeMatch[1],
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

// The fallback path when Intelephense's workspace symbols do not offer the type, so it has to accept
// everything the stub can declare too.
function isMatchingPhpTypeSource(source, typeName, namespace) {
	const text = String(source);
	const declaredNamespace = text.match(/^\s*namespace\s+([^;]+);/m)?.[1]?.trim();
	const declaredType = text.match(/^\s*(?:abstract\s+|final\s+|readonly\s+)*(?:class|interface|trait)\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/m)?.[1];

	return declaredNamespace === String(namespace).replace(/^\\/, '') && declaredType === typeName;
}

module.exports = {
	getStubMethodName,
	getStubTypeDeclaration,
	isMatchingPhpTypeSource,
};
