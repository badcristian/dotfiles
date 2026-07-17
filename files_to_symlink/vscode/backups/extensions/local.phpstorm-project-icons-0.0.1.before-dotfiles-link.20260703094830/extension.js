const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const themeRoot = path.join(os.homedir(), '.vscode/extensions/phantriviethoang.phpstorm-icon-1.0.4');
const themePath = path.join(themeRoot, 'icons/icon.json');
const statePath = path.join(themeRoot, 'icons/.project-icon-map.json');

const excludedFolders = new Set([
  '.git',
  '.idea',
  '.vscode',
  'bootstrap/cache',
  'node_modules',
  'public',
  'storage',
  'vendor',
]);

const lightFileIcons = new Map([
  ['file_class', 'file_class_light'],
  ['file_classabstract', 'file_classabstract_light'],
  ['file_classAnonymous', 'file_classAnonymous_light'],
  ['file_enum', 'file_enum_light'],
  ['file_exception', 'file_exception_light'],
  ['file_interface', 'file_interface_light'],
  ['file_php', 'file_php_light'],
  ['file_testclass', 'file_testclass_light'],
  ['file_trait', 'file_trait_light'],
]);

function stripJsonComments(input) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < input.length && input[index] !== '\n') {
        index++;
      }
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
        index++;
      }
      index++;
      continue;
    }

    output += char;
  }

  return output;
}

function parseJsonc(input) {
  return JSON.parse(stripJsonComments(input).replace(/,\s*([}\]])/g, '$1'));
}

async function collectPhpFiles() {
  const files = await vscode.workspace.findFiles(
    '**/*.php',
    '**/{.git,.idea,.vscode,bootstrap/cache,node_modules,public,storage,vendor}/**'
  );

  return files.filter(uri => {
    const parts = uri.fsPath.split(path.sep);
    return !parts.some((part, index) => excludedFolders.has(part) || excludedFolders.has(parts.slice(index, index + 2).join('/')));
  });
}

function withoutStringsAndComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function iconForPhpFile(filePath, source) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const clean = withoutStringsAndComments(source);
  const basename = path.basename(filePath);

  if (/\breturn\s+new\s+class\b/.test(clean)) {
    return 'file_classAnonymous';
  }

  if (/\benum\s+[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/.test(clean)) {
    return 'file_enum';
  }

  if (/\binterface\s+[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/.test(clean)) {
    return 'file_interface';
  }

  if (/\btrait\s+[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/.test(clean)) {
    return 'file_trait';
  }

  if (/\babstract\s+class\s+[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/.test(clean)) {
    return 'file_classabstract';
  }

  if (basename.endsWith('Exception.php') || /\/Exceptions?\//.test(normalizedPath)) {
    return 'file_exception';
  }

  if (/\bclass\s+[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*/.test(clean)) {
    return /\/tests?\//i.test(normalizedPath) ? 'file_testclass' : 'file_class';
  }

  return null;
}

async function scanWorkspace() {
  const files = await collectPhpFiles();
  const byName = new Map();
  const conflicts = new Set();

  for (const uri of files) {
    let source;
    try {
      source = await fs.promises.readFile(uri.fsPath, 'utf8');
    } catch {
      continue;
    }

    const icon = iconForPhpFile(uri.fsPath, source);
    if (!icon) {
      continue;
    }

    const basename = path.basename(uri.fsPath);
    const existing = byName.get(basename);

    if (existing && existing.icon !== icon) {
      conflicts.add(basename);
      byName.delete(basename);
      continue;
    }

    if (!conflicts.has(basename)) {
      byName.set(basename, { icon, filePath: uri.fsPath });
    }
  }

  return { byName, conflicts };
}

function lightenSvg(svg, type) {
  if (type === 'folder') {
    return svg
      .replace(/#43454A/gi, '#F5F7FA')
      .replace(/#25324D/gi, '#F5F7FA')
      .replace(/#2F2936/gi, '#F5F7FA')
      .replace(/#253627/gi, '#F5F7FA')
      .replace(/#CED0D6/gi, '#AEB6C2');
  }

  return svg
    .replace(/#25324D/gi, '#FFFFFF')
    .replace(/#2F2936/gi, '#FFFFFF')
    .replace(/#253627/gi, '#FFFFFF')
    .replace(/#43454A/gi, '#FFFFFF');
}

function ensureLightSvg(relativePath, type) {
  const absolutePath = path.join(themeRoot, 'icons', relativePath.replace(/^\.\//, ''));
  const parsed = path.parse(absolutePath);

  if (parsed.name.endsWith('_light')) {
    return relativePath;
  }

  const lightPath = path.join(parsed.dir, `${parsed.name}_light${parsed.ext}`);
  const relativeLightPath = `./${path.relative(path.join(themeRoot, 'icons'), lightPath).replace(/\\/g, '/')}`;

  if (!fs.existsSync(lightPath) && fs.existsSync(absolutePath)) {
    fs.writeFileSync(lightPath, lightenSvg(fs.readFileSync(absolutePath, 'utf8'), type), 'utf8');
  }

  return relativeLightPath;
}

function ensureLightIconDefinitions(theme) {
  const definitions = theme.iconDefinitions || {};
  const entries = Object.entries({ ...definitions });

  for (const [id, definition] of entries) {
    if (!definition || typeof definition.iconPath !== 'string') {
      continue;
    }

    if (definition.iconPath.startsWith('./folder/')) {
      const lightId = `${id}_light`;
      definitions[lightId] = {
        iconPath: ensureLightSvg(definition.iconPath, 'folder'),
      };
    }
  }

  const fileDefinitionMap = {
    file_class: './file/class.svg',
    file_classabstract: './file/classAbstract.svg',
    file_classAnonymous: './file/classAnonymous.svg',
    file_enum: './file/enum.svg',
    file_exception: './file/exception.svg',
    file_interface: './file/interface.svg',
    file_php: './file/php.svg',
    file_testclass: './file/testClass.svg',
    file_trait: './file/trait.svg',
  };

  for (const [darkId, iconPath] of Object.entries(fileDefinitionMap)) {
    const lightId = lightFileIcons.get(darkId);
    definitions[lightId] = {
      iconPath: ensureLightSvg(iconPath, 'file'),
    };
  }

  theme.iconDefinitions = definitions;
}

function readPreviousGeneratedNames() {
  if (!fs.existsSync(statePath)) {
    return [];
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return Array.isArray(state.fileNames) ? state.fileNames : [];
  } catch {
    return [];
  }
}

function applyFolderLightOverrides(theme) {
  theme.light = theme.light || {};
  theme.light.folder = theme.iconDefinitions[`${theme.folder}_light`] ? `${theme.folder}_light` : theme.folder;
  theme.light.folderNames = theme.light.folderNames || {};

  for (const [folderName, iconId] of Object.entries(theme.folderNames || {})) {
    const lightIconId = `${iconId}_light`;
    theme.light.folderNames[folderName] = theme.iconDefinitions[lightIconId] ? lightIconId : iconId;
  }
}

function applyPhpLightOverrides(theme, generatedMappings) {
  theme.light = theme.light || {};
  theme.light.fileExtensions = theme.light.fileExtensions || {};
  theme.light.fileNames = theme.light.fileNames || {};
  theme.light.fileExtensions.php = 'file_php_light';

  for (const [fileName, iconId] of generatedMappings) {
    theme.light.fileNames[fileName] = lightFileIcons.get(iconId) || iconId;
  }
}

function writeTheme(generatedMappings) {
  if (!fs.existsSync(themePath)) {
    throw new Error(`PhpStorm icon theme file was not found at ${themePath}`);
  }

  const raw = fs.readFileSync(themePath, 'utf8');
  const theme = parseJsonc(raw);
  const previousGeneratedNames = readPreviousGeneratedNames();

  if (!fs.existsSync(`${themePath}.before-project-icons`)) {
    fs.copyFileSync(themePath, `${themePath}.before-project-icons`);
  }

  theme.fileNames = theme.fileNames || {};
  theme.light = theme.light || {};
  theme.light.fileNames = theme.light.fileNames || {};

  for (const fileName of previousGeneratedNames) {
    delete theme.fileNames[fileName];
    delete theme.light.fileNames[fileName];
  }

  ensureLightIconDefinitions(theme);
  applyFolderLightOverrides(theme);
  applyPhpLightOverrides(theme, generatedMappings);

  for (const [fileName, iconId] of generatedMappings) {
    theme.fileNames[fileName] = iconId;
  }

  fs.writeFileSync(themePath, `${JSON.stringify(theme, null, 2)}\n`, 'utf8');
  fs.writeFileSync(statePath, `${JSON.stringify({ fileNames: [...generatedMappings.keys()].sort() }, null, 2)}\n`, 'utf8');
}

async function refresh() {
  const { byName, conflicts } = await scanWorkspace();
  const generatedMappings = new Map([...byName.entries()].map(([fileName, value]) => [fileName, value.icon]));
  writeTheme(generatedMappings);

  await vscode.workspace.getConfiguration().update('workbench.iconTheme', 'phpstorm-icon', vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage(
    `PhpStorm icons refreshed: ${generatedMappings.size} PHP filenames mapped${conflicts.size ? `, ${conflicts.size} duplicate filename conflicts skipped` : ''}. Reload the window if Explorer does not repaint immediately.`
  );
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('phpstormProjectIcons.refresh', refresh));
}

function deactivate() {}

module.exports = { activate, deactivate };
