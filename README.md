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
| Shell | `files_to_symlink/zshrc`, `files_to_symlink/starship*.toml` | PATH setup, aliases, shell history, adaptive dark/light prompt, fzf, mise, SDKMAN, and language tooling |
| Terminal | `files_to_symlink/ghostty.config`, `files_to_symlink/ghostty/backgrounds/`, `files_to_symlink/ghostty/shaders/`, `files_to_symlink/ghostty/themes/`, `files_to_symlink/muxy/ghostty.conf`, `files_to_symlink/tmux*.sh`, `files_to_symlink/tmux.conf` | Ghostty and Muxy appearance, configurable dark-mode star background, shaders, and tmux behavior |
| Project sessions | `files_to_symlink/init_tmux_sessions.sh` | Personal tmux sessions and pane layouts for active projects |
| Desktop automation | `files_to_symlink/init.lua` | Hammerspoon application shortcuts, IDE selection, and quitting VS Code once its last window closes |
| Notes | `files_to_symlink/obsidian/snippets/` | Obsidian vault CSS snippets |
| Editor defaults | `files_to_symlink/editorconfig` | Global EditorConfig rules |
| VS Code | `files_to_symlink/vscode/` | User settings, keybindings, marketplace extension list, installers, and repository-owned local extensions |
| PHP tooling | `files_to_symlink/switch_php_ver.sh` | Switches the Homebrew CLI PHP link and persists the selected version |
| Local routing | `files_to_symlink/cloudflared/*.yml` | Tracked Cloudflared tunnel routing; credentials remain outside the repository |
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
| `files_to_symlink/ghostty/backgrounds/*.jpg` | `~/.config/ghostty/backgrounds/*.jpg` |
| `files_to_symlink/ghostty/shaders/*.glsl` | `~/.config/ghostty/shaders/*.glsl` |
| `files_to_symlink/ghostty/themes/*` | `~/.config/ghostty/themes/*` |
| `files_to_symlink/muxy/ghostty.conf` | `~/Library/Application Support/Muxy/ghostty.conf` |
| `files_to_symlink/obsidian/snippets/file-explorer-font.css` | `~/Documents/mac_obisidian_vault/.obsidian/snippets/file-explorer-font.css` |
| `files_to_symlink/starship.toml` | `~/.config/starship.toml` |
| `files_to_symlink/starship-light.toml` | `~/.config/starship-light.toml` |
| `files_to_symlink/cloudflared/vanta.yml` | `~/.cloudflared/vanta.yml` |
| `files_to_symlink/cloudflared/growee.yml` | `~/.cloudflared/growee.yml` |
| `files_to_symlink/cloudflared/spro-marketing.yml` | `~/.cloudflared/spro-marketing.yml` |
| `files_to_symlink/init_tmux_sessions.sh` | `~/init_tmux_sessions.sh` |
| `files_to_symlink/tmux-notes.lua` | `~/tmux-notes.lua` |
| `files_to_symlink/tmux-notes-core.lua` | `~/tmux-notes-core.lua` |
| `files_to_symlink/tmux-notes.sh` | `~/tmux-notes.sh` |
| `files_to_symlink/nvim/tmux-notes.lua` | `~/.config/nvim/lua/plugins/tmux-notes.lua` |
| `files_to_symlink/tmux-project.sh` | `~/tmux-project.sh` |
| `files_to_symlink/tmux-session-ui.sh` | `~/tmux-session-ui.sh` |
| `files_to_symlink/tmux-status.sh` | `~/tmux-status.sh` |
| `files_to_symlink/tmux-agent-usage.sh` | `~/tmux-agent-usage.sh` |
| `files_to_symlink/tmux-background.sh` | `~/tmux-background.sh` |
| `files_to_symlink/tmux-ui.sh` | `~/tmux-ui.sh` |
| `files_to_symlink/tmux-open-url.sh` | `~/tmux-open-url.sh` |
| `files_to_symlink/switch_php_ver.sh` | `~/switch_php_ver.sh` |
| `files_to_symlink/vscode/User/*` | `~/Library/Application Support/Code/User/` |
| `files_to_symlink/vscode/extensions/local.*` | `~/.vscode/extensions/` |

### Prompt appearance

New zsh sessions select the dark or light Starship configuration from the
current macOS appearance. Existing shells can switch without restarting:

```bash
prompt-theme light
prompt-theme dark
prompt-theme auto
```

`auto` removes the per-shell override and reads the macOS appearance again.

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
- `files_to_symlink/cloudflared/*.yml` for local tunnels, hostnames, and
  credentials-file paths.

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
- workbench CSS and scripts injected by the Custom CSS and JS Loader, with a
  checksum-repair script for the corruption warning that patching triggers;
- a reproducible Marketplace extension list;
- local extensions for PHP/Laravel navigation and editing, PHP DocBlocks,
  project icons, preview-tab and Markdown behavior, status-bar control, and a
  PhpStorm-style project chooser on `Cmd+O`;
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

### Open or switch tmux projects

```bash
init
```

This opens a fuzzy project picker containing Home and the immediate directories
under `~/dev`. Selecting a project switches to its existing Tmux session or
creates a session with one shell in that project directory. Inside Tmux, `init`
opens the same centered popup as `Cmd-P`; outside Tmux it uses the current
terminal directly.

Selecting "Find any folder" opens a simple directory browser starting in
`~/dev`. It behaves like navigating with `cd`: select a child directory to
enter it, select `..` to go up, or select `.` to open the current directory as
a Tmux project. `Escape` returns to the project list. Common dependency and
build directories are excluded. Set `TMUX_PROJECT_BROWSE_ROOT` to start in
another directory.

From inside Tmux, press `Ctrl-A`, then `p` to open the same picker. `Option-.`
and `Option-,` switch directly to the next or previous running project.
Running sessions use a persistent manual order. Drag their names in the status
bar to reorder them, or use `Option-Up` / `Option-Down` on a running project in
the picker. Click a status-bar session name to switch to it. In the picker,
`Ctrl-X` deletes the selected running session; deleting the current session
first switches the client to the next session in the manual order.
The status bar uses compact native Unicode icons for tmux, battery, usage,
window, pane, and command metadata. Sessions use a filled triangle for the
active project and an outlined triangle for inactive projects. Status icons use
the same JetBrains Mono face as their labels with a single-cell separator,
keeping them readable and vertically aligned. The bar sits at the top of the
client, with the manually ordered session group centered between the fixed
system details on the left and pane metadata on the right. A second,
one-cell status row draws the native double pane rule directly underneath,
including top-facing junctions where vertical pane borders begin. A matching
uninterrupted double rule sits above the content row, replacing the shorter
session markers and framing the entire status area. A native double rule also
runs along the bottom of the screen, using `╩` where vertical pane borders join
it.

HTTP and HTTPS addresses shown inside a pane open in the default macOS browser
with one click, including dotless development hosts such as `localhost`. Tmux
also advertises OSC 8 hyperlink support to Ghostty for applications that emit
real terminal hyperlinks. Mouse selections made while viewing scrollback are
copied without leaving copy mode, so the selected text and scroll position stay
visible. Click once inside the pane to clear the highlight, leave copy mode, and
forward the click to the terminal application; `q` or `Escape` also returns to
the live bottom.

The `✦` item beside the active window in the bottom status bar shows the
highest current Codex or Claude usage window. Click it, press `Option-U`, or
press `Ctrl-A`, then `u` to open the detailed usage popup. The popup reads the
providers' existing local OAuth credentials, refreshes on demand, and caches
only normalized percentages and reset times for five minutes under
`~/.cache/tmux-agent-usage/`; it does not run a background process.
The colored dot beside usage opens a live accent selector. Its menu previews
the standard and bright Catppuccin palette colors plus Omarchy's default Tokyo
Night window-border accent (`#7aa2f7`), applies the choice across status and
pane UI immediately, and persists it under `~/.local/state/tmux-ui/accent`.
The menu remains open after the launching mouse button is released, so a
separate click selects the desired color.

The `✧` item beside the color selector opens the moving-background popup.
Press `Ctrl-A`, then `b` for the same menu. Selecting a row cycles animation
on/off, speed, density, or brightness and applies the change immediately while
leaving the popup open. The choice persists under
`~/.local/state/tmux-ui/moving-background`. The generated Ghostty override and
active shader live under `~/.config/ghostty`; the image and animation remain
dark-mode-only, and disabling them restores plain Catppuccin Macchiato.

Press `Ctrl-A`, then `n` to open the two-pane notes workspace for the current
project. Project notes are shown alongside global notes that are available from
every project:

```text
~/.local/share/tmux-project-notes/
├── global/
└── projects/
    └── <tmux-session>/
```

The narrow left pane contains tag filters, project notes, and global notes; the
right pane is the real editable Markdown buffer. Moving with `j` / `k`, arrow
keys, or `Cmd-Up` / `Cmd-Down` previews the selected note immediately. `Enter`
or `Tab` focuses the editor in Normal mode, so press `i` when you want to type.
The bottom line changes with the active column and mode and shows only the most
useful keys; `?` displays the complete key guide.

Filename filtering and full-text search are separate: `/` filters the visible
sidebar by title or tag, `Space Space` opens the all-project filename picker,
and `s` or `Space /` searches inside every note and jumps to the matching line.
Select a tag row and press `Enter`, or press `t` for the tag picker. A filled dot
marks the active tag. Add a tag anywhere in a note as `#todo`, `#idea`, or
another single-word hashtag.

Write `[[Note name]]` to connect notes, `[[Note name|short label]]` to display a
different label, or `[[Note name#Heading]]` to document a heading-level target.
Place the cursor inside a link and press `gf` to open the target. A `←N` marker
beside a filename shows how many other notes link to it. Press `R` on a note to
rename it without overwriting an existing file; matching wiki links in every
project and global note are updated at the same time.

Markdown is rendered while the editor is in Normal mode: headings, lists,
checkboxes, links, code blocks, and tables are easier to scan. Press `i` and the
current editing area returns to raw Markdown. English and Romanian word
suggestions are available only in Notes, without spelling underlines. In Insert
mode, use `Ctrl-L` to show completion,
`Ctrl-N` / `Ctrl-P` to choose a suggestion, and `Ctrl-Y` to accept it. The spell
source begins suggesting after three characters and uses both `en_us` and `ro`.

Use `P` / `G` for a new project/global note, `Ctrl-Y` in Normal mode to copy the
whole note, and `Ctrl-D` in the sidebar to delete. Notes autosave while editing.
`Escape` changes Insert mode back to Normal mode; from Normal mode or the
sidebar it saves and closes the workspace. `Option-N` also saves and closes it
immediately. Selecting editor text with the mouse copies it to the macOS
clipboard. `Cmd-V` pastes normally; hold `Shift` while dragging for a
Ghostty-native selection. `TMUX_NOTES_EDITOR` may point to another Neovim
executable.

Ghostty forwards `Cmd-P`, `Cmd-N`, `Cmd-,`, `Cmd-.`, `Cmd-Left`, `Cmd-Right`,
and `Cmd-/` to tmux. They open the project menu, toggle notes, switch sessions,
and switch to the next window. `Cmd-Left` mirrors `Cmd-,` for the previous
session; `Cmd-Right` mirrors `Cmd-.` for the next session. `Cmd-Shift-N` opens a
new Ghostty window, preserving the action formerly assigned to `Cmd-N`.
`Cmd-,` replaces Ghostty's default Open Config shortcut, while `Cmd-Left` and
`Cmd-Right` replace its default shell line-beginning and line-end shortcuts.

The older fixed multi-pane bootstrap remains available directly as:

```bash
bash ~/init_tmux_sessions.sh
```

## Verification

There is no single repository-wide test suite. Use checks appropriate to the
area changed:

```bash
nvim --headless -u NONE -l tests/tmux-notes-core-test.lua
nvim --headless "+luafile tests/tmux-notes-workspace-test.lua" +qa!
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
  only non-secret routing YAML files belong here and are symlinked individually.
- Marketplace extensions and application binaries are external dependencies,
  not vendored artifacts.
- `files_to_symlink/vscode/backups` exists for recovery and comparison. Do not
  implement new behavior in a backup copy.
- Repository guidance for coding agents lives in [`AGENTS.md`](AGENTS.md).
