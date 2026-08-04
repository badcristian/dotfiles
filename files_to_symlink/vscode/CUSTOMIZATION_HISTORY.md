# VS Code customization intent, decisions, and history

Last reviewed: 2026-08-03

This is the durable context for the VS Code configuration and repository-owned
local extensions in this directory. It explains what exists, why it exists,
which tradeoffs are intentional, what failed before, and how to verify future
changes.

The goal is to make a newly opened Codex, Claude, or human session productive
without reconstructing the design from settings, extension code, and git
history.

## Agent contract

Read this file before changing:

- `User/settings.json`
- `User/keybindings.json`
- either installer or `marketplace_extensions.txt`
- anything under `extensions/`
- the injected workbench CSS and scripts under `User/`

The repository copy under `files_to_symlink/vscode` is authoritative. Do not
edit files inside `~/Library/Application Support/Code/User` or
`~/.vscode/extensions` as though they were independent copies; after
installation they should be symlinks back to this directory.

For every meaningful feature, fix, or architectural lesson:

1. Keep the current-state sections accurate.
2. Add a dated entry at the bottom of **Change history**.
3. Include intent, implementation, decisions, lessons, and verification.
4. State what was actually verified. Do not turn an unrun check into a claim.
5. Preserve old entries. Correct history through a new entry rather than
   silently rewriting an earlier decision.

Small version bumps, formatting-only changes, and spelling fixes do not need a
history entry unless they teach something future work must preserve.

## Product intent

This setup brings selected PhpStorm ergonomics into VS Code while remaining
recognizably VS Code:

- make PHP and Laravel navigation fast and predictable;
- keep familiar muscle memory such as `Cmd+B`, `Option+Enter`, and
  `Cmd+Enter`;
- use native VS Code or language-server behavior when it is sufficient;
- fill focused gaps with local extensions rather than a second general PHP
  language server;
- keep generated Laravel intelligence passive and command-driven so
  Intelephense does not enter a re-indexing loop;
- keep the interface compact and usable on a laptop screen;
- make Markdown source/preview behavior consistent across files;
- keep commands available in local and Remote SSH windows;
- reproduce all personal behavior from this dotfiles repository.

The target is not a byte-for-byte PhpStorm clone. A customization is worthwhile
when it removes repeated friction without making ordinary editing surprising.

## Repository and deployment model

### Sources of truth

| Concern | Repository source | Installed destination |
| --- | --- | --- |
| User settings | `User/settings.json` | `~/Library/Application Support/Code/User/settings.json` |
| Keybindings | `User/keybindings.json` | `~/Library/Application Support/Code/User/keybindings.json` |
| Workbench CSS and JS | `User/custom-*.css`, `User/custom-*.js` | `~/Library/Application Support/Code/User/`, injected by the loader |
| Local extensions | `extensions/local.*` | `~/.vscode/extensions/local.*` |
| Marketplace list | `marketplace_extensions.txt` | Installed by the `code` CLI |
| Install orchestration | `install_vscode.sh` | Called directly or by root `symlink.sh` |
| Checksum repair | `fix_vscode_checksums.sh` | Rewrites `product.json` in the VS Code application directory |

`install_vscode.sh` backs up existing live files, creates the symlinks, and
registers the local extensions in VS Code's extension registry. Folder suffixes
such as `local.smart-references-0.0.1` are stable installation paths; they do
not need to change when the version inside `package.json` changes. Renaming
them also requires coordinated installer and registry changes, so a manifest
version bump alone must not rename a folder.

The root `symlink.sh` delegates VS Code installation to this installer. The
marketplace installer stays separate because those packages come from the VS
Code Marketplace rather than this repository.

From the repository root:

```bash
bash files_to_symlink/vscode/install_marketplace_extensions.sh
bash files_to_symlink/vscode/install_vscode.sh
```

Then run **Developer: Reload Window** in every open local or Remote SSH window
that should pick up an extension change.

The repository includes backups for recovery and comparison. They are not the
place to implement a new feature.

## Current architecture

### Settings and interface

The settings intentionally create a compact, low-noise editor:

- JetBrains Mono, compact tabs, no minimap, no sticky scroll, and a limit on
  open editors;
- preview tabs remain enabled, while the local preview extension pins a tab
  when it is deliberately clicked;
- the status bar starts hidden and can be toggled from an editor-title action;
- injected workbench CSS tightens the UI, corrects light/dark tab text, and
  outlines the quick input widget with a light or dark border per theme;
- an injected script preserves horizontal editor scroll around pointer and
  selection changes;
- a second injected script anchors the quick input widget under the command
  center pill, so pickers open out of the title bar rectangle instead of VS
  Code's window-relative position;
- PHP uses Intelephense for core language intelligence, with selected
  Intelephense CodeLens features disabled where the local extension supplies
  the intended navigation;
- generated, compiled, vendor, helper, and framework-cache paths are separated
  carefully between indexing, diagnostics, references, and Sonar analysis.
- Prettier owns JavaScript, TypeScript, and JSON formatting, Laravel Pint owns
  PHP formatting, and JavaScript/TypeScript imports update automatically when
  files move.

The injected layer modifies VS Code's workbench at a DOM/CSS level through
`be5invis.vscode-custom-css`. It is inherently more fragile than an extension
API and must be rechecked after VS Code updates.

### Keybinding philosophy

Keybindings use `when` clauses so one physical shortcut can have different
meanings without leaking into unrelated editors:

| Shortcut | Intended behavior |
| --- | --- |
| `Cmd+B` | PHP smart definition/reference navigation |
| `Option+Enter` | Quick fixes, including local PHP refactors and DocBlocks |
| `Cmd+Enter` | PHP smart navigation or Markdown source/preview toggle |
| `Cmd+C` / `Cmd+V` | PHP-aware copy/paste, native behavior elsewhere |
| `Backspace`, `Enter`, `=` | PHP-aware editing helpers |
| `Shift+Cmd+.` | Regenerate the passive Laravel IDE helper |
| `Cmd+P` | Command Palette, matching the desired PhpStorm muscle memory |
| `Cmd+O` | PhpStorm-style project picker instead of the macOS folder dialog |
| `Cmd+W` | Close the editor, or close the window when no editor is open |
| double `Shift` | Quick file open |
| `Cmd+Left` / `Cmd+Right` | Previous/next editor |

Global keybindings remain active inside a Remote SSH window. The extension that
owns a globally bound command must therefore be available in the correct
extension host; otherwise VS Code reports `command '<id>' not found`.

### Marketplace extensions

The marketplace list supplies broad capabilities that should not be
reimplemented locally. Important examples include Intelephense, PHP DocBlocker,
Laravel Pint, the PhpStorm icon theme, GitLens, Error Lens, SonarLint, Vue
tooling, and the Custom CSS and JS Loader.

Intelephense remains the primary PHP language server. The local extensions
compose around it; they do not replace its parser, diagnostics, symbol index,
completion engine, or rename provider.

### Local extension inventory

#### `local.smart-references`

This is the main PHP/Laravel workflow extension. Its responsibilities are
deliberately related to navigation, focused editing ergonomics, and
framework-specific bridges:

- PhpStorm-style `Cmd+B`: prefer a useful definition, then fall back to
  references when a definition is missing, self-referential, or ambiguous;
- grouped reference picking with generated helper locations filtered out and
  test usages visually de-emphasized;
- PHP-aware copy/paste that can copy a variable token or replace a target
  variable with a copied expression;
- smart Backspace, Enter, equals insertion, and chain splitting;
- JSON/JSONC smart Enter that inserts a missing comma before starting the next
  item while preserving native indentation;
- parent and trait method navigation and custom reference CodeLens counts;
- Laravel route-controller, Gate/policy, policy-method, and translation-key
  references;
- materializing selected PHP inlay hints into source code;
- adding a more precise Laravel builder type to applicable callbacks;
- Explorer deletion while temporarily preventing auto-reveal from moving the
  selection;
- manually marking Explorer files with a persistent coral-red flag decoration;
- adding Explorer-selected files to the nearest repository's `.gitignore`;
- explicit Laravel helper regeneration;
- PhpStorm-style movement of a PHP class file with coordinated namespace and
  reference updates.

The extension writes diagnostics to the **Smart References Debug** output
channel.

Its Up-arrow command is intentionally boring: it delegates to VS Code's normal
`cursorUp` command and must never edit the document. Navigation keys mutating
whitespace caused autosave noise in an earlier implementation.

#### Laravel intelligence bridge

`laravelIntelligence.js` builds a passive, on-demand
`_ide_helper_manual.php`. It scans models for classic and modern accessors,
emits `@property-read` types, and adds selected Restify `self` to `static`
overrides.

The helper is generated only through an explicit action. It is indexed where
Intelephense needs type information but hidden from user-facing reference
results. This distinction is intentional:

- excluding every helper from indexing removes useful facade, macro, accessor,
  and return-type intelligence;
- exposing helper declarations as normal references makes navigation noisy;
- rewriting a helper continuously can trigger repeated Intelephense analysis.

`Cmd+B` bridges generated accessor declarations back to the real model
accessor, and can find magic-property usages when navigating from the accessor.
Semantic locations are preferred; bounded text search is a fallback for cases
the language server cannot model.

#### PHP class-file move

The move behavior is a focused PSR-4 refactor, not a general PHP AST refactoring
engine. It is exposed in three places:

- **Option+Enter** on a class, interface, trait, or enum name;
- **PHP: Move Class File…** from a PHP file's Explorer context menu;
- automatic handling after a PHP file is renamed or dragged in the VS Code
  Explorer.

The refactor:

- finds the nearest applicable `composer.json` PSR-4 mapping;
- moves within the current workspace;
- updates a semicolon-style namespace;
- updates direct and grouped imports, exact fully qualified names, and relevant
  same-namespace dependencies and PHPDoc references;
- avoids rewriting comments and string contents where possible;
- warns and stops when the mapping or syntax is not safe enough to handle.

Known boundaries:

- bracketed namespaces are not supported;
- arbitrary dynamic class-name strings cannot be updated safely;
- moves performed outside VS Code, such as in Finder or a terminal, may not
  emit the VS Code rename event;
- complex PHP syntax can exceed the conservative text-aware transformer;
- a warning is preferable to a partial refactor that silently corrupts code.

The transformation core lives in `phpMove.js` and is tested separately from the
VS Code UI so namespace and reference rules can be verified deterministically.

#### `local.php-smart-docblock`

This extension fills a gap not covered reliably by the marketplace DocBlock
extension: an **Option+Enter** action on a local PHP variable can insert
`/** @var TYPE_NAME $variable */` as a snippet.

Its `Cmd+Enter` command requests definitions and falls back to the
`local.smart-references` picker when the language server only points back to
the current location.

It declares both UI and workspace extension kinds so its globally configured
commands remain available in local and Remote SSH windows.

#### `local.preview-pin-on-click`

This extension has three connected responsibilities:

- convert a preview tab into a pinned editor when it is deliberately clicked;
- remember whether Markdown is currently using source or preview and carry
  that shared mode to subsequently opened Markdown files;
- add bottom space to the rendered Markdown preview.

The shared mode cannot be implemented by permanently associating `*.md` with
the preview editor: that would force preview instead of remembering the last
chosen mode. The extension uses the editor association as stored state and
guards programmatic transitions against feedback loops.

Rendered Markdown is a webview. Source-editor padding settings do not affect
it, so preview spacing belongs in the extension's contributed
`markdown.previewStyles` CSS.

#### `local.phpstorm-project-icons`

This extension scans PHP files and refreshes the installed PhpStorm icon theme
with class, abstract-class, anonymous-class, enum, interface, trait, exception,
test, and resource distinctions.

VS Code icon themes map file icons by basename rather than full path. Duplicate
basenames with conflicting classifications are skipped instead of receiving a
misleading icon.

Use **PhpStorm Icons: Refresh PHP File Icons From Workspace** when
classifications need to be regenerated.

#### `local.statusbar-toggle`

This is a small wrapper around VS Code's built-in status-bar visibility command.
It contributes the editor-title button used to reveal or hide a status bar that
starts hidden.

#### `local.project-chooser`

This extension replaces the macOS folder dialog on `Cmd+O` with a PhpStorm-style
project picker. It exists because an empty VS Code window offers no fast way to
return to a known project, and because the native dialog is a file browser
rather than a project list.

The list is assembled from three sources, in priority order:

- the workbench's recently opened folders and workspaces;
- projects this extension recorded itself when a window opened one;
- directories one level under `projectChooser.projectRoots`, restricted to git
  repositories while `projectChooser.scanRequiresGit` is true.

Duplicates collapse into their most recent position, and scanned repositories
follow alphabetically. The final entry, **Open Folder…**, still reaches the
native dialog.

Window targeting is explicit rather than guessed:

- an empty window opens the picked project in place;
- a window with a project already open follows the **Open in a new window**
  toggle, which defaults to on;
- `Cmd+Enter` and the per-row button open in the other window once, without
  changing the toggle.

VS Code cannot show a real modal window from an extension. `showInformationMessage`
with `modal: true` renders only a message and buttons, so a QuickPick is the
closest available shape for a focused, keyboard-driven chooser.

Two implementation constraints are deliberate:

- `_workbench.getRecentlyOpened` is an internal workbench command. The recently
  opened list is not present in the extension-visible `state.vscdb`, so there is
  no supported alternative. Every call is guarded, and the recorded history plus
  the scanned roots keep the picker useful if the command disappears.
- The toggle is stored in `globalState`, not in settings. `settings.json` is a
  symlink into this repository, and a runtime configuration write can replace
  the link with a plain file.

`projects.js` holds the ordering, naming, path-display, and target rules with no
`vscode` dependency so they can be tested directly.

## Decisions future changes must preserve

### 1. Repository sources, not installed symlinks

Always edit this directory. A fix made only in the live VS Code directory will
either edit through the symlink without making its origin obvious or be lost
the next time installation is repaired.

Verify both the tracked source and the installed link after changes.

### 2. Native behavior first, focused extensions for real gaps

Use VS Code and Intelephense commands where they produce the intended result.
Local extensions are appropriate when behavior must coordinate several native
commands, preserve shared state, or supply Laravel semantics unavailable from
the language server.

Do not add a second PHP language server or broad shadow implementation without
first demonstrating why the existing language server cannot serve the need.

### 3. Context-scoped keyboard behavior

The same shortcut may serve PHP, Markdown, terminal, or Explorer behavior only
when `when` clauses make the contexts understandable. Review new bindings
against all existing bindings for that key.

### 4. Extension-host placement is part of command reliability

`command '<id>' not found` can mean the keybinding exists globally but the
extension that registers it is absent or running only on the wrong side of an
SSH session. Commands intended to work everywhere need deliberate
`extensionKind`, activation events, and reload verification in a remote window.

Do not solve this only by removing the keybinding; first verify whether the
command-owning local extension is registered, activated, and placed correctly.

### 5. Laravel generation stays explicit and passive

No live completion or hover provider should rewrite the Laravel helper as the
user types. Regeneration is explicit because stable files allow Intelephense to
index once instead of reacting to a provider that changes its own inputs.

### 6. Indexing and result visibility are different concerns

A generated file can be valuable to Intelephense while still being undesirable
in references, diagnostics, Sonar output, or file search. Configure each
consumer for its purpose rather than applying one blanket exclusion everywhere.

### 7. Navigation commands must not mutate source

Arrow keys and pure navigation commands must delegate to normal editor
movement. Do not combine whitespace cleanup with navigation; autosave makes
even a seemingly harmless edit visible as file churn.

### 8. Refactors fail closed

When namespace style, PSR-4 mapping, workspace boundary, or syntax is
unsupported, warn and stop. Conservative behavior is preferable to a move that
leaves references partially updated.

### 9. Pure transformation logic earns tests

Keep namespace, reference, Laravel helper, and Markdown state transformations
separate from VS Code UI calls where practical. Pure modules are faster to test
and make edge cases reproducible.

### 10. Workbench injection is a maintenance liability

Injected CSS and DOM scripts are acceptable for the desired interface, but they
are version-sensitive. After a VS Code update, inspect tab styling, the quick
input position and border, and horizontal scroll behavior before changing
unrelated editor settings to compensate.

Failure here is silent. APC injected through the AMD bootstrap and simply
stopped applying anything when VS Code moved to ESM, while its settings stayed
in place and looked correct. Confirm the injector still patches the running
version before concluding that a rule or script is wrong.

## Verification playbook

Run the checks that match the change. Record the exact checks run in the
history entry.

### Repository and shell checks

From `/Users/mac/dev/dotfiles`:

```bash
bash -n symlink.sh
bash -n files_to_symlink/vscode/install_vscode.sh
bash -n files_to_symlink/vscode/install_marketplace_extensions.sh
git diff --check
```

### Local extension syntax and tests

```bash
node --check files_to_symlink/vscode/extensions/local.smart-references-0.0.1/extension.js
node --check files_to_symlink/vscode/extensions/local.smart-references-0.0.1/phpMove.js
node --check files_to_symlink/vscode/extensions/local.smart-references-0.0.1/laravelIntelligence.js
node --test files_to_symlink/vscode/extensions/local.smart-references-0.0.1/test/*.test.js

node --check files_to_symlink/vscode/extensions/local.php-smart-docblock-0.0.1/extension.js

node --check files_to_symlink/vscode/extensions/local.preview-pin-on-click-0.0.1/extension.js
node --test files_to_symlink/vscode/extensions/local.preview-pin-on-click-0.0.1/test/*.test.js

node --check files_to_symlink/vscode/extensions/local.phpstorm-project-icons-0.0.1/extension.js
node --check files_to_symlink/vscode/extensions/local.statusbar-toggle-0.0.1/extension.js

node --check files_to_symlink/vscode/extensions/local.project-chooser-0.0.1/extension.js
node --check files_to_symlink/vscode/extensions/local.project-chooser-0.0.1/projects.js
node --test files_to_symlink/vscode/extensions/local.project-chooser-0.0.1/test/*.test.js

node --check files_to_symlink/vscode/User/custom-preserve-editor-horizontal-scroll.js
node --check files_to_symlink/vscode/User/custom-anchor-quick-input-to-command-center.js
```

Confirm the injector still reaches the running VS Code build. The loader patches
the first matching workbench HTML file, and an injector that no longer runs
leaves settings that look correct while doing nothing:

```bash
grep -c "custom-workbench\|CUSTOM_CSS" "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html"
```

After patching, confirm the checksums match the files again, so the corruption
warning stays gone and a later mismatch means something unexpected changed:

```bash
bash files_to_symlink/vscode/fix_vscode_checksums.sh
```

A clean run reports that all checksums already match. Run the injection check
above first: a checksum repair over a workbench that lost its injection would
report success while nothing is applied.

Validate extension manifests:

```bash
for manifest in files_to_symlink/vscode/extensions/local.*/package.json; do
  jq empty "$manifest"
done
```

### Installed-link checks

After running `install_vscode.sh`:

```bash
readlink "$HOME/Library/Application Support/Code/User/settings.json"
readlink "$HOME/Library/Application Support/Code/User/keybindings.json"
readlink "$HOME/.vscode/extensions/local.smart-references-0.0.1"
code --list-extensions --show-versions | rg '^local\.'
```

Expected results point into `/Users/mac/dev/dotfiles/files_to_symlink/vscode`.

### Manual smoke tests

After **Developer: Reload Window**:

- open Command Palette and confirm every changed `local.*` command is present;
- run the relevant keybinding in a PHP file and in an unrelated file to verify
  both the positive context and native fallback;
- for Remote SSH fixes, repeat command discovery and execution in an actual
  remote window;
- for PHP moves, use Option+Enter and Explorer drag on a disposable PSR-4 class,
  then inspect namespace, imports, FQNs, PHPDoc, and git diff;
- for Laravel helper changes, regenerate once and ensure Intelephense settles
  rather than repeatedly re-analyzing;
- for Markdown changes, toggle one file and open another to confirm the shared
  mode, then click a preview tab to confirm it pins;
- after VS Code upgrades, re-run **Enable Custom CSS and JS**, then
  `fix_vscode_checksums.sh`, then check compact tabs, light/dark contrast, the
  quick input position and border, and horizontal-scroll restoration.

## Change history

Entries are chronological. Add new entries at the bottom so the file remains an
append-only trail.

### 2026-06-26 — PhpStorm-oriented VS Code workflow established

Intent:

- reproduce the small, high-frequency editor behaviors that made the PHP
  workflow productive in PhpStorm;
- keep those behaviors in dotfiles so a new machine does not require manual
  reconstruction.

Starting behavior reconstructed from the imported configuration:

- local-variable DocBlock action on Option+Enter;
- smart definition/reference navigation;
- PHP-aware editing and Explorer actions;
- compact workbench styling, project-aware icons, and a hidden status bar with
  an explicit toggle;
- settings and keybindings organized as repository-owned files.

Decisions and lessons:

- marketplace extensions cover broad capabilities, but local extensions are
  justified for narrow gaps;
- behavior should be discoverable through Command Palette, context menus, and
  familiar shortcuts rather than keyboard-only hidden functionality;
- command identifiers and keybindings form a contract and change together.

Verification evidence:

- this entry records the design origin reconstructed from the current files and
  prior implementation context; it is not claiming a standalone git commit in
  this repository on that date.

### 2026-07-18 — VS Code configuration and extensions imported into dotfiles

Intent:

- make the full VS Code environment reproducible from
  `/Users/mac/dev/dotfiles`;
- replace one-off installed copies with a repository-owned symlink model.

Implementation:

- added settings, keybindings, marketplace list, installers, backups, the APC
  scroll helper, local extensions, and tests;
- wired root `symlink.sh` to the VS Code installer;
- registered local extensions in VS Code's extension registry so symlinked
  folders load like installed extensions;
- documented new-machine installation in the VS Code README.

Decisions and lessons:

- `install_vscode.sh` is the canonical deployment path;
- local extension directory names stay stable when manifest versions advance;
- correct source files are not enough—both live symlinks and VS Code's
  extension registration must be verified;
- user-only secrets such as the Intelephense licence remain outside version
  control.

Historical evidence:

- repository commit `e08a729` imported the VS Code customization tree.

### 2026-07-19 — Up-arrow stopped mutating PHP documents

Intent:

- eliminate modified files and autosave churn caused by ordinary cursor
  movement.

Implementation:

- simplified `smartCursorUp` to delegate to VS Code's native `cursorUp`.

Decision:

- navigation and cleanup are separate operations; cursor movement must not trim
  whitespace or rewrite continuation lines.

Lesson:

- a tiny edit inside a navigation command becomes a real file mutation when
  autosave is enabled. Tests and reviews must consider editor-state changes,
  not only the visible cursor result.

Historical evidence:

- repository commit `2ca514c` contains the focused fix.

### 2026-07-26 — Shared Markdown mode and preview ergonomics consolidated

Intent:

- make the last chosen Markdown source/preview mode apply consistently to all
  Markdown files without forcing preview forever;
- preserve preview-tab behavior while making deliberate selections durable.

Implementation:

- extended `local.preview-pin-on-click` to remember shared Markdown mode;
- prevented programmatic transitions from feeding back into state detection;
- pinned deliberately clicked preview tabs;
- moved preview bottom spacing into contributed Markdown preview CSS.

Decisions:

- extend the existing preview extension because it already owns the relevant
  editor lifecycle;
- preserve unrelated `workbench.editorAssociations` entries when updating the
  Markdown association;
- keep `Cmd+Enter` context-specific: Markdown toggle in Markdown, PHP
  navigation in PHP/Hack.

Lessons:

- a static `*.md` preview association forces a mode; it does not model shared
  last-used state;
- rendered preview spacing cannot be fixed with source-editor padding because
  the preview is a webview;
- mutually exclusive `when` clauses matter when one shortcut has multiple
  language-specific meanings.

Verification:

- the extension includes tests for preview pinning, shared mode transitions,
  and contributed preview styling.

### 2026-07-26 — Laravel intelligence made explicit and index-friendly

Intent:

- recover Laravel accessor and framework-specific type intelligence that
  Intelephense cannot infer reliably;
- avoid re-analysis storms caused by live providers or continuously rewritten
  generated files.

Implementation:

- added a command-driven Laravel helper generator;
- generated `_ide_helper_manual.php` with model accessor properties and
  selected Restify return overrides;
- added navigation between generated accessor properties, real accessors, and
  magic-property usages;
- added route, Gate/policy, translation, parent, and trait references;
- separated Intelephense indexing exclusions from reference and Sonar result
  exclusions;
- added `Shift+Cmd+.` for explicit helper refresh.

Decisions:

- keep generation passive and user-triggered;
- allow useful stubs into the language-server index while filtering them from
  references and unrelated analysis;
- prefer semantic locations and use bounded text fallbacks only for framework
  patterns the language server cannot express;
- keep framework logic in a pure helper module where possible.

Lessons:

- generated-code policy must be configured per consumer rather than with one
  blanket exclusion;
- improved type intelligence can worsen navigation unless generated
  declarations redirect to real application code;
- writing an indexed helper from a live provider can create a self-reinforcing
  analysis cycle.

Verification:

- syntax checks and the smart-reference tests cover the pure Laravel helper
  transformations and navigation helpers;
- manual verification still requires regeneration in a real Laravel workspace
  and observing that Intelephense settles.

### 2026-07-26 — PHP class movement gained a conservative PSR-4 refactor

Intent:

- provide the core PhpStorm behavior missing from VS Code Explorer moves:
  moving a PHP class file should update its namespace and known references.

Implementation:

- added a class-name Option+Enter action;
- added **PHP: Move Class File…** to the Explorer context menu;
- listened for VS Code file rename events so Explorer drag/rename can apply the
  same follow-up refactor;
- added nearest-`composer.json` PSR-4 resolution;
- added transformations for namespaces, direct/grouped imports, exact FQNs,
  same-namespace dependencies, and applicable PHPDoc references;
- isolated the transformer in `phpMove.js` and added focused tests.

Decisions:

- put the feature in `local.smart-references` because it already owns PHP
  navigation/refactor actions and context-sensitive Option+Enter behavior;
- offer class-level and Explorer-level discovery, and support normal Explorer
  drag as the natural file-management path;
- support a well-defined safe subset and warn outside it;
- do not present a text-aware transformer as a complete PHP AST/project index.

Lessons:

- moving a file and rewriting references are separate phases and both require
  failure handling;
- PSR-4 mapping must come from the nearest relevant Composer configuration, not
  a hard-coded `app/` assumption;
- comments, strings, grouped imports, PHPDoc, duplicate short names, and
  same-namespace references distinguish a refactor from search-and-replace;
- terminal and Finder moves are outside the reliable VS Code event boundary.

Verification:

- `phpMove.js` has focused unit tests;
- completion requires the automated suite and a disposable real-project smoke
  test through Option+Enter and Explorer drag.

### 2026-07-26 — Local PHP commands made resilient in Remote SSH windows

Intent:

- prevent globally configured shortcuts from failing with
  `command 'smartReferences.smartCopy' not found` or
  `command 'php-smart-docblock.navigate' not found` in an SSH window.

Implementation:

- declared both `ui` and `workspace` extension kinds for the command-owning PHP
  extensions;
- activated smart references after startup in addition to its language and
  command activation paths;
- retained global keybindings for the same local and remote workflow.

Decision:

- extension-host placement and activation are part of a command's public
  contract.

Lessons:

- a keybinding's presence does not prove its command is registered;
- local symlink installation, extension registry state, remote extension-host
  placement, activation events, and reload are distinct failure boundaries;
- verify a fix in an actual Remote SSH window, not only a local Extension
  Development Host.

Verification:

- manifest syntax and local tests cover packaging and behavior;
- final confirmation requires rerunning `install_vscode.sh`, reloading the
  remote window, checking Command Palette, and executing the shortcuts.

### 2026-07-26 — Canonical customization history and agent discovery added

Intent:

- stop future agents from rediscovering the same architecture or repeating
  rejected approaches;
- preserve the intent and lessons behind settings and extension code.

Implementation:

- added this canonical document beside the symlinked VS Code sources;
- added root `AGENTS.md` and `CLAUDE.md` entrypoints;
- linked the history from human-facing repository documentation;
- established an append-only entry format and verification playbook.

Decision:

- keep detailed history close to its implementation while exposing it through
  conventional agent-discovery files at the repository root.

Lesson:

- code shows mechanics but rarely preserves why generated files are indexed,
  why a command runs in a particular extension host, or why an apparently
  simpler implementation was rejected. Those decisions need a durable record.

Verification:

- root guidance and README links resolve to this file;
- the live settings, keybindings, and smart-reference extension symlinks resolve
  back into this repository;
- shell syntax passed for `symlink.sh` and both VS Code installers;
- all five local extension manifests passed `jq empty`;
- JavaScript syntax passed for every local extension entrypoint plus
  `phpMove.js` and `laravelIntelligence.js`;
- the smart-reference suite passed 9 tests and the Markdown-preview suite
  passed 6 tests;
- `git diff --check` passed;
- Remote SSH command execution and a real-project PHP move remain manual smoke
  tests and are not claimed by these repository checks.

### 2026-07-27 — JSON Enter gained conservative comma insertion

Intent:

- make Enter at the end of a completed JSON or JSONC property/item insert the
  separator needed for the next line;
- preserve native Enter behavior in incomplete structures and unrelated files.

Implementation:

- extended the existing context-scoped `smartReferences.smartEnter` command to
  handle JSON and JSONC;
- added a JSON-aware lexical helper that ignores braces and comment markers
  inside strings;
- added a separate JSON/JSONC Enter keybinding and focused unit tests.

Decisions and lessons:

- reuse the existing smart-Enter command instead of introducing a parallel
  extension;
- add a comma only at the logical end of a completed item inside an object or
  array;
- delegate the newline itself to VS Code so native indentation, suggestions,
  and non-matching cases remain intact;
- fail conservatively around comments, selections, mid-line cursors, opening
  tokens, existing commas, and root closing tokens.

Verification:

- `jsonSmartEnter.test.js` covers package-script properties, existing commas,
  arrays, nested containers, comments, strings, mid-line cursors, and root
  closings;
- the local extension registry was reinstalled at version `0.0.6` and its live
  symlink was verified;
- active-window behavior still requires `Developer: Reload Window` and a manual
  smoke test in VS Code.

### 2026-07-27 — Workstation and editor configuration consolidated

Intent:

- commit the accumulated workstation and VS Code changes as one reproducible
  repository state;
- make formatter ownership and generated-code analysis boundaries explicit;
- remove an obsolete Claude usage helper and keep its runtime cache out of
  version control.

Implementation:

- assigned Prettier to JavaScript, TypeScript, and JSON, Laravel Pint to PHP,
  and enabled JavaScript/TypeScript import updates after file moves;
- expanded Intelephense and Sonar exclusions for generated Laravel helpers,
  compiled views, framework caches, dependencies, and minified assets;
- added a global EditorConfig source and linked it through the root installer;
- updated the shell's preferred Homebrew Node path to Node 24;
- removed `claude-usage.sh`, its shell alias, installer reference, and live
  symlink;
- ignored the generated `status-cache.json` usage snapshot.

Decisions and lessons:

- formatter ownership is language-specific rather than relying on whichever
  extension happens to answer first;
- transient usage snapshots do not belong in the machine-configuration source
  of truth;
- generated-code indexing, diagnostics, and standalone Sonar analysis continue
  to use separate exclusion controls.

Verification:

- automated syntax, manifest, test, link, and diff checks must pass before the
  commit is created;
- no new credential patterns may be present in added content;
- active-window formatter behavior, Remote SSH commands, Laravel helper
  generation, and a real-project PHP move remain manual smoke tests and are not
  claimed by this entry.

### 2026-07-27 — Explorer files gained an Add to .gitignore action

Intent:

- expose **Add to .gitignore** where files are managed: the Explorer context
  menu;
- make the action work for ordinary local repositories, worktrees, nested
  repositories, multi-selection, and Remote SSH workspaces.

Implementation:

- added the action to `local.smart-references`, which already owns focused
  Explorer file actions;
- used the VS Code Git extension's known repository roots when available and
  fell back to walking toward the workspace root for the nearest `.git` file or
  directory;
- append repository-relative paths to the root `.gitignore`, preserving its
  newline style and skipping exact duplicates;
- apply the change through VS Code's document and workspace-edit APIs so an
  already-open, unsaved `.gitignore` is not overwritten from disk;
- isolated path and text transformations in `gitignore.js` with focused tests.

Decisions and lessons:

- VS Code's built-in `git.ignore` command cannot be placed directly in the
  Explorer menu because it accepts internal Source Control resource objects,
  not Explorer file URIs;
- repository discovery and file writes use VS Code APIs so the command is not
  limited to local `file:` workspaces;
- directories are deliberately excluded from the menu because this action was
  requested for files.

Verification:

- automated syntax, manifest, unit-test, and diff checks cover the repository
  implementation;
- active-window confirmation still requires **Developer: Reload Window** and a
  real Explorer context-menu smoke test.

### 2026-07-30 — Cmd+O gained a PhpStorm-style project chooser

Intent:

- replace the macOS folder dialog on `Cmd+O` with a project list, so an empty
  window can return to a known project without browsing the filesystem;
- keep the same shortcut useful when a project is already open, with an explicit
  choice between reusing the window and opening a new one.

Implementation:

- added `local.project-chooser`, registered by `install_vscode.sh` alongside the
  other repository-owned extensions;
- built the list from the workbench recently opened entries, a self-recorded
  history, and git repositories one level under `projectChooser.projectRoots`
  (default `~/dev`), deduplicated with recents keeping their position;
- rendered it as a QuickPick with a title-bar toggle, per-row alternate button,
  and a trailing **Open Folder…** entry that keeps the native dialog reachable;
- scoped `Cmd+Enter` and `Option+Cmd+N` to the picker through the
  `projectChooser.visible` context key, so both keys keep their PHP, Markdown,
  and window meanings elsewhere;
- kept ordering, naming, path display, target resolution, and history trimming
  in `projects.js` with unit tests.

Decisions and lessons:

- an extension cannot open a real modal window; `showInformationMessage` with
  `modal: true` supports only a message and buttons, so a QuickPick is the
  closest keyboard-driven equivalent to the PhpStorm dialog;
- the recently opened list is not readable from the extension-visible
  `state.vscdb`, and `_workbench.getRecentlyOpened` is internal, so it is called
  defensively with the recorded history and root scan as fallbacks;
- the new-window toggle is persisted in `globalState` rather than settings,
  because `settings.json` is a symlink into this repository and a runtime
  configuration write can replace the link with a plain file;
- an empty window ignores the toggle and opens in place: there is no session to
  preserve, and that matches how PhpStorm treats its own chooser.

Verification:

- `node --check` on both new modules, `jq empty` on the new manifest, and
  `node --test` over `test/projects.test.js` (11 tests, all passing);
- `bash -n` on `symlink.sh` and both VS Code installers, plus `git diff --check`;
- `install_vscode.sh` run, with `readlink` confirming
  `~/.vscode/extensions/local.project-chooser-0.0.1` points into this
  repository and `code --list-extensions` reporting `local.project-chooser`;
- picker behavior in an empty window, in a loaded window, the toggle, the
  alternate-window keys, and the **Open Folder…** fallback are manual smoke
  tests after **Developer: Reload Window** and are not claimed by this entry.

### 2026-07-30 — Quick input anchored under the command center

Intent:

- make the project picker, and every other quick input, open out of the rounded
  command center rectangle in the title bar instead of appearing offset from it.

Implementation:

- added `User/apc-anchor-quick-input-to-command-center.js` to `apc.imports`;
- measured `.command-center-center` at runtime and set the widget's `left`,
  `top`, and `width` so it is centered on the pill, matches its width down to a
  420px floor, and sits just below it;
- re-anchored only on the hidden-to-visible transition and on window resize,
  across two animation frames and one short timeout, so no polling is needed;
- left overlay-anchored and closing widgets alone.

Decisions and lessons:

- the widget was not merely uncentered: VS Code stores a dragged position in
  `workbench.quickInput.viewState` and lays the widget out at
  `dimension.width * (viewState.left ?? 0.5)`. This machine had
  `{"top":0.0056,"left":0.5695}` stored, which shifted every picker right by
  about 7% of the window width;
- window-centered and pill-centered are different positions. `.titlebar-center`
  is centered between title bar areas of unequal width, so the offset cannot be
  written as a static stylesheet rule and must be measured;
- positions are written as ordinary inline styles, not `!important`. VS Code
  reuses one widget element for the window's lifetime, so an important inline
  value would outrank its own layout writes permanently and break dragging;
- anchoring on the visibility transition rather than on every mutation keeps
  drag-to-move working within a session while discarding the stale stored
  position on the next open;
- the existing `quick-input-widget-open` animation already uses
  `transform-origin: top center`, so no custom animation was added; the widget
  now grows out of the pill because it is centered on it.

Verification:

- `node --check` on the new script and a parse check on `settings.json`;
- `bash -n` on `symlink.sh` and both VS Code installers, all local extension
  syntax checks, `node --test` across every local extension (39 tests passing),
  and `git diff --check`;
- the anchored position, resize behavior, and drag-then-reopen behavior are
  manual smoke tests after a full VS Code quit and relaunch, and are not claimed
  by this entry. `apc.imports` changes do not take effect on
  **Developer: Reload Window** alone, because this setup suppresses APC's
  restart prompt.

### 2026-07-30 — Quick input given a theme-aware border

Intent:

- separate the picker from the editor behind it with a visible outline: bright
  on dark themes, dark on light themes.

Implementation:

- added two `apc.stylesheet` rules scoped by the workbench theme class,
  `.monaco-workbench.vs-dark .quick-input-widget` and
  `.monaco-workbench.vs .quick-input-widget`;
- used `rgba(255, 255, 255, 0.72)` and `rgba(0, 0, 0, 0.62)` so the border
  reads against any theme background without matching one palette;
- forced `box-sizing: border-box` so the border cannot change the width the
  anchor script measures and applies.

Decisions and lessons:

- VS Code has no `quickInput.border` theme color, and neither the base
  stylesheet nor any theming participant draws a border on
  `.quick-input-widget`, so `workbench.colorCustomizations` could not express
  this and the APC stylesheet was the only route;
- the widget inherits `border-radius: var(--vscode-cornerRadius-xLarge)`, so the
  border follows the existing rounded corners without extra rules;
- theme-conditional styling continues to key off the `.vs` and `.vs-dark`
  workbench classes, matching the existing tab and explorer rules. High contrast
  themes are left alone because they already draw their own borders.

Verification:

- `settings.json` parse check and `git diff --check`;
- the rendered border in a dark and a light theme is a manual smoke test and is
  not claimed by this entry.

### 2026-07-30 — Workbench injection moved off APC to the Custom CSS and JS Loader

Intent:

- restore the workbench CSS and scripts, which had silently stopped applying,
  and put them on an injector that supports the running VS Code version.

Implementation:

- replaced `apc.stylesheet` and `apc.imports` with `vscode_custom_css.imports`
  and added `be5invis.vscode-custom-css` to the marketplace list in place of
  `drcika.apc-extension`;
- moved every stylesheet rule from the setting into `User/custom-workbench.css`,
  including the quick input border added earlier the same day;
- renamed `User/apc-preserve-editor-horizontal-scroll.js` and
  `User/apc-anchor-quick-input-to-command-center.js` to `custom-` prefixes,
  since neither belongs to APC any more;
- generalized `install_vscode.sh` to link every file in `User/` instead of only
  the two JSON files, so the live user folder mirrors the repository and the
  loader can import through those symlinks;
- removed `patch_apc_restart_prompt` from the installer along with the settings
  it existed to support.

Decisions and lessons:

- APC 0.4.1 injects by hooking `window.MonacoBootstrapWindow` and AMD
  `require.define`. VS Code 1.131.0 has neither: its bootstrap is ESM, its main
  process loads `workbench.html` rather than APC's `workbench-apc-extension.html`,
  and nothing but APC's own unreachable `process.main.js` references that file.
  The extension's last release is 0.4.1 from 2024-08-02 against engine `^1.92.0`,
  so there is no version to upgrade to;
- the failure was invisible. Compact tabs kept working because
  `workbench.editor.tabHeight: "compact"` is a native setting, so the dead layer
  looked alive. Verify the injector patched the running build before debugging a
  rule that "does nothing";
- the loader inlines file contents into `workbench.html` instead of linking to
  them, so edits need **Reload Custom CSS and JS** and a restart, and every VS
  Code update drops the injection until it is re-enabled;
- imports point at the symlinked copies in the live user folder rather than at
  repository paths, keeping one load location; `Url.fileURLToPath` in the loader
  decodes the `%20` in `Application%20Support` correctly;
- `drcika.apc-extension` is left installed but untracked and inert. Its stale
  patched files remain in the application directory and are never loaded, since
  the loader prefers `workbench.html`.

Verification:

- `bash -n` on `symlink.sh` and both VS Code installers, `node --check` on both
  injected scripts, `node --test` across every local extension (39 tests
  passing), and `git diff --check`;
- `install_vscode.sh` run; `ls -l` confirms all five `User/` files are symlinks
  into this repository;
- the loader's own resolution path was simulated with `Url.fileURLToPath` plus a
  read of each imported URL, and `workbench.html` was confirmed writable by the
  current user, so no ownership change is needed on this machine;
- the rendered border, anchored position, tab metrics, and horizontal-scroll
  behavior are manual smoke tests after **Enable Custom CSS and JS** and a
  restart, and are not claimed by this entry.

### 2026-07-30 — Quick input border softened and its corners clipped

Intent:

- reduce the border to a quieter outline;
- stop the scrolled list from painting square corners over the widget's rounded
  bottom edge, which broke the border at both bottom corners.

Implementation:

- lowered the border alpha to `0.45` on dark themes and `0.4` on light themes;
- added `overflow: hidden` to `.quick-input-widget` so its children are clipped
  to the existing `--vscode-cornerRadius-xLarge` radius.

Decisions and lessons:

- the artifact only appeared once the list was scrolled, because the rows reach
  the bottom edge only then. A radius on a parent does not clip children unless
  the parent also hides overflow;
- clipping the widget is safe for item hovers: they are rendered by the hover
  service in the workbench overlay, not inside this element;
- the widget's own drop shadow is unaffected, since a box shadow paints outside
  the element and ignores its overflow.

Verification:

- `git diff --check`; the injected file is linked into the live user folder;
- the rendered result requires **Reload Custom CSS and JS** and a restart, and is
  not claimed by this entry.

### 2026-07-30 — Corruption warning resolved with a tracked checksum repair

Intent:

- clear "Your Code installation appears to be corrupt. Please reinstall.", which
  VS Code shows on every start once the workbench is patched;
- keep the repair repeatable, since it is needed again after each CSS reload and
  each VS Code update.

Implementation:

- added `fix_vscode_checksums.sh`, which recomputes the `product.json` checksums
  from the files on disk and rewrites only the values that changed;
- replaced each entry through a targeted pattern match rather than re-serializing
  the document, so `product.json` keeps its original formatting;
- re-parsed the result before writing, printed every file updated, and made the
  script fail with the `chown` command when `product.json` is not writable;
- documented the alternative of dismissing the notification with
  **Don't Show Again**, which changes nothing in the application directory.

Decisions and lessons:

- VS Code checksums ten workbench files with **SHA-256**, base64 encoded with
  the padding stripped. An MD5 comparison reports all ten as mismatched and
  looks like catastrophic corruption; only `workbench.html` actually differed;
- the other nine files were untouched, which also confirmed APC's leftovers in
  the application directory are inert rather than damaging;
- this repair is deliberately not part of `install_vscode.sh`. The checksum only
  diverges after the loader patches the workbench, which happens later, from
  inside VS Code;
- the script trusts the files on disk, so it would equally bless an unintended
  modification. The printed file list is the only signal that the change was the
  expected one, and the injection check belongs before the repair rather than
  after it.

Verification:

- `bash -n` on the new script, and `git diff --check`;
- the script was run on this machine: it updated
  `vs/code/electron-browser/workbench/workbench.html` only, a follow-up SHA-256
  comparison reported all ten checksums matching, and `workbench.html` still
  contains the injected rules and the loader's indicator marker;
- the warning's disappearance requires a restart and is not claimed by this
  entry.

### 2026-07-30 — Cmd+W closes an editor-less window, and the last window quits

Intent:

- make `Cmd+W` close the window when no editor is open, rather than doing
  nothing;
- quit VS Code when that window was the last one, instead of leaving the
  application running without windows.

Implementation:

- bound `Cmd+W` to `workbench.action.closeWindow` under
  `!editorIsOpen && !multipleEditorGroups`, so it still closes editors and
  groups whenever either exists;
- added a Hammerspoon rule in `files_to_symlink/init.lua` that quits VS Code
  after its last window is destroyed, debounced by 1.2 seconds so a replacing
  window can register first.

Decisions and lessons:

- nothing was closing the window because VS Code binds **`Shift+Cmd+W`** to
  `workbench.action.closeWindow` on macOS, and this setup unbinds that in favor
  of `workbench.action.closeOtherEditors`. `Cmd+W` reached only
  `closeActiveEditor`, which is a no-op with no editors;
- quitting cannot be done from the editor. VS Code's main process ignores
  Electron's `window-all-closed` on macOS, there is no setting for it, and no
  extension API or context key exposes how many windows exist. The application
  lifecycle belongs to the desktop layer, which this repository already manages
  through Hammerspoon;
- the watcher keys off the `Code` application name and the
  `com.microsoft.VSCode` bundle identifier, and is held in a global so
  Hammerspoon does not collect the filter;
- the debounce matters. Opening a project from an empty window can destroy the
  old window before its replacement appears, and quitting inside that gap would
  close the editor the user just asked for.

Verification:

- `keybindings.json` parses, `init.lua` passes `luac -p`, and `git diff --check`
  is clean;
- window-close and quit behavior are manual smoke tests after
  **Developer: Reload Window** and a Hammerspoon **Reload Config**, and are not
  claimed by this entry.

### 2026-07-30 — Tab accent strips clipped to the rounded tab shape

Intent:

- stop the active-tab accent lines from running straight across the rounded tab
  corners.

Implementation:

- added `overflow: hidden` to the tab rule in `User/custom-workbench.css`, so the
  existing `border-radius: 5px` clips the accent strips.

Decisions and lessons:

- VS Code draws the active, selected, and dirty tab accents as absolutely
  positioned `left: 0; width: 100%; height: 1px` children of the tab, not as
  borders on it. A radius on the tab therefore does nothing to them until the
  tab also hides its overflow;
- the clash only became visible now. The tab rules had been inert since APC
  stopped injecting, so this rounding shipped for the first time with the move to
  the Custom CSS and JS Loader. Restoring a dormant layer means re-reviewing what
  it renders, not only that it renders;
- VS Code's own styled workbench hides both strip containers with `display: none`
  under `.style-override`, which is the alternative if the accents are not wanted
  at all. Clipping was chosen because `tab.activeBorderTop` is deliberately set to
  `#d09010` in the color customizations;
- clipping shortens each strip at the curve rather than tapering it, so the line
  now stops where the corner begins.

Verification:

- `git diff --check`, and the file is linked into the live user folder;
- the rendered tabs require **Reload Custom CSS and JS**, a restart, and a
  `fix_vscode_checksums.sh` run, and are not claimed by this entry.

### 2026-08-03 — Explorer files gained persistent manual markers

Intent:

- make a manually chosen file easy to spot in a long Explorer list without
  renaming it or changing repository content;
- keep the marker subtle and native to VS Code rather than injecting Explorer
  CSS.

Implementation:

- added **Toggle File Marker** to the Explorer context menu in
  `local.smart-references`;
- registered a native file-decoration provider that renders a single amber
  `●` with a marker-removal tooltip;
- stored marked URI strings in workspace-scoped extension state, including
  local and Remote SSH resources;
- made a mixed multi-selection mark all selected files, while an entirely
  marked selection is unmarked together;
- carried marks across file and containing-folder renames and removed stale
  marks after file or folder deletion;
- isolated persistence transformations in `fileMarkers.js` with focused tests.

Decisions and lessons:

- VS Code's `FileDecorationProvider` is the supported boundary for a short
  badge, tooltip, and theme color; a `ThemeIcon` cannot be placed arbitrarily
  beside an Explorer filename through this API;
- markers are workspace state rather than settings because absolute file URIs
  are workspace-specific and should not be synced into dotfiles;
- folder propagation remains disabled: only files explicitly marked by the
  user receive the dot.

Verification:

- JavaScript syntax, manifest parsing and wiring, the complete Smart References
  test suite, live extension symlink, and `git diff --check` were verified;
- the context-menu action, rendered badge, persistence after reload, and a real
  Explorer rename/delete remain manual smoke tests after **Developer: Reload
  Window**.

### 2026-08-03 — Test usages became visually distinct in the References picker

Intent:

- make test-only references unmistakable while keeping the production usages
  at the top of the picker visually dominant;
- preserve the existing grouped QuickPick workflow and its keyboard navigation.

Implementation:

- gave every item in **Test usages** a purple beaker icon and added the same
  icon to the group separator;
- added theme-aware workbench styles that give test rows a quiet purple tint
  and a persistent two-pixel stripe;
- preserved VS Code's native focused and selected backgrounds, while retaining
  the stripe and beaker during keyboard navigation.

Decisions and lessons:

- VS Code's public QuickPick API supports a colored item icon but not per-item
  foreground or background colors;
- the row tint therefore uses the existing Custom CSS and JS Loader and targets
  the beaker marker emitted only for test-reference items; the icon remains a
  native fallback if workbench injection is unavailable;
- purple is deliberately categorical rather than green or red, which could
  imply that a test has passed or failed.

Verification:

- JavaScript syntax, manifest parsing, the complete Smart References test
  suite, stylesheet marker wiring, live source symlinks, and `git diff --check`
  were verified;
- the rendered tint requires **Reload Custom CSS and JS**, a restart, and a real
  References picker smoke test, so the visual result is not claimed by
  repository checks alone.

### 2026-08-03 — File markers strengthened and test usages changed to green

Intent:

- make manually marked Explorer files much easier to spot than the original
  small amber dot;
- follow the familiar green visual language for test-related rows;
- clear the VS Code corruption warning without blessing unrelated application
  modifications.

Implementation:

- changed the native Explorer decoration to a coral-red `⚑` and registered a
  dedicated theme color with contrast-adjusted light and high-contrast values;
- changed test-reference beakers, row tints, and left stripes from purple to a
  quiet green in both dark and light themes;
- diagnosed VS Code's recorded SHA-256 checksums against every protected file
  before using the tracked checksum repair.

Decisions and lessons:

- a dedicated contributed theme color allows the marker to use coral red rather
  than borrowing VS Code's semantic error color;
- green identifies the category as tests but deliberately stays subdued so test
  usages remain lower priority than production usages;
- only `workbench.html` differed, and it contained the expected Custom CSS and
  JS Loader markers and injected stylesheet. No other protected application
  file was accepted as modified.

Verification:

- JavaScript syntax, manifest parsing and color wiring, the complete Smart
  References test suite, live symlinks, injected-workbench markers, protected
  checksum comparison, and `git diff --check` were checked;
- the final rendered flag and green tint still require a restarted VS Code
  window for visual confirmation.
