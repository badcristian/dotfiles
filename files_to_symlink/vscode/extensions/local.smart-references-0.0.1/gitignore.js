const path = require('path');

function getGitignoreEntry(repositoryPath, resourcePath) {
	const relativePath = path.posix.relative(repositoryPath, resourcePath);

	if (
		!relativePath
		|| relativePath === '..'
		|| relativePath.startsWith('../')
		|| path.posix.isAbsolute(relativePath)
	) {
		return undefined;
	}

	return relativePath.replace(/\\/g, '/').replace(/\[/g, '\\[');
}

function appendGitignoreEntries(source, entries) {
	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	const existingEntries = new Set(source.split(/\r?\n/));
	const addedEntries = [...new Set(entries)].filter((entry) => entry && !existingEntries.has(entry));

	if (addedEntries.length === 0) {
		return {
			source,
			addedEntries,
		};
	}

	const separator = source.length > 0 && !source.endsWith('\n') && !source.endsWith('\r')
		? newline
		: '';

	return {
		source: `${source}${separator}${addedEntries.join(newline)}${newline}`,
		addedEntries,
	};
}

module.exports = {
	appendGitignoreEntries,
	getGitignoreEntry,
};
