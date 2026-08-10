# VS Code customization intent, decisions, and history

Last reviewed: 2026-08-10

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
- anything under `User/snippets/`
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
| Snippets | `User/snippets/` | `~/Library/Application Support/Code/User/snippets` (directory symlink) |
| Workbench CSS and JS | `User/custom-*.css`, `User/custom-*.js` | `~/Library/Application Support/Code/User/`, injected by the loader |
| Local extensions | `extensions/local.*` | `~/.vscode/extensions/local.*` |
| Marketplace list | `marketplace_extensions.txt` | Installed by the `code` CLI |
| Install orchestration | `install_vscode.sh` | Called directly or by root `symlink.sh` |
| Checksum repair | `fix_vscode_checksums.sh` | Rewrites `product.json` in the VS Code application directory |

`install_vscode.sh` backs up existing live files, creates the symlinks, and
registers the local extensions in VS Code's extension registry. Entries in
`User/` are linked whether they are files or directories, and a directory is
linked whole rather than walked, so a snippet file added to the repository copy
appears in VS Code without rerunning the installer. Folder suffixes
such as `local.smart-references-0.0.1` are stable installation paths; they do
not need to change when the version inside `package.json` changes. Renaming
them also requires coordinated installer and registry changes, so a manifest
version bump alone must not rename a folder.

After changing a local extension manifest version, rerun `install_vscode.sh`
before reloading VS Code. The installer updates `extensions.json` and removes
stale `local.*` entries from `.obsolete`; a symlink alone does not refresh
those registry records.

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

- JetBrains Mono, compact tabs, no minimap, no sticky scroll, and an eight-tab
  limit per editor group;
- the integrated terminal uses JetBrainsMono Nerd Font Mono so Starship's
  monochrome language and Git glyphs render as single-cell symbols, while the
  editor keeps the ordinary JetBrains Mono family;
- preview tabs remain enabled, while the local preview extension pins a tab
  when it is deliberately clicked;
- the status bar starts hidden and can be toggled from an editor-title action;
- injected workbench CSS tightens the UI, corrects light/dark tab text, rounds
  the tabs and rings the active one, and outlines the quick input widget with a
  light or dark border per theme;
- every theme in use carries a full tab palette, because the two dark themes
  ship active, inactive, hover, and bar backgrounds that are all one colour;
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

### Snippets and PhpStorm live templates

`User/snippets/php.json` carries the PhpStorm PHP live templates: `pubf`, the
rest of the visibility/static family, the loop and include abbreviations, and
the personal Laravel and Pest ones. Typing an abbreviation and pressing Tab
expands it, which is the whole point of the port.

That Tab behavior is two settings, not one, because Tab means different things
depending on whether the suggest widget is open:

- `editor.tabCompletion: "onlySnippets"` binds Tab to snippet insertion when the
  word before the cursor is a prefix and no widget is showing;
- `editor.snippetSuggestions: "top"` sorts snippets above language-server
  proposals, which is what decides the case where the widget *is* open —
  `acceptSelectedSuggestion` outranks snippet insertion on that key, so the
  snippet has to be the highlighted row rather than merely available.

Three constraints are structural rather than stylistic:

- **VS Code scopes snippets by language; PhpStorm scopes them by syntax.** A
  PhpStorm group can rebind `pubf` to the bodyless form inside an interface. One
  language file cannot, so declaration forms keep the distinct abbreviations
  (`pf`, `fun`, `ps`) that the PhpStorm group already gave them.
- **An abbreviation containing a space can never be Tab-expanded**, in either
  editor, because the expansion reads the word before the cursor. PhpStorm's
  `query logs`, `facade template`, and `validation callback` were reachable only
  from its template list; they are run together here.
- **Every PHP `$` must be written `\$` in a snippet body.** An unescaped `$fail`
  is valid snippet syntax for an unknown variable, and VS Code turns it into a
  placeholder holding the word `fail` — the sigil disappears and nothing reports
  an error.

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
- grouped reference picking with generated helper locations filtered out, a
  labelled rule introducing every group, and test usages tinted and sorted last;
- PHP-aware copy/paste that can copy a variable token or replace a target
  variable with a copied expression;
- smart Backspace, Enter, equals insertion, and chain splitting;
- JSON/JSONC smart Enter that inserts a missing comma before starting the next
  item while preserving native indentation;
- parent and trait method navigation and custom reference CodeLens counts;
- Laravel route-controller, Gate/policy, policy-method, and translation-key
  references;
- Laravel `config('file.nested.key')` definition navigation to the exact key in
  `config/file.php`, and `Log::channel('name')` to that channel in
  `config/logging.php`;
- Laravel macro navigation in both directions: `Rule::uniqueCaseInsensitive(...)`
  opens the `Rule::macro('uniqueCaseInsensitive', ...)` registration, and the
  name in that registration finds every call site;
- materializing selected PHP inlay hints into source code;
- adding a more precise Laravel builder type to applicable callbacks;
- fixing one-argument Laravel Collection PHPDoc types by adding their missing
  integer key type through Option+Enter;
- extending PHPDoc syntax highlighting so spaced generic arguments, annotation
  variables, and nullable markers keep meaningful type/variable scopes;
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
emits `@property-read` types, declares `@method` signatures for Macroable
registrations, and adds selected Restify `self` to `static` overrides.

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

Macros are the same shape of problem in the opposite direction: the method is
added at runtime, so no stub declares it and Intelephense returns no definition
at all. `laravelMacroNavigation.js` closes the loop from both ends.

From a `Foo::bar(` or `$foo->bar(` call it locates the `::macro('bar', ...)`
registration, running only after native resolution has already come back empty
so ordinary navigation never pays for it. From the name inside that
registration it finds the call sites, joining the other custom reference
providers. Call sites are matched against source with comments, strings, and
heredoc bodies blanked out, because the usage example in a docblock above a
registration is documentation rather than a reference.

Registrations are found through a workspace-wide index built once and kept until
a PHP file changes, not by re-reading first-party source on every lookup. "Native
resolution came back empty" is a common state in a Laravel project, not a rare
one, and most of those lookups name something no registration will ever match, so
the miss is the case that has to be cheap.

Locating the registration is only half of it. A macro with no declared return
type leaves everything chained onto the call unresolvable too, which is why the
generator declares `@method` tags for the macros it finds — the two halves read
the same registration scan.

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

### 11. A resolved theme colour is not a painted one

`workbench.colorCustomizations` is an input to VS Code's colour registry, not a
promise that any rule consumes the result. VS Code's **modern workbench style** —
the `.style-override` class on `.monaco-workbench` — repaints parts of the UI
from its own `--modern-ui-*` variables with `!important`, and those are derived
from `foreground` rather than from the semantic colour for the element. While it
is on, `tab.activeBackground` and `tab.selectedBackground` reach nothing.

This failure is silent in the worst way: the setting is valid, the key is
correct, and **Developer: Generate Color Theme From Current Settings** reports it
live, because that command shows what the registry resolved and not what any
rule used. Treat it as necessary evidence, never sufficient.

The rule to work by: **when a colour setting changes and the pixels do not, the
setting is not the one being drawn.** Stop tuning it and go find the declaration
that wins — see the playbook below. Three rounds were spent tuning a value that
nothing read, when one `grep` over VS Code's own stylesheet named the winner.

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
node --check files_to_symlink/vscode/extensions/local.smart-references-0.0.1/laravelMacroNavigation.js
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

### Proving a snippet expands to the PHP it claims

Snippet bodies fail silently, and JSON validity proves nothing about them. An
unescaped `$fail` is valid snippet syntax for an unknown variable, so VS Code
drops the sigil and leaves a placeholder holding the word `fail`; a stray `}`
closes a placeholder early and swallows the rest of the line. Both look correct
in the source. Render the bodies and read the PHP instead:

```bash
node files_to_symlink/vscode/render_snippets.js \
  files_to_symlink/vscode/User/snippets/php.json
```

Every `$` that belongs to PHP has to survive into the output, and every body has
to end where it should. The renderer implements the part of VS Code's snippet
grammar that can change emitted text — escapes, tabstops, and placeholder
defaults including nested ones — so its output is the expansion rather than a
guess at it.

### Proving a colour actually reaches the pixels

For any change to `workbench.colorCustomizations` or to injected CSS, three
checks in this order. The first two are cheap and the third is decisive.

Is the merged value live? This reads the registry, so it proves the setting was
parsed and matched the active theme — nothing more:

```text
Cmd+Shift+P → Developer: Generate Color Theme From Current Settings
```

Which declaration actually wins? Search VS Code's own bundled stylesheet for
rules that both match the element and set the property. This is the step that
finds `!important` overrides and `--modern-ui-*` variables, and it is where to
start whenever a setting appears to do nothing:

```bash
APP="/Applications/Visual Studio Code.app/Contents/Resources/app/out"
grep -oE '[^{}]*\.tab\.active[^{}]*\{[^}]*background[^}]*\}' \
  "$APP/vs/workbench/workbench.desktop.main.css"
grep -ohE '\-\-modern-ui-[a-z-]*: *[^;}]*' "$APP/vs/workbench/workbench.desktop.main.css" | sort -u
```

What is on screen? A screenshot is measurable evidence, not an impression.
Decode it and read the pixels; the scratch PNG decoder used for this is ~40
lines of `zlib` plus the PNG filter loop, and comparing a before and after
capture settles "nothing changed" in one step. A histogram of the region, plus a
vertical slice through it, gives the fill, any border, and the surface behind it:

```text
bar #313445 · ring #747681 · fill #5d5f6c   → fill is 1.98:1 against the bar
```

Then check that number against the design target rather than against taste. Two
captures that differ in a setting but agree to the byte are proof the setting is
not the one being drawn.

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

### 2026-08-04 — Cmd+B gained Laravel config-key definitions

Intent:

- make `Cmd+B` on a Laravel config key such as
  `config('management.all_backend_vm_names')` open the matching array key in
  `config/management.php`, matching the useful PhpStorm behavior.

Implementation:

- added a pure Laravel config navigator that recognizes only the first string
  argument of `config()`;
- mapped the first dotted segment to `config/<segment>.php` and followed the
  remaining segments through direct PHP array keys, including nested arrays;
- resolved this focused Laravel convention before asking Intelephense for a
  normal definition, while preserving the existing definition/reference path
  for every non-matching cursor position;
- bumped `local.smart-references` to `0.0.11` and added focused unit coverage.

Decisions and lessons:

- Intelephense cannot infer Laravel's runtime config-string convention, so the
  missing target belongs in the existing Laravel navigation bridge rather than
  in a second language server or a Ribeit-specific path rule;
- both the config filename and array path are derived from the literal, and the
  workspace folder is resolved through VS Code URIs so local and Remote SSH
  workspaces use the same path;
- parsing is deliberately conservative: unrelated strings, missing config
  files, absent keys, and non-array intermediate segments fall back to normal
  navigation without changing source.

Verification:

- the new focused tests, JavaScript syntax checks, and the complete Smart
  References suite passed;
- a read-only fixture check against Ribeit's real `Infra.php` and
  `config/management.php` resolved `management.all_backend_vm_names` to line
  63 and selected the exact `all_backend_vm_names` key;
- `git diff --check`, manifest parsing, installed-symlink checks, and the broader
  repository checks were run after the change;
- the active VS Code window still requires **Developer: Reload Window** and one
  real `Cmd+B` smoke test; repository checks do not claim that visual/runtime
  interaction.

### 2026-08-04 — Open-editor limit reduced to eight tabs

Intent:

- keep each editor group to eight open tabs and automatically make room when a
  ninth editor is opened.

Implementation and decision:

- changed `workbench.editor.limit.value` from `10` to `8` while preserving the
  existing per-editor-group scope and dirty-editor exclusion;
- VS Code evicts the least-recently-used eligible editor when the limit is
  exceeded. Unsaved editors remain protected, so the visible count may exceed
  eight when every eviction candidate is dirty.

Verification:

- `settings.json` parsed successfully as JSONC, the live settings symlink still
  resolved to this repository, and `git diff --check` passed;
- runtime eviction order requires reloading the VS Code window and opening a
  ninth clean editor, so that interaction is not claimed by static checks.

### 2026-08-04 — Option+Enter gained a Laravel Collection generic fix

Intent:

- turn the Intelephense warning on PHPDocs such as
  `Collection<ProcessedPage>` into an immediately actionable fix;
- keep the fix on the existing Option+Enter workflow rather than adding a new
  shortcut or command.

Implementation:

- extended the existing Smart References PHP code-action provider with **Add
  missing Collection key type (int)**;
- rewrote only the selected generic argument, producing
  `Collection<int, ProcessedPage>`;
- recognized imported, aliased, and fully qualified
  `Illuminate\Support\Collection` and
  `Illuminate\Database\Eloquent\Collection` types;
- isolated the PHPDoc matcher and edit calculation in
  `phpDocCollectionFix.js`, added focused tests, and bumped the extension to
  `0.0.12`.

Decisions and lessons:

- the action is limited to Laravel's known two-template Collection classes;
  an unrelated project class named `Collection` may validly accept one type
  and must not be rewritten;
- annotations that already have a top-level key/value pair are ignored, while
  commas nested inside array shapes do not masquerade as a second Collection
  argument;
- the code action is preferred but remains explicit: it appears only when
  Option+Enter is invoked on the relevant PHPDoc line and never edits a file in
  the background.

Verification:

- the focused test was observed failing before the implementation existed,
  then all focused and complete Smart References tests passed after wiring;
- a read-only check against Ribeit's live `ActivityService.php` ignored the
  already-correct `Collection<int, ProcessedPage>` annotation and produced
  `Collection<int, ProcessedMetadata>` for the remaining one-argument
  annotation;
- JavaScript syntax, manifest parsing, the live extension symlink and registry
  version, and `git diff --check` were verified;
- the visible Option+Enter interaction requires **Developer: Reload Window**
  and a manual invocation in the active Ribeit window.

### 2026-08-04 — PHPDoc generics and variables gained complete syntax scopes

Intent:

- stop valid PHPDocs such as `Collection<int, ProcessedPage> $mapped` from
  becoming base-comment gray after the space following a comma;
- make PHPDoc properties easier to scan by highlighting `$variables` normally
  and rendering nullable `?` markers as quiet type punctuation rather than red
  operators.

Root cause:

- VS Code's built-in PHP grammar ends its PHPDoc type region at the first
  whitespace and has no generic context that can span `Collection<int,
  ProcessedPage>`;
- annotation variables therefore fall back to the base comment scope, and the
  built-in nullable marker inherits the theme's general operator color.

Implementation:

- contributed `syntaxes/phpdoc.tmLanguage.json` from `local.smart-references`
  as a left-priority injection into `source.php` PHPDoc comments;
- kept generic contexts open through whitespace and nested generic arguments;
- assigned standard PHP class, scalar type, variable, delimiter, and nullable
  punctuation scopes instead of hard-coded Monokai colors;
- added manifest/grammar/regex regression tests and bumped the extension to
  `0.0.13`.

Decisions and lessons:

- this is a TextMate grammar boundary, not an Intelephense type-analysis or
  Custom CSS problem; a syntax injection is the smallest native mechanism;
- standard scopes preserve compatibility with other themes and make **Developer:
  Inspect Editor Tokens and Scopes** useful for future diagnosis;
- the injection is limited to `comment.block.documentation.phpdoc.php`, so
  ordinary comments and executable PHP tokens are unchanged.

Verification:

- the new contribution test failed before the grammar existed and passed after
  it was registered;
- JSON parsing and every injected regex were checked;
- the actual VS Code PHP grammar was tokenized together with the injection:
  `ProcessedPage` received `entity.name.type.class.php`, `$mapped` and
  `$exported_at` received `variable.other.readwrite.php`, and `?` received
  `punctuation.definition.nullable.phpdoc.php`;
- the complete Smart References suite, manifest parsing, live extension link
  and registered version, and `git diff --check` were verified;
- the rendered colors still require **Developer: Reload Window** in the active
  editor; token scopes prove grammar behavior but not the final pixels.

### 2026-08-04 — PHPDoc grammar live registration was repaired

Intent:

- fix the PHPDoc colors after both **Developer: Reload Window** and a complete
  VS Code relaunch left the old scopes visible.

Root cause:

- the tracked extension manifest was `0.0.13`, but VS Code's live
  `extensions.json` still registered `local.smart-references` as `0.0.10`;
- `.obsolete` also contained `local.smart-references-0.0.13`, and the shared
  process log reported that version as removed;
- the existing extension host could still activate JavaScript commands from
  the stable symlink, but VS Code did not load the new grammar contribution
  from a manifest version it considered removed.

Implementation:

- reran the existing `install_vscode.sh` deployment path rather than editing
  the live registry as an independent configuration;
- documented that every local manifest version change must be followed by the
  installer, even though the symlink folder name remains stable.

Decisions and lessons:

- standalone TextMate tokenization verifies the grammar itself, but does not
  prove the active VS Code extension scanner accepted its contribution;
- `code --list-extensions --show-versions` was not sufficient evidence here:
  the registry version and `.obsolete` state are the relevant deployment
  boundaries.

Verification:

- the installer completed with `VS Code dotfiles links installed.`;
- the live registry now records `local.smart-references` as `0.0.13` at the
  repository-backed stable symlink path;
- `.obsolete` no longer contains `local.smart-references-0.0.13`, and the Code
  CLI reports `local.smart-references@0.0.13`;
- a fresh reload and visual inspection remain required because the currently
  running window started before the registry repair.

### 2026-08-04 — PHPDoc injection now targets the live HTML-PHP root grammar

Intent:

- correct the still-dark PHPDoc generic tail after registry repair and repeated
  VS Code reloads confirmed the injection was not reaching the document.

Root cause:

- **Developer: Inspect Editor Tokens and Scopes** showed the affected token had
  only `comment.block.documentation.phpdoc.php` beneath a `text.html.php` root;
- the extension injected only into `source.php`. Although `source.php` appeared
  in the token's nested scope stack, VS Code attaches injection contributions
  to the selected root grammar, which was `text.html.php` for normal `.php`
  files containing `<?php` blocks;
- the earlier standalone check loaded `source.php` directly and therefore did
  not reproduce the live grammar-root selection.

Implementation:

- added `text.html.php` beside `source.php` in the grammar contribution's
  `injectTo` targets;
- expanded the manifest regression test and bumped Smart References to
  `0.0.14`;
- deployed the new manifest through `install_vscode.sh`.

Decisions and lessons:

- a nested TextMate scope is not equivalent to the grammar root used for
  injection registration;
- future syntax tests must reproduce the root grammar shown by VS Code's token
  inspector, not merely tokenize the embedded language grammar in isolation.

Verification:

- the manifest test failed with actual `['source.php']` versus expected
  `['source.php', 'text.html.php']` before the change, then passed afterward;
- the real VS Code `text.html.php` grammar, its embedded `source.php` grammar,
  and the injection were tokenized together: `ProcessedMetadata` received
  `entity.name.type.class.php` and `$mapped` received
  `variable.other.readwrite.php` under the same `text.html.php` root shown in
  the inspector;
- all 45 Smart References tests passed, both JSON files parsed, and the
  installer completed;
- the final rendered colors still require one reload and visual confirmation
  in the active editor.

### 2026-08-04 — VS Code terminal gained a Nerd Font for Starship glyphs

Intent:

- render the selected compact PHP glyph and the existing Git branch glyph in
  VS Code's integrated terminal without changing the editor typeface.

Root cause:

- the terminal inherited ordinary JetBrains Mono, which does not contain the
  private-use Nerd Font glyphs `` and ``;
- Ghostty could display those symbols through its own fallback behavior, while
  VS Code rendered both as missing-glyph boxes.

Implementation:

- installed Homebrew cask `font-jetbrains-mono-nerd-font` version `3.5.0`;
- set `terminal.integrated.fontFamily` to the registered monospaced family
  `JetBrainsMono Nerd Font Mono`;
- left `editor.fontFamily` on ordinary `JetBrains Mono`.

Decisions and lessons:

- use the Mono Nerd Font variant for terminal cell alignment rather than the
  proportional variant;
- prompt glyph verification must include VS Code's terminal as well as
  Ghostty because the two applications have different font fallback behavior.

Verification:

- Homebrew reported the cask installed successfully;
- Fontconfig read `JetBrainsMonoNerdFontMono-Regular.ttf` as family
  `JetBrainsMono Nerd Font Mono`, style `Regular`;
- the repository and live VS Code settings remain the same symlinked file;
- a new integrated terminal is required for the visible glyph check because
  existing terminal canvases can retain their original font selection.

### 2026-08-04 — References picker groups labelled, spaced, and reordered

Intent:

- introduce each References group the same way, so **Usages**, **Top level
  usages**, and **Test usages** all begin with a labelled rule rather than only
  the two secondary groups;
- keep test references at the very bottom of the picker;
- separate the two-line reference rows, which ran together;
- drop the green left stripe on test rows.

Implementation:

- moved **Test usages** to the last group index and **Top level usages** to the
  middle, and checked the test predicate first, so a top-level reference inside
  a test file still sorts with the tests;
- emitted a separator for the first group as well, and removed the `$(beaker)`
  prefix from the test separator label;
- replaced the group separators with header items, so each of Usages, Top level
  usages, and Test usages occupies a 22px row of its own under a full-width rule,
  drawn as a bare label with no fill and no highlight in any state, and marked
  those items with the `blank` codicon so the stylesheet can recognise the row;
- rebuilt the picker on `createQuickPick`, which the header items require: they
  are ordinary rows, so navigation is walked past them in the direction it
  arrived from, they are dropped from the list as soon as a query is typed, and
  their cards are made inert to the mouse;
- drew each two-line picker row as an inset card: the row's inner element gained
  a faint background, a 5px radius, and a vertical margin, and hover, focus, and
  the focus outline were moved onto the card so the highlight no longer paints
  full width behind it;
- compressed the two text lines to 27px by trimming the row icon, the
  description codicons, and both line-heights together, and spent the 17px that
  freed on 5px of padding inside a 37px card and a 7px gutter between cards;
- pulled the card in by 12px while the vertical scrollbar is visible, so the
  scrollbar stops overlapping the cards but short lists keep full-width ones;
- deleted the inset stripe rules, moved the test tint onto the card, and kept the
  green beaker;
- inverted the card fill from a light tile to a slightly recessed dark one, wrote
  the hover out explicitly instead of taking `--vscode-list-hoverBackground`,
  which several themes leave invisible against a card that has its own fill, and
  gave the filename weight over the description and the code line beside it;
- darkened the test tint to match, and gave test cards their own hover: the
  generic hover is more specific than the tint, so without a matching rule the
  green disappeared exactly while the pointer was on the row;
- reduced focus to an outline, so the row a QuickPick focuses on open no longer
  looks permanently highlighted, and made hover the only thing that brightens a
  card, on the focused row as much as on any other;
- dropped the rule above the first group, which has nothing to divide it from,
  and made the test tint unconditional — with no focus background left to sit
  under, its `:not(.focused)` guard would have turned a focused test card grey;
- coloured the group headings orange at weight 700, per theme like the beaker
  greens, rather than leaving them on `pickerGroup.foreground`, which most themes
  keep quiet enough to disappear against the cards;
- bumped `local.smart-references` to `0.0.16`.

Decisions and lessons:

- a QuickPick separator without buttons is not rendered as its own row: VS Code
  draws its rule on the following row and prints the label in a small
  right-aligned span. That span is plain text, which is why the previous
  `$(beaker)` prefix appeared literally in the picker;
- an extension cannot obtain a standalone group *separator* at all.
  `setElements` returns early for a separator unless it carries buttons, and the
  extension host builds `{type: "separator", label}` for every separator in both
  `showQuickPick` and `createQuickPick`, forwarding `buttons` only for ordinary
  items. A header on its own row therefore has to be an ordinary item, with the
  focus handling that implies. An intermediate attempt carved the label out of
  the following row instead; it kept navigation untouched but left the first card
  of each group visibly tighter than the rest, and headers as items replaced it;
- a rule under `.quick-input-widget` reaches every picker in the workbench, not
  only this one. The carved-out label positioned `.quick-input-list-separator`
  absolutely, which would have displaced the group labels in any other QuickPick
  that uses separators. Prefer a hook the extension itself emits — the `blank`
  codicon here, the beaker for test rows — over a class VS Code puts on rows we
  do not own;
- card height and gutter are one budget, not two: the row is a fixed 44px, so
  every pixel of card is a pixel of gutter. Asking for a taller card and a larger
  gap at the same time is not satisfiable in a QuickPick;
- and the gutter is the half that matters. A 39px card over a 5px gutter was
  tried first and read as a solid wall — with a filled card, adjacent entries are
  told apart by the space between them, not by the size of the block;
- three separate floors set the height of the first text line, and trimming any
  one alone does nothing: the row icon is prepended into that line rather than
  placed beside both, the description codicons carry `font: ... 16px/1 codicon`
  and so bring their own line-height, and only then does the inherited text
  line-height matter. Trimming all three brought the two lines to 27px, which is
  what finally paid for both padding and gutter;
- 27px of text, 10px of padding, and a 7px gutter is the end of the 44px row.
  Padding inside the card, space between cards, and legible text are one budget
  in a QuickPick. Moving the headers onto their own 22px rows did not enlarge
  that budget, but it did stop the first card of each group from paying for a
  label out of it, so every reference card now gets the full amount. Anything
  beyond this needs the webview view, where the extension owns the row height;
- an absolutely positioned child of the card escapes the card's own
  `overflow: hidden` because the tree makes `.monaco-tl-row` relative, and that
  ancestor sits above both clipping boxes. That is what lets the label sit in
  the strip while the card still clips its own contents;
- picker row height is decided in TypeScript — 22px for a label, 44px once an
  item carries a detail — and written to each row as an inline style, so it
  cannot be raised from injected CSS: the list still positions the next row at
  the original offset and a taller row would overlap it. Spacing has to be
  reclaimed from inside the row instead;
- a first attempt that only tightened line-heights barely moved anything, for a
  reason worth remembering: the item icon is prepended into the first text line
  rather than placed beside both lines, so that line is 22px tall no matter what
  line-height it inherits. The two lines already filled the 44px row, which is
  why the entries ran together. Trimming the icon is the actual lever;
- whitespace between transparent rows is invisible in any case. The card gives
  the eye an edge, so a 7px gutter separates better than a larger gap between
  two pieces of unbounded text;
- the card rules are scoped to rows whose detail label is not inline-hidden, so
  single-line pickers such as the command palette keep native density;
- the card carries no explicit height. It hugs its content, so the gutter is
  whatever the row has left over and stays correct if VS Code changes its row
  metrics;
- the stripe was removed rather than recoloured: with every group now carrying
  its own labelled rule, a second per-row accent marked the same thing twice;
- the checksum repair must be the last action before restarting. The loader
  stamps a fresh `VSCODE-CUSTOM-CSS-SESSION-ID` UUID into `workbench.html` on
  every patch, so each **Reload Custom CSS and JS** produces a different hash
  even when the stylesheet is byte-identical. Running the reload again after the
  repair — the natural reaction to still seeing the warning — silently
  re-invalidates it, which is exactly what happened here.

Verification:

- `node --check extension.js` passed, `package.json` parsed, and all 45 Smart
  References tests passed;
- the separator, row-height, and detail-label class names in the rules were read
  back out of the installed `workbench.desktop.main.css` and
  `workbench.desktop.main.js` rather than assumed;
- both edited files are the live symlink targets;
- the rendered result requires **Reload Custom CSS and JS**, a restart, and a
  real References picker, so the visual outcome is not claimed here;
- that reload raised the corruption warning again, as expected. Only
  `workbench.html` differed, it carried the loader marker and the new rules and
  no longer carried the stripe rule, and `fix_vscode_checksums.sh` then brought
  all ten checksums back into agreement.

### 2026-08-05 — Cmd+B follows Log::channel, and picker descriptions brightened

Intent:

- make `Cmd+B` on `Log::channel('facebook_sync')` open that channel in
  `config/logging.php`, the same way it already opens a `config()` key;
- make the filename legible in pickers that put it in the row's description.

Implementation:

- recognized `Log::channel('name')` in the existing Laravel config navigator and
  mapped it to the key `logging.channels.name`, which the rest of the navigator
  already knows how to open;
- matched the facade imported, root-namespaced, and fully qualified, since all
  three spellings appear in practice, while leaving any other class that happens
  to have a `channel()` method alone;
- raised quick-pick descriptions from `opacity: .7` to `.95` in dark themes;
- coloured Quick Search's filenames the same orange as the References group
  headings, through `.quick-input-list-separator-as-item`;
- excluded separator rows from all seventeen References card selectors, which is
  what the orange actually needed: Quick Search's file rows were matching the
  card rules and taking their filename colour;
- wrote every picker-wide rule against both `.quick-input-list` and
  `.quick-input-tree`, which is correct for pickers built on the tree widget,
  though it was not what Quick Search needed;
- dropped the focus background in every picker, leaving VS Code's focus outline
  to say where focus is, so a picker no longer opens with its first row looking
  hovered;
- removed the rule above the References group headings;
- bumped `local.smart-references` to `0.0.17` and added unit coverage;
- rewrote the quick-input anchor to correct the widget synchronously, from a
  MutationObserver and a ResizeObserver, on every layout rather than only when
  the picker is shown.

Decisions and lessons:

- `Log::channel()` belongs in the config navigator rather than in a rule of its
  own: Laravel resolves the channel name through `config('logging.channels.…')`,
  so the literal names a config key exactly as directly as `config()` does, and
  the file, key walk, and workspace resolution are all already there;
- VS Code dims a quick-pick description and restores it only on the focused row.
  Any picker that puts a location in the description therefore shows the
  filename as the least legible text on the row. The rule is deliberately not
  scoped to one picker, since the problem is not specific to one;
- in the References picker this brightens the method name beside the filename,
  which keeps its own emphasis from being bold rather than from being brighter
  than its neighbour;
- **a QuickPick is backed by one of two different widgets, with entirely
  separate class namespaces.** `.quick-input-list` carries
  `.quick-input-list-entry`, `.quick-input-list-rows`, `.quick-input-list-icon`;
  `.quick-input-tree` carries `.quick-input-tree-entry`,
  `.quick-input-tree-rows`, `.quick-input-tree-icon`. A picker created with
  `useSeparators: true` gets the tree, everything else — including every
  extension quick pick, so all of Smart References — gets the list. A rule
  written against one namespace silently does nothing in the other, which is
  exactly how the first attempt at Quick Search's filenames failed: the CSS was
  injected, the stylesheet parsed, the selector was valid, and it matched no
  element on the page. Any rule intended for pickers in general must list both;
- **the two-widget split was not why the orange failed, and the correction is
  worth recording as plainly as the fact.** Quick Search is an ordinary
  `.quick-input-list`, its file rows are `separator-as-item`, and the very first
  selector written for them was correct. What defeated it was a rule of ours: the
  References "make the filename prominent" rule selects any row whose detail
  label is not inline-hidden, and a separator row carries a detail element that
  is never hidden, so Quick Search's file rows matched it — at specificity 11
  against the orange rule's 6. Its `--vscode-quickInput-foreground` was the grey
  that kept appearing. The card fill, padding, and line-height trims were landing
  on those rows too;
- so the References card selectors now exclude separator rows explicitly. A
  predicate meant to say "our two-line reference row" was really saying "any row
  with a visible detail", and separator rows satisfy that by construction;
- the picker appeared to jump for two separate reasons, and both were in the
  anchor script. It deferred its correction into `requestAnimationFrame` plus a
  60ms timeout, so VS Code's own position was painted first and the widget then
  moved; and it re-anchored only on the hidden-to-visible transition, so every
  later layout — typing into Quick Search is enough to cause one — was left where
  VS Code put it. A MutationObserver callback is a microtask and therefore runs
  after VS Code's layout writes but before the browser paints, which is the only
  place this correction can go without a visible frame at the wrong position;
- the price is that the picker can no longer be dragged elsewhere: a drag is a
  layout write like any other and is undone on the next microtask. That matches
  the intent of anchoring to the pill, but it is a deliberate loss;
- do not mistake VS Code's opening animation for a jerk. `.style-override
  .monaco-enable-motion` gives the widget a 250ms `quick-input-widget-open`
  animation from `transform-origin: top center`, so `getBoundingClientRect()`
  reports a moving box for a quarter second after every open while the layout
  position never changes. Measure `style.left` when the question is placement;
- when a selector looks right and does nothing, read the DOM rather than
  theorise. Three rounds went into hypotheses — separator shape, then widget
  namespace — that a single look at the rendered row would have settled. VS Code
  can be launched with `--remote-debugging-port` against a scratch
  `--user-data-dir`, driven over CDP to open the picker, and asked directly for
  the row's classes and computed styles. Note that such an instance still loads
  the patched `workbench.html`, so the stale inlined stylesheet has to be removed
  from the page before any measurement means anything;
- clearing the focus background is safe for the References cards because it
  applies to the row, while their fill is painted on the card inside it. The two
  rules never meet.

Verification:

- `node --check`, `package.json` parsing, and all 48 Smart References tests,
  including four new ones covering the imported, root-namespaced, and fully
  qualified facade and the calls that must not match;
- resolved against the real files rather than fixtures alone:
  `Log::channel('facebook_sync')` in `SyncFacebookLoginDataJob.php` produced
  `logging.channels.facebook_sync` and located line 159 of that project's
  `config/logging.php`, while the `const LOG_CHANNEL = 'facebook_sync'` earlier
  in the same file correctly produced nothing;
- `git diff --check` was clean;
- the brightened description needs **Reload Custom CSS and JS**, a restart, and
  the checksum repair, so the rendered result is not claimed here.

### 2026-08-05 — Filesystem watching scoped away from vendor and generated storage

Intent:

- the laptop was running hot; investigation of sustained CPU turned up VS Code's
  main process and `kernel_task` as steady consumers alongside an unrelated
  terminal shader;
- `files.watcherExclude` had never been set, so VS Code watched every file the
  built-in defaults do not already cover.

Implementation:

- added `files.watcherExclude` to `User/settings.json` covering `vendor`,
  `node_modules`, `.git`, `storage/clockwork`, `storage/debugbar`,
  `storage/framework`, `storage/logs`, `bootstrap/cache`, `dist`, `.output`,
  and `target`.

Decisions and lessons:

- VS Code's default watcher exclusions are narrower than they look: only
  `**/node_modules/*/**` and `**/.git/objects/**`. For a PHP project that leaves
  the whole of `vendor/` and every generated `storage/` tree watched;
- this follows decision 6. The watcher is a distinct consumer from search and
  from Intelephense indexing, and is configured for its own purpose. Excluding
  `vendor/` from watching does not remove it from Intelephense, which still
  indexes it for completion. `vendor/` changes only on `composer install`;
- `storage/app` is deliberately still watched. Real source lives there, for
  example `storage/app/scripts`, which is tracked in git;
- `storage/clockwork` and `storage/debugbar` are profiler output and are pure
  churn: 10,251 and 998 files respectively in `spro-marketing`.

Measurements taken before the change, with `find`:

| project | vendor/ | storage/ | unguarded by defaults |
| --- | --- | --- | --- |
| `spro-marketing` | 160,604 | 18,206 | 178,810 |
| `ribeit-api` | 21,937 | 3,220 | 25,157 |

Verification evidence:

- `files_to_symlink/vscode/User/settings.json` parses as JSON after comment and
  trailing-comma stripping; 127 top-level keys, 11 `files.watcherExclude`
  entries;
- `~/Library/Application Support/Code/User/settings.json` confirmed to be a
  symlink back to the repository copy;
- `bash -n symlink.sh`, `bash -n files_to_symlink/vscode/install_vscode.sh`,
  `bash -n files_to_symlink/vscode/install_marketplace_extensions.sh`, and
  `git diff --check` all clean.

Not verified: the CPU effect of the exclusion. It requires a VS Code window
reload and a like-for-like measurement that was not taken.

### 2026-08-05 — Unused language stacks and SonarLint removed

Intent:

- 109 extensions were installed against a repository whose active work is PHP,
  Laravel, JS/TS and Swift. Extension inventory was audited against the actual
  file types present under `~/dev`.

Implementation:

- removed 16 extensions: the Java stack (`redhat.java`, `vscjava.*` — pack,
  debug, dependency, test, maven, gradle), the C/C++ stack (`ms-vscode.cpptools`
  and its pack, themes, `cpp-devtools`, `cmake-tools`),
  `rust-lang.rust-analyzer`, `ms-vscode-remote.remote-wsl`, the remote extension
  pack, and `sonarsource.sonarlint-vscode`;
- reconciled `marketplace_extensions.txt` from 100 to 84 entries;
- deleted 61 lines of now-dead `sonarlint.*` configuration from
  `User/settings.json`.

Decisions and lessons:

- **Uninstalling an extension pack uninstalls its members.** Removing
  `ms-vscode-remote.vscode-remote-extensionpack` to make the `remote-wsl`
  removal stick also took `remote-ssh`, `remote-ssh-edit`, `remote-containers`,
  `remote-explorer` and `remote-server`. Those were reinstalled individually.
  Remove the unwanted member and leave the pack, or expect to restore the rest;
- **Audit against file types, not assumptions.** A scan of `~/dev` showed 618
  Swift files in `muxy` and `growee-mobile`, so Swift stayed, and
  `llvm-vs-code-extensions.lldb-dap` had to stay with it because the Swift
  extension depends on it. PowerShell was believed to be used in one project but
  is present in four (`ribeit-api`, `dfs-api`, `public-api`, `ribeit-ui`), so it
  stayed too. Java, Rust and C++ hits were scratch projects and third-party
  checkouts (`java-learning`, `hello-rust`, `SoftHSMv2`, `PKCS-11-Tutorials`);
- SonarLint was removed on the evidence of its own configuration: all 18
  configured rules were set to `off`, and those were its distinguishing ones —
  complexity (`php:S3776`), size (`php:S138`, `php:S1448`), naming (`php:S116`,
  `S100`, `S115`), duplication (`php:S1192`). With a long
  `analysisExcludesStandalone` list on top, what remained did not justify 331 MB
  and a bundled 119 MB JRE analysing every opened file;
- `code --uninstall-extension` reports failures for pack members already removed
  earlier in the same batch, and defers directory deletion until restart.
  `code --list-extensions` is the source of truth, not the extensions directory.

Verification evidence:

- extension count 109 → 93; the diff of `code --list-extensions` before and
  after contains exactly the 16 intended entries and nothing else;
- `swiftlang.swift-vscode`, `ms-vscode.powershell`, `graphql.vscode-graphql`,
  `bmewburn.vscode-intelephense-client`, `ms-vscode-remote.remote-ssh` and
  `ms-python.python` all confirmed still installed;
- `settings.json` parses as JSON after comment and trailing-comma stripping;
  125 keys, zero `sonarlint.*` keys, `files.watcherExclude` intact;
- `bash -n` clean on `symlink.sh`, `install_vscode.sh` and
  `install_marketplace_extensions.sh`; `git diff --check` clean.

Not done: `graphql.vscode-graphql` is used only by `spro-app` but remains
enabled globally at ~112 MB resident. Per-workspace enablement is stored in
`state.vscdb`, a binary SQLite file that cannot be version-controlled, so it is
a manual step: disable the extension globally, then use Enable (Workspace) in
`spro-app`. Keep `graphql.vscode-graphql-syntax` enabled everywhere; it is 1 MB
and provides only highlighting.

### 2026-08-05 — Cmd+B connects Laravel macros to their registration and back

Intent:

- make `Cmd+B` on `Rule::uniqueCaseInsensitive('companies', 'identification_number')`
  in a Restify repository open the `Rule::macro('uniqueCaseInsensitive', ...)`
  closure in `app/Providers/MacroServiceProvider.php`, and `Cmd+B` on the name
  in that registration list every call site — matching PhpStorm with Laravel
  Idea. `Macroable` installs the method at runtime, so the call names a method
  that exists in no class body and Intelephense can relate neither side to the
  other.

Implementation:

- added `laravelMacroNavigation.js` with pure helpers for both directions:
  recognizing a `Foo::bar(` or `$foo->bar(` call spanning the cursor, finding
  that name's `::macro('bar', ...)` registration, recognizing the cursor inside
  a registration's name literal, and listing that macro's call sites;
- resolved the definition direction in `goToDefinition` only on the branch where
  the language provider returned no usable definition, scanning
  `{app,routes,bootstrap,database,tests}/**/*.php` through `workspace.fs` with an
  `includes(name)` pre-filter;
- joined the reference direction to the existing custom providers in
  `getReferenceTargets`, widened to `resources` because a Request or Blueprint
  macro is reachable from Blade;
- matched call sites against source with comments, strings, and heredoc bodies
  blanked to spaces at their original offsets;
- bumped `local.smart-references` to `0.0.18` and added 22 focused tests.

Decisions and lessons:

- placement is the whole design. The config navigator has to run *before*
  Intelephense because a config key is a string literal the language server
  would resolve to nothing meaningful; a macro call is the opposite — the
  language server is simply empty, so running after it costs normal navigation
  nothing and cannot preempt a real definition;
- only the name *literal* opens the reverse direction, never the `macro`
  keyword. On the keyword Intelephense correctly resolves the real
  `Macroable::macro()`, and preempting that would be a regression;
- comment and string blanking is what separates references from text matches.
  This repository's own provider carries a usage example in the comment directly
  above the registration, and `UniqueCaseInsensitiveRule`'s docblock carries
  another; reporting either as a call site is worse than missing it. Strings are
  tracked in the same pass only because `'https://x'` would otherwise look like
  the start of a `//` comment, and heredocs because a quote inside raw SQL would
  otherwise blank the rest of the file;
- recognition is deliberately narrow: a call name must be both preceded by `::`
  or `->` and followed by `(`. A plain function call, a property read, and the
  `macro` method itself are all rejected, so a failed lookup falls through to the
  existing reference picker unchanged;
- `macro()` is matched positionally *and* with PHP 8 named arguments. The
  Ribeit provider switched to `macro(name: ..., macro: ...)` mid-change and the
  first implementation silently stopped finding it — a reminder that a call-shape
  assumption needs a fixture check against real source, not just unit tests. A
  registration that puts `macro:` first, closure and all, is still not matched;
  it falls back to ordinary navigation rather than guessing;
- the scan is bounded to first-party source. A macro registered inside `vendor/`
  is not found by design — that is a vendor method with real declarations of its
  own, and indexing vendor here would reintroduce the analysis cost this
  extension avoids everywhere else.

Verification:

- 22 new tests and the full Smart References suite pass (70 tests, 0 failures);
- `node --check` clean on `extension.js` and `laravelMacroNavigation.js`;
- a read-only fixture round trip against the real Ribeit files: the cursor at
  `app/Restify/Companies/CompanyRepository.php:192` resolved to
  `app/Providers/MacroServiceProvider.php:90` with `uniqueCaseInsensitive`
  selected, and that literal resolved back to 22 call sites across six Restify
  repositories, one trait, and the macro's own feature test — excluding both the
  comment on line 88 of the provider and the docblock example in
  `UniqueCaseInsensitiveRule`;
- the same check found every other macro in that provider and its call sites:
  `prefix` (15), `hasAdminPrefix` (2), `shouldLogActivity` (2), `creator` (37),
  `terminator` (5), `fs` (24), `vault` (8);
- `bash -n` on the three shell scripts and `git diff --check` are clean;
- not verified: the live editor. This needs **Developer: Reload Window** and one
  real `Cmd+B` in each direction; no repository check exercises the VS Code
  runtime.

### 2026-08-05 — Picker focus made visible again, reversing the outline-only rule

This entry reverses the "dropped the focus background in every picker" decision
of **2026-08-05 — Cmd+B follows Log::channel, and picker descriptions
brightened**. That decision was sound in its reasoning and wrong in its premise;
the earlier entry stands as written.

Intent:

- restore a visible active row in `Cmd+O` and every other plain picker. Arrowing
  through the project chooser changed almost nothing on screen: the row that
  Enter would open was identifiable only by hovering it.

Implementation:

- deleted the picker-wide rule that forced `.monaco-list-row.focused` and
  `.selected` to a transparent background in both quick-input widgets, which
  returns plain rows to VS Code's native painting of
  `quickInputList.focusBackground`;
- set that colour explicitly for the two dark themes, which had never defined it:
  `#6f6c71` for Monokai Pro and Catppuccin's own Surface2 `#626880`, each with
  `#f7f7f7` focus foreground;
- gave the References cards' focus outline a written-out dark-theme colour
  (`#cfccc7`), since the outline they rely on was not being drawn either.

Decisions and lessons:

- **the premise was the bug, not the reasoning.** "Let VS Code's own focus
  outline say where focus is" is a fine trade, but neither dark theme in use
  draws that outline: Monokai Pro never defines `list.focusOutline`, so
  `outline: 1px solid var(--vscode-list-focusOutline)` was invalid at
  computed-value time and produced no outline at all, and Catppuccin Noctis
  Frappé defines it as `#00000000`. Removing the fill removed the only remaining
  indicator. A rule that hands its job to a theme colour has to be checked
  against the themes actually in use;
- the fill was restored by *deleting* custom CSS rather than by writing more of
  it. The colour belongs in `workbench.colorCustomizations`, where the light
  themes had been declaring it correctly all along;
- Monokai Pro's own `list.activeSelectionBackground` and `list.hoverBackground`
  are the same value, `#fcfcfa0c` — white at 5% alpha. That is why a themed focus
  fill originally looked like hover: in this theme it *was* hover. The
  replacement is separated from hover by 2.11:1, so the auto-focused first row
  now reads as focused rather than as pointed at, which was the whole worry
  behind the original change;
- values were chosen against measured contrast, not by eye. Each fill is a little
  over 2:1 against the picker background it sits on while keeping `#f7f7f7` text
  above 4.5:1 — a brighter fill reads better as a bar and worse as a label, and
  that ceiling is what fixes the value;
- the outline colour is written per theme class in the stylesheet rather than set
  as `list.focusOutline`, which would add an outline to every focused row in the
  workbench, far past the picker.

Verification:

- `settings.json` parses after comment and trailing-comma stripping, 125 keys,
  with the two dark blocks now carrying `quickInputList.focusBackground` and
  `quickInputList.focusForeground`;
- the stylesheet's braces balance, the picker-wide transparent rule is gone, and
  the two remaining focus rules are the References cards and the group headers,
  both of which override the native fill through a more specific `:has()`
  selector and keep the treatments they already had;
- contrast computed from the sRGB values: Monokai Pro fill 2.05:1 against the
  picker with text at 4.83:1 and 2.11:1 against hover; Catppuccin fill 2.23:1
  with text at 5.14:1; the card outline 7.57:1 against the card;
- `git diff --check` clean;
- not verified: the rendered result. This needs **Reload Custom CSS and JS**, and
  the CSS change re-patches the workbench, so `fix_vscode_checksums.sh` and a
  restart are needed after it.

### 2026-08-05 — Dark tabs given a real active state

Intent:

- make the active editor tab readable at a glance. Neither dark theme drew one:
  the active tab, the inactive tabs, the tab bar, and the editor were all the
  same colour, so the only fill that ever appeared on the strip was hover — the
  tab under the pointer looked selected and the selected tab looked like nothing.

Implementation:

- gave both dark themes a full tab palette, the treatment the light themes
  already had: active, inactive, hover, and their unfocused counterparts;
- used each theme's own raised surface for the active fill — `#403e41` in
  Monokai Pro, Catppuccin's Surface0 `#414559` — each a little over 1.3:1 above
  the bar, with hover placed below active so it never competes with it;
- set `tab.border` transparent in both, since rounded tabs with a gap between
  them do not also need a vertical rule;
- added a 1px inset ring on the active tab in dark themes.

Decisions and lessons:

- **the themes were not underspecified, they were uniformly specified.** Monokai
  Pro sets every tab background to `#2d2a2e` and Catppuccin every one to
  `#303446`, in both cases the editor colour, and distinguish the active tab
  only through an edge strip and the label. Rounding the tabs made that worse:
  a 1px strip clipped to a 5px radius is most of a corner short of a shape;
- the ring is an inset `box-shadow`, not a border. `tab.activeBorder` and
  `tab.activeBorderTop` are strips along one edge rather than a border around
  the shape, and a real border would take 2px out of a row whose height is
  pinned at 26px. An inset shadow costs no layout and clips to the same radius
  as the fill;
- the ring is white at 14% rather than a literal per-theme colour, because the
  workbench exposes only `.vs-dark` and `.vs`: both dark themes share one class,
  so a fixed value could only ever suit one of them. Composited, it lands on each
  theme's own border colour anyway — exactly `#5b595c` over Monokai Pro's active
  tab, which is that theme's border, and `#5c5f70` over Catppuccin's, a shade off
  its Surface2. A translucent ring is self-adjusting where a literal is a guess;
- the tab bar itself was deliberately left at the editor colour. Recessing it
  would read as a well rather than a strip of floating tabs, which is a larger
  change than the one asked for and easy to add later;
- fills are gentle on purpose. Active sits 1.30–1.34:1 above the bar and the ring
  carries the definition, which is what keeps a full strip of tabs from turning
  into a row of competing blocks;
- **`tab.hoverBackground` is one colour for every hovered tab, the active one
  included.** The first cut set it below the active fill, which is unavoidable if
  it is also to lift an inactive tab off the bar — so pointing at the selected
  tab darkened it. VS Code has no colour for the hovered-active tab, so the lift
  moved into the stylesheet as a flat 5% white overlay, which raises whatever the
  fill happens to be and cannot invert. Ordering is now monotonic in both themes:
  bar < hover < active < active+hover;
- a screenshot is measurable evidence and was treated as such. Decoding the PNG
  and sampling the tab strip is what showed the ring had landed (`#747681` where
  `rgba(255,255,255,.14)` over the fill predicts `#737581`) while the fill still
  looked unchanged, and later that the fill *was* `#414559` under a white wash.
  Two rounds of guessing at causes were worth less than one histogram.

Verification:

- `settings.json` parses after comment and trailing-comma stripping, 125 keys,
  with ten tab colours now present in each dark block;
- the stylesheet's braces balance and the active-tab ring rule is in place;
- contrast computed from the sRGB values — Monokai Pro: active 1.34:1 against the
  bar, hover 1.14:1, ring 2.04:1 against the bar and 1.53:1 against the fill,
  `#ffffff` label 10.59:1; Catppuccin: active 1.30:1, hover 1.13:1, ring 1.95:1
  and 1.50:1, label 9.46:1;
- **Developer: Generate Color Theme From Current Settings** confirmed the merged
  result live in the running editor: `tab.activeBackground #414559`,
  `tab.hoverBackground #383c50`, `tab.border #00000000`. That command is the way
  to settle whether a colour customization is reaching the workbench — the
  `colorThemeData` cached in `state.vscdb` is the theme's raw map and does not
  include customizations, so it cannot answer the question;
- luminance ordering after the hover fix is monotonic in both themes;
- `git diff --check` clean;
- not verified: the rendered result. The gold `tab.activeBorderTop` was left as
  it was.

**Correction, same day.** The "roughly 14% white wash" this entry originally
reported over the active tab was a misreading. `tab.activeBackground` was never
painting that tab at all, and the arithmetic that seemed to fit it was
coincidence — the disproof was already in hand and went unnoticed: the tab
measured `#5d5f6c` both before the change, when the value was the theme's
`#303446`, and after, at `#414559`. Two different settings, identical pixels.

The active tab is also the *selected* tab, and **`tab.selectedBackground` wins**.
It does not inherit from `tab.activeBackground`; this build defaults it to
`list.inactiveSelectionBackground`, which this file sets to `#46494d`, so a list
colour was painting the tab. It is absent from both dark themes and from
**Developer: Generate Color Theme From Current Settings**, which lists only
resolved colours — a key can be missing there and still be the one in effect.
`tab.selectedBackground` and `tab.selectedForeground` are now set alongside the
active pair in both dark blocks.

The lesson is about method rather than colour: a model that fits one measurement
is not evidence. The second data point that would have falsified it existed from
the start, in the earlier screenshot, and checking a hypothesis against the
observation that preceded it is cheaper than any amount of further arithmetic.

### 2026-08-05 — Dark tab ladder toned down and measured against the bar

Intent:

- the active tab read as too bright once it was finally painting the intended
  colour, so the whole ladder was re-derived instead of nudged.

Implementation:

- set every step from the bar by target contrast rather than by picking palette
  colours: hover 1.10:1, unfocused active 1.14–1.15:1, active 1.20:1, down from
  the 1.30–1.34:1 the first cut used;
- applied `tab.selectedBackground` with the same value as `tab.activeBackground`
  in both dark themes, which is what actually reaches the tab.

Decisions and lessons:

- deriving each step from a contrast target against the bar keeps the two themes
  consistent without hand-matching palettes, and makes "a bit more toned down" a
  number rather than a taste argument;
- the 5% hover overlay on the active tab lifts it to 1.40:1, so the ordering
  bar < hover < unfocused active < active < active+hover still holds after the
  reduction.

Verification:

- `settings.json` parses, 126 keys; the ladder is monotonic in both themes and
  `tab.selectedBackground` equals `tab.activeBackground` in each;
- measured from the screenshot before this change: bar `#313445`, ring
  `#747681`, fill `#5d5f6c` — the fill 1.98:1 against the bar, against a 1.30:1
  design target, which is what "too bright" was;
- `git diff --check` clean;
- not verified: the rendered result, which needs a window reload.

**Correction, same day — the tab strip was never being themed from `tab.*`.**
Neither `tab.activeBackground` nor `tab.selectedBackground` reached the active
tab. VS Code's "modern" workbench style, the `.style-override` class on
`.monaco-workbench`, replaces the tab colours with its own variables and applies
them with `!important`:

```css
--modern-ui-tab-active-background: color-mix(in srgb, var(--vscode-foreground) 22%, transparent)
--modern-ui-tab-hover-background:  color-mix(in srgb, var(--vscode-foreground)  6%, transparent)
```

Mixing from the **foreground** is what made the tab so bright. This file sets
`foreground` to `#f7f7f7` in both dark themes, so the active tab was near-white
at 22% over the bar: `rgb(92, 95, 109)` predicted against `rgb(93, 95, 108)`
measured, 1.94:1 where the design called for 1.20:1. It was also why the colour
never moved — three settings changes, three identical screenshots.

`custom-workbench.css` now points both variables back at
`var(--vscode-tab-activeBackground)` and `var(--vscode-tab-hoverBackground)`, so
the ladder in `settings.json` governs the tab strip again, per theme.
`!important` is legal on a custom property and is what beats VS Code's own
declaration.

Lessons this cost more than it should have:

- **a theme colour that is registered, resolved, and merged can still paint
  nothing.** `Developer: Generate Color Theme From Current Settings` confirmed
  `tab.activeBackground: #414559` was live at a point when nothing on screen used
  it. It reports what the colour registry resolved, not what any rule consumed;
- the disproof was available from the first screenshot and went unread for three
  rounds: the tab measured `#5d5f6c` both before and after a change to
  `tab.activeBackground`. **When a setting changes and the pixels do not, stop
  tuning the setting** — the value is not the one being drawn;
- the answer came from VS Code's own stylesheet, not from more inference over the
  screenshots. `grep` for rules matching `.tab.active` that set a background,
  in `out/vs/workbench/workbench.desktop.main.css`, names the winning declaration
  in one step; it is the first thing to try, not the last;
- the modern style also excludes the active tab from its hover rule
  (`.tab:not(.active)`), which makes the `.tab.active:hover` lift added earlier
  inert while that style is on. It is kept because it is correct whenever the
  style is off.

### 2026-08-05 — Gate and policy references resolved from the call's real target

Intent:

- make Laravel gate navigation work in both directions for the calls that were
  being dropped. `Gate::allows('uploadClassified', $document->company)` did not
  count as a reference to `CompanyPolicy::uploadClassified`, and
  `canGrantRibeitClassifiedAccess` found no callers from its declaration even
  though `Gate::check` navigated to it from the call side.

Implementation:

- anchored the target resolver to the argument that follows the ability instead
  of scanning a 360-character window for anything target-shaped;
- taught it property access, so `$document->company` resolves to Company;
- routed the reference direction through the same resolver, so a type-hinted
  `Company $model` counts where only a literal `$company` did before, while an
  unresolvable call keeps the old name-based check that can only confirm;
- returned `undefined` rather than an empty name for an unresolved variable;
- bumped `local.smart-references` to `0.0.19` and added ten tests.

Decisions and lessons:

- **the window scan was reading the wrong expression entirely.** Against this
  repository it resolved `Gate::check('show', $company)` to `Nomenclator` and
  `Gate::check('process', $document)` to `Use`, both picked up from unrelated
  lines below the call. It survived because the old caller only asked "does this
  window mention my model", a question a wrong answer can still pass;
- the polarity of the two directions is deliberately different and must stay so.
  Definition narrows a glob, so an unresolved target falls back to every policy;
  reference filters call sites, so an unresolved target is kept only when it
  names the model. Ability names collide hard — `show` is declared in all 39
  policies here, `update` in 21 — and making the reference direction inclusive
  would bury the common ones;
- a policy delegating to another policy is normal, and the call inside
  `DocumentPolicy` targeting a Company is exactly the case a variable-name
  heuristic cannot see;
- an array target takes its first element: `Gate::check('update', [new Access,
  $clientUser])` is an Access question, and previously matched both
  `CompanyPolicy::update` and `ClientUserPolicy::update`, neither of them right.

Verification:

- the extension suite passes, 80 tests, 0 failures, including ten new ones;
- an old-versus-new comparison over the real Ribeit tree — 39 policies, 1119 PHP
  files, every declared ability — gained 22 references and dropped 4. All four
  dropped were read individually and are false positives the window scan had
  produced: two `Gate::check('store', Service::class)` calls attributed to
  `GroupPolicy::store`, and one array-target call attributed to two unrelated
  policies at once;
- the four references originally reported as missing now resolve, and the
  definition direction sends `$document->company` to `CompanyPolicy` rather than
  to the `DocumentPolicy` the call sits in;
- `node --check` and `git diff --check` clean;
- not verified: the live editor, which needs **Developer: Reload Window**.

### 2026-08-06 — Docblocks given readable prose and three structural colors

Intent:

- stop PHPDoc blocks reading as one flat grey wall, which was the reported
  problem: uniform colour and low contrast made a ten-line class docblock hard
  to scan and hard to read at all.

Root cause:

- two separate causes, only one of them ours.
- contrast: Catppuccin Noctis Frappé paints `comment` Overlay0 `#737994` on the
  editor background `#303446`. Measured against the screenshot that is
  **2.87:1** — under the 3:1 floor for any text, and far under 4.5:1;
- structure: VS Code's built-in PHP grammar knows only two inline doc tags. Its
  rule is `{(@(link|inherit[Dd]oc)).+?}`, so `{@see Foo}` never becomes an
  inline tag at all. Meanwhile its *block* tag rule listing `see` is
  **unanchored**, so `@see` matched anywhere and coloured alone. The result was
  a mauve `@see` with its braces and its referenced class left as ordinary
  comment grey. Backtick code spans had no scope whatsoever, so
  `` `$e->response` `` was grey prose except for the `$e`, which our own
  injection had already claimed.

Implementation:

- added `code-span` and `inline-tag` to `syntaxes/phpdoc.tmLanguage.json`, both
  ordered **before** `phpdoc-variable` so a backtick span claims its contents
  instead of being torn apart by the bare-variable rule;
- `code-span` deliberately carries no inner patterns, so a span stays one
  colour; both new regions end at `$` as well as their closing delimiter, so an
  unclosed backtick or brace cannot swallow the rest of the docblock;
- `reference-body` distinguishes `Class`, `method()`, and `Class::method()`;
- bumped Smart References to `0.0.20` and deployed through `install_vscode.sh`;
- in `settings.json`, added per-theme `editor.tokenColorCustomizations` blocks
  assigning: prose `#a5adce` (5.6:1), `@tag` unchanged theme mauve `#ca9ee6`,
  references `#8caaee` (5.4:1), code spans `#a6d189` (7.1:1), and delimiters
  `#838ba7` (3.7:1), with the light theme given the same three roles.

Decisions and lessons:

- **a single-segment scope override cannot beat a theme's descendant
  selector.** The existing anti-italic rule lists `keyword`, but the theme sets
  italic through `comment.block.documentation.phpdoc.php keyword`. TextMate
  resolves by selector specificity, not by application order, so the
  customization lost every time. The fix is to repeat the theme's selector
  verbatim: that ties on specificity, and customizations are applied second, so
  the tie goes to the override. Worth remembering for any future
  "my `tokenColorCustomizations` rule does nothing" case;
- delimiters were deliberately left below the words they wrap. The complaint
  was unreadable *content*, not invisible punctuation, and lifting braces and
  backticks to full contrast makes a docblock noisier rather than clearer;
- colour was assigned by role, not by mimicking how the same identifier looks
  in executable code. A `{@see Foo}` is a link, so it is blue; a backtick span
  is a literal, so it is green. Three roles is the ceiling — more hues in a
  comment stop being structure and become decoration.

Verification:

- the whole Smart References suite passes, 82 tests, 0 failures, including
  three new PHPDoc-syntax tests that assert the pattern ordering, the
  single-region code span, and the `Class` / `method()` / `Class::method()`
  split;
- both JSON files parse, and `settings.json` was parsed as JSONC to confirm the
  three `editor.tokenColorCustomizations` sections resolve;
- the installer completed and the live registry now records
  `local.smart-references` at `0.0.20` with an empty `.obsolete`;
- every contrast ratio above was computed from the colours measured out of the
  reported screenshot, against the measured background `#303446`;
- **not verified: the rendered pixels.** Grammar and theme resolution were
  checked statically; the editor still needs **Developer: Reload Window** and a
  visual pass before these colours can be called confirmed.

### 2026-08-06 — Docblock @method reference counts scoped to the open file

Intent:

- stop the reference CodeLens reporting a base class's usage as if it belonged
  to the annotated model. `@method static MetaTokenQueryBuilder query()` on
  `MetaToken` claimed **943 References**, a number about Eloquent, not about
  `MetaToken`.

Root cause:

- Intelephense reports `@method` and `@property` docblock tags as ordinary
  document symbols of kind `Method`, so `getPhpReferenceCodeLensSymbols` picked
  them up alongside real declarations;
- asked for references at that position, Intelephense resolves the magic method
  to whatever really declares it — `Illuminate\Database\Eloquent\Model::query()`
  — and returns every reference to *that*. Counted in the real tree: 691
  `query()` call sites under `app/`, `tests/`, `database/`, `routes/`, plus 105
  in `vendor/laravel`, which is the reported 943. `newQuery()` showed 49 and
  `newModelQuery()` 34 by the same route;
- this was never an Intelephense CodeLens. `intelephense.codeLens.references.
  enable` and `.parent.enable` are both `false`; both lenses on those lines are
  ours, from `createPhpReferenceCodeLensProvider` and
  `createPhpParentCodeLensProvider`.

Implementation:

- `getPhpLanguageProviderReferenceCount` gained a `sameFileOnly` argument that
  keeps only references in the requested document, and drops any landing on the
  tag's own line, since the tag is the declaration rather than a usage of it;
- the provider sets that argument from `PHPDOC_TAG_LINE_PATTERN` against the
  symbol's start line, guarded by a `document.lineCount` bounds check: symbols
  arrive from an `await`, so a document that shrank in the gap would otherwise
  throw out of `provideCodeLenses` and blank every lens in the file;
- bumped Smart References to `0.0.21` and deployed through `install_vscode.sh`.

Decisions and lessons:

- the obvious fix — report the true count for `MetaToken::query()` — was
  rejected as unaffordable, not as wrong. Intelephense hands back one
  undifferentiated list for an inherited method, so separating the annotated
  class's call sites means opening and analysing all 943 on every CodeLens
  refresh;
- file scope was chosen over hiding the lens entirely, deliberately accepting
  that the number is usually 0 (lens suppressed) or 1. A small true number was
  preferred to a large false one;
- the real-declaration lenses were left workspace-wide. The class lens on
  `MetaToken` reads 267 and is correct; scoping every lens to the file would
  have destroyed working behavior to fix a case that only affects annotations;
- **a document symbol is not evidence of a declaration.** Any provider walking
  `executeDocumentSymbolProvider` results in PHP will be handed docblock
  annotations mixed in with real code, and any position-based language-server
  query on those will silently answer about the parent.

Verification:

- the extension suite passes, 82 tests, 0 failures, and `node --check` is clean;
- the shipped `PHPDOC_TAG_LINE_PATTERN` was extracted from `extension.js` and
  run against the real `app/Models/MetaToken.php`: it matches every `@method`
  and `@property` tag line, and falsely matches none of the 24 candidate
  non-tag lines in that file — `public function …`, `@param`, `@see`, `use`,
  and the `#[UseEloquentBuilder(...)]` attribute all correctly reject;
- the installer completed, the live registry records `local.smart-references` at
  `0.0.21`, and `.obsolete` is empty;
- **not verified: the rendered CodeLens.** `createPhpReferenceCodeLensProvider`
  lives in `extension.js`, which exports only `activate`/`deactivate` and has no
  unit-test coverage; the counting path depends on live Intelephense responses.
  Confirming that line 52 now reads `Parent` alone, and that the class lens
  still reads `267 References`, needs **Developer: Reload Window** and a look at
  the file.

### 2026-08-06 — Docblock reference scoping extended to navigation

Intent:

- finish the previous entry's change, which scoped the *count* on a `@method`
  tag but left every way of acting on it global. The lens could read
  `1 Reference` and still open a 943-row picker, and `Cmd+B` on the same line
  ran the full workspace search: slow, and visibly thrashing the Problems panel.

Root cause:

- `createPhpReferenceCodeLensProvider` and the navigation path do not share a
  query. Counting goes through `getPhpLanguageProviderReferenceCount`, which was
  scoped; opening goes through `showReferencesAtLocation` → `getReferenceTargets`,
  which was not, and both the lens command and `smartReferences.go` land there;
- the Problems churn is a second-order effect. `showReferences` builds one row
  per target through `getReferenceContext`, which calls
  `workspace.openTextDocument` per reference. 943 targets meant 943 opened
  documents, each triggering Intelephense diagnostics.

Implementation:

- `getReferenceTargets` gained a `sameFileOnly` option, filtered inside its
  existing pass so rejected locations never reach `showReferences` and the
  document-per-row cost disappears with them;
- `showReferencesAtLocation` threads the option through; the CodeLens passes its
  already-computed scope as a third command argument; `goToSmartReference`
  derives it from the line under the cursor, so `Cmd+B` and the lens agree;
- the Laravel policy CodeLens passes no third argument and stays workspace-wide;
- bumped Smart References to `0.0.22` and deployed.

Decisions and lessons:

- **scoping a count without scoping its command is worse than not scoping at
  all.** The number and the thing it opens have to answer the same question, or
  the lens becomes a lie the user only discovers by clicking it. Any future
  filter added to a count must be pushed into `getReferenceTargets` too;
- `getReferenceTargets` was the right choke point precisely because it sits
  before the expensive fan-out, not after.

Verification:

- the extension suite passes, 82 tests, 0 failures; `node --check` clean;
  installer completed and the live registry records `0.0.22`;
- traced by reading, not by running: with `sameFileOnly` false the filter
  reduces to its previous expression, so real declarations are unaffected.

Open, and explicitly not verified:

- a report came in that **no** reference counts render at all, not just the
  suppressed docblock ones. That cannot come from this code path: for any line
  that fails `PHPDOC_TAG_LINE_PATTERN`, `sameFileOnly` is false and the count
  filter is byte-for-byte the previous expression. The Intelephense log for the
  current host shows indexing finished at 12:40:03, so a cold index is not the
  explanation either, and no exception from `local.smart-references` appears in
  `exthost.log`. Whether the class lens still renders `267 References` is the
  question that separates "docblock tags correctly suppressed at 0" from a real
  regression, and it has not yet been answered.

### 2026-08-06 — Docblock @method counts answered per class, correcting two earlier entries

Intent:

- make `@method static MetaTokenQueryBuilder query()` report the number that was
  wanted all along: how many times `MetaToken::query(` is called. It reported
  943 (every `Model::query()` in the workspace), then 0 (scoped to the open
  file), and `Cmd+B` answered `No other references found` for a method with 33
  real call sites.

Correcting the two entries above:

- the first claimed a per-class count was unaffordable, on the reasoning that
  separating them meant opening all 943 call sites. That was wrong twice over.
  The extension already sweeps `**/*.php` with `findFiles` + `readWorkspaceText`
  inside a CodeLens path — `getLaravelGatePolicyReferenceCounts` does exactly
  that — so a targeted scan was always within the house budget. And the cheaper
  route was never considered: the provider's own reference list already contains
  the wanted locations, so only the *receiver* needs disambiguating, which costs
  one read per distinct file rather than one per reference;
- the second then built file scoping on that false premise, which is why the
  lens vanished and `Cmd+B` went dead. File scope survives only as the fallback
  for tags a `Class::name(` scan cannot answer.

Implementation:

- `filterStaticCallReferences` keeps the provider locations whose line reads
  `Class::` immediately before the match, reading each distinct file once
  through `workspace.fs` — never `openTextDocument`, which is what generated the
  diagnostics storm;
- `getPhpDocStaticCallScope` reads the method name from the tag and takes the
  owning class from the declaration *after* the docblock, since a class docblock
  precedes its class;
- both the count and `getReferenceTargets` go through the same helper, so the
  lens and `Cmd+B` cannot disagree again;
- results cache on `Class::name` and clear on PHP save, because the scan would
  otherwise repeat per keystroke;
- bumped to `0.0.23`.

Decisions and lessons:

- **the language server resolves, text disambiguates.** Intelephense correctly
  finds every `query()` reference; it just cannot say which receiver each has,
  because for an inherited method they are genuinely the same symbol. Filtering
  its output beats both trusting it whole and replacing it with a grep;
- only `@method static` can be answered this way. A non-static `@method` or a
  `@property` is reached through `->name`, whose receiver type is not
  recoverable from text, so those keep the file-scoped fallback;
- `self::query()` and `static::query()` inside the model are deliberately not
  counted. The test asserts this, so the choice is visible if it needs revising;
- "affordable" was assumed rather than measured, twice. The cost that mattered
  was `openTextDocument` per row, not the file count.

Verification:

- 85 tests, 0 failures, including a new `phpDocStaticCalls.test.js` that pins
  the three patterns against the exact regression: `FacebookPage::query()`,
  `$builder->query()` and `LegacyMetaToken::query()` must be rejected while
  `MetaToken::query()`, `\App\Models\MetaToken::query()` and `MetaToken :: query()`
  are kept;
- that test **failed first** on the fully-qualified form, which the initial
  pattern rejected; the fix took the real count from 32 to 33;
- the shipped patterns were extracted from `extension.js` and run over the real
  `spro-marketing` tree: of 715 candidate `query(` sites, exactly 33 survive the
  `MetaToken::` test, matching `grep` ground truth. The tag pattern finds all
  three `@method static` lines in `MetaToken.php` and resolves each to
  `MetaToken`;
- installer completed, live registry records `0.0.23`;
- **not verified: the rendered lens.** `provideCodeLenses` still needs live
  Intelephense output, and `extension.js` exports only `activate`/`deactivate`,
  so the wiring between these patterns and the lens is covered by reading only.

### 2026-08-06 — Backtick code spans stopped swallowing the rest of the line

Intent:

- fix docblock prose turning green from the first backtick onward. `` `facebookLogin` ``
  coloured itself, its delimiters, and every word after it to the end of the
  line.

Root cause:

- the `code-span` rule was a `begin`/`end` pair. The grammar is contributed as a
  **left-priority** injection, so at every position the injected patterns are
  tried *before* the enclosing rule's own `end`. At the closing backtick the
  injection matched `begin` again and opened a **second, nested** span rather
  than closing the first;
- tokenizing the real file proves it — the closing backtick carried
  `markup.inline.raw.phpdoc.php` **twice**, and so did the prose behind it;
- the `|$` alternative in the `end` pattern is the only reason the damage
  stopped at the line break instead of running to `*/`. It was added for a
  different reason and accidentally limited the blast radius;
- the delimiters looked wrong too, and that was the tell: they rendered in the
  span colour rather than the punctuation colour, which cannot happen if
  `beginCaptures`/`endCaptures` are the rules producing them.

Implementation:

- `code-span` became a single `match` — `` (`)([^`]*)(`) `` with the delimiters as
  captures 1 and 3. A `match` consumes the span atomically and cannot re-enter
  itself, whatever the injection priority;
- an unclosed backtick now colours nothing at all, which is a better failure
  than colouring to end of line;
- `inline-tag` was checked for the same defect and does not have it: nothing in
  the injection matches `}`, so its region closes correctly. It was left as
  begin/end;
- bumped to `0.0.24`.

Decisions and lessons:

- **an L: injection must not use begin/end for a region whose delimiters its own
  patterns can match.** The injection stays active inside the region it opened,
  so its `begin` competes with the region's `end` and wins. Prefer `match` for
  anything delimiter-balanced and single-line;
- a scope appearing **twice** in a token's scope list is the signature of this
  bug, and is visible only by tokenizing;
- the existing grammar tests could not have caught this. They assert on the JSON
  and compile the regexes, which is a structural check — the grammar was
  well-formed and every regex was valid while the rendering was wrong. Only
  running the real tokenizer exposes rule *interaction*.

Verification:

- the file was tokenized with `vscode-textmate` + `vscode-oniguruma` against the
  real `text.html.php` root, its embedded `source.php`, and this injection —
  the same root the token inspector reports. Before: the closing backtick and
  the following prose both carried two nested `markup.inline.raw.phpdoc.php`
  scopes. After: the span is exactly `` ` `` + content + `` ` ``, and
  ` credential parents entities…` is plain `comment.block.documentation.phpdoc.php`
  again;
- `{@see RequestException}`, `{@see MetaErrorKindEnum}` and `{@see MetaLimitService}`
  were tokenized in the same run and scope correctly, with the prose after each
  `}` returning to plain comment;
- 85 tests, 0 failures. The `code-span` test was rewritten to pin the actual
  invariant — no `begin`, no `end`, stops at the first closing backtick, two
  spans on a line stay two, an unclosed backtick matches nothing;
- installer completed, live registry records `0.0.24`;
- **not verified: the rendered pixels**, which need a reload. Token scopes now
  prove the grammar; they do not prove the theme mapping on top of them.

Repeating the tokenizer check:

- `npm install vscode-textmate vscode-oniguruma` in a scratch directory, load
  `php/syntaxes/html.tmLanguage.json` from the VS Code app bundle as the root
  scope `text.html.php`, register this injection through `getInjections`, and
  tokenize line by line carrying the `ruleStack` forward. The extension itself
  is kept dependency-free, so this stays a scratch harness rather than a test.

### 2026-08-06 — Git status colours restored to explorer filenames in light mode

Intent:

- colour explorer filenames by git status in the light theme, which showed
  coloured status badges beside uniformly black filenames while the dark theme
  coloured both.

Root cause:

- not the colour customizations, which were correct and live. The badges proved
  it: measured out of the reported screenshot, the `U` badge is `#d97835` and
  the `R` badge `#007C7C`, exactly the configured `gitDecoration` values;
- the injected `custom-workbench.css` was overriding the label. Its light rule
  selected `.vs .explorer-folders-view .monaco-list-row .monaco-icon-label
  .label-name` — every row — and set `color: #1f2328 !important`, which beats
  the decoration colour VS Code puts on the label. The dark rule immediately
  above it is scoped to `.monaco-icon-label.folder-icon`, folders only, which is
  the entire reason dark mode was unaffected. The asymmetry was the bug.

Implementation:

- the light rule was narrowed to `.folder-icon`, matching the dark rule;
- a second rule keeps `opacity: 1` for all light file labels, so only the
  `color` half of the old rule is gone. Undecorated filenames are carried by
  `list.foreground` in `[GitHub Light]`, which is already `#000000`;
- `gitDecoration.added` and `gitDecoration.untracked` were darkened from
  `#d97835` to `#9a4f00` in both light blocks. The dark themes keep `#d97835`
  through the top-level customizations and are untouched.

Decisions and lessons:

- **a coloured badge beside an uncoloured label means CSS, not settings.** Both
  are drawn from the same `gitDecoration.*` colour, so when they disagree the
  colour resolved correctly and something overrode the label afterwards;
- a per-theme CSS rule written with a different selector depth than its
  counterpart is a latent divergence. These two were introduced as a pair and
  read as symmetric, but one matched folders and the other matched everything;
- the contrast fix was not cosmetic. `#d97835` measures **2.95:1** on the light
  sidebar `#F7F8FA` — below the 3:1 floor. It was invisible as a defect only
  because it was confined to a two-character badge; the moment the CSS fix let
  it reach the filename it would have shipped a wall of unreadable orange.
  `#9a4f00` is the same hue at 5.66:1.

Verification:

- every light `gitDecoration` colour was measured against the sidebar
  background: modified `#0042c7` 7.59:1, submodule `#7503DC` 7.05:1, deleted
  `#616161` 5.83:1, renamed `#007C7C` 4.73:1, ignored `#727238` 4.73:1, and the
  new orange 5.66:1. Only `conflicting` `#FF0000` remains weak at 3.76:1; it was
  left alone as a rarely-shown deliberate alarm colour;
- `settings.json` was parsed as JSONC and the resolved palettes printed per
  theme, confirming both light blocks changed and the dark themes still inherit
  the top-level values;
- `workbench.html` was checked and still contains the **old** selector and none
  of the new rule, which confirms the CSS change is not live yet.

Not verified, and required to take effect:

- the CSS is inlined into `workbench.html`, so this needs **Reload Custom CSS
  and JS**, a restart, and then `fix_vscode_checksums.sh` before the light
  explorer is expected to change at all. The `settings.json` half needs only a
  reload. No rendered pixels were confirmed for either.

### 2026-08-06 — Backspace at the first character joins the line upward

Intent:

- with the caret on the first non-whitespace character of an indented line,
  make one Backspace move the text up to the previous line. Reported against a
  string concatenation wrapped onto a leading `.`, where Backspace outdented
  instead.

Root cause:

- `smartBackspace` recognised six specific wrap shapes and fell through to
  `deleteLeft` for everything else. `deleteLeft` walks the caret left one tab
  stop at a time and joins the lines only once it reaches column 0, so the
  indentation had to be chewed through before the text moved anywhere;
- the shapes it knew were `->` chains, lines opened by `(`/`[`/`,`, `=>`,
  closing delimiters, `&&`/`||`, and ternary arms. A `.` at line start matched
  none of them. Each new shape needed its own predicate, and the list was never
  going to be complete.

Implementation:

- the fallback now joins: with the caret on the first non-whitespace character
  of an indented line, the indentation and the line break are removed together
  and nothing is inserted, which is exactly what `deleteLeft` does when it
  finally joins from column 0;
- the three branches for `->` chains, bracket-opened lines and closing
  delimiters were deleted. Every one computed the identical edit to this
  fallback and each recognised only one shape, so they are strictly subsumed.
  `isPhpChainContinuation`, `isPhpIndentedContinuation` and
  `isPhpClosingContinuation` went with them;
- the three that insert a space — `=>`, `&&`/`||`, ternary arms — are kept and
  collapsed into one branch, since those operators read as glued to the line
  above without it;
- bumped to `0.0.25`.

Decisions and lessons:

- enumerating wrap shapes was the wrong model. The shapes that matter are the
  few that need a **space**; everything else is the same join, so the default
  should be the join and the list should be the exception;
- the caret at column 0 is unchanged in effect. `deleteLeft` already joined
  there, so only an indented caret sees a difference. A simulation that reports
  column-0 sites as changed is measuring its own labels, not behaviour — the
  first run of this comparison did exactly that and claimed 29,399 changes.

Verification:

- both branch orders were transcribed from the shipped source into a scratch
  simulation and run over 400 real files from `spro-marketing/app`: 44,006
  caret-at-first-character sites, and the **only** transition is
  `outdent -> join`, 24,068 of them. No site that the old code already handled
  changed — no `join -> …` and no `join-space -> …` — which is the property that
  matters, since it means the reordering after deleting three branches altered
  nothing;
- the simulation refuses to run if the three deleted predicates are still
  present or if the kept predicates no longer match the shipped source, so it
  cannot silently drift from the code it claims to model;
- 85 tests, 0 failures; `node --check` clean; installer completed; live registry
  records `0.0.25`;
- **not verified: the keystroke in a live editor.** `smartBackspace` lives in
  `extension.js`, which exports only `activate`/`deactivate`, so this is covered
  by simulation rather than by a test that drives the editor.

Known consequence, not yet judged:

- docblock continuation lines are indented, so Backspace on the `*` of a wrapped
  `/** … */` line now joins it upward and leaves the `*` inline. That follows
  from the rule as asked for. Stripping a leading `* ` on join would be a
  separate decision.

### 2026-08-07 — Macro lookups indexed, and macros given a return type

Intent:

- `Cmd+B` on the `->get()` of `Http::facebookGraph()->get('/me', …)` answered
  `No other references found` after a multi-second pause, and `Cmd+B` on
  `facebookGraph` itself reached the registration but was just as slow. Make both
  immediate, and make the first one land on `PendingRequest::get()`.

Diagnosis:

- both symptoms are one cause. Intelephense cannot type a macro call, so
  `Http::facebookGraph()` resolves to nothing and `->get()` — a call on a value
  of unknown type — resolves to nothing either. `goToDefinition` then falls to
  `resolveLaravelMacroTarget`, which read every first-party PHP file with one
  `vscode.workspace.fs.readFile` round trip at a time: 2,180 files in
  `spro-marketing`. `facebookGraph` paid for 1,399 of them before matching;
  `get` matches no registration anywhere, so it paid for all 2,180 and then
  reported no references. The scan ran again, in full, on the next press;
- the misses are not the unusual case. Any `Cmd+B` the language server cannot
  answer reaches this path, and a name like `get` is never going to be a macro.

Implementation:

- `findMacroRegistrations` reports every registration in one file — name offsets,
  receiver, closure parameters, declared return type — replacing the
  single-name-at-a-time `findMacroRegistrationRange`, which had no callers left
  and was deleted with its tests retargeted at the survivor;
- registrations are collected once into a name-keyed index per workspace folder
  and cached as the in-flight promise, so concurrent presses share one scan. A
  `**/*.php` watcher clears it; rebuilding is lazy;
- added `forEachFileText`, which reads a file set 32 at a time and still hands
  files to its caller in workspace order, and moved the other six workspace scans
  onto it — the Gate/policy CodeLens counter was reading up to 5,000 files the
  same serial way;
- the IDE-helper generator now emits `@method` tags for the macros it finds:
  receiver and return type resolved against the registering file's imports and
  namespace, parameter types rewritten to fully qualified names;
- `Cmd+B` on a macro call therefore resolves to that generated tag, so
  `resolveLaravelHelperTarget` hands an `@method` line back to the registration
  index rather than leaving the caret in the stub.

Decisions and lessons:

- **the miss is the hot path.** The original scan was justified on the grounds
  that "a macro call has nothing to lose by it" — true of the call that finds
  something, false of every call that does not, and in a Laravel codebase those
  are the majority. A fallback that only runs when native resolution fails is not
  thereby rare;
- a `@method` tag is generated for both the static and the instance call form of
  every macro. `Macroable` really does answer both, through `__callStatic` and
  `__call`, and which one a project uses is a property of the receiving class —
  `Http::facebookGraph()` against `$collection->pluckDeep()` — not of the
  registration. Emitting one form would make the IDE guess and reintroduce the
  unresolved call this exists to fix;
- `self`/`static` in a macro closure names the service provider that registered
  it, never what calling the macro returns, so those degrade to `mixed`. A
  non-literal default such as `MetaService::GRAPH_BASE` would be resolved against
  the *stub's* namespace and name nothing there, so only the parameter's
  optionality is kept. A parameter list the transformer cannot read in full
  becomes `mixed ...$arguments`: a wrong arity would be reported as an error at
  every call site, which is worse than the vagueness;
- the type is what makes the chain navigable. Finding the registration was never
  going to fix `->get()` — only a return type on `facebookGraph()` gives the next
  link in the chain something to resolve against.

Verification:

- 94 tests, 0 failures (85 before), covering the registration scan, receiver and
  return-type resolution, parameter rewriting, both rendered call forms, and the
  `@method` → registration hand-off;
- `node --check` clean on all four changed modules; `jq empty` on every manifest;
  `bash -n` on `symlink.sh` and both installers; `git diff --check` clean;
- the generator was run against the real `spro-marketing` tree outside VS Code:
  it finds the three `Http::macro` registrations in `AppServiceProvider.php` and
  renders `@method static \Illuminate\Http\Client\PendingRequest facebookGraph()`
  under `namespace Illuminate\Support\Facades`;
- `install_vscode.sh` run; the live registry reports `local.smart-references@0.0.26`
  and the extension symlink resolves into this repository;
- **not verified here: the editor behaviour.** The batched read's effect is on
  `vscode.workspace.fs` round trips, which only exist in the extension host —
  local `fs` measured the same 2,180 files at 246 ms serial against 37 ms
  batched, which bounds the file I/O but not the RPC that dominates it. Whether
  Intelephense merges a `@method` tag onto a vendor facade the way it merges the
  Restify partial classes is likewise a live-editor question. Both need
  **Developer: Reload Window**, then `Shift+Cmd+.` to regenerate the helper, and
  a real `Cmd+B` on `->get()` and on `facebookGraph`.

### 2026-08-07 — Light mode given a full tab ring and the missing light icons

Intent:

- the active tab in `GitHub Light` had a blue line above and below it and nothing
  down its sides, and some PHP files showed a black disc where the class icon
  should be. Make the outline go all the way round and the icons match the theme.

Diagnosis, from measuring the screenshot rather than reading the settings:

- a vertical slice through the active tab gives `#94b6f7` on the two device rows
  at each end of a `#deeafc` fill; the horizontal slices at those same rows show
  the fill running edge to edge with no blue at either side. Those are
  `tab.activeBorderTop` and `tab.activeBorder`, both `#8bb8ff` in the light
  blocks, and VS Code renders each as `left: 0; width: 100%; height: 1px` inside
  the tab — `.tab-border-top-container` at `top: 0`, `.tab-border-bottom-container`
  at `bottom: 0`. The grey `d0d7de` between tabs is `tab.border`. Three different
  outlines on one tab, none of them a ring;
- the dark themes never showed this because the inset-ring rule added earlier was
  scoped `.vs-dark`, on the stated assumption that light themes separate their
  tabs by fill alone. They do not;
- the icons are a separate fault with the same shape. `applyPhpLightOverrides`
  mirrored only the mappings the workspace scan generated, so the 114 `fileNames`
  the theme ships with kept pointing at the dark JetBrains icon in light mode.
  Four of them use a dark-surface shape — `Response.php` and `Validator.php` at
  `file_class`, whose `class.svg` fills its circle `#25324D`, plus `functions.php`
  and `getter.php` at `file_php`.

Implementation:

- added a `.vs` active-tab rule mirroring the dark one, taking its colour from
  `--tab-border-bottom-color`. VS Code sets that as an inline style on the tab
  element itself from `tab.activeBorder`, so the ring is by construction the
  colour already painted along the bottom edge and stays governed per theme from
  `settings.json` — no literal, and no new colour to keep in step;
- the strips are left in place rather than hidden. `--tab-border-top-color` also
  carries `tab.activeModifiedBorder`, so hiding the container to avoid a doubled
  edge would have taken the dirty-file marker with it. Same colour, same 5px
  clip, so the overlap does not show;
- `applyPhpLightOverrides` now also walks the theme's own `fileNames` and
  redirects any entry whose icon has a light variant, without overwriting one the
  scan already set.

Decisions and lessons:

- only icons already listed in `lightFileIcons` are redirected. Those are the
  JetBrains shapes built on a dark surface; a brand logo like ESLint's or
  Prettier's carries its own colours and reads the same either way, so generating
  a light variant for it would change icons that were never wrong;
- the screenshot was the evidence, not the starting point for a theory. Counting
  colours in the two icon regions returned identical histograms — 440 background,
  343 interior, 128 blue — which is what proved they were the same shape in two
  fills rather than two different icons, and sent the search to the light
  override rather than to the classifier.

Verification:

- the light-override step was replayed against the live theme with the shipped
  generated names stripped first, exactly as `writeTheme` sequences it: files
  lacking a light override fall from 114 to 110, with `Response.php` and
  `Validator.php` now at `file_class_light` and `functions.php`/`getter.php` at
  `file_php_light`. The 110 that remain were checked against `lightenSvg`'s
  palette and carry no dark surface;
- VS Code's own bundled stylesheet was read to confirm the strip geometry, and
  `workbench.desktop.main.js` to confirm `--tab-border-bottom-color` is set
  inline on the tab element and that the top variable doubles as the dirty
  marker;
- `node --check` on the changed extension, `jq empty` on every manifest,
  `git diff --check`, `bash -n` on the installers, and 111 tests still passing;
- `install_vscode.sh` run; the live registry reports
  `local.phpstorm-project-icons@0.0.2` and the injected CSS resolves to a symlink
  into this repository;
- **not verified: the rendered result.** The CSS is inlined into `workbench.html`
  by the loader, so it needs **Reload Custom CSS and JS** and a restart, and the
  icon mapping needs the refresh command rerun before the theme on disk changes.
  Neither is claimed by these checks.

Known and not fixed:

- `file_config` is also a dark-surface icon — `config.svg` fills its page shape
  `#43454A` — and covers `component.json`, `components.json`, `CMakeCache.txt`
  and the `.cfg/.conf/.config/.cnf` extensions. It is not in `lightFileIcons`,
  and adding it is not a one-line change: its outline is `#CED0D6`, which
  `lightenSvg` only darkens in its folder branch, so a generated light variant
  would be a white page with an almost invisible edge. It needs the file branch
  to learn that colour and a look at the result.

### 2026-08-08 — Intelephense stopped indexing eleven copies of the framework

Intent:

- the Intelephense language server was holding 1.8 GB on a 16 GB machine, which
  is what put 1.2 GB into swap. Find out whether that is what a PHP index costs
  or what this workspace was asking for.

Diagnosis:

- it was the ask. `spro-marketing` presents 137,767 PHP files to the index after
  the existing exclusions. Counting them by directory: **78,522 are in
  `nova-components/*/vendor/`**. A Nova component is a Composer package living
  inside the app, and eleven of them install their own vendor tree — 7,300 to
  8,700 PHP files each — against 2 to 32 files of first-party code apiece. Every
  one is another copy of Laravel, Nova and Symfony that the root `vendor/`
  already supplies;
- `**/vendor/**/vendor/**` was already excluded and does not reach them: the
  outer directory is `nova-components`, not `vendor`, so the pattern never
  matches;
- a second block, `vendor/google/apiclient-services`, is 35,735 files — one
  generated class tree per Google API — where first-party code references six
  services.

Implementation:

- added `**/nova-components/*/vendor/**` to `intelephense.files.exclude`.

Decisions and lessons:

- the duplicate trees cost more than memory. Eleven `Application` classes and
  eleven `Collection`s make Cmd+B ambiguous where one definition would be exact,
  so this is the same fault as the reference work earlier in the week seen from
  the other side: too many symbols, not too few;
- "is 1.8 GB normal for Intelephense" was the wrong question, and answering it
  from reputation would have ended in `intelephense.files.maxSize` or a
  smaller-is-better setting sweep. Counting the files it was given named the
  cause in one command;
- a per-project `.vscode/settings.json` was rejected. The pattern is not
  specific to this repository — any Laravel app with Nova components has it —
  and this file is where the machine's PHP intelligence is configured.

Verification:

- the file count under the same exclusion set falls from 137,767 to 59,301, a
  removal of 78,466, measured with `find` using the exclusions as written;
- all 242 first-party PHP files under `nova-components` remain indexed, and the
  new glob matches nothing under `app/` or the root `vendor/` — both counted;
- `settings.json` still parses after comment and trailing-comma stripping, and
  `intelephense.files.exclude` carries 18 patterns including the new one;
- **not verified: the resulting memory figure.** The server has to be restarted
  and the workspace re-indexed before its heap reflects this, and the 1.8 GB
  reading was taken from a process that has since been replaced by one at
  842 MB. The claim here is the size of the input, not the size of the outcome.

Known and not fixed:

- `vendor/google/apiclient-services` is another 35,735 files, and Intelephense
  glob excludes cannot express "everything except these six services". The fix
  belongs in `composer.json`, where `Google\Task\Composer::cleanup` prunes the
  unused service classes at install time from an `extra.google/apiclient-services`
  list. That is a project change, not an editor one, so it is recorded here
  rather than made.

### 2026-08-08 — Google's generated API clients excluded down to the five in use

Intent:

- finish the index reduction started the same day. `vendor/google/apiclient-services`
  was the second block named in that entry and left alone because a glob cannot
  obviously say "everything except these".

Diagnosis:

- the package ships one generated class tree per Google API: 327 directories,
  35,734 PHP files. First-party code names five services —
  `BusinessProfilePerformance`, `MyBusinessAccountManagement`,
  `MyBusinessBusinessInformation`, `SearchConsole` and `YouTube` — which come to
  379 files between them. Excluding the package wholesale, which is what "we
  don't need it" would suggest, would leave `Google\Service\SearchConsole`
  undefined at every call site.

Implementation:

- an extglob negation holds the five back by name:
  `**/vendor/google/apiclient-services/src/!(A|B|C|D|E)/**`, spelled out with the
  real service names.

Decisions and lessons:

- the pattern is not a hopeful guess. Intelephense's bundle was searched for its
  glob engine, which turned out to be micromatch — `_micromatchOptions`,
  `_getNegativePatternsRe`, and a `noext` option derived from an `extglob`
  setting — and the pattern was then run against micromatch directly over eleven
  paths: the five kept services, five excluded ones, a lowercase near-miss
  (`Youtube/`), and the root `vendor/` and `apiclient/` trees that must not be
  touched. Eleven for eleven;
- the alternative considered and rejected was a first-letter character class
  keeping B, M, S and Y. It is shorter and needs no extglob, but it leaves 7,507
  files rather than 379 — every `Bigquery`, `Merchant` and `Storage` service
  rides along with the ones actually wanted;
- this exclusion has a maintenance cost the others do not: a service added to the
  code must be added to the pattern or its classes read as undefined. That is
  noted in the setting itself, next to the names.

Verification:

- the eleven-case micromatch check above, run against the real paths;
- counted with `find` using the exclusions as written, the indexed set falls from
  **137,767 to 24,258 files** across both of today's entries — 82% — of which
  35,028 come from this one;
- `settings.json` parses, with 19 exclude patterns;
- **not verified: Intelephense's own reading of the pattern.** micromatch is what
  the bundle carries, but whether `files.exclude` reaches the same matcher as the
  fast-glob call the options were found on is an inference. The check is a
  reload, then whether `Google\Service\SearchConsole` still resolves while an
  unused service no longer autocompletes.

### 2026-08-08 — Six extensions removed, and the tracked list resynced

Intent:

- 93 extensions were installed. Remove the ones nothing on this machine uses,
  and make `marketplace_extensions.txt` describe reality again.

Implementation and evidence — each removal was checked against the filesystem
before it was made, not against a guess about what a PHP developer needs:

- `drcika.apc-extension` — recorded as inert in the 2026-07-30 entry: it injects
  through the removed AMD bootstrap and has applied nothing since VS Code moved
  to ESM. Removed;
- `ms-vscode.powershell` — 15 `.ps1` files across `~/dev`, all deploy or utility
  scripts in projects that are not PowerShell projects. VS Code's core grammar
  keeps highlighting them; only IntelliSense and debugging are lost;
- `ms-python.python`, and with it `vscode-pylance`, `debugpy` and
  `vscode-python-envs`, which uninstalled as its dependencies. Removed on an
  explicit request. Worth recording that this is not a costless removal:
  `~/dev/dfs-api` is a live Python project with a `requirements.txt` and a commit
  from 2026-07-30.

Kept, against the same evidence:

- `swiftlang.swift-vscode` and `llvm-vs-code-extensions.lldb-dap` were on the
  removal list but `~/dev/muxy` is a real Swift project — 1,359 `.swift` files,
  its own remote at `github.com/muxy-app/muxy`, and a `.vscode/launch.json` whose
  configurations are `"type": "swift"`. Removing either would break debugging
  there, so neither was touched.

Decisions and lessons:

- "if those are not used" is a question with a checkable answer. Counting files
  by extension under `~/dev` and reading the debug configurations settled all
  five cases in one pass, and reversed two of them;
- themes are not the place to look for weight. Roughly twenty of the installed
  extensions are colour or icon themes, and VS Code loads only the active one —
  the cost is in extensions that activate on a language or on startup;
- the tracked list had drifted both ways. `vscjava.migrate-java-to-azure` was
  listed but not installed, and `anthropic.claude-code`,
  `astro-build.astro-vscode` and `mechatroner.rainbow-csv` were installed but not
  listed, so a new machine would have lost them.

Verification:

- 93 installed before, 87 after; `marketplace_extensions.txt` rewritten from the
  live set and diffed back to it — 81 marketplace entries, in sync, plus the six
  `local.*` extensions;
- **not verified: the memory saved.** Extension-host memory is not attributable
  per extension from outside, so the claim here is only that six fewer extensions
  load. Five Jupyter extensions remain installed and are now orphaned — the
  Python extension they depend on is gone and there are zero `.ipynb` files
  anywhere under `~/dev`.

### 2026-08-08 — Jupyter removed, and the extension that was holding it

Intent:

- finish the removal started earlier the same day. Five Jupyter extensions were
  left installed after the Python extension they depend on was uninstalled.

Implementation:

- four uninstalled without incident. `ms-toolsai.jupyter` refused, reporting that
  **Fabric Data Engineering VS Code** (`synapsevscode.synapse`) depends on it —
  Microsoft's Fabric data-engineering client, which nothing on this machine uses:
  no Fabric or Synapse artifacts anywhere under `~/dev`, and no notebooks for it
  to open. It was uninstalled first, then Jupyter followed;
- `marketplace_extensions.txt` rewritten from the live set again.

Decisions and lessons:

- a refused uninstall is information, not an obstacle. The dependency named a
  second unused extension that would otherwise have gone unnoticed — nothing in
  the original review flagged `synapsevscode.synapse`, because its name says
  nothing about what it is;
- `synapsevscode.synapse` was removed without being asked for by name. It was the
  sole blocker for an explicit instruction and the evidence for disuse was the
  same evidence that condemned Jupyter, but it is recorded here because it was
  not on the list, and reinstalling it is one command.

Verification:

- 93 extensions at the start of the day, **81** after: 75 marketplace plus the
  six `local.*`. The tracked list diffs clean against the live set;
- zero `.ipynb` files under `~/dev`, and no Fabric or Synapse artifacts, both
  counted before removal.

### 2026-08-10 — PhpStorm live templates ported, and Tab taught to expand them

Intent:

- make `pubf` + Tab produce a method in VS Code the way it did in PhpStorm, and
  bring the rest of the live templates across with it.

Implementation:

- the user-authored templates were read out of
  `~/Library/Application Support/JetBrains/PhpStorm2025.3/templates/` rather than
  reconstructed. PhpStorm writes a group file there only once a template in the
  group is added or edited, so `PHP.xml`, `PHP Interfaces.xml`, `PestPHP.xml` and
  `user.xml` are exactly the set that was not stock — `pubf`, the interface
  declaration forms, Pest's `it`/`test`, and the personal Laravel ones (`ifff`,
  `ifelse`, `dd`, `booted`, `facade`, the validation closures, `query logs`);
- PhpStorm's *bundled* PHP group lives in the application jar, and PhpStorm is no
  longer installed on this machine. The loop, throw and include abbreviations
  (`fore`/`iter`, `fori`, `itar`, `thr`, `rq`, `rqo`, `inc`, `inco`) are therefore
  reconstructed from known behaviour. The abbreviations are exact; the bodies are
  approximate, and `php.json` says so at the point of use;
- 29 snippets landed in the new `User/snippets/php.json`, with
  `editor.tabCompletion: "onlySnippets"` and `editor.snippetSuggestions: "top"`
  added to `settings.json`;
- the installer's `User/` loop tested `[ -f ]`, so a directory was skipped in
  silence. It now tests `[ -e ]` and links a directory whole, which also means a
  snippet file added later needs no reinstall;
- `render_snippets.js` was added to print what a snippet file actually expands to.

Decisions and lessons:

- **Tab expansion is two settings, and the second one is the one that matters.**
  `tabCompletion` only governs the case where no suggest widget is open. With
  Intelephense proposing on every keystroke the widget is almost always open, and
  `acceptSelectedSuggestion` outranks snippet insertion on Tab — so what actually
  decides the common case is `snippetSuggestions: "top"` putting the snippet in
  the highlighted row. Setting only `tabCompletion` would have looked correct and
  worked intermittently, which is the worst available outcome;
- **an unescaped `$` in a snippet body destroys PHP silently.** `$fail` is valid
  snippet syntax for an unknown variable, so VS Code drops the sigil and inserts a
  placeholder holding the word `fail`. The file is valid JSON, the snippet
  expands, and the code is wrong. Every PHP sigil is written `\$`, and the
  rendering check exists because reading the source cannot catch this;
- **VS Code scopes snippets by language where PhpStorm scopes them by syntax.**
  The "PHP Interfaces" group rebinds `pubf` to the bodyless form inside an
  interface; one `php.json` cannot. The class forms keep `pubf`/`pubsf` and the
  declaration forms keep that group's own `pf`, `fun` and `ps`;
- **an abbreviation with a space in it was never Tab-expandable**, in either
  editor, because expansion reads the word before the cursor. PhpStorm's
  `query logs`, `facade template` and `validation callback` were list-only; they
  are `querylogs`, `facade` and `validationcallback` here;
- the live `php.json` already held three snippets and was not in the repository.
  `vdoc` was kept as-is; `facade` was incomplete — missing the class's closing
  brace and hardcoding an `App\Domains\DFS\Facades` namespace — and was merged
  with PhpStorm's `facade template` into one complete snippet, with the string-key
  accessor variant kept separately as `facadekey`. A `log` snippet expanding to
  `console.log` in PHP was dropped from `php.json`; the identical one in
  `snippet.code-snippets` is untouched, so nothing changed except the duplicate.
  Dropping it mattered more than usual: `snippetSuggestions: "top"` would have
  promoted it above every Intelephense proposal for `log`.

Verification:

- `bash -n` on `install_vscode.sh` and `symlink.sh`; `node --check` on
  `render_snippets.js`; `git diff --check` clean;
- all four snippet files parse as JSONC;
- `render_snippets.js` run over `php.json`: all 29 bodies inspected, every PHP
  `$` present in the output, namespaces intact, and `{$attribute}` correct inside
  the double-quoted string in `validationcallback`;
- `install_vscode.sh` run. `~/Library/Application Support/Code/User/snippets`
  resolves to the repository copy and lists all three files through the link;
  `settings.json`, `keybindings.json` and the `local.*` extension links unchanged.
  The installer backed the previous live directory up to
  `backups/extensions/snippets.before-dotfiles-link.20260810151516`, and `diff -r`
  against the repository copy shows `graphql.json` and `snippet.code-snippets`
  identical, with `php.json` the only intended difference;
- **not yet verified: the expansion itself.** Tab-expanding `pubf` in a real PHP
  buffer needs **Developer: Reload Window** first, and no window was reloaded from
  this session.
