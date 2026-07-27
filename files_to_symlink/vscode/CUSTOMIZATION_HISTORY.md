# VS Code customization intent, decisions, and history

Last reviewed: 2026-07-26

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
- the APC scripts or CSS embedded in the settings

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
| Local extensions | `extensions/local.*` | `~/.vscode/extensions/local.*` |
| Marketplace list | `marketplace_extensions.txt` | Installed by the `code` CLI |
| Install orchestration | `install_vscode.sh` | Called directly or by root `symlink.sh` |

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
- APC CSS tightens the workbench UI and corrects light/dark tab text;
- an APC script preserves horizontal editor scroll around pointer and
  selection changes;
- PHP uses Intelephense for core language intelligence, with selected
  Intelephense CodeLens features disabled where the local extension supplies
  the intended navigation;
- generated, compiled, vendor, helper, and framework-cache paths are separated
  carefully between indexing, diagnostics, references, and Sonar analysis.
- Prettier owns JavaScript, TypeScript, and JSON formatting, Laravel Pint owns
  PHP formatting, and JavaScript/TypeScript imports update automatically when
  files move.

The APC layer modifies VS Code's workbench at a DOM/CSS level. It is inherently
more fragile than an extension API and must be rechecked after VS Code updates.

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
| double `Shift` | Quick file open |
| `Cmd+Left` / `Cmd+Right` | Previous/next editor |

Global keybindings remain active inside a Remote SSH window. The extension that
owns a globally bound command must therefore be available in the correct
extension host; otherwise VS Code reports `command '<id>' not found`.

### Marketplace extensions

The marketplace list supplies broad capabilities that should not be
reimplemented locally. Important examples include Intelephense, PHP DocBlocker,
Laravel Pint, the PhpStorm icon theme, GitLens, Error Lens, SonarLint, Vue
tooling, and APC.

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
- grouped reference picking with generated helper locations filtered out;
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

APC CSS and DOM scripts are acceptable for the desired interface, but they are
version-sensitive. After a VS Code update, inspect tab styling and horizontal
scroll behavior before changing unrelated editor settings to compensate.

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
```

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
- after APC or VS Code upgrades, check compact tabs, light/dark contrast, and
  horizontal-scroll restoration.

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
