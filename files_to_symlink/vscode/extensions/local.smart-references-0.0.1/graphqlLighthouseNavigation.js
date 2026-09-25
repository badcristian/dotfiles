// Lighthouse hangs the PHP half of a GraphQL schema off directive arguments that name a class:
// `@field(resolver: "App\\GraphQL\\Mutations\\MetaCampaignCause@link")`, `@can(model: "App\\User")`,
// `@scalar(class: "App\\GraphQL\\Scalars\\StringOrInt")`. To every indexer those are string
// literals, so the resolver and the schema that calls it are unconnected. Pure text in, pure data
// out; extension.js owns the documents and the providers.

// Lighthouse's class-carrying argument names. `resolver`, `model` and `class` are the three the
// spro-app schema uses; `builder` and `validator` are the rest of the vocabulary, one alternation.
const CLASS_ARGUMENT_NAMES = 'resolver|model|class|builder|validator';

function classArgumentPattern() {
	return new RegExp(`\\b(${CLASS_ARGUMENT_NAMES})\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g');
}

// A GraphQL string literal, so every namespace separator is written `\\`. The leading one is
// optional in the schema and absent from a PHP `namespace` declaration, so it is dropped here.
function decodeClassValue(rawValue) {
	return rawValue.replace(/\\\\/g, '\\').replace(/^\\/, '');
}

function splitClassReference(rawValue) {
	const value = decodeClassValue(rawValue);
	// `Class@method`. Lighthouse also accepts a bare class, which resolves to `__invoke`.
	const separator = value.indexOf('@');
	const fqcn = separator === -1 ? value : value.slice(0, separator);
	const methodName = separator === -1 ? undefined : value.slice(separator + 1);

	if (!/^[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*(\\[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)*$/.test(fqcn)) {
		return undefined;
	}

	const segments = fqcn.split('\\');

	return {
		fqcn,
		className: segments[segments.length - 1],
		namespace: segments.slice(0, -1).join('\\'),
		methodName: methodName || undefined,
	};
}

// The class reference whose string literal contains `offset`, or undefined. The offsets returned
// cover the literal's contents, not its quotes, so a caller can underline just the name.
function getGraphqlClassReferenceAt(text, offset) {
	const pattern = classArgumentPattern();
	let match;

	while ((match = pattern.exec(text)) !== null) {
		const valueStart = match.index + match[0].indexOf('"', match[1].length) + 1;
		const valueEnd = match.index + match[0].length - 1;

		if (offset < valueStart || offset > valueEnd) {
			continue;
		}

		const reference = splitClassReference(match[2]);

		return reference ? { ...reference, argument: match[1], start: valueStart, end: valueEnd } : undefined;
	}

	return undefined;
}

// Every schema site naming `fqcn`. With `methodName`, only the sites that also name that method,
// so Find References on `link()` does not answer with every other method of the same resolver.
function findGraphqlClassReferences(text, fqcn, methodName) {
	const pattern = classArgumentPattern();
	const matches = [];
	let match;

	while ((match = pattern.exec(text)) !== null) {
		const reference = splitClassReference(match[2]);

		if (!reference || reference.fqcn !== fqcn) {
			continue;
		}

		if (methodName && reference.methodName !== methodName) {
			continue;
		}

		const valueStart = match.index + match[0].indexOf('"', match[1].length) + 1;

		matches.push({
			start: valueStart,
			end: match.index + match[0].length - 1,
			methodName: reference.methodName,
		});
	}

	return matches;
}

module.exports = {
	getGraphqlClassReferenceAt,
	findGraphqlClassReferences,
	splitClassReference,
};
