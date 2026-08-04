// Pure project-list transformations for the project chooser. Nothing here may require `vscode`,
// so ordering, naming, and target rules stay unit-testable outside the extension host.

const OpenTargetEnum = Object.freeze({
	CURRENT_WINDOW: 'currentWindow',
	NEW_WINDOW: 'newWindow',
});

const WORKSPACE_FILE_SUFFIX = '.code-workspace';
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', 'vendor']);

function toPosixPath(value) {
	const normalized = String(value === undefined || value === null ? '' : value).replace(/\\/g, '/');

	if (normalized.length > 1 && normalized.endsWith('/')) {
		return normalized.replace(/\/+$/, '') || '/';
	}

	return normalized;
}

function toDisplayPath(rawPath, homeDir) {
	const value = toPosixPath(rawPath);
	const home = toPosixPath(homeDir);

	if (!home || home === '/' || !value) {
		return value;
	}

	if (value === home) {
		return '~';
	}

	return value.startsWith(`${home}/`) ? `~${value.slice(home.length)}` : value;
}

function getProjectName(rawPath) {
	const value = toPosixPath(rawPath);
	const basename = value.slice(value.lastIndexOf('/') + 1);

	if (!basename) {
		return value;
	}

	return basename.endsWith(WORKSPACE_FILE_SUFFIX)
		? basename.slice(0, -WORKSPACE_FILE_SUFFIX.length)
		: basename;
}

// Roots are configured the way they are typed in a shell (`~/dev`), not as absolute URIs.
function expandProjectRoot(root, homeDir) {
	const value = toPosixPath(String(root === undefined || root === null ? '' : root).trim());
	const home = toPosixPath(homeDir);

	if (!value) {
		return undefined;
	}

	if (value === '~') {
		return home || undefined;
	}

	const expanded = value.startsWith('~/') && home ? `${home}/${value.slice(2)}` : value;

	return expanded.startsWith('/') ? toPosixPath(expanded) : undefined;
}

function isScannableDirectoryName(name) {
	return typeof name === 'string'
		&& name.length > 0
		&& !name.startsWith('.')
		&& !SKIPPED_DIRECTORY_NAMES.has(name);
}

// Recently opened entries keep the order VS Code gave them; scanned repositories fill the tail
// alphabetically. A project present in both appears once, in its recent position.
function mergeProjects(recentProjects, scannedProjects) {
	const seen = new Set();
	const recent = [];
	const scanned = [];

	for (const project of recentProjects || []) {
		if (!project || !project.id || seen.has(project.id)) {
			continue;
		}

		seen.add(project.id);
		recent.push({ ...project, recent: true });
	}

	for (const project of scannedProjects || []) {
		if (!project || !project.id || seen.has(project.id)) {
			continue;
		}

		seen.add(project.id);
		scanned.push({ ...project, recent: false });
	}

	scanned.sort((first, second) => {
		const byName = first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });

		return byName !== 0 ? byName : first.displayPath.localeCompare(second.displayPath);
	});

	return recent.concat(scanned);
}

function describeProject(project) {
	const icon = project.kind === 'workspace'
		? 'folder-library'
		: (project.recent ? 'history' : 'repo');
	const label = project.kind === 'workspace'
		? `$(${icon}) ${project.name} (workspace)`
		: `$(${icon}) ${project.name}`;
	const description = project.remoteAuthority
		? `${project.remoteAuthority} · ${project.displayPath}`
		: project.displayPath;

	return { label, description };
}

// An empty window has nothing to preserve, so it always opens in place unless the alternate
// action is used explicitly. Everywhere else the persisted toggle decides.
function resolveOpenTarget({ defaultTargetEnum, workspaceIsEmpty, invert }) {
	const base = workspaceIsEmpty || defaultTargetEnum !== OpenTargetEnum.NEW_WINDOW
		? OpenTargetEnum.CURRENT_WINDOW
		: OpenTargetEnum.NEW_WINDOW;

	if (!invert) {
		return base;
	}

	return base === OpenTargetEnum.NEW_WINDOW
		? OpenTargetEnum.CURRENT_WINDOW
		: OpenTargetEnum.NEW_WINDOW;
}

function limitRecordedProjects(records, limit) {
	const seen = new Set();
	const ordered = (records || [])
		.filter(record => record && typeof record.uriString === 'string' && record.uriString)
		.slice()
		.sort((first, second) => (second.openedAt || 0) - (first.openedAt || 0));
	const unique = [];

	for (const record of ordered) {
		if (seen.has(record.uriString)) {
			continue;
		}

		seen.add(record.uriString);
		unique.push(record);
	}

	return unique.slice(0, limit);
}

module.exports = {
	OpenTargetEnum,
	describeProject,
	expandProjectRoot,
	getProjectName,
	isScannableDirectoryName,
	limitRecordedProjects,
	mergeProjects,
	resolveOpenTarget,
	toDisplayPath,
};
