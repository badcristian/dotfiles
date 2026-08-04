const vscode = require('vscode');
const os = require('os');
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
} = require('./projects');

// The toggle lives in globalState rather than in settings: `settings.json` is a symlink into this
// repository, and a runtime `configuration.update` write can replace the link with a plain file.
const NEW_WINDOW_STATE_KEY = 'projectChooser.openInNewWindow';
const RECENT_HISTORY_STATE_KEY = 'projectChooser.recentProjects';
const RECENT_HISTORY_LIMIT = 50;
const OPEN_FOLDER_ITEM_ID = 'projectChooser.openFolder';
const VISIBLE_CONTEXT_KEY = 'projectChooser.visible';

let activeChooser;

function getDefaultTargetEnum(context) {
	return context.globalState.get(NEW_WINDOW_STATE_KEY, true)
		? OpenTargetEnum.NEW_WINDOW
		: OpenTargetEnum.CURRENT_WINDOW;
}

function isWorkspaceEmpty() {
	const folders = vscode.workspace.workspaceFolders;

	return !vscode.workspace.workspaceFile && (!folders || folders.length === 0);
}

function toUri(value) {
	if (!value) {
		return undefined;
	}

	try {
		if (value instanceof vscode.Uri) {
			return value;
		}

		if (typeof value === 'string') {
			return vscode.Uri.parse(value);
		}

		if (typeof value.scheme === 'string') {
			return vscode.Uri.from(value);
		}
	} catch (error) {
		return undefined;
	}

	return undefined;
}

function createProject(uri, kind, remoteAuthority) {
	const rawPath = uri.scheme === 'file' ? uri.fsPath : uri.path;

	return {
		id: uri.toString(),
		uriString: uri.toString(),
		kind,
		name: getProjectName(rawPath),
		displayPath: toDisplayPath(rawPath, os.homedir()),
		remoteAuthority: remoteAuthority || undefined,
	};
}

// `_workbench.getRecentlyOpened` is an internal workbench command. It is the only way to read the
// real "Open Recent" list from an extension, so every failure falls back to the recorded history
// and the configured project roots instead of surfacing an error.
async function getRecentlyOpenedProjects() {
	let recent;

	try {
		recent = await vscode.commands.executeCommand('_workbench.getRecentlyOpened');
	} catch (error) {
		return [];
	}

	const entries = (recent && Array.isArray(recent.workspaces)) ? recent.workspaces : [];
	const projects = [];

	for (const entry of entries) {
		if (!entry) {
			continue;
		}

		const isWorkspaceFile = Boolean(entry.workspace && entry.workspace.configPath);
		const uri = toUri(entry.folderUri || (isWorkspaceFile ? entry.workspace.configPath : undefined));

		if (!uri) {
			continue;
		}

		projects.push(createProject(uri, isWorkspaceFile ? 'workspace' : 'folder', entry.remoteAuthority));
	}

	return projects;
}

function getRecordedProjects(context) {
	const records = context.globalState.get(RECENT_HISTORY_STATE_KEY, []);
	const projects = [];

	for (const record of limitRecordedProjects(records, RECENT_HISTORY_LIMIT)) {
		const uri = toUri(record.uriString);

		if (uri) {
			projects.push(createProject(uri, record.kind === 'workspace' ? 'workspace' : 'folder', record.remoteAuthority));
		}
	}

	return projects;
}

// Keeps a usable list even if the internal recents command disappears in a future VS Code release.
async function recordCurrentWorkspace(context) {
	const workspaceFile = vscode.workspace.workspaceFile;
	const folders = vscode.workspace.workspaceFolders;
	const uri = workspaceFile && workspaceFile.scheme !== 'untitled'
		? workspaceFile
		: (folders && folders.length === 1 ? folders[0].uri : undefined);

	if (!uri) {
		return;
	}

	const records = context.globalState.get(RECENT_HISTORY_STATE_KEY, []);
	const next = limitRecordedProjects([
		{
			uriString: uri.toString(),
			kind: workspaceFile ? 'workspace' : 'folder',
			remoteAuthority: vscode.env.remoteName || undefined,
			openedAt: Date.now(),
		},
		...(Array.isArray(records) ? records : []),
	], RECENT_HISTORY_LIMIT);

	await context.globalState.update(RECENT_HISTORY_STATE_KEY, next);
}

async function pathExists(uri) {
	try {
		await vscode.workspace.fs.stat(uri);

		return true;
	} catch (error) {
		return false;
	}
}

async function scanProjectRoots() {
	const config = vscode.workspace.getConfiguration('projectChooser');
	const roots = config.get('projectRoots', ['~/dev']);
	const requireGit = config.get('scanRequiresGit', true);
	const homeDir = os.homedir();
	const projects = [];

	for (const root of Array.isArray(roots) ? roots : []) {
		const expanded = expandProjectRoot(root, homeDir);

		if (!expanded) {
			continue;
		}

		const rootUri = vscode.Uri.file(expanded);
		let children;

		try {
			children = await vscode.workspace.fs.readDirectory(rootUri);
		} catch (error) {
			continue;
		}

		const candidates = children
			.filter(([name, type]) => (type & vscode.FileType.Directory) !== 0 && isScannableDirectoryName(name))
			.map(([name]) => vscode.Uri.joinPath(rootUri, name));
		const resolved = await Promise.all(candidates.map(async (uri) => {
			if (requireGit && !(await pathExists(vscode.Uri.joinPath(uri, '.git')))) {
				return undefined;
			}

			return createProject(uri, 'folder');
		}));

		for (const project of resolved) {
			if (project) {
				projects.push(project);
			}
		}
	}

	return projects;
}

async function collectProjects(context) {
	const [recentlyOpened, scanned] = await Promise.all([getRecentlyOpenedProjects(), scanProjectRoots()]);

	return mergeProjects(recentlyOpened.concat(getRecordedProjects(context)), scanned);
}

function getAlternateButton(targetEnum) {
	return targetEnum === OpenTargetEnum.NEW_WINDOW
		? { iconPath: new vscode.ThemeIcon('window'), tooltip: 'Open in this window' }
		: { iconPath: new vscode.ThemeIcon('multiple-windows'), tooltip: 'Open in a new window' };
}

function getToggleButton(targetEnum) {
	return targetEnum === OpenTargetEnum.NEW_WINDOW
		? { iconPath: new vscode.ThemeIcon('pass-filled'), tooltip: 'Open in a new window: on (⌥⌘N)' }
		: { iconPath: new vscode.ThemeIcon('circle-large-outline'), tooltip: 'Open in a new window: off (⌥⌘N)' };
}

function buildItems(projects, effectiveTargetEnum) {
	const items = projects.map((project) => {
		const { label, description } = describeProject(project);

		return {
			label,
			description,
			project,
			buttons: [getAlternateButton(effectiveTargetEnum)],
		};
	});

	items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
	items.push({
		label: '$(folder-opened) Open Folder…',
		itemId: OPEN_FOLDER_ITEM_ID,
		alwaysShow: true,
	});

	return items;
}

function renderChooser(chooser) {
	const effectiveTargetEnum = chooser.workspaceIsEmpty
		? OpenTargetEnum.CURRENT_WINDOW
		: chooser.defaultTargetEnum;
	const activeItemId = chooser.quickPick.activeItems[0]
		&& (chooser.quickPick.activeItems[0].project
			? chooser.quickPick.activeItems[0].project.id
			: chooser.quickPick.activeItems[0].itemId);

	chooser.quickPick.title = chooser.workspaceIsEmpty
		? 'Open Project'
		: `Open Project — new window: ${effectiveTargetEnum === OpenTargetEnum.NEW_WINDOW ? 'on' : 'off'}`;
	chooser.quickPick.placeholder = chooser.workspaceIsEmpty
		? 'Search projects…   Enter: open   ⌘Enter: open in a new window'
		: 'Search projects…   Enter: open   ⌘Enter: open in the other window   ⌥⌘N: toggle';
	chooser.quickPick.buttons = chooser.workspaceIsEmpty ? [] : [getToggleButton(chooser.defaultTargetEnum)];
	chooser.quickPick.items = buildItems(chooser.projects, effectiveTargetEnum);

	if (activeItemId) {
		const restored = chooser.quickPick.items.find(item => (item.project ? item.project.id : item.itemId) === activeItemId);

		if (restored) {
			chooser.quickPick.activeItems = [restored];
		}
	}
}

async function openProject(project, targetEnum) {
	const uri = toUri(project.uriString);

	if (!uri) {
		return;
	}

	await vscode.commands.executeCommand('vscode.openFolder', uri, {
		forceNewWindow: targetEnum === OpenTargetEnum.NEW_WINDOW,
	});
}

async function acceptActiveItem({ invert }) {
	const chooser = activeChooser;

	if (!chooser) {
		return;
	}

	const item = chooser.quickPick.activeItems[0] || chooser.quickPick.selectedItems[0];

	if (!item) {
		return;
	}

	chooser.quickPick.hide();

	if (item.itemId === OPEN_FOLDER_ITEM_ID) {
		await vscode.commands.executeCommand('workbench.action.files.openFolder');

		return;
	}

	if (!item.project) {
		return;
	}

	await openProject(item.project, resolveOpenTarget({
		defaultTargetEnum: chooser.defaultTargetEnum,
		workspaceIsEmpty: chooser.workspaceIsEmpty,
		invert,
	}));
}

async function setNewWindowPreference(context, useNewWindow) {
	await context.globalState.update(NEW_WINDOW_STATE_KEY, useNewWindow);

	if (activeChooser) {
		activeChooser.defaultTargetEnum = useNewWindow ? OpenTargetEnum.NEW_WINDOW : OpenTargetEnum.CURRENT_WINDOW;
		renderChooser(activeChooser);
	}
}

async function toggleNewWindowPreference(context) {
	const useNewWindow = getDefaultTargetEnum(context) !== OpenTargetEnum.NEW_WINDOW;

	await setNewWindowPreference(context, useNewWindow);

	if (!activeChooser) {
		vscode.window.showInformationMessage(
			`Project Chooser will open projects in ${useNewWindow ? 'a new window' : 'the current window'}.`
		);
	}
}

async function showProjectChooser(context) {
	if (activeChooser) {
		activeChooser.quickPick.hide();
	}

	const quickPick = vscode.window.createQuickPick();
	const chooser = {
		quickPick,
		projects: [],
		workspaceIsEmpty: isWorkspaceEmpty(),
		defaultTargetEnum: getDefaultTargetEnum(context),
	};

	activeChooser = chooser;
	quickPick.matchOnDescription = true;
	quickPick.busy = true;
	renderChooser(chooser);
	await vscode.commands.executeCommand('setContext', VISIBLE_CONTEXT_KEY, true);
	quickPick.show();

	quickPick.onDidAccept(() => {
		acceptActiveItem({ invert: false });
	});

	quickPick.onDidTriggerButton(() => {
		setNewWindowPreference(context, chooser.defaultTargetEnum !== OpenTargetEnum.NEW_WINDOW);
	});

	quickPick.onDidTriggerItemButton((event) => {
		if (!event.item || !event.item.project) {
			return;
		}

		quickPick.hide();
		openProject(event.item.project, resolveOpenTarget({
			defaultTargetEnum: chooser.defaultTargetEnum,
			workspaceIsEmpty: chooser.workspaceIsEmpty,
			invert: true,
		}));
	});

	quickPick.onDidHide(() => {
		if (activeChooser === chooser) {
			activeChooser = undefined;
		}

		vscode.commands.executeCommand('setContext', VISIBLE_CONTEXT_KEY, false);
		quickPick.dispose();
	});

	chooser.projects = await collectProjects(context);
	quickPick.busy = false;

	if (activeChooser === chooser) {
		renderChooser(chooser);
	}
}

function activate(context) {
	recordCurrentWorkspace(context).catch(() => undefined);

	context.subscriptions.push(
		vscode.commands.registerCommand('projectChooser.open', () => showProjectChooser(context)),
		vscode.commands.registerCommand('projectChooser.toggleNewWindow', () => toggleNewWindowPreference(context)),
		vscode.commands.registerCommand('projectChooser.acceptInOtherWindow', () => acceptActiveItem({ invert: true }))
	);
}

function deactivate() {}

module.exports = { activate, deactivate };
