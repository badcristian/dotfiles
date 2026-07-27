# macOS development environment

This repository is the source of truth for a personal macOS development
environment. It started as a dotfiles collection, but now also contains
workstation automation, project-session bootstrapping, developer utilities, and
a source-controlled VS Code setup with custom local extensions.

It is intentionally opinionated and machine-specific. The current scripts
assume:

- macOS with Apple Silicon Homebrew under `/opt/homebrew`;
- this repository is checked out at `~/dev/dotfiles`;
- personal projects live under `/Users/mac/dev`;
- the installed applications and language versions match the paths in the
  configuration.

Review those assumptions before using the repository on another machine.

## What it manages

| Area | Repository source | Purpose |
| --- | --- | --- |
| Shell | `files_to_symlink/zshrc` | PATH setup, aliases, shell history, fzf, Starship, mise, SDKMAN, and language tooling |
| Terminal | `files_to_symlink/ghostty.config`, `files_to_symlink/tmux.conf` | Ghostty appearance and tmux behavior |
| Project sessions | `files_to_symlink/init_tmux_sessions.sh` | Personal tmux sessions and pane layouts for active projects |
| Desktop automation | `files_to_symlink/init.lua` | Hammerspoon application shortcuts and IDE selection |
| Editor defaults | `files_to_symlink/editorconfig` | Global EditorConfig rules |
| VS Code | `files_to_symlink/vscode/` | User settings, keybindings, marketplace extension list, installers, and repository-owned local extensions |
| PHP tooling | `files_to_symlink/switch_php_ver.sh` | Switches the Homebrew CLI PHP link and persists the selected version |
| Local routing | `files_to_symlink/cloudflared-vanta.yml` | Tracked Cloudflared tunnel routing; credentials remain outside the repository |
| Bootstrap | `check_dependencies.sh`, `symlink.sh` | Checks the expected tools and installs the repository links |

## How the repository is installed

Files are edited in this repository and symlinked into their live macOS
locations. Do not edit a linked file in the home directory as though it were an
independent copy.

The root installer currently manages:

| Source | Live destination |
| --- | --- |
| `files_to_symlink/zshrc` | `~/.zshrc` |
| `files_to_symlink/tmux.conf` | `~/.tmux.conf` |
| `files_to_symlink/editorconfig` | `~/.editorconfig` |
| `files_to_symlink/init.lua` | `~/.hammerspoon/init.lua` |
| `files_to_symlink/ghostty.config` | `~/.config/ghostty/config` |
| `files_to_symlink/cloudflared-vanta.yml` | `~/.cloudflared/vanta.yml` |
| `files_to_symlink/init_tmux_sessions.sh` | `~/init_tmux_sessions.sh` |
| `files_to_symlink/switch_php_ver.sh` | `~/switch_php_ver.sh` |
| `files_to_symlink/vscode/User/*` | `~/Library/Application Support/Code/User/` |
| `files_to_symlink/vscode/extensions/local.*` | `~/.vscode/extensions/` |

`files_to_symlink/claude-usage.sh` is retained in the repository but its link is
currently disabled in `symlink.sh`.

## Set up a new Mac

### 1. Clone to the expected location

```bash
mkdir -p ~/dev
git clone <repository-url> ~/dev/dotfiles
cd ~/dev/dotfiles
```

If the checkout lives elsewhere, update the hard-coded repository and personal
project paths before continuing.

### 2. Review machine-specific configuration

At minimum, inspect:

- `files_to_symlink/zshrc` for Homebrew versions, aliases, PATH entries, SSH
  hosts, and local tools;
- `files_to_symlink/init_tmux_sessions.sh` for project directories and startup
  commands;
- `files_to_symlink/init.lua` for installed applications and keyboard
  shortcuts;
- `files_to_symlink/cloudflared-vanta.yml` for the local tunnel, hostname, and
  credentials-file path.

### 3. Check dependencies

```bash
bash check_dependencies.sh
```

The checker reports missing tools; it does not install them. Homebrew is
required. It currently classifies these commands as required:

```text
git  nvim  tmux  fzf  fd  bat  php  composer  python3  node
```

Valet, tree, lsd, GPG, Ruby, Cargo, pipx, mise, Geometry, Ghostty, and SoftHSM
are checked as optional integrations.

Treat this as a diagnostic inventory rather than a complete package manifest.
For example, the current `.zshrc` initializes Starship and calls mise from
`~/.local/bin/mise` directly, although Starship is not checked and mise is
classified as optional. Install those tools or adjust the shell configuration
before making it active.

### 4. Install the links

```bash
bash symlink.sh
```

This creates the expected configuration directories, installs Hammerspoon with
Homebrew when `~/.hammerspoon` is absent, links the root configuration files,
and delegates VS Code setup to its installer.

The root links use `ln -sf`, so inspect any existing destination files first.
The VS Code installer is more defensive: it moves conflicting user files and
local extensions into timestamped backups before linking the repository
versions.

### 5. Install VS Code marketplace extensions

The root installer links the repository-owned extensions but does not install
Marketplace packages. With VS Code's `code` command available:

```bash
bash files_to_symlink/vscode/install_marketplace_extensions.sh
```

Then run **Developer: Reload Window** in each open local or Remote SSH window.

## VS Code environment

The VS Code directory is effectively a small editor-distribution project of its
own. It contains:

- macOS user settings and keybindings;
- a reproducible Marketplace extension list;
- local extensions for PHP/Laravel navigation and editing, PHP DocBlocks,
  project icons, preview-tab and Markdown behavior, and status-bar control;
- unit tests for the more involved local-extension behavior;
- installers that link and register those extensions.

See [`files_to_symlink/vscode/README.md`](files_to_symlink/vscode/README.md) for
installation details and the extension inventory.

Before changing anything under `files_to_symlink/vscode`, read
[`files_to_symlink/vscode/CUSTOMIZATION_HISTORY.md`](files_to_symlink/vscode/CUSTOMIZATION_HISTORY.md).
It is the canonical record of current behavior, architectural decisions, known
limitations, verification steps, and the append-only change history.

## Common workflows

### Change a managed configuration

1. Edit the source under `files_to_symlink`.
2. Re-run `bash symlink.sh` only when adding or repairing links; existing
   symlinks expose normal file edits immediately.
3. Reload the affected application or shell.

To add a new managed file, place it under `files_to_symlink` and add its source
and destination to `symlink.sh`. If it introduces a required command, also
update `check_dependencies.sh`.

### Switch CLI PHP

The shell defines `switch` as the interactive shortcut:

```bash
switch
```

A version can also be supplied directly:

```bash
bash ~/switch_php_ver.sh 8.4
```

The script discovers installed `php@*` Homebrew formulae, updates the Homebrew
PHP link, and writes the selection to `~/.php-version`. It deliberately does
not stop or restart PHP-FPM services.

### Start the personal tmux workspace

```bash
init
```

This creates the project-specific sessions defined in
`files_to_symlink/init_tmux_sessions.sh` and attaches to the configured default
session. The script assumes those project directories exist and is not a
generic tmux-session manager.

## Verification

There is no single repository-wide test suite. Use checks appropriate to the
area changed:

```bash
bash -n check_dependencies.sh symlink.sh
bash -n files_to_symlink/*.sh files_to_symlink/vscode/*.sh
node --test files_to_symlink/vscode/extensions/*/test/*.test.js
git diff --check
```

For VS Code changes, also follow the runtime verification steps in
`CUSTOMIZATION_HISTORY.md`; tests alone do not prove that the active extension
host loaded the repository copy.

## Safety and maintenance notes

- This is a personal environment, not a portable package manager. Versioned
  Homebrew paths, app names, project directories, and keyboard shortcuts are
  expected to need maintenance.
- Keep Cloudflared credential JSON files and `cert.pem` under `~/.cloudflared`;
  only non-secret routing configuration belongs here.
- Marketplace extensions and application binaries are external dependencies,
  not vendored artifacts.
- `files_to_symlink/vscode/backups` exists for recovery and comparison. Do not
  implement new behavior in a backup copy.
- Repository guidance for coding agents lives in [`AGENTS.md`](AGENTS.md).
