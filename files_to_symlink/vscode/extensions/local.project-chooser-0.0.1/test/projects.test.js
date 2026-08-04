const assert = require('node:assert/strict');
const test = require('node:test');

const {
	OpenTargetEnum,
	describeProject,
	expandProjectRoot,
	getProjectName,
	isScannableDirectoryName,
	limitRecordedProjects,
	mergeProjects,
	resolveOpenTarget,
	toDisplayPath,
} = require('../projects');

function project(overrides) {
	return {
		id: overrides.id || `file://${overrides.displayPath}`,
		uriString: overrides.uriString || `file://${overrides.displayPath}`,
		kind: overrides.kind || 'folder',
		name: overrides.name,
		displayPath: overrides.displayPath,
		remoteAuthority: overrides.remoteAuthority,
	};
}

test('shortens paths inside the home directory', () => {
	assert.equal(toDisplayPath('/Users/mac/dev/growee', '/Users/mac'), '~/dev/growee');
	assert.equal(toDisplayPath('/Users/mac', '/Users/mac'), '~');
	assert.equal(toDisplayPath('/opt/homebrew', '/Users/mac'), '/opt/homebrew');
	assert.equal(toDisplayPath('/Users/machine/other', '/Users/mac'), '/Users/machine/other');
});

test('names a project from its folder or workspace file', () => {
	assert.equal(getProjectName('/Users/mac/dev/ribeit-api'), 'ribeit-api');
	assert.equal(getProjectName('/Users/mac/dev/dotfiles/dotfiles.code-workspace'), 'dotfiles');
	assert.equal(getProjectName('/Users/mac/dev/growee/'), 'growee');
});

test('expands configured roots and rejects unusable ones', () => {
	assert.equal(expandProjectRoot('~/dev', '/Users/mac'), '/Users/mac/dev');
	assert.equal(expandProjectRoot('~', '/Users/mac'), '/Users/mac');
	assert.equal(expandProjectRoot('/srv/projects/', '/Users/mac'), '/srv/projects');
	assert.equal(expandProjectRoot('relative/path', '/Users/mac'), undefined);
	assert.equal(expandProjectRoot('   ', '/Users/mac'), undefined);
});

test('skips hidden and dependency directories when scanning', () => {
	assert.equal(isScannableDirectoryName('growee'), true);
	assert.equal(isScannableDirectoryName('.claude'), false);
	assert.equal(isScannableDirectoryName('node_modules'), false);
	assert.equal(isScannableDirectoryName(''), false);
});

test('keeps recent order and appends scanned projects alphabetically', () => {
	const merged = mergeProjects(
		[
			project({ name: 'ribeit-api', displayPath: '~/dev/ribeit-api' }),
			project({ name: 'growee', displayPath: '~/dev/growee' }),
		],
		[
			project({ name: 'vault', displayPath: '~/dev/vault' }),
			project({ name: 'growee', displayPath: '~/dev/growee' }),
			project({ name: 'Muxy', displayPath: '~/dev/muxy' }),
		]
	);

	assert.deepEqual(merged.map(entry => entry.name), ['ribeit-api', 'growee', 'Muxy', 'vault']);
	assert.deepEqual(merged.map(entry => entry.recent), [true, true, false, false]);
});

test('drops duplicate recent entries without reordering the first occurrence', () => {
	const merged = mergeProjects(
		[
			project({ name: 'growee', displayPath: '~/dev/growee' }),
			project({ name: 'dfs-api', displayPath: '~/dev/dfs-api' }),
			project({ name: 'growee', displayPath: '~/dev/growee' }),
		],
		[]
	);

	assert.deepEqual(merged.map(entry => entry.name), ['growee', 'dfs-api']);
});

test('describes folders, workspaces, and remote projects', () => {
	assert.deepEqual(
		describeProject({ ...project({ name: 'growee', displayPath: '~/dev/growee' }), recent: true }),
		{ label: '$(history) growee', description: '~/dev/growee' }
	);
	assert.deepEqual(
		describeProject({ ...project({ name: 'vault', displayPath: '~/dev/vault' }), recent: false }),
		{ label: '$(repo) vault', description: '~/dev/vault' }
	);
	assert.deepEqual(
		describeProject({
			...project({ name: 'dotfiles', displayPath: '~/dev/dotfiles/dotfiles.code-workspace', kind: 'workspace' }),
			recent: true,
		}),
		{ label: '$(folder-library) dotfiles (workspace)', description: '~/dev/dotfiles/dotfiles.code-workspace' }
	);
	assert.deepEqual(
		describeProject({
			...project({ name: 'api', displayPath: '/srv/api', remoteAuthority: 'ssh-remote+box' }),
			recent: true,
		}),
		{ label: '$(history) api', description: 'ssh-remote+box · /srv/api' }
	);
});

test('an empty window opens in place regardless of the toggle', () => {
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.NEW_WINDOW, workspaceIsEmpty: true, invert: false }),
		OpenTargetEnum.CURRENT_WINDOW
	);
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.CURRENT_WINDOW, workspaceIsEmpty: true, invert: false }),
		OpenTargetEnum.CURRENT_WINDOW
	);
});

test('an empty window can still open a project in a new window explicitly', () => {
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.NEW_WINDOW, workspaceIsEmpty: true, invert: true }),
		OpenTargetEnum.NEW_WINDOW
	);
});

test('a loaded window follows the toggle and its inversion', () => {
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.NEW_WINDOW, workspaceIsEmpty: false, invert: false }),
		OpenTargetEnum.NEW_WINDOW
	);
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.NEW_WINDOW, workspaceIsEmpty: false, invert: true }),
		OpenTargetEnum.CURRENT_WINDOW
	);
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.CURRENT_WINDOW, workspaceIsEmpty: false, invert: false }),
		OpenTargetEnum.CURRENT_WINDOW
	);
	assert.equal(
		resolveOpenTarget({ defaultTargetEnum: OpenTargetEnum.CURRENT_WINDOW, workspaceIsEmpty: false, invert: true }),
		OpenTargetEnum.NEW_WINDOW
	);
});

test('recorded history keeps the newest entry per project within the limit', () => {
	const records = limitRecordedProjects([
		{ uriString: 'file:///Users/mac/dev/growee', openedAt: 10 },
		{ uriString: 'file:///Users/mac/dev/dfs-api', openedAt: 30 },
		{ uriString: 'file:///Users/mac/dev/growee', openedAt: 40 },
		{ uriString: 'file:///Users/mac/dev/vault', openedAt: 20 },
		{ openedAt: 50 },
	], 2);

	assert.deepEqual(records.map(record => record.uriString), [
		'file:///Users/mac/dev/growee',
		'file:///Users/mac/dev/dfs-api',
	]);
	assert.deepEqual(records.map(record => record.openedAt), [40, 30]);
});
