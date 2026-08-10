#!/bin/bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_USER_DIR="$HOME/Library/Application Support/Code/User"
VSCODE_EXTENSIONS_DIR="$HOME/.vscode/extensions"
BACKUP_DIR="$DOTFILES_DIR/backups"

LOCAL_EXTENSIONS=(
  "local.php-smart-docblock-0.0.1"
  "local.phpstorm-project-icons-0.0.1"
  "local.preview-pin-on-click-0.0.1"
  "local.project-chooser-0.0.1"
  "local.smart-references-0.0.1"
  "local.statusbar-toggle-0.0.1"
)

mkdir -p "$CODE_USER_DIR"
mkdir -p "$VSCODE_EXTENSIONS_DIR"
mkdir -p "$DOTFILES_DIR/User"
mkdir -p "$DOTFILES_DIR/extensions"
mkdir -p "$BACKUP_DIR/extensions"

link_file() {
  local source="$1"
  local target="$2"
  local backup

  if [ -e "$target" ] || [ -L "$target" ]; then
    if [ "$(readlink "$target" 2>/dev/null || true)" = "$source" ]; then
      return
    fi

    backup="$BACKUP_DIR/extensions/$(basename "$target").before-dotfiles-link.$(date +%Y%m%d%H%M%S)"
    mv "$target" "$backup"
    echo "Backed up $target to $backup"
  fi

  ln -s "$source" "$target"
}

link_extension() {
  local name="$1"
  local source="$DOTFILES_DIR/extensions/$name"
  local target="$VSCODE_EXTENSIONS_DIR/$name"
  local backup

  if [ ! -d "$source" ]; then
    echo "Missing local extension in dotfiles: $source"
    return
  fi

  if [ -e "$target" ] || [ -L "$target" ]; then
    if [ "$(readlink "$target" 2>/dev/null || true)" = "$source" ]; then
      return
    fi

    backup="${target}.before-dotfiles-link.$(date +%Y%m%d%H%M%S)"
    mv "$target" "$backup"
    echo "Backed up $target to $backup"
  fi

  ln -s "$source" "$target"
}

register_extension() {
  local id="$1"
  local name="$2"

  node -e '
    const fs = require("fs");
    const path = require("path");
    const registryPath = path.join(process.env.HOME, ".vscode/extensions/extensions.json");
    const id = process.argv[1];
    const name = process.argv[2];
    const extensionPath = path.join(process.env.HOME, ".vscode/extensions", name);
    const packagePath = path.join(extensionPath, "package.json");
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const data = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : [];
    const location = { "$mid": 1, path: extensionPath, scheme: "file" };
    const item = {
      identifier: { id },
      version: pkg.version,
      location,
      relativeLocation: name
    };
    const existingIndex = data.findIndex(entry => entry.identifier && entry.identifier.id === id);

    if (existingIndex !== -1) {
      const existing = data[existingIndex];
      const existingPath = existing.location && existing.location.path;

      if (
        existing.version === item.version &&
        existing.relativeLocation === item.relativeLocation &&
        existingPath === item.location.path
      ) {
        process.exit(0);
      }

      data[existingIndex] = item;
    } else {
      data.push(item);
    }

    const next = JSON.stringify(data);
    const previous = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, "utf8") : "";

    if (previous === next) {
      process.exit(0);
    }

    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, next);
  ' "$id" "$name"
}

relocate_extension_backups() {
  find "$VSCODE_EXTENSIONS_DIR" -maxdepth 1 -name 'local.*.before-dotfiles-link.*' -exec mv -n {} "$BACKUP_DIR/extensions/" \;
}

clean_local_obsolete_entries() {
  local obsolete_file="$VSCODE_EXTENSIONS_DIR/.obsolete"

  if [ ! -f "$obsolete_file" ]; then
    return
  fi

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    let changed = false;

    for (const key of Object.keys(data)) {
      if (key.startsWith("local.")) {
        delete data[key];
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(file, JSON.stringify(data));
    }
  ' "$obsolete_file"
}

# Settings, keybindings, snippets, and every injected workbench asset are linked, so the live User
# folder is a complete mirror of the repository copy. Directories are linked whole rather than
# walked: VS Code reads snippets/ by listing it, so a new file in the repository copy has to appear
# there without rerunning this installer.
for user_entry in "$DOTFILES_DIR/User/"*; do
  [ -e "$user_entry" ] || continue
  link_file "$user_entry" "$CODE_USER_DIR/$(basename "$user_entry")"
done

relocate_extension_backups

for extension in "${LOCAL_EXTENSIONS[@]}"; do
  link_extension "$extension"
done

register_extension "local.php-smart-docblock" "local.php-smart-docblock-0.0.1"
register_extension "local.phpstorm-project-icons" "local.phpstorm-project-icons-0.0.1"
register_extension "local.preview-pin-on-click" "local.preview-pin-on-click-0.0.1"
register_extension "local.project-chooser" "local.project-chooser-0.0.1"
register_extension "local.smart-references" "local.smart-references-0.0.1"
register_extension "local.statusbar-toggle" "local.statusbar-toggle-0.0.1"

clean_local_obsolete_entries

echo "VS Code dotfiles links installed."
