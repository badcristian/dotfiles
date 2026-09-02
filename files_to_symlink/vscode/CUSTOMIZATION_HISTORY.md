# VS Code customization intent, decisions, and history

Last reviewed: 2026-08-20

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
| Workbench compatibility check | `check_workbench_customizations.sh` | Validates source CSS, the installed DOM contract, and injection after upgrades |
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
- the glyph margin remains hidden, while injected workbench CSS gives every
  rendered line number a fixed 4px inset from the left;
- the shared Catppuccin pane surface — populated editor canvas, gutter, empty
  groups, Explorer, and Codex sidebar all on `#292c3c` — is currently **not in
  effect**: it lives in the `[Catppuccin Noctis Frappé]` block, and the dark
  theme in force is now Macchiato. See the 2026-08-20 entry;
- the integrated terminal uses JetBrainsMono Nerd Font Mono so Starship's
  monochrome language and Git glyphs render as single-cell symbols, while the
  editor keeps the ordinary JetBrains Mono family;
- preview tabs remain enabled, while the local preview extension pins a tab
  when it is deliberately clicked;
- JavaScript and TypeScript share native complete-function-call suggestions;
  `Cmd+R` delegates to a file-aware local runner (currently project-local `tsx`
  for ordinary `.ts` files), while `Shift+Cmd+R` opens editor Replace;
- the status bar starts hidden and can be toggled from an editor-title action;
- empty editor groups use the current theme's Explorer background and replace
  the oversized VS Code letterpress with a small, quiet `⌘`, while keeping the
  native shortcut hints;
- there is no activity bar: `workbench.activityBar.location` is `"hidden"`, and
  Explorer plus Extensions/Remote remain reachable through their scoped
  keybindings;
- injected workbench CSS tightens the UI, corrects light/dark tab text, keeps
  every outer tab at 26px with centred 24px modern fill and action layers, maps
  that active fill to the per-theme tab palette, keeps the pinned action visually
  transparent over it, rings it, optically aligns tab file icons with their
  labels, balances actionless tabs' horizontal padding, and outlines the quick
  input widget with a light or dark border per theme;
- Monokai Pro, Catppuccin Noctis Frappé, and both GitHub Light themes carry a
  full tab palette, because those dark themes ship active, inactive, hover, and
  bar backgrounds that are all one colour. Catppuccin Noctis Macchiato, the dark
  theme actually in force, has the same defect and does **not** yet have one —
  its block pins `tab.selectedBackground` only, to hold the tab still while the
  Explorer list colours were corrected;
- an injected script preserves horizontal editor scroll around pointer and
  selection changes;
- a second injected script anchors the quick input widget under the command
  center pill, so pickers open out of the title bar rectangle instead of VS
  Code's window-relative position;
- PHP uses Intelephense for core language intelligence, with selected
  Intelephense CodeLens features disabled where the local extension supplies
  the intended navigation;
- `intelephense.stubs` pins Intelephense's own default list plus `apcu`. The
  setting replaces the default rather than extending it, so the defaults are
  reproduced there and have to be resynced after an Intelephense upgrade;
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
| `Cmd+B` | Smart definition/reference navigation through native and local providers |
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
  labelled rule introducing every group, import/export-only top-level grouping,
  an orange current-file marker, and test usages tinted and sorted last;
- PHP-aware copy/paste that can copy a variable token or replace a target
  variable with a copied expression;
- smart Backspace, Enter, equals insertion, and chain splitting;
- JSON/JSONC smart Enter that inserts a missing comma before starting the next
  item while preserving native indentation;
- parent and trait method navigation and custom reference CodeLens counts;
- Laravel route-controller, Gate/policy, policy-method, and translation-key
  references;
- JSON key find-usages: Cmd+B on a key in any JSON file builds its dotted path
  from the enclosing objects and arrays, then lists the vue-i18n `t(...)` call
  sites that use it;
- Laravel `config('file.nested.key')` definition navigation to the exact key in
  `config/file.php`, and `Log::channel('name')` to that channel in
  `config/logging.php`;
- returned TypeScript/Vue composable members: Cmd+B on a locally declared member
  returned from an exported factory follows matching imports and destructures to
  its consumer bindings and template handlers;
- Eloquent query-string navigation: `->with('metaToken')` opens `metaToken()` on
  the model the chain started from, following a dotted path one hop at a time, and
  `->where('status', …)` opens that column's `@property` line on the same model;
- Laravel macro navigation in both directions: `Rule::uniqueCaseInsensitive(...)`
  opens the `Rule::macro('uniqueCaseInsensitive', ...)` registration, and the
  name in that registration finds every call site;
- materializing selected PHP inlay hints into source code;
- adding a more precise Laravel builder type to applicable callbacks;
- fixing one-argument Laravel Collection PHPDoc types by adding their missing
  integer key type through Option+Enter;
- splitting a one-line PHP function or method signature onto separate parameter
  lines through Option+Enter, PSR-12 style, with the body brace pulled up beside
  the closing parenthesis;
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
node --check files_to_symlink/vscode/extensions/local.smart-references-0.0.1/laravelQueryNavigation.js
node --check files_to_symlink/vscode/extensions/local.smart-references-0.0.1/i18nKeyNavigation.js
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

### 2026-08-10 — APCu added to the Intelephense stubs, pinning the default list

Intent:

- clear `P1010 Undefined function 'App\Shared\Cache\apcu_entry'` in
  `ribeit-api/app/Shared/Cache/Apcu.php`.

Implementation:

- the diagnostic was correct about what it saw and wrong about the code. `apcu`
  is not among Intelephense 1.18.5's 69 default stubs, so nothing declared any
  `apcu_*` function. `ext-apcu` is a hard requirement in that project's
  `composer.json` and the machine's PHP 8.4.17 has it loaded, so the call is
  fine;
- `intelephense.stubs` added to the global settings with `apcu` appended.

Decisions and lessons:

- **the setting replaces the default list, it does not extend it.** Writing
  `["apcu"]` would have resolved `apcu_entry` and undefined the entire standard
  library. All 69 defaults are reproduced alongside it;
- they were read out of the installed extension's `package.json` and spliced in
  programmatically rather than typed, then diffed back against it — a
  hand-copied 69-item list is a silent-typo machine, and a dropped entry only
  shows up later as a P1010 on something unrelated;
- the cost is a pinned list. Intelephense has been adding defaults — `random` and
  `uri` are recent — and they will not arrive until this is resynced. The
  settings comment carries the command to diff it after an upgrade;
- global rather than per-project, because a workspace `intelephense.stubs` would
  also replace rather than merge, so every project would have to carry the whole
  list. The tradeoff is that `apcu_*` now resolves in projects that do not
  declare `ext-apcu`; the extension is installed machine-wide, so that costs a
  warning nobody was going to act on;
- `imagick` is the one other stub these projects declare and do not get. It was
  left out: `ext-imagick` is required by `ribeit-api`, but the only reference is
  `BaconQrCode`'s `ImagickImageBackEnd` inside vendor, so no first-party
  diagnostic depends on it. The settings comment says where to add it.

Verification:

- the bundled stub at `intelephense/lib/stub/apcu/apcu.php` was read directly and
  declares all five functions the file calls: `apcu_entry`, `apcu_key_info`,
  `apcu_add`, `apcu_store`, `apcu_delete`;
- `settings.json` parses; the list is 70 entries, its first 69 compare equal to
  Intelephense's `default` array, every name is in the extension's permitted
  `enum`, and there are no duplicates;
- every `ext-*` requirement across the six PHP projects under `~/dev` was checked
  against the default list. `apcu` and `imagick` are the only two not covered;
- **not yet verified: the diagnostic clearing.** That needs a window reload in
  the ribeit-api window, which was not done from this session.

### 2026-08-10 — Cmd+B resolves the strings in an Eloquent query

Intent:

- `->with('metaToken')`, `->where('status', …)` and
  `->whereNotIn('facebook_business_id', $seen)` all reported "No other references
  found". Make Cmd+B open the relation method, or the column's `@property` line,
  on the model the query was built from.

Implementation:

- `laravelQueryNavigation.js` added, wired into `goToDefinition` in the branch that
  runs only after native resolution came back empty — for a string literal it
  always does, and running it first would put a workspace symbol lookup in front of
  every ordinary Cmd+B;
- a relation resolves to the method; a dotted path is walked a hop at a time,
  reading each relation's own `belongsTo(X::class)`-style factory call to find the
  next model, so the segment under the cursor is the one that opens;
- a column resolves to its `@property` line on the model, with `$casts`/`$guarded`
  as a second look for a column real enough to be cast but not documented.

Decisions and lessons:

- **the receiver is the whole problem, not the name.** Five models in
  spro-marketing declare a `metaToken()`. Searching the workspace for the method
  offers a picker of five and calls that navigation; only the type the chain
  started from picks the right one. Everything here follows from resolving a chain
  head and declining when it cannot be resolved;
- **"any method starting with `where`" is the rule that looks dynamic and is
  wrong.** `whereStatus('active')` is Laravel's dynamic where: the first argument
  is the value and the column is in the method name, so a blanket rule sends Cmd+B
  hunting for a column called `active`. The method sets are curated for that
  reason; everything downstream of them — which model, which column, which file —
  is inferred and needs no configuration;
- **position alone cannot tell a column from a value.** The elements of
  `whereIn('status', ['active', 'paused'])` sit at the same frozen argument index
  as `'status'`, because an array argument is all one argument. Inside an array a
  string counts only when the method takes arrays of columns (`select([…])`) or
  when it is a key in a column => value map (`updateOrCreate(['col' => $v])`);
- **scanning backwards from the cursor is the obvious approach and the wrong one.**
  Whether a `)` closes anything depends on whether it sits inside a string, and
  answering that means having read forwards from the top of the file anyway. One
  forward pass keeps a bracket stack whose frames carry where the expression began,
  which call it belongs to, and how many commas have passed — three questions, one
  scan;
- **a comma resets the frame's expression start**, so
  `->when($flag, fn ($q) => $q->with('rel'))` is understood to hang off
  `fn ($q) => $q` and correctly declines, rather than inheriting the outer model
  and being right only by luck;
- **`$this` in a builder is resolved from the generic the class already declares** —
  `@extends Builder<FacebookAdAccount>` — not from its class name. Stripping
  `QueryBuilder` off `FacebookAdAccountQueryBuilder` agrees with the generic in
  every current case and is still a guess; the two names are free to diverge, and
  opening the wrong model silently is worse than not navigating. This matters more
  than it looks: this codebase keeps named queries in a builder class rather than
  in model scopes, so `$this` is the common head, not the rare one;
- declining on an unresolvable head is also what keeps `redirect()->with('status')`
  and `view($v)->with('name', $x)` out of the feature. They spell session keys and
  view variables with the same method name, and neither has a class at its head;
- the column target is the model's `@property` line rather than a migration.
  `status` on `facebook_ad_accounts` is touched by four separate migrations, so
  "the migration that defines it" is not one place to navigate to; the model
  documents each column exactly once, next to the relations;
- `getPhpImports` and `resolvePhpClassName` were promoted out of
  `laravelIntelligence._internal` into its public exports, and `scanPhpString` and
  `skipPhpComment` exported from `laravelConfigNavigation` rather than
  reimplemented. `_internal` is the test seam, and these now have real second
  callers.

Verification:

- 32 new tests, 126 in the suite, all passing. Deliberately, about half the new
  ones cover what must NOT resolve: a variable head, a nested closure, a builder
  with no generic, a session flash, a view `with`, `whereRaw`, `whereKey`, the
  value argument of `where`, the elements of a `whereIn` list, a relation argument
  of `withSum`, and a name that is not a plain identifier;
- run end to end against the real workspace with only the VS Code symbol lookup
  stubbed by a filesystem search, at the exact reported lines:

  | call | resolves to |
  | --- | --- |
  | `FacebookAdAccountQueryBuilder.php:33` `where('status', …)` | `FacebookAdAccount.php:19` |
  | `FacebookAdAccountQueryBuilder.php:34` `with('metaToken')` | `FacebookAdAccount.php:78` |
  | `FbBMService.php:210` `whereNotIn('facebook_business_id', …)` | `FacebookBusinessManager.php:19` |
  | `FbBMService.php:211` `where('is_active', true)` | `FacebookBusinessManager.php:17` |
  | `FbBMService.php:143` `updateOrCreate(['facebook_business_id' => …])` | `FacebookBusinessManager.php:19` |

- `node --check` on every changed module; manifest bumped to 0.0.27 and validated
  with `jq`; installer rerun so the registry picks the version up;
- **not yet verified: Cmd+B itself.** That needs a window reload, which was not
  done from this session.

Known boundaries, all failing closed rather than guessing:

- a chain headed by a variable — `$query->where('status', …)` — is not resolved;
- the second column of `whereColumn('a', '=', 'b')`, and the column argument of
  `withSum('lines', 'total')`, which belongs to the related model;
- a `table.column` reference keeps only the column and resolves it against the head
  model, which is wrong for a joined table;
- a model with neither `@property` docblocks nor a `$casts`/`$guarded` entry for the
  column. Migrations are not searched.

Footnote on how the `$this` case was found: the first reported call was in
`app/Jobs/Meta/SyncFbAdsJob.php`, written as
`FacebookAdAccount::query()->with('metaToken')`. It moved into
`FacebookAdAccountQueryBuilder::activeForSync()` while this work was in progress,
and the head changed from a class to `$this`. Building against the first shape
alone would have shipped a feature that worked on the example and missed the
convention the codebase actually follows — worth re-reading the target file before
trusting a premise collected earlier in a session.

### 2026-08-10 — Activity bar moved to the title bar, and why hover-reveal was refused

Intent:

- remove the left icon column. The request was for it to hide by default and come
  back on hover at the left edge.

Implementation:

- `workbench.activityBar.location` set to `"top"`. The Explorer, Search, Source
  Control and Extensions icons move into the title bar row next to the command
  center; the left column disappears and costs no vertical space either;
- `workbench.activityBar.compact` kept, with a note that it is only read when the
  location is `"default"`, so switching back stays a one-line change.

Decisions and lessons:

- **hover-reveal was investigated and refused, for two independent reasons.**
  Neither is a matter of effort:
  - *CSS can shrink the bar but cannot reclaim its space.* The part is a leaf in
    a `.monaco-grid-view`, which is `position: relative; overflow: hidden` with
    every leaf positioned and sized inline from the layout service. VS Code sizes
    the bar itself through `--activity-bar-width`, which
    `updateCompactStyle()` sets inline on the element — so a stylesheet rule does
    win over it, and collapsing the bar to zero would still leave its ~36px cell
    as a gap between the window edge and the sidebar. The result would look like a
    blank margin, not a hidden bar;
  - *the runtime toggle writes settings.* `workbench.action.toggleActivityBarVisibility`
    persists `workbench.activityBar.location`, and `settings.json` is a symlink
    into this repository — the same hazard already recorded for the project
    chooser's window toggle, which is why that one lives in `globalState`;
- a third option, `"hidden"`, was offered and not taken: it removes the part from
  the DOM, which also removes anything for a hover rule to bring back, and it
  would have meant new keybindings for the views that lost their icons;
- **this change adds nothing to the injected layer**, which is the point. The
  fragile path existed — a hot zone in `custom-workbench.css` — and it would have
  bought a worse result than a native setting, while needing a recheck after every
  VS Code update under decision 10.

Verification:

- `settings.json` parses, and `workbench.activityBar.location` reads `"top"`;
- the title bar prerequisite holds by evidence rather than assumption:
  `window.titleBarStyle` is unset, and the custom title bar is demonstrably active
  already because `custom-anchor-quick-input-to-command-center.js` anchors to
  `.part.titlebar .command-center` and works today;
- that script re-measures `getBoundingClientRect()` on every show, so the quick
  input follows the command center if the added icons shift the pill — no change
  needed there. Confirmed by reading the script, not by watching it;
- the setting applies live; no window reload and no `install_vscode.sh` run is
  needed, because `settings.json` is already symlinked and VS Code watches it.

### 2026-08-11 — Activity-bar icons centred, and the empty gutter band reclaimed

Intent:

- centre the activity-bar icons, which sat packed to the left;
- stop the line-number gutter wasting horizontal space, starting with the empty
  band to the left of the digits.

Implementation:

- `custom-workbench.css` centres the icon row. With
  `workbench.activityBar.location: "top"` the icons are **not** in the title bar —
  they are hosted by the sidebar's own header, in
  `.pane-composite-part > .header-or-footer > .composite-bar-container`, which VS
  Code gives `flex: 1` and packs to the start. The rule is scoped from the header
  down rather than applied to `.actions-container`, which is the shared class for
  every toolbar in the workbench and would have recentred unrelated ones;
- `editor.glyphMargin` off and `editor.lineNumbersMinChars` from 3 to 2.

Decisions and lessons:

- **the gutter was measured, not eyeballed.** The screenshot was decoded and
  reduced to a per-column ink profile — how many rows differ from the editor
  background at each x. In 2x pixels:

  ```
  x   3.. 64   empty            62px = 31 CSS px
  x  65.. 94   the two digits   ~7.5 CSS px per digit
  x 106..111   change marks
  x 136..138   indent guide, full height
  x 199..211   code text begins
  ```

  31 CSS px with nothing drawn in it anywhere down a 1660px capture is not a
  judgement call about whether the gutter "looks wide"; it is the glyph margin,
  which exists only to hold breakpoint and bookmark icons;
- **the glyph margin has a real cost and it is recorded here rather than
  discovered later.** Bookmarks — which this setup uses, with a keybinding and an
  expanded sidebar — draws its marker as a gutter icon, so a bookmarked line no
  longer shows one. The bookmarks still exist, the sidebar still lists them, the
  jump commands still work. Breakpoints likewise keep working while becoming
  invisible. One setting reverses it;
- `lineNumbersMinChars` is a floor, not a fixed width: VS Code uses
  `max(minChars, digits in the last line number)`, so a thousand-line file still
  gets four columns. Three reserved a column that only files of 100+ lines used;
- folding controls are the next ~19 CSS px, in the band between the digits and the
  indent guide, and were left alone. Reclaiming them means `editor.folding: false`,
  which disables folding rather than just hiding its controls —
  `showFoldingControls: "mouseover"` still reserves the space. That is a different
  trade from removing an empty margin, so it was not bundled in.

Corrections to the entry above it:

- that entry, and the option offered when the change was made, described
  `activityBar.location: "top"` as putting the icons in the title bar beside the
  command center. It does not: it puts them in the sidebar header. The choice
  between `"top"` and `"hidden"` is unaffected — the left column is gone either
  way — but the description was wrong;
- consequently the claim there that the change "adds nothing to the injected
  layer" held only until the icons needed centring. Centring is not available as a
  setting, so it is now one more rule in the fragile layer, subject to decision 10.

Verification:

- `settings.json` parses; `glyphMargin` reads false and `lineNumbersMinChars` 2;
- the CSS file's braces balance, and the selector was taken from VS Code
  1.132.0's own stylesheet rather than guessed:
  `.monaco-workbench .pane-composite-part>.header-or-footer>.composite-bar-container`
  with `flex: 1`, and `.monaco-action-bar .actions-container` as
  `display:flex; width:100%`;
- **not verified: any of it on screen.** The CSS needs "Enable/Reload Custom CSS
  and JS" plus a restart before it applies at all, and neither was run from this
  session. The two settings apply live. The honest next step is a fresh screenshot
  measured the same way, to confirm the 31px band is gone rather than assume it.

### 2026-08-11 — Overview-ruler git markers cleared and the scrollbar column narrowed

Intent:

- stop the blue marks on the right-hand scrollbar, make its background less
  visible, and make the column narrower.

Implementation, all in top-level `workbench.colorCustomizations` so every theme
gets it, matching how `errorLens.*` and `gitDecoration.*` are already handled:

- `editorOverviewRuler.modifiedForeground` cleared — the blue marks;
- `editorOverviewRuler.background` and `.border` cleared — the dark track;
- `scrollbar.shadow` cleared;
- `editor.scrollbar.verticalScrollbarSize` set to 8.

Decisions and lessons:

- **the marks were identified by sampling, not by reading token names.** A column
  profile of the screenshot gave the bands and their colours, which were then
  matched against the active theme's JSON:

  | measured | theme token | what it is |
  | --- | --- | --- |
  | `#2a2c3b` | `editorOverviewRuler.background` `#292c3c` | the track |
  | `#92a9e9` | `editorOverviewRuler.modifiedForeground` `#8caaee` | git modified lines |
  | `#48524e` | `editorOverviewRuler.addedForeground` `#a6d1893a` over the track | git added lines |
  | `#3f4152` | `scrollbarSlider.background` `#c6d0f520` over the track | the thumb |

  Every measurement came back one channel off from the theme value **in the same
  direction** — a display-profile shift, not a different colour — which is what
  makes the mapping certain rather than plausible. The blue marks turned out to be
  git change markers; bookmarks and find matches were both plausible guesses and
  both wrong;
- **a documented restriction lost to a measurement.** VS Code documents
  `editorOverviewRuler.background` as used "only when the minimap is enabled".
  The minimap is off here and the band is painted in exactly that colour anyway,
  so the doc is wrong for this build. Recorded because the natural reaction to
  that sentence is to skip the key and go looking for a different one;
- the surgical keys were preferred over `editor.overviewRulerLanes: 0`, which
  removes the ruler's decorations wholesale and would have taken errors, warnings
  and find matches with the git marks. Added and deleted lines — the olive and red
  marks — are also left in place, because only the blue was objected to.

Verification:

- `settings.json` parses; the four colour keys and the scrollbar size read back
  correctly, and all four per-theme blocks are intact;
- the column measurement that motivated the width change: the scrollbar and
  overview ruler share one column of 23 retina pixels, 11.5 CSS px;
- these apply live — no reload, no installer run;
- **not verified: the result on screen.** The honest next step is a second capture
  measured the same way, which would show the track at the editor's own colour and
  no `#92a9e9` anywhere in the column.

Note on the previous entry: the icon-centring rule described there did nothing on
screen. It was confirmed deployed — the rule was found inlined in the patched
`workbench.html`, so the loader had picked it up — which means one of its `>`
links does not exist in the live DOM. It has been rewritten with descendant
combinators covering both hosts VS Code uses for the composite bar, and both
candidate flex lines. Still unverified, and the DOM dump that would settle it has
not been run yet.

### 2026-08-11 — Reformat scoped to changed lines in one project only

Intent: `Option+Cmd+L` reformatted whole files in `construction-frontend`, and a
single `.vue` file came back with 12 insertions and 49 deletions and no semantic
change. That repository's formatting was produced by a JetBrains IDE and is
described in its `.editorconfig` almost entirely through `ij_*` keys, which only
JetBrains implements. VS Code reads about five of that file's ~400 lines and
ignores every rule governing attribute wrapping, so Volar rewraps to its own
width and the diff buries the real edit.

Implementation: a third `alt+cmd+l` binding was appended, running
`editor.action.formatChanges` — "Format Modified Lines" — guarded by
`resourcePath =~ /construction-frontend/`. It is last in the file, so where the
guard matches it wins over the two `editor.action.formatDocument` bindings
above; everywhere else those still apply unchanged.

Decisions:

- **the scope is a `when` clause, not a workspace file.** VS Code has no
  per-workspace `keybindings.json`; `resourcePath =~` is the only way to give one
  physical shortcut a project-specific meaning, which is the existing
  context-scoped philosophy applied to a path instead of a language;
- **no formatter was swapped.** `[javascript]` and `[typescript]` already point
  at `vscode.typescript-language-features`, which has no print width and never
  reflows lines — it was measured as near-inert on these files. `[vue]` points at
  `Vue.volar`, which does reflow. Narrowing the *range* fixes that without
  disturbing a global default that other projects rely on;
- **Prettier was rejected as a reconciliation.** Measured over 60 committed
  `.vue` files, its closest configuration (`printWidth: 120`, `singleQuote`,
  `semi: false`) matched 5 of 60 exactly and averaged 105 changed lines per file.
  `singleAttributePerLine` did not improve it. The gaps are structural — Prettier
  reflows prose text where `ij_html_keep_line_breaks_in_text` preserves it, and
  has no equivalent of `ij_typescript_imports_wrap = on_every_item`;
- **the JetBrains headless formatter was investigated and abandoned.**
  `format.sh` ships with the installed IntelliJ IDEA Ultimate 2026.1 and does
  format `.js` and `.ts` correctly from the same `.editorconfig`, but reports
  `Skipped, not supported` for `.vue`: `disabled_plugins.txt` contains
  `com.intellij.modules.ultimate`, so the bundled Vue plugin never loads. That is
  a licensing boundary, and `.vue` is 2,466 of the files that matter.

Verification:

- `keybindings.json` parses as JSONC — 77 entries, exactly one
  `editor.action.formatChanges`, guard string as written;
- the installed path is still a symlink back to this repository;
- the churned `.vue` file was reverted; that repository's working tree now holds
  only a pre-existing unrelated edit to `src/modules/common/config.js`;
- **not verified: the binding's behaviour in a running VS Code window.** It has
  not been reloaded and `Option+Cmd+L` has not been pressed inside or outside
  `construction-frontend`. The honest next step is one press in each place —
  changed lines only in the former, whole document in the latter.

### 2026-08-11 — Model concerns get `@mixin Model`, generated rather than written into app/

Intent: `static::addGlobalScope()` and `static::creating()` inside a trait such as
`BelongsToCompany` read as `Undefined method` (P1013). PhpStorm resolves `static::`
in a trait by looking at the classes that use it; Intelephense analyses a trait
standalone, where none of the Eloquent API exists, so correct code reports
errors. The fix that circulates for this is a `@mixin` docblock added to each
trait — but PhpStorm needs no such edit, so neither should this setup. The tag
belongs in the generated helper, not in application source.

Implementation: a fourth section in `laravelIntelligence.js`. `getTraitName` and
`usesEloquentModelApi` are pure; `scanTraitsForModelApi` walks `app/**/*.php`
with the same `workspace.fs` discipline as the other scanners, and
`renderTraitMixinBlock` emits an empty partial trait carrying
`@mixin \Illuminate\Database\Eloquent\Model`. Intelephense merges it with the
real declaration, which is the mechanism the Restify overrides already rely on.

Decisions:

- **evidence, not location.** A trait qualifies by calling API that exists
  nowhere but an Eloquent model — the model events and `addGlobalScope` on the
  static side, the relation builders and `newQuery`/`qualifyColumn` on the
  instance side. "Every trait under `Models/Concerns`" would have been simpler
  and wrong: `HasUuid` lives in `Global\Concerns`, and plain helper traits sit
  beside models everywhere;
- **`getAttribute`/`setAttribute`/`getKey`/`getTable`/`forceFill` are not
  evidence, and this was learned the hard way.** The first cut included them and
  claimed `Global\Dtos\Concerns\HasAttributes`, which is composed into DTO casts
  (`Dtos\Cast\AP`, `GL`, `ES`, `IV`) rather than models. Any attribute bag
  implements those names, so the mixin would have asserted "this is an Eloquent
  model" across the DTO layer and silenced real diagnostics there. Dropping them
  took the match count from 90 to 87 and removed the only false positive found;
- **the trait body stays empty.** Declaring methods would risk shadowing the
  real ones; an empty body contributes only the docblock;
- **`@mixin` is a claim.** It asserts the trait is only ever composed into
  models. That is why the detector demands positive evidence rather than
  defaulting to "probably a model".

Verification:

- `node test/laravelIntelligence.test.js` — **28 passing**, six of them new,
  including a regression fixture built from the real DTO concern;
- the detector was run over `construction-backend/app` (486 traits): **87** earn
  the mixin, all recognisably model concerns, and the three that prompted this —
  `BelongsToCompany`, `WithAuthor` (52 models), `HasUuid` (10 models) — are all
  covered. No `Dtos` namespace appears in the output;
- `node --check` passes on the modified module;
- **not verified: Intelephense's response.** The command has not been run in a
  live window and the P1013 diagnostics have not been observed clearing. The
  merge behaviour is documented and already used for a vendor trait
  (`ProxiesCanSeeToGate`), but a redeclared *first-party* trait is new here. The
  honest next step is to run "Laravel: Refresh IDE Helpers & Icons" in
  `construction-backend`, reload, and reopen `BelongsToCompany.php`.

Follow-up not taken: `construction-backend/.gitignore` lists `_ide_helper.php`
and `_ide_helper_models.php` but not `_ide_helper_manual.php`, so the generated
file is currently staged for commit there and will now carry 87 extra blocks.
That is a change to a project repository and was left for its owner.

### 2026-08-11 — Activity bar hidden outright, and the two views that needed keys

Intent: the icon strip was still there. `"top"` did not put the icons beside the
command center as the 2026-08-10 entry expected — it gives them a band of their
own below the title bar, and the Explorer starts under it. Measured from a
screenshot of the live window: the title bar's colour `#242633` ends at 9 CSS px
and the strip's `#2a2c3b` runs from there through the bottom of the crop, so the
band is real vertical space, not a title-bar row. The icons in it were not being
used.

Implementation: `workbench.activityBar.location` set to `"hidden"`, which removes
the part from the DOM and lifts the sidebar by the band. Two keybindings replace
the icons that were actually wanted:

- `Shift+Cmd+1` — Explorer. Already bound, and independent of the icons;
- `Shift+Cmd+X` — Extensions, and pressed again from Extensions, Remote Explorer.
  Two entries keyed on `activeViewlet`, the same shape the Explorer toggle above
  them already uses.

Decisions:

- **this reverses the third option refused on 2026-08-10**, and the reason it was
  refused is the reason it is now correct. That entry set it aside because
  `"hidden"` "would have meant new keybindings for the views that lost their
  icons". That is exactly the trade being made: the icons were unused, so paying
  two keybindings to reclaim the band is a gain rather than a cost. The earlier
  entry stands as written — the trade changed, not the facts;
- **the earlier entry's expectation about `"top"` was wrong** and is corrected
  here rather than edited there. It predicted the icons would "cost no horizontal
  or vertical space"; they cost a band. Anyone reading that entry alone would
  reach for `"top"` again;
- **`Shift+Cmd+X` cycles rather than closes.** `activeViewlet != extensions`
  covers a hidden sidebar too, so the first press always lands on Extensions from
  anywhere, and only a second press reaches Remote;
- **no injected CSS was added.** Decision 10's recheck-after-update cost is
  avoided; this remains two native settings keys and two keybindings.

Verification:

- both files parse — `settings.json` 134 entries with
  `workbench.activityBar.location` reading `"hidden"`, `keybindings.json` 79
  entries with the `Shift+Cmd+X` pair as written;
- the command ids are not assumed: `workbench.view.remote`,
  `workbench.view.extensions` and `workbench.view.explorer` were each found in
  the shipped `workbench.desktop.main.js`, so all three resolve in this build;
- the band measurement came from decoding the screenshot's pixels, not from
  reading it;
- **not verified: the result on screen.** The window has not been reloaded, and
  neither `Shift+Cmd+X` press has been made. The honest next step is one press
  from the Explorer — expect Extensions — and a second — expect Remote Explorer.

### 2026-08-12 — Format Modified Lines withdrawn: it corrupts indentation in Vue templates

Intent: undo the previous day's binding. `editor.action.formatChanges` on
`Alt+Cmd+L` in `construction-frontend` was meant to limit reformat churn to the
lines actually edited. It does that, and in `.vue` files it also mangles them.

What it does wrong: range formatting hands the formatter only the changed line
ranges. A `git diff` of a file under active work is many small scattered hunks —
`DashboardPage.vue` had 289 insertions across dozens of them — and a hunk
routinely covers *some* lines of a multi-line element. The formatter then
re-indents those lines as if they were a standalone snippet, with no knowledge
that they sit inside a tag opened eight columns in. Observed in one element:

    <BaseInput
        v-model="dashboard.name"
        :placeholder="$t('Dashboard Name')"
    :disabled="!canEditCurrent"          <- column 0
      :style="{ width: nameWidth }"      <- partial indent
        inline-errors
        class="dashboard-page-input"
    @blur="saveDashboard"                <- column 0
    />

Across the same file it also left attribute runs at indent 13 and pushed a
`<style>` block to indent 64. Vue templates are the worst case for this: an
attribute is by definition mid-element, so a hunk boundary almost always falls
inside a construct. JS statements are mostly self-contained and survive it.

Implementation: the binding was removed. `Alt+Cmd+L` is `editor.action.formatDocument`
again everywhere, as it was before 2026-08-11.

Decisions:

- **the 2026-08-11 entry proposed this binding on reasoning, not evidence.** It
  recorded the churn measurement that motivated it but never checked what range
  formatting does to a partially-edited element. Reformat behaviour has to be
  tried on a real dirty file, not argued from the command's description;
- **the two options for `.vue` are now both known bad**, and that is the useful
  result: whole-document format rewraps ~105 lines per file (measured over 60
  files on 2026-08-11), range format corrupts indentation. Not formatting `.vue`
  at all is the remaining honest answer until the repo adopts a shared formatter;
- **whole-document format is the repair.** With full context the indentation
  resolves correctly, so one `Alt+Cmd+L` on a damaged file fixes every region —
  at the cost of that file's rewrap.

Verification:

- `keybindings.json` parses — 78 entries, zero `editor.action.formatChanges`,
  the `Shift+Cmd+X` pair from the previous entry still present;
- the damage was measured, not inferred: attribute lines at column 0 (L31, L35),
  runs at odd indent 13 (L88, L120–L127) and 15 (L91), and a `<style>` block at
  indents 64–67 from L505;
- **not verified: the repair.** The file was being edited while this was written
  — its length changed between two reads — so nothing was rewritten from here.

### 2026-08-12 — The tab label's fade strip stopped staying dark on hover

Intent: a 5px vertical band near the right edge of each tab kept its unhovered
colour while the tab around it lifted, so hover read as broken on that strip.

What it is: the label fade, a pseudo-element VS Code paints only while tabs are
shrinking —

    .tab.sizing-shrink > .tab-label > .monaco-icon-label-container:after {
      content:""; position:absolute; right:0; width:5px; height:calc(100% - 2px) }

`workbench.editor.tabSizing` is `"shrink"` here, which turns it on. Its gradient
is painted from the tab's background at render and never repainted when hover
changes that background. Hidden here with the same `display:none` VS Code applies
one rule later under its `.style-override` class — a class this workbench does
not carry, which is also why the `.monaco-workbench.style-override` block earlier
in the file is currently dormant.

Decisions and lessons:

- **the first diagnosis was wrong, and the way it was reached is the lesson.**
  `.tab-fade-hider` was proposed because VS Code gives it `width:5px` under
  `.sizing-shrink.close-action-off`, and both classes are produced by settings in
  use here. A rule matching on width and plausible trigger is not identification.
  The DOM settled it in one call: `tab-fade-hider` computes to width `auto`,
  meaning `display:none`, while `monaco-icon-label-container::after` reports
  5 x 24. A rule was written and then removed on that evidence;
- **a grep can rule things out that are there.** The search that should have found
  this filtered CSS rules for `tab` in the selector; the owning class is
  `monaco-icon-label-container`, which contains no such substring, so the one rule
  that mattered was excluded from a search reported as "0 tab rules paint a
  gradient". Filter on the property being hunted, not on where it is expected;
- **hidden rather than recoloured.** Recolouring means restating the gradient per
  hover state and per theme against a value VS Code writes inline; hiding is what
  the product itself does in its newer style. The cost is that an over-long label
  now clips instead of fading, and `workbench.editor.limit.value` caps tabs at 8,
  so labels rarely truncate far enough for it to show.

Verification:

- `custom-workbench.css` parses — braces balanced at 50/50, 455 lines, and no
  `tab-fade-hider` rule left behind;
- the element identity is from the live DOM, not inferred: `5 x 24` for
  `div.monaco-icon-label-container::after`, matching `width:5px` and
  `height:calc(100% - 2px)` in the shipped stylesheet, and matching a band
  measured at 5 CSS px from a screenshot;
- **not verified: the result on screen.** Injected CSS needs "Reload Custom CSS
  and JS" and a restart, which has not been run. The next step is that reload and
  one hover over an inactive tab.

### 2026-08-12 — Vue components resolve on Cmd+B without touching the project

Intent: `Cmd+B` on `<DashboardPage />` reported "No other references found".
The cause is not the tab, the tsconfig or the language server: the import is
written without the extension —

    const DashboardPage = () => import("@/modules/.../DashboardPage")

TypeScript resolves a specifier by trying `.ts`, `.tsx`, `.d.ts`, `.js`, and
**never `.vue`**; no compiler option adds it. Vite does resolve it, so the app
builds and only the tooling is blind. Measured in construction-frontend: 2,664
component imports carry the extension and **1,655 do not**, so roughly two in
five components were unreachable.

Adding `.vue` at the call sites is the upstream advice and would have been 1,655
edits in a shared repository. The requirement was to fix it without repo changes,
which is what this extension is for.

Implementation: `vueComponentNavigation.js`, a definition provider for `vue`,
`javascript` and `typescript`. It reads the binding out of the document already on
screen — static import, `() => import(...)`, or `defineAsyncComponent` — maps the
`@/` alias onto `src/`, and returns the first candidate that exists, trying
`.vue` and `/index.vue` ahead of the extensions TypeScript would have tried.

Decisions:

- **a provider, not a branch in the Cmd+B command.** Cmd+B is a command here that
  calls `vscode.executeDefinitionProvider` and falls back; registering a provider
  instead means the same resolution also serves Cmd+Click and the peek widgets,
  and it composes with the native result rather than replacing it;
- **the workspace-scan lesson from the Laravel helpers still applies.** That
  module is command-driven precisely because live providers get auto-invoked and
  can trigger an analysis storm. This provider reads only the open document's
  text and stats a few paths. The single `findFiles` call is a last resort for a
  globally registered component, when the file declares no binding at all;
- **package specifiers are ignored rather than chased.** Rewriting
  `vue-feather-icons` into `src/` would invent paths and could shadow a real
  node_modules resolution the language server already answers correctly;
- **`.vue` is preferred over `.js` when both exist**, because the caller used the
  name in a template.

Verification:

- `node test/vueComponentNavigation.test.js` — **11 passing**, including the
  welcome.vue shape verbatim and a case asserting `DashboardPage` does not match
  a `DashboardPageHeader` import;
- run against the real repository: the failing case resolves
  `@/modules/dashboard/components/dashboard/DashboardPage` to
  `src/modules/dashboard/components/dashboard/DashboardPage.vue`, and **1,655 of
  1,655** extensionless imports resolve — 100%;
- `node --check` passes on the new module and on `extension.js`;
- **not verified: behaviour in the extension host.** The window has not been
  reloaded and no key has been pressed. The next step is a reload, then Cmd+B on
  `<DashboardPage />` in `welcome.vue`.

### 2026-08-13 — Playwright e2e files joined one TypeScript project for references

Intent: `Cmd+B` inside `construction-frontend/e2e` reported "No other references
found" on almost every symbol, including functions imported across support,
model, and spec files.

Diagnosis: the repository's root `tsconfig.json` includes only `src/**/*.ts`,
`src/**/*.tsx`, declarations, and Vue files. Every `e2e/**/*.ts` file therefore
sat outside the configured TypeScript project. The custom command was working as
designed — it asked VS Code's definition and reference providers — but the
provider did not own the complete Playwright file graph.

Implementation: added `construction-frontend/e2e/tsconfig.json`. It defines a
strict, no-emit NodeNext project over all e2e TypeScript files and the root
`playwright.config.ts`. No Smart References code or keybinding changed; native
TypeScript intelligence now supplies the missing cross-file locations to the
existing command, Cmd+Click, rename, and other language features.

Decisions and lessons:

- **the project boundary is the fix.** Adding a text-search fallback to Smart
  References would duplicate TypeScript badly: it could match comments and
  unrelated same-name symbols while still lacking type identity;
- **a dedicated config is safer than broadening the app config.** The root file
  carries Vue-specific plugins, path aliases, type libraries, and application
  source includes. Playwright is a Node project with a different runtime, so its
  compiler boundary should say that explicitly;
- **`playwright.config.ts` belongs to the same graph.** It imports the e2e
  environment module, so including only the subtree would leave one real caller
  outside reference results;
- `Cmd+B` still means definition first and references second. On an imported use
  it opens the declaration; on the declaration it shows the other uses. This
  change restores the provider data rather than changing that navigation model.

Verification:

- TypeScript 6.0.3, the version bundled with VS Code 1.133.0, discovers
  `e2e/tsconfig.json` from an e2e test file and loads all 21 e2e TypeScript files;
- a language-service reference lookup for `gotoCreateForm` returns 9 locations
  across `navigation.ts`, both entity models, and both entity specs;
- syntactic, semantic, config, and compiler-option diagnostics over that project:
  **zero**;
- `git diff --check` passes in `construction-frontend`; its pre-existing
  `src/modules/common/config.js` modification remains untouched;
- **not verified: the live key press.** The running TypeScript server has not
  been restarted from this terminal. Run **TypeScript: Restart TS Server** (or
  reload the window), then press `Cmd+B` on `gotoCreateForm` in
  `e2e/support/navigation.ts` to verify the picker in the live extension host.

### 2026-08-13 — Breadcrumb suppression restored after a latent settings regression

Intent: the breadcrumb row reappeared beneath the editor tabs, making the tabs
look flush against another header strip instead of separated from the editor by
their compact bottom spacing.

Diagnosis: the custom tab CSS was still present in all three relevant places:
the tracked source, the live User-folder symlink, and the CSS inlined into
`workbench.html`. It still gives the 26px tabs a 30px container with 2px top and
bottom padding. The missing piece was the native `breadcrumbs.enabled: false`
setting. Git history shows it existed before the 2026-07-27 settings
consolidation and was dropped in that commit. VS Code 1.133.0 still registers
that exact setting and defaults it to `true`, so the regression stayed latent
until the default was observed again.

Implementation: restored `"breadcrumbs.enabled": false` in the tracked,
symlinked `User/settings.json`, beside the tab settings it visually affects. No
CSS selector, height, padding, or loader state changed.

Decisions and lessons:

- **use the native setting for a native row.** Hiding the breadcrumb widget with
  injected CSS would duplicate a supported preference and add another fragile
  DOM selector;
- **the apparent tab-spacing failure was downstream.** The tab row retained its
  2px bottom padding; the unexpected breadcrumb row immediately below it changed
  the composition and consumed the space that used to lead into the editor;
- **a current default can expose an old omission.** The visible regression did
  not require a recent source edit: the setting had been absent since July while
  another persisted state masked it.

Verification:

- the tracked and live settings paths resolve to the same repository file;
- VS Code 1.133.0's bundled configuration schema still defines
  `breadcrumbs.enabled` as a boolean with default `true`;
- the injected `workbench.html` contains the compact-tab CSS, including the 30px
  container and 2px vertical padding, so the loader is active;
- settings JSONC parsing and repository whitespace checks pass;
- the active VS Code 1.133.0 window was reloaded and captured with Developer
  Tools closed: the breadcrumb row is gone, the 26px tabs remain vertically
  separated inside their 30px row, and the editor begins beneath that gap.

### 2026-08-13 — Active-tab effects moved onto VS Code's modern fill element

Intent: the active tab looked like two nested buttons, and hovering it made the
outer shape brighten around an unchanged inner shape. The result resembled
uneven vertical padding or a missing bottom edge.

Diagnosis: VS Code 1.133's `modern-ui-tabs` layout makes the outer `.tab`
transparent and paints the rounded button on a new `.tab-fill` child, inset by
one spacing step on the left and right. The existing custom ring and active-hover
overlay predate that DOM. Both still targeted the outer `.tab`, overriding its
required transparency while the native inner fill continued painting above it.
The two independently rounded layers produced the double capsule in the
screenshots; the tab's measured 26px height and zero vertical padding were not
the fault.

Implementation: split the custom ring and active-hover selectors at the actual
layout boundary. Legacy tabs retain both effects on `.tab`; `modern-ui-tabs`
applies them to `.tab-fill`. The modern hover rule adds only the 5% white overlay
and leaves VS Code's active fill colour in place. Heights, padding, radius,
palette, and the native horizontal inset are unchanged.

Decisions and lessons:

- **paint the element that owns the shape.** Adjusting top or bottom padding
  would have moved the tab while leaving both paint layers intact;
- **keep the legacy selector explicitly scoped.** The custom CSS can still load
  without `modern-ui-tabs`, so the old DOM remains supported without being able
  to override the modern parent's transparency;
- **the hover was diagnostic.** It did not create the second layer; it made the
  existing outer layer brighter and therefore easier to identify.

Verification:

- a one-off structural regression check fails before the change because the
  shipped stylesheet contains the modern `.tab-fill` while both custom effects
  target the outer tab;
- after the change, the same check passes only when modern ring/hover selectors
  target `.tab-fill` and the legacy outer selectors exclude `.modern-ui-tabs`;
- **Reload Custom CSS and JS** was run through this setup's actual command-palette
  binding, `Cmd+P` (`Shift+Cmd+P` pins an editor here), and the installed
  `workbench.html` contains the new legacy/modern split under a fresh loader
  session id;
- after **Developer: Reload Window**, separate normal and pointer-hover captures
  of the active `README.md` tab show one rounded fill and one ring. The former
  brighter outer capsule and the apparently missing bottom edge are gone;
- the repository checksum-repair script was not run because modifying the
  application's integrity record was not authorized. The injected CSS works,
  but VS Code may continue to show its expected modified-installation warning.

### 2026-08-13 — Correction: modern tab spacing was clipping label bottoms

Correction to the preceding entry: moving the ring and hover overlay to
`.tab-fill` removed the double capsule, but its conclusion that the measured
26px tab height was not involved was wrong. The full-window captures were too
wide to expose the cropped glyph edge; the close screenshot did.

Diagnosis: VS Code 1.133's non-wrapping modern-tab rule adds
`border-block: var(--vscode-spacing-size40) solid transparent` to each `.tab`
and normally grows its minimum height by two matching spacing steps. The compact
customization overrides that minimum back to 26px and gives the label a 26px
line-height, while the older rounded-tab rule clips the outer element with
`overflow: hidden`. The transparent borders therefore consume part of the fixed
26px box and the label overflows its remaining content area, cutting off the
bottom of `README.md` and other labels. Pinned tabs made it especially clear
because their semibold text and visible pin action fill more of the row.

Implementation: set `border-block: 0` only on modern, non-wrapping editor tabs.
The existing 30px `tabs-and-actions-container` still supplies 2px above and
below the 26px tab, so this removes duplicated internal spacing rather than the
intended gap. No font, line-height, pin padding, tab height, or wrapping layout
changed.

Decisions and lessons:

- **the close crop outranks the full-window smoke test.** Shape correctness did
  not prove text correctness at that scale;
- **remove the duplicate spacing source.** Increasing the tab height would make
  the whole header taller, and removing `overflow: hidden` would let the symptom
  escape its box while reviving the accent-strip corner defect;
- **scope out wrapping tabs.** They use a different border width as part of row
  separation and `workbench.editor.wrapTabs` is disabled here.

Verification:

- a one-off check reproduces the conflict before the change: shipped modern
  vertical borders, forced 26px tab and line-height, clipping enabled, and no
  modern border reset;
- after the change the structural check requires the modern non-wrapping
  `border-block: 0` override and balanced CSS;
- **Reload Custom CSS and JS** produced a fresh injected session containing the
  border reset, then **Developer: Reload Window** applied it;
- close normal and hovered captures show the semibold pinned `README.md` label
  with an intact lower edge, and the descender on ordinary `dialog.ts` is fully
  visible. The active tab remains one rounded shape in both states.

### 2026-08-13 — Modern active fill toned down and centred within equal tab boxes

Intent: the active tab remained too pale after the geometry repairs and its
painted capsule looked taller than the unfilled tabs beside it. Every tab should
occupy the same row height, with a quieter active state.

Diagnosis: the outer geometry was already equal: the inspected active tab and
the shared custom rule both report 26px, and that rule applies to every tab.
Two current modern-UI defaults created the visual difference:

- VS Code 1.133 paints `.tab-fill` from
  `--modern-ui-editor-tab-action-active-background`, a 22% foreground mix over
  the editor. The existing override targets the older
  `--modern-ui-tab-active-background`, so the new fill ignored the deliberately
  darker `tab.activeBackground` values in `settings.json`;
- `.tab-fill` uses `inset: 0 ...`, painting the full 26px outer height. An
  inactive tab has no capsule, so the full-height active shape reads taller even
  though both outer boxes are identical.

Implementation: point the current modern active-fill variable at
`var(--vscode-tab-activeBackground)` and give every non-high-contrast modern
`.tab-fill` a 1px block inset. Outer tabs remain 26px; active, selected, and
hover fills are all centred at 24px. The label still owns the full 26px content
area, so the clipping correction is preserved.

Decisions and lessons:

- **change the paint, not the tab.** Altering active height would make the boxes
  genuinely unequal; the measured boxes were already equal;
- **use the existing palette.** Both dark themes already carry active colors
  derived for a restrained contrast ladder, so another literal grey would
  create a second source of truth;
- **apply the inset to every fill state.** Scoping it only to `.active` would
  make inactive hover and multi-selection capsules a different height;
- high-contrast themes retain VS Code's native geometry and colors.

Verification:

- the pre-change structural check fails with the installed 22% foreground mix,
  equal 26px outer tabs, no current-variable redirect, and no vertical fill
  inset;
- after the change the check requires the current variable redirect, the shared
  1px fill inset, equal 26px outer tabs, and balanced CSS;
- **Reload Custom CSS and JS** produced a fresh installed session containing
  both rules, followed by **Developer: Reload Window**;
- close normal and active-hover captures show the active `README.md` fill on the
  darker theme color, centred at the same bounds in both states. A separate
  neighboring-tab hover capture uses the same vertical fill bounds, while every
  label retains its intact baseline inside the unchanged 26px outer row.

### 2026-08-13 — Pinned actions share the tab fill, with an upgrade guard

Intent: hovering the pin drew a separate rectangle over the right end of the
tab. On the active tab it had a different colour; on an inactive tab it appeared
taller than the hover fill. Keep the pin visually part of one tab surface and
make future VS Code updates fail visibly when this private DOM contract changes.

Diagnosis: VS Code 1.133 paints two sibling layers with different geometry. The
modern `.tab-fill` is now centred at 24px by this customization, but the shipped
`.tab-actions` rule remains absolutely positioned at `top: 0; bottom: 0`, so its
background covers all 26px. The active mismatch had a second cause: the custom
5% hover lift belongs to `.tab-fill`, while the native action layer repaints the
unlifted `--modern-ui-editor-tab-action-active-background` above it.

Implementation:

- centre modern `.tab-actions` with the same 1px block inset as `.tab-fill`;
- keep the pinned action background transparent. Modern pinned tabs already
  reserve 28px of right padding for the action, so there is no label underneath
  to mask; the shared fill, active ring, and hover lift remain visible unchanged;
- add `check_workbench_customizations.sh`. Its source-only mode checks the 26px
  outer tab, 24px fill/action geometry, theme-backed active colour, transparent
  pinned surface, and balanced CSS. Its normal mode also checks the installed
  VS Code stylesheet for the semantic modern-tab hooks and confirms the current
  repository CSS markers are present in `workbench.html`;
- document that check as the first post-upgrade gate in `vscode/README.md` and
  list it in the current deployment model above.

Decisions and lessons:

- **remove duplicate paint where the underlying layer is authoritative.** Trying
  to reproduce the fill colour, ring, and image overlay on `.tab-actions` would
  create two surfaces that can drift again;
- **the action hit area remains.** Transparency changes only paint; the native
  pin action, focus behavior, and reserved padding are untouched;
- **private workbench CSS cannot be made update-proof.** VS Code updates replace
  the injected HTML and may rename or restructure the DOM. The useful guarantee
  is that the checker stops on a missing injection or missing semantic hook
  before a checksum repair or a claim that the design survived;
- **structural checks are necessary but not visual proof.** A close active-pin
  and inactive-pin hover capture remains part of the update smoke test.

Verification:

- before the CSS fix, the new source check failed with
  `missing the centred 24px tab action layer`;
- before reinjection, the full check passed the source contract and failed on
  the missing current `.tab > .tab-actions` marker in the installed workbench;
- **Reload Custom CSS and JS** and **Developer: Reload Window** were run. The
  full check then passed all three gates: 58 balanced source rule blocks, the
  installed modern-tab DOM contract, and the current workbench injection;
- close live captures with the pointer visibly over each pin show one continuous
  active `README.md` fill and no separate tall rectangle behind the inactive
  `data.ts` pin;
- the checksum repair was not run; the expected modified-installation warning
  may remain.

### 2026-08-13 — Empty editor groups now continue the Explorer surface

Intent: replace the large VS Code logo and the editor-coloured empty canvas with
a calmer empty state: the same surface as the Explorer, one small glyph, and the
useful native shortcut hints left in place.

Implementation:

- set `editorGroup.emptyBackground` to each configured theme's actual
  `sideBar.background`: Monokai Pro `#221f22`, Catppuccin Noctis Frappé
  `#292c3c`, and both GitHub Light variants `#f6f8fa`;
- replaced only `.letterpress`'s background artwork with a 44px, low-opacity
  `⌘` inside a 72px box. The surrounding watermark container and `.shortcuts`
  remain native, so Show All Commands and Go to File still display and update
  with their real keybindings;
- excluded high-contrast workbench classes, and extended the compatibility
  checker to require both the installed `.letterpress` hook and the injected
  glyph marker after a VS Code upgrade.

Decisions and lessons:

- **use the native colour boundary for the surface.** VS Code applies
  `editorGroup.emptyBackground` directly to an empty group, so the background
  needs no private selector; only changing the artwork crosses into injected
  CSS;
- **keep the watermark semantics and replace only its art.** Hiding the whole
  watermark would also remove the two useful shortcut rows, while a custom image
  would add an asset and a scaling path for one quiet symbol;
- **theme matching is explicit.** VS Code colour customizations cannot reference
  `sideBar.background` as another token, so each configured theme repeats its
  installed sidebar value. If a theme changes that value later, these pairs must
  be resynced.

Verification:

- `settings.json` parses as JSONC, and all four configured themes carry the
  expected empty-group value copied from their installed Explorer surface;
- `check_workbench_customizations.sh --source-only` passes with 60 balanced CSS
  rule blocks, including both new watermark rules; shell syntax and
  `git diff --check` pass;
- the live settings and stylesheet paths both resolve to this repository, and
  the full compatibility check passes the installed VS Code 1.133 `.letterpress`
  DOM gate before stopping on the missing new injection marker, as expected
  before the loader is rerun;
- **not verified: the rendered result.** The colour setting is live through the
  existing settings symlink, but the glyph needs **Reload Custom CSS and JS** and
  a VS Code restart before it can be judged on screen.

### 2026-08-15 — Tab file icons optically aligned with their titles

Intent: the editor-tab file icons sat visibly above the adjacent filename text.
Align the artwork without changing tab height, the text baseline, or the same
icon theme's Explorer rendering.

Diagnosis: the supplied 1022 x 72 Retina capture makes the mismatch measurable.
Each TypeScript icon's solid blue square occupies y=16..39, centred at 27.5,
while the active filename's dark ink occupies y=20..44, centred at 32. The icon
therefore sits about 4.5 device pixels, or roughly 2 CSS pixels, above the
title's optical centre. VS Code 1.133 centres `.monaco-icon-label::before` in its
line box, and the PhpStorm TypeScript SVG is itself symmetric in a 16px viewbox;
the mismatch is between geometric icon centring and the font's visible ink, not
a malformed asset or unequal tab boxes.

Implementation: on editor tabs with a file icon, set only the pseudo-element's
`background-position-y` to `calc(50% + 2px)`. The pseudo-element dimensions,
the label's 26px line-height, and the tab's 26px outer geometry remain unchanged.
The compatibility checker now requires that optical offset in source and in the
installed injection, and guards the native file-icon pseudo-element, tab
line-box, and `.has-icon` class hooks on which it depends.

Decisions and lessons:

- **move the artwork, not the flex item.** A transform or relative offset on the
  pseudo-element would also move its layout box; changing the background
  position leaves spacing and clipping untouched;
- **scope the correction to editor tabs.** Explorer rows use the same file icon
  theme but a different text and row geometry, so a global icon-theme change
  would solve one surface by shifting another;
- **use an optical correction.** The SVG and native line box are geometrically
  centred already; aligning visible icon and font ink is the relevant boundary.

Verification:

- before the CSS rule, the extended source check failed with
  `missing the 2px tab file-icon optical alignment`;
- after the rule, source-only verification passes with 61 balanced CSS rule
  blocks; shell syntax and `git diff --check` pass, and the full checker reaches
  the installed-injection gate, proving the three new native VS Code 1.133
  selector/class checks pass;
- `bash tests/run.sh` passes both headless Neovim suites;
- the installed workbench is still on the older injection and stops first on
  the previously added empty-editor glyph marker. Run **Reload Custom CSS and
  JS**, restart VS Code, and rerun the full checker before judging the pixels;
- **not verified: the rendered alignment.** The source correction is measured
  from the supplied capture, but it is not active in a freshly reloaded VS Code
  window yet.

### 2026-08-15 — Actionless modern tabs now have balanced horizontal padding

Intent: after the icon alignment was loaded, the active `generics.ts` tab still
looked crowded on the left and loose on the right. Balance the content without
changing the action spacing of pinned tabs.

Diagnosis: the new 258 x 72 Retina capture confirms the perception. The active
fill spans x=13..223, while the visible TypeScript square begins at x=21 and the
filename ink ends at x=200. More importantly, VS Code 1.133's shipped modern-tab
rule proves the underlying layout is asymmetric: every normal tab receives
`padding: 0 var(--vscode-spacing-size80) 0 var(--vscode-spacing-size40)`, or 8px
right and 4px left. This setup has `workbench.editor.tabActionCloseVisibility`
disabled, which gives ordinary tabs `.close-action-off`; there is no close hit
area requiring that ordinary-tab asymmetry. Pinned tabs still expose their
separate unpin action.

Implementation: raise only `.close-action-off:not(.sticky-compact)` modern
tabs' left padding from the native 4px token to the same 8px token already used
on the right. The right padding, icon spacing, tab height, fill geometry, and all
tabs with a close or unpin action remain untouched. The compatibility checker
now guards the native asymmetric padding rule, the runtime `.close-action-off`
class, the source correction, and its installed injection marker.

Decisions and lessons:

- **balance the semantic padding boxes.** Font side bearings and transparent
  space inside an SVG make visible-ink gaps imperfect measuring proxies; the
  shipped 4px/8px declarations identify the actual mismatch;
- **do not steal action space.** Reducing the right side would make a future
  close/unpin glyph cover more of the filename. Increasing the actionless left
  side preserves the existing right-side contract;
- **keep pinned tabs out of the change.** Their action layer and reserved 28px
  padding were deliberately repaired earlier and should remain authoritative.

Verification:

- before the CSS rule, the extended source check failed with
  `missing the symmetric padding for actionless modern tabs`;
- after the rule, source-only verification passes with 62 balanced CSS rule
  blocks;
- the full checker initially passed the source, shipped-CSS, runtime-class, and
  existing injection gates, then stopped specifically on the missing new padding
  marker. A later run passes all gates after `workbench.html` acquired the new
  marker;
- **not verified: the rendered balance.** The installed injection is current,
  but the active window still needs a restart and inspection of an ordinary and
  a pinned tab before calling the visual result complete.

### 2026-08-15 — File-aware `Cmd+R` runner starts with TypeScript

Intent: make `Cmd+R` run the active file through explicit, extensible rules.
Start with `.ts`: save the current buffer, execute it visibly in a terminal, and
show a clear message for every file that has no rule yet. Move the PhpStorm-style
editor Replace action to `Shift+Cmd+R`.

Diagnosis and command choice:

- `Cmd+R` came from the installed IntelliJ IDEA Keybindings extension as
  `editor.action.startFindReplaceAction`; the repository had also assigned
  `Shift+Cmd+R` globally to `python.execInTerminal`, shadowing the keymap's
  Replace in Path binding;
- `/opt/homebrew/bin/ts` exists, but it is Moreutils' timestamp utility and its
  usage is `ts [-r] [-i | -s] [-m] [format]`. It cannot execute TypeScript;
- the active playground has `tsx` 4.23.1 as a local dev dependency. The runner
  therefore uses `npx --no-install tsx <workspace-relative-file>`: project-local,
  visible in the terminal, and unable to hide a network install when a project
  lacks the required runner.

Implementation:

- replace the deprecated JavaScript-only
  `javascript.suggest.completeFunctionCalls` setting with the unified
  `js/ts.suggest.completeFunctionCalls`, enabling native call completion for
  both languages;
- add `local.current-file-runner`, installed through the existing local-extension
  registry. Its pure rule layer currently accepts language `typescript`, suffix
  `.ts`, and rejects declarations; the command layer saves dirty buffers, reuses
  a dedicated **Run Current File** terminal per workspace, preserves editor
  focus, and sends the quoted project-relative command;
- unsupported, untitled, and missing-editor states use informational messages.
  A failed save uses a warning and never starts the command;
- explicitly remove the keymap's `Cmd+R` Replace binding, bind `Cmd+R` to the
  runner while an editor has text focus, and bind `Shift+Cmd+R` to editor Replace.

Decisions and lessons:

- **one command owns dispatch.** Filename, language, and location rules belong
  in an inspectable rule table, not in overlapping `when` clauses and terminal
  text keybindings;
- **use the project's runner.** A global alias would conflict with the existing
  `ts` utility and make project behavior depend on an undocumented shell state;
- **do not download on Run.** `--no-install` makes missing `tsx` an ordinary,
  visible project error instead of mutating the project or global toolchain;
- **save before execution.** The terminal runs the content visible in the editor,
  while a failed save stops cleanly;
- **keep action context narrow.** `Cmd+R` only runs with editor text focus, so it
  does not steal terminal or picker keystrokes. Pinned/preview state is unrelated.

Verification:

- the runner's eight Node tests pass, covering project-relative and standalone
  commands, declaration/TSX/JavaScript rejection, shell quoting, unsupported-file
  messaging, dirty-file save, terminal reuse, and save failure;
- from `/Users/mac/dev/node-playground`, the exact generated command
  `npx --no-install tsx random/typescript-examples.ts` exits 0 and prints every
  example through the final `.then(): Async User` line;
- the existing installer linked the settings, keybindings, and extension source
  into their live locations, and `code --list-extensions --show-versions`
  reports `local.current-file-runner@0.0.1` after reloading the active window;
- live `Cmd+R` on `package.json` shows
  `I have not set up run logic for package.json (json) yet.`; live
  `Shift+Cmd+R` opens the editor Find/Replace widget;
- live `Cmd+R` on TypeScript sends
  `npx --no-install tsx 'random/typescript-examples.ts'` to the dedicated
  terminal. A smaller `generics.ts` run visibly printed its expected values,
  and an exact rerun of the larger file in that VS Code terminal exited 0 and
  reached `.then(): Async User`. One earlier large-file invocation displayed a
  transform error, but the same command and environment did not reproduce it.

### 2026-08-15 — Line numbers regain one column of left padding

Intent: move the line-number digits slightly away from the editor's left edge
without restoring the much wider glyph margin removed on 2026-08-11.

Implementation: raise `editor.lineNumbersMinChars` from 2 to 4. VS Code treats
this as a minimum character count and right-aligns the digits, so the supplied
three-digit view gains one character cell on the left. The existing 4px line
decoration strip to the right and the hidden glyph margin remain unchanged.

Decisions and lessons:

- **use the native layout setting.** The requested space is exactly the spare
  capacity represented by `lineNumbersMinChars`; injected padding on private
  gutter DOM would be more fragile and could overlap the editor canvas;
- **keep the compact-gutter tradeoff.** Restoring `editor.glyphMargin` would add
  roughly 31px in this setup and bring breakpoint/bookmark icons back, which is
  a different and much larger change than the requested small inset;
- the reserve is deliberately adaptive: files through 999 lines show at least
  one blank character cell, while longer line numbers consume it as needed.

Verification:

- `settings.json` parses as JSONC and
  `editor.lineNumbersMinChars` reads `4`;
- `check_workbench_customizations.sh --source-only` passes with 62 balanced CSS
  rule blocks, and `git diff --check` passes;
- the live VS Code `settings.json` resolves to the repository file changed here,
  so no installer or custom-CSS reinjection is needed;
- **not verified: the rendered gutter.** The active editor was not captured after
  the setting changed; inspect it in VS Code before treating the visual spacing
  as final.

### 2026-08-15 — Correction: line-number reserve must exceed the file's digit count

The preceding change did not add padding in the reported editor. A follow-up
capture showed line `100` still beginning at the left edge of the line-number
column.

Root cause: the earlier entry treated `lineNumbersMinChars` as though VS Code
compared it with the currently visible line number. The installed VS Code 1.133
layout code actually computes the model's total line-count digits first, then
uses `max(lineNumbersDigitCount, lineNumbersMinChars)`. In a file with at least
1,000 lines, both values were `4`, leaving no spare cell even while lines around
`100` were visible.

Implementation: set `editor.lineNumbersMinChars` to `5`, the installed VS Code
default. Files through 9,999 lines now retain one full character cell to the
left; the hidden glyph margin and 4px decoration strip remain unchanged.

Decisions and lessons:

- inspect `lineNumbersDigitCount` at the model boundary, not the digits visible
  in the viewport;
- a minimum of five is the smallest native value that guarantees one spare cell
  for the reported four-digit model. A CSS inset is still unnecessary;
- preserve the preceding entry as the record of the failed value and correct it
  here rather than silently rewriting its conclusion.

Verification:

- `settings.json` parses as JSONC and
  `editor.lineNumbersMinChars` reads `5`;
- `check_workbench_customizations.sh --source-only` passes with 62 balanced CSS
  rule blocks, and `git diff --check` passes;
- the live VS Code `settings.json` resolves to the repository file changed here;
- **not verified: the corrected rendered gutter.** The supplied capture proves
  the value `4` failed, but it predates this correction to `5`.

### 2026-08-16 — Line-number padding moved to the rendered gutter

Intent: keep a visible left inset when line numbers cross from two to three
digits. Two attempts through `editor.lineNumbersMinChars` left line `100`
against the gutter edge.

Root cause: `lineNumbersMinChars` is a Monaco editor option, but VS Code 1.133's
regular text-editor pane overwrites it during editor creation. The installed
workbench code reads the user's editor configuration and then merges
`lineNumbersMinChars: 3` through `getConfigurationOverrides()`. The model layout
therefore never received either repository value (`4` or `5`); both earlier
entries diagnosed the Monaco width calculation without tracing the later
workbench override.

Implementation:

- remove the ignored `editor.lineNumbersMinChars` key from `settings.json`;
- translate only `.margin-view-overlays .line-numbers` 4px to the right. The
  existing `editor.lineDecorationsWidth: 4` provides that room, so the fixed
  inset consumes no additional editor width and does not move the code canvas;
- extend the compatibility checker to guard the native line-number overlay, the
  source rule, and its installed injection marker.

Decisions and lessons:

- **trace settings through the workbench boundary.** A registered Monaco option
  and valid JSONC do not prove that VS Code's text-editor pane preserves it;
- **use one fixed visual offset.** The request is independent of the file's line
  count, so an adaptive minimum-character calculation is the wrong contract;
- **keep the offset within reserved space.** Moving only the glyphs by the same
  4px already allocated to line decorations avoids widening the gutter or
  restoring breakpoint/bookmark lanes.

Verification:

- before the CSS rule, the extended source check failed with
  `missing the fixed 4px line-number inset`;
- after the rule, source verification passes with 63 balanced CSS rule blocks;
- before reloading the loader, the full checker passed the source and native
  overlay contracts, then stopped on the missing 4px injection marker;
- **Reload Custom CSS and JS** and **Developer: Reload Window** were run through
  VS Code's actual View menu. The full checker now passes the native line-number
  overlay contract and confirms the current marker in `workbench.html`;
- `settings.json` parses as JSONC, the ignored `lineNumbersMinChars` key is
  absent, the 4px decoration strip remains, and `git diff --check` passes;
- **not verified: the rendered pixels after reload.** The active workbench has
  the rule, but a new gutter capture was not taken from this session.

### 2026-08-16 — Catppuccin editor surface matches Explorer and Codex

Intent: remove the lighter rectangle in the middle of the three-pane layout so
the populated editor reads as the same surface as Explorer and the Codex
sidebar.

Diagnosis: direct samples from the supplied 3216 x 2090 capture measured both
blank Explorer and Codex areas at rendered `#2a2c3b`, while the editor canvas
was rendered `#313445`. The installed theme defines the corresponding source
tokens as `sideBar.background: #292c3c` and `editor.background: #303446`; the
one-channel difference between source and capture is consistent for both
surfaces. The mismatch came from Catppuccin's editor token, not from an overlay
or injected workbench rule.

Implementation: in the `[Catppuccin Noctis Frappé]` color customization only,
set `editor.background`, `editorGutter.background`, and
`editorGroup.emptyBackground` to the theme's Explorer source value `#292c3c`.
The other configured themes retain their own palettes, and tab fills keep their
existing contrast ladder above the unified body surface.

Decisions and lessons:

- **change the native color boundary.** `editor.background` and
  `editorGutter.background` are supported theme tokens and update populated
  editors without private DOM selectors;
- **compare source tokens as well as rendered pixels.** Explorer and Codex
  already resolve to the same pixel value, but the capture shifts the CSS source
  channels slightly; copying the theme's `sideBar.background` is what makes the
  rendered surfaces exact;
- **keep the gutter with the canvas.** Changing only `editor.background` would
  leave a lighter line-number band along the editor's left edge.

Verification:

- `settings.json` parses as JSONC and all three Catppuccin editor-surface tokens
  read `#292c3c`; the live settings path resolves to this repository;
- a first window-scoped capture with the rendered pixel value copied directly
  into settings proved the color-management boundary: CSS `#2a2c3b` rendered as
  dominant `#2b2c3a` in the editor, while both side panes remained `#2a2c3b`;
- inspection of the installed Catppuccin Noctis Frappé 3.1.9 theme confirmed
  `sideBar.background: #292c3c`. After using that source value, a second capture
  measured the dominant Explorer, populated editor/gutter, and Codex pixels all
  as `#2a2c3b`;
- the final window-scoped capture was inspected visually and shows one continuous
  body surface across all three panes. Tab fills, borders, selections, and the
  active-line overlay retain their intended contrast;
- `git diff --check` passes. No custom-CSS reload was needed because these are
  native theme tokens in the live symlinked settings file.

### 2026-08-16 — Cmd+B follows members returned by TypeScript/Vue composables

Intent: make Cmd+B on `closeTimeLog` in `useTimeLog.ts` show the places that use
the member after `const { closeTimeLog } = useTimeLog()`, including Vue template
handlers. TypeScript treats the local declaration, the return shorthand, and a
consumer destructure as separate symbols, so its native reference provider only
returned the declaration and `return { closeTimeLog }`.

Implementation: add `returnedComposableNavigation.js` to Smart References. On an
explicit Cmd+B only, it recognises a local function/value returned as a shorthand
member of an exported function or arrow factory, finds named imports of that
factory from the exact source file, and follows destructured members in `src/`
TypeScript, JavaScript, and Vue files. The resulting binding occurrences join the
ordinary reference picker. Native definitions and references still answer every
other symbol; this does not register a live reference provider or run in CodeLens.

Decisions and lessons:

- this is a missing static relationship, not a project-boundary failure. A direct
  TypeScript language-service probe found `closeTimeLog` only at its declaration
  and return shorthand, while `useTimeLog` correctly found its import and calls;
- constrain the bridge to returned shorthand members, named imports, and
  destructuring from a source-root module. A general same-name scan would merge
  unrelated functions and comments, recreating the ambiguity that native symbol
  navigation avoids;
- retain the current command-driven architecture. Scanning consumer files on a
  reference provider would run during automatic editor queries, while a Cmd+B is
  both deliberate and already the established Smart References boundary.

Verification:

- the new focused tests pass (4 cases), covering declaration recognition, return
  shorthand rejection, named imports/destructures, and Vue-template/script uses;
- a real-project helper probe resolves `useTimeLog.closeTimeLog` to lines 50, 72,
  146, and 261 of `TimeLogDrawer.vue`;
- all 128 Smart References tests, JavaScript syntax checks, manifest parsing, and
  `git diff --check` pass; the extension installer updated the registered local
  version to `0.0.28` and its live extension path points to this repository;
- **not verified: the active Cmd+B.** Run **Developer: Reload Window**, then use
  Cmd+B on `closeTimeLog` in `useTimeLog.ts`; the picker should show the four
  `TimeLogDrawer.vue` locations above.

### 2026-08-16 — Reference groups distinguish imports from composable calls

Intent: correct the References picker after `useTimeLog` showed both its imports
and `const { … } = useTimeLog()` calls under **Top level usages**.

Root cause: the picker used `symbolName === 'top level'` as the whole grouping
rule. Vue `<script setup>` supplies no enclosing document symbol for either a
module import or a top-level initializer, even though only the import is a
top-level navigation boundary worth separating.

Implementation: extract the pure `referenceGrouping.js` rule. **Top level
usages** now contains only `import` and `export` lines with no enclosing symbol;
destructuring, function calls, and other executable initializers remain in
**Usages**. The reference locations and their order within each group are
unchanged.

Verification:

- the new focused grouping tests pass, covering import/export, a `useTimeLog()`
  destructure, and a real enclosing function;
- all 129 Smart References tests, syntax checks, manifest parsing, and
  `git diff --check` pass; the extension installer updated the registered local
  version to `0.0.29` and its live path points to this repository;
- **not verified: the reloaded picker.** Run **Developer: Reload Window**, then
  Cmd+B on `useTimeLog`; the two import rows remain under **Top level usages**
  and the two destructuring rows appear under **Usages**.

### 2026-08-16 — Current-file references gain an orange marker

Intent: make references in the file where Cmd+B began recognisable immediately,
without requiring users to read every filename.

Implementation: carry the originating editor URI from `showReferencesAtLocation`
through both picker and webview renderers. Matching locations receive an orange
filled-circle icon in the native picker and a small orange badge over their
normal symbol icon in the webview. The picker placeholder explains the marker;
the webview badge retains the normal class/function/reference symbol beneath it.

Decision: compare URIs rather than file names or workspace-relative paths, so
same-named files and Remote SSH URIs cannot be incorrectly marked as current.

Verification:

- focused URI-comparison tests pass for matching, different, and absent origins;
- all 130 Smart References tests, syntax checks, manifest parsing, and
  `git diff --check` pass; the extension installer updated the registered local
  version to `0.0.30` and its live path points to this repository;
- **not verified: the reloaded visual picker.** Run **Developer: Reload Window**
  and open References; rows from the source file should carry an orange dot.

### 2026-08-17 — Current-file dot moves to the row's right edge

Intent: retain the current-file marker without replacing the existing symbol
icon, and keep the visual scan column separate from file/type information.

Implementation: current-file rows now use the native picker item's right-side
button slot for their orange dot. The webview adds one small final grid column
and places the same dot there; ordinary rows reserve the column but leave it
empty, keeping every code and method column aligned.

Verification:

- all 130 Smart References tests, syntax checks, manifest parsing, and
  `git diff --check` pass; the extension installer updated the registered local
  version to `0.0.31` and its live path points to this repository;
- **not verified: the reloaded visual picker.** Run **Developer: Reload Window**
  and open References to confirm the orange dot sits at the far right.

### 2026-08-17 — Remove the reference preview separator

Intent: keep each reference row visually quiet; the leading `|` before the
source preview competed with method and function names without encoding any
additional state.

Implementation: the native QuickPick now displays the source preview directly,
with no artificial separator or indentation. The webview already renders the
same preview without one.

Verification:

- all 130 Smart References tests, JavaScript syntax, manifest parsing, and
  `git diff --check` pass; the extension installer registered version `0.0.32`;
- **not verified: the reloaded visual picker.** Run **Developer: Reload Window**
  and open References to confirm source previews now begin directly with code.

### 2026-08-17 — Persistent current-file home marker in QuickPick

Intent: distinguish references in the file where Cmd+B began at a glance, even
when the pointer is not over their rows.

Root cause: VS Code renders QuickPick item buttons only on hover or focus. Its
public `QuickInputButton` contract has no always-visible property, so the
right-side button slot alone cannot carry persistent state.

Implementation: replace the dot with a small orange `home` icon, whose tooltip
states that it marks a reference in the current file. A narrowly scoped custom
workbench rule displays only that button continuously, matched by its exact
accessible label; other QuickPick actions retain their native hover behavior.

Verification:

- all 130 Smart References tests, JavaScript syntax, manifest parsing,
  `check_workbench_customizations.sh`, and `git diff --check` pass; the
  extension installer registered version `0.0.33`;
- **not verified: the reloaded visual picker.** Run **Reload Custom CSS and JS**
  followed by **Developer: Reload Window**, then open References with the
  pointer off the rows. Current-file references should keep the orange home at
  the far right.

### 2026-08-17 — Toolbar-controlled PhpStorm-style file blame

Intent: keep Git history out of the editor until it is needed, then show a
compact author-and-age annotation for every line, like PhpStorm's Git Blame.

Implementation: use the existing GitLens File Blame provider, not VS Code's
built-in editor decoration. The latter only annotates selected lines. Setting
`gitlens.fileAnnotations.command` to `blame` changes GitLens' editor-group
toolbar control from an annotations menu into a direct toggle. Its annotation
format shows a bounded author name and age. The always-on built-in active-line
decoration is disabled; the ordinary Git status-bar item remains enabled.

Decision: VS Code reserves the global layout controls in the application title
bar (the controls shown in the supplied image). GitLens' supported placement is
the active editor's top-right toolbar, immediately beside the editor actions,
which is the closest native, upgrade-stable location.

Verification:

- settings JSONC parses with the intended values, the live settings path points
  to this repository, the installed GitLens manifest supplies
  `gitlens.toggleFileBlame:editor/title`, and `git diff --check` passes;
- not verified: reload VS Code and open a committed file. The GitLens button in
  the editor toolbar should toggle the full per-line blame column; the existing
  Option+Command+B shortcut should do the same.

### 2026-08-17 — Correction: GitLens must be enabled before its blame command exists

The GitLens settings above are valid, but live verification found the installed
`eamodio.gitlens` extension in VS Code's global disabled-extension list. The
`construction-frontend` extension-host log confirms that it did not activate at
startup, which is why VS Code reported `command 'gitlens.toggleFileBlame' not
found` and supplied no toolbar button.

Use the supported UI path — Extensions, search **GitLens**, then **Enable** —
rather than editing VS Code's live state database while the application runs.
After a window reload, the direct File Blame toolbar toggle and
Option+Command+B configuration can be visually verified.

### 2026-08-17 — Quiet, per-line GitLens blame labels

Intent: retain the useful file-blame author context without a broad timestamp
column or distracting coloured blocks.

Implementation: File Blame now renders only a bounded 14-character author
name. Compact mode is disabled so the author is shown on every line, while the
heatmap and current-line group highlight are disabled to leave the editor's
normal background and line emphasis intact.

Verification:

- settings JSONC parses with the four author-only presentation values, the live
  settings path points to this repository, and `git diff --check` passes;
- not verified: toggle File Blame off and back on, or reload VS Code, then
  inspect the live rendering. Long names should truncate rather than widen the
  column.

### 2026-08-17 — Disable automatic current-line GitLens blame

Intent: leave Git details entirely opt-in; clicking or moving the caret should
not add a commit message beside the active line.

Implementation: set `gitlens.currentLine.enabled` to `false`. This is separate
from File Blame, which remains available only through its explicit toolbar or
Option+Command+B toggle.

Verification:

- settings JSONC parses with `gitlens.currentLine.enabled: false`, the live
  settings path points to this repository, and `git diff --check` passes;
- not verified: move the caret in a regular editor with File Blame turned off;
  no inline GitLens annotation should appear.

### 2026-08-17 — File Blame uses author plus ISO date

Intent: make the per-line annotation column useful enough to retain while
remaining predictable and more compact than a relative date plus commit text.

Implementation: File Blame now renders `${author|14} ${date}` and formats its
absolute date as `YYYY-MM-DD`. Compact mode remains off, so this information
appears on every line.

Verification:

- pending: parse the JSONC settings and toggle File Blame to refresh the live
  annotations. Each row should read `Author YYYY-MM-DD` with no relative date.

### 2026-08-17 — File Blame width follows actual labels

Intent: avoid reserving an arbitrary author-name width in files whose commit
authors have short names.

Implementation: remove the `|14` fixed-width modifier from the author token.
GitLens now formats `${author} ${date}`, so VS Code measures the actual labels
in the file. The editor keeps one shared annotation margin, by design, so its
width follows the longest actual author-plus-date value rather than shifting
code horizontally on every line.

Verification:

- settings JSONC parses with the dynamic author-plus-date format, the live
  settings path points to this repository, and `git diff --check` passes;
- not verified: toggle File Blame to refresh the live annotations; short-author
  files should use a narrower shared margin.

### 2026-08-17 — Always show the Git author name

Intent: retain the author identity in File Blame consistently, including on
commits made by the configured local Git user.

Implementation: set `gitlens.defaultCurrentUserNameStyle` to `name`, replacing
GitLens' default `You` label with the actual author name.

Verification:

- settings JSONC parses with the `name` display style, the live settings path
  points to this repository, and `git diff --check` passes;
- not verified: refresh File Blame; local-user commits should show their author
  name rather than `You`.

### 2026-08-17 — Separate change markers from line numbers

Intent: add a small visual gap between line numbers and Git's changed-line bars
without restoring the much wider glyph margin.

Implementation: enlarge `editor.lineDecorationsWidth` from 4px to 8px. The
existing number inset remains 4px, while margin line decorations (`.cldr`) move
4px into the new half of the lane. Code shifts right only by the additional 4px
reserved for the lane, and source-control markers no longer sit against digits.

Verification:

- settings JSONC parses with an 8px line-decoration lane, the CSS source
  contract passes with 65 balanced rule blocks, the live settings path points
  to this repository, and `git diff --check` passes;
- not verified: run **Reload Custom CSS and JS**, then **Developer: Reload
  Window**, and inspect the rendered gutter. The change marker should sit 4px
  farther from the line numbers.

### 2026-08-17 — Slim gutter change markers

Intent: make changed-line bars less visually heavy while preserving their
separation from line numbers.

Implementation: constrain margin line decorations to 3px wide. The Git marker
remains in the far half of the eight-pixel decoration lane.

Verification:

- the CSS source contract passes with 65 balanced rule blocks and
  `git diff --check` passes;
- not verified: run **Reload Custom CSS and JS**, then **Developer: Reload
  Window**, and inspect the slimmer rendered change bars.

### 2026-08-17 — Further slim gutter change markers

Intent: reduce the changed-line bars one final small step while retaining a
visible status cue.

Implementation: reduce the margin decoration width from 3px to 2px.

Verification:

- the CSS source contract passes with 65 balanced rule blocks and
  `git diff --check` passes;
- not verified: run **Reload Custom CSS and JS**, then **Developer: Reload
  Window**, and inspect the 2px change bars.

### 2026-08-17 — Cmd+B opens static import paths directly

Intent: make Cmd+B on a local TypeScript, JavaScript, or Vue import path open
the imported file rather than falling through to references for its binding.

Implementation: add `importSpecifierNavigation.js`, a pure resolver that
recognises a cursor inside a static `import` or re-export specifier. It resolves
only `@/` aliases and `./`/`../` paths, tries TypeScript before JavaScript/Vue,
and refuses package specifiers. Smart References runs this before ordinary
definition/reference navigation and opens the resolved file at line one.

Decision: scope it to import-string positions, not imported identifiers. Cmd+B
on `useTimeLog` remains normal symbol navigation; Cmd+B on
`@/modules/common/composables/useTimeLog` becomes file navigation.

Verification:

- the focused resolver suite passes (3 cases): static alias import, type import
  and re-export recognition, relative resolution, and package refusal;
- all 131 Smart References tests, JavaScript syntax checks, manifest parsing,
  and `git diff --check` pass; a real `construction-frontend` check resolves
  `@/modules/common/composables/useTimeLog` to `useTimeLog.ts`, and the
  installer registered version `0.0.34`;
- not verified: reload VS Code and invoke Cmd+B on the import path in
  `useTimeLogFrame.ts`; it should open `useTimeLog.ts` directly.

### 2026-08-19 — File Blame rows all share one width

Intent: stop the blame column looking ragged. Each annotation row was sized to
its own text, so a `cristian 2026-08-18` row ended several characters short of a
`Cristi Jora 2022-09-22` row and every row's background stopped at a different
column.

Implementation: restore a fixed width on the author token —
`gitlens.blame.format` is `${author|14} ${date}`. GitLens pads a token shorter
than its width with non-breaking spaces (`padEnd`) and truncates a longer one
with an ellipsis, and `${date}` is a fixed ten characters under the
`YYYY-MM-DD` format, so every row renders exactly 14 + 1 + 10 = 25 characters.
The annotation inherits the editor's monospace font (`gitlens.blame.fontFamily`
is unset), so equal character counts are equal pixel widths.

Decision: this reverses *File Blame width follows actual labels* (2026-08-17),
which removed the same `|14` to avoid reserving width in short-author files.
That reasoning only ever applied to the shared margin; the per-row background
still followed each label. Uniform rows require a fixed reserve, so the width
is back deliberately and the setting carries a comment saying why.

Note: GitLens' token syntax puts the width immediately after the pipe and any
alignment flag *after* the digits — `${author|14}` pads to the right (text left
aligned), `${author|14-}` pads to the left. `${author|-14}` parses as no width
at all, which is why it silently does nothing.

Verification:

- the settings JSONC parses (151 keys) with `${author|14} ${date}` and the
  `YYYY-MM-DD` date format, the live settings path symlinks to this repository,
  and `git diff --check` passes;
- GitLens 19.0.1's formatter was read directly to confirm padding uses U+00A0
  (so trailing padding renders rather than collapsing) and that over-long values
  truncate to the same width;
- not verified: toggle File Blame off and on in a file with mixed-length author
  names; every row should end at the same column.

### 2026-08-19 — Closing one window no longer quits VS Code

Symptom: closing a single VS Code window closed every VS Code window.

Cause: the quit rule from *Cmd+W closes an editor-less window, and the last
window quits* (2026-07-30) decided on `#app:allWindows() == 0`. The
accessibility APIs behind both `hs.application:allWindows()` and
`hs.window.filter` only report windows on the **current Mission Control space**,
so closing the last window on the active space read as "no windows left" while
windows were still open on another space, and `app:kill()` took them all.

Measured on this machine with five windows open, three on the focused space and
two on another:

| source | reported |
| --- | --- |
| `hs.application:allWindows()` | 3 |
| `hs.window.filter:getWindows()` | 4 |
| `code --status` (`window [n]` lines) | 5 |
| `CGWindowListCopyWindowInfo` | 5 |

Implementation, in `files_to_symlink/init.lua`:

- the two accessibility reads now only *rule out* quitting, since both
  undercount and neither can confirm zero;
- when both read zero, an `hs.task` runs a JXA snippet through `osascript` that
  counts VS Code's windows with `CGWindowListCopyWindowInfo`, which is not
  scoped to a space, and the application is killed only on a count of zero;
- a non-zero exit or unparseable output counts as "windows remain". A VS Code
  left idle in the Dock is the old, harmless behavior; a wrong quit is not.

Decisions and lessons:

- `CGWindowListCopyWindowInfo` also returns VS Code's helper windows — one
  hidden 500x500 window and several 1512x33 title bars — so the count is
  narrowed to layer 0 and at least 600x400. Counting every layer-0 window would
  have reported 10 for five real windows and the rule would never fire;
- `code --status` is authoritative and space-independent too, but it took 3.7 s
  and spawns the Node CLI, against 0.18 s for the CoreGraphics query;
- JXA's `console.log` writes to stderr, so the snippet ends in an IIFE whose
  return value osascript prints to stdout.

Verification:

- `luac -p files_to_symlink/init.lua` passes;
- after **Reload Config**, running the snippet through `hs.task` from the live
  Hammerspoon state returned `exit=0 out=5` while `hs.window.filter` reported 3
  and `code --status` reported 5, so the guard sees the windows the old check
  missed;
- not verified: closing the genuinely last VS Code window should still quit the
  application.

### 2026-08-20 — The revealed file is visible in the Explorer again

Symptom: with a file open and active, its row in the Explorer carried no
highlight. Clicking the row highlighted it; clicking back into the editor made
the highlight vanish again.

`explorer.autoReveal` was never the cause — it is `true` and it was working. The
cause is that the customizations were keyed to a theme that is no longer the one
in force. `window.autoDetectColorScheme` is on, so in dark mode the active theme
is `workbench.preferredDarkColorTheme`, and that was changed from **Catppuccin
Noctis Frappé** to **Catppuccin Noctis Macchiato**. `workbench.colorTheme`
(`Monokai Pro`) is inert while auto-detect is on, and both dark blocks in
`workbench.colorCustomizations` — `[Monokai Pro]` and
`[Catppuccin Noctis Frappé]` — stopped applying. Macchiato was rendering
unmodified.

Unmodified Macchiato defines, in
`alexdauenhauer.catppuccin-noctis-3.1.9/themes/Catppuccin Noctis Macchiato-color-theme.json`:

| key | value |
| --- | --- |
| `sideBar.background` | `#1e2030` |
| `list.inactiveSelectionBackground` | `#1e2030` |
| `list.inactiveFocusBackground` | `#1e2030` |
| `list.activeSelectionBackground` | `#363a4f` |
| `list.hoverBackground` | `#363a4f` |

The selected row and the sidebar are the same colour, so the selection is only
ever visible while the Explorer itself holds focus — which, when you are typing,
it never does.

Measured from the two screenshots, at 3216x2090 and 882x166:

| sample | measured | theme value |
| --- | --- | --- |
| sidebar background | `#1e202f` | Mantle `#1e2030` |
| editor background | `#252739` | Base `#24273a` |
| title bar | `#181925` | Crust `#181926` |
| highlight after clicking the row | `#373a4e` | Surface0 `#363a4f` |

Every sample is one unit low per channel, uniformly — the screenshots' colour
profile, not a colour difference. That ladder is also what identified the theme:
Base `#24273a` for the editor rules out `siris01.catppuccin-theme`, whose
Macchiato paints the editor Mantle `#1e2030`.

Implementation: a `[Catppuccin Noctis Macchiato]` block in
`workbench.colorCustomizations`, with a monotonic ladder out of the theme's own
palette:

| state | before | after |
| --- | --- | --- |
| hover | Surface0 `#363a4f` | Base `#24273a` |
| revealed, Explorer unfocused | Mantle `#1e2030` | Surface0 `#363a4f` |
| selected, Explorer focused | Surface0 `#363a4f` | Surface1 `#494d64` |

Decisions:

- the revealed file gets Surface0, the fill the theme already used for the
  focused case, so the row now looks the same whether or not the Explorer has
  focus — which is the state that was being asked for;
- Surface2 `#5b6078` for the focused case was rejected on measurement: it puts
  the theme's `list.*SelectionForeground` `#b7bdf8` at 3.44:1, under AA.
  Surface1 holds it at 4.61:1, and Surface0 at 6.21:1;
- hover had to come *down* to Base, because its old value is now the selection
  fill and pointer feedback must not read as selection;
- `tab.selectedBackground` is pinned to `#1e2030`. It is unset in this theme, so
  it was defaulting to `list.inactiveSelectionBackground` and raising that key
  would have repainted the active tab Surface0. This is the same defaulting
  chain as the 2026-08-05 correction above, and the screenshot confirms it was
  live: every tab measured Base `#24273a` — the theme sets `tab.activeBackground`
  and `tab.inactiveBackground` to the same `#24273a` — while the active tab
  measured Mantle `#1e2030`, a colour no `tab.*` key in the theme contains.

Lesson: a per-theme block is silently disabled by a change to
`workbench.preferredDarkColorTheme`, with no warning and no error. Nothing
reports "these customizations match no active theme". When the preferred theme
changes, every `[Theme Name]` key has to move with it.

Still outstanding, and deliberately not done here: the `[Catppuccin Noctis
Frappé]` blocks in **both** `workbench.colorCustomizations` and
`workbench.tokenColorCustomizations` are still dead. Porting them is not a
rename — their values are Frappé's palette (Base `#303446`, Mantle `#292c3c`),
and every one has to be re-derived in Macchiato's.

Verification:

- `settings.json` parses as JSONC, and the block reads back under
  `workbench.colorCustomizations["[Catppuccin Noctis Macchiato]"]`;
- contrast ratios above computed from the sRGB relative-luminance formula;
- theme values read from the installed 3.1.9 theme file;
- screenshot samples decoded from the PNGs directly;
- not verified: the rendered result. This needs the window reloaded and a look
  at the Explorer with focus in the editor.

### 2026-08-20 — Tabs keep their labels and the bar scrolls

Intent: stop tabs from being compressed as the count grows. A row of four had
already squeezed the filenames; the wanted behaviour is full-width tabs with a
horizontally scrollable bar.

Implementation: `workbench.editor.tabSizing` moved from `"shrink"` to `"fit"`.
That is the whole change — `fit` keeps every tab wide enough for its complete
label and lets the tabs container scroll once they overflow the bar.

Decisions:

- `workbench.editor.wrapTabs` stays `false`. Wrapping is the *alternative* to
  scrolling, not a companion to it: with it on, an overflowing bar grows onto a
  second row and never scrolls;
- `workbench.editor.limit.value` stays at 8. Under `shrink` the cap was also
  doing width duty; under `fit` it is back to being only a cap, and eight
  full-width tabs will overflow and scroll on a laptop screen, which is the
  point;
- `workbench.editor.scrollToSwitchTabs` left unset (`false`), so a wheel or
  trackpad gesture over the bar scrolls it rather than switching editor.

The injected CSS rule that hides `.monaco-icon-label-container::after` — the 5px
label fade documented in the 2026-08-05 hover work — is now inert: VS Code paints
that pseudo-element only under `.tab.sizing-shrink`. It is kept, since it costs
nothing and applies again if tabs ever shrink. Its comment was corrected rather
than deleted, because the measurement it records (`#373b4c` fade against a
`#474a5b` hovered tab) is still the reason the rule exists.

Verification:

- `settings.json` parses as JSONC and reads back `"fit"`, with `wrapTabs` false;
- not verified: the rendered result. `tabSizing` applies live, but the CSS
  comment edit needs **Reload Custom CSS and JS** plus a restart to be inlined —
  a comment, so nothing depends on it.

### 2026-08-20 — Option+Enter splits a PHP signature onto separate lines

Intent: PhpStorm's "Split parameters onto separate lines" intention, on the same
key. A one-line declaration

```php
    public function record(Device $device, string $instanceId, array $counts, ?string $hostname = null): void
    {
```

becomes

```php
    public function record(
        Device $device,
        string $instanceId,
        array $counts,
        ?string $hostname = null
    ): void {
```

Implementation:

- `phpSignatureSplit.js`, a new module exporting `getPhpSignatureSplit(lineText,
  nextLineText)`. Pure text in, pure text out — no `vscode` import — which is
  what makes it testable under `node --test`, the same split the repository
  already uses for `phpMove.js` and `jsonSmartEnter.js`;
- `getSplitPhpSignatureEdit` in `extension.js` turns that into a document range,
  and has two callers: the `smartReferences.splitPhpSignature` command and
  `createSplitPhpSignatureAction`;
- the code action is `CodeActionKind.QuickFix`, added to
  `createPhpCodeActionProvider`. **That is what puts it on Option+Enter** —
  `alt+enter` is bound to `editor.action.quickFix`, so the action appears in that
  menu rather than needing a key of its own. Same route as the existing chain
  split and the Collection PHPDoc fix.

Decisions:

- **Declarations only.** The `function` keyword is what distinguishes a
  declaration from a call on a single line, and the closing line differs: a call
  ends `);` or `),` with no brace to collect. Splitting call arguments is a
  separate intention and was not written;
- **commas are found by depth and quote state, not by `split(',')`.** Defaults
  like `array $counts = [1, 2, 3]`, `Clock $clock = new Clock(1, 2)`, and
  `string $sep = ', '` all contain commas that are not parameter separators;
- **one parameter is left alone.** Splitting it lengthens the declaration without
  making anything readable, and the action would then offer itself on nearly
  every method line in the file, which is noise in the Option+Enter menu;
- **the brace is pulled up.** PSR-12 §4.5 puts the closing parenthesis and the
  opening brace together on one line. The edit range therefore extends through
  the following line when that line is exactly `{`. An abstract or interface
  method ends at `;` and keeps its own closing line — checked before the merge,
  not after;
- a PHP 8.0 trailing comma leaves an empty final entry, dropped rather than
  emitted as a blank line;
- comment lines beginning `//`, `#`, or `*` are skipped, so a commented-out
  declaration is not rewritten.

Not done, and worth knowing it was considered: the reverse — joining a split
signature back onto one line. PhpStorm offers it as a separate intention. As a
toggle on the same key it would be a surprise, since Option+Enter applies the
action directly here rather than opening PhpStorm's menu.

Verification:

- `node --test test/phpSignatureSplit.test.js` — **12 passing**, all new, pinning
  the exact output above plus the brace-already-inline, `;`, nested-default,
  string-comma, promoted-property, `use (…)` closure, trailing-comma,
  single-parameter, already-split, call, and comment cases;
- `node --test test/*.test.js` across the extension — **143 passing, 0 failing**;
- `node --check extension.js` passes, and `package.json` parses with the new
  command, its `onCommand` activation event, and version `0.0.35`;
- not verified in the running editor: the action appearing in the Option+Enter
  menu. That needs **Developer: Reload Window** first, since the extension is
  loaded from the symlinked directory at startup.

### 2026-08-20 — VS Code 1.134.0 wiped the CSS injection

Symptom: the References picker lost every custom style — no cards, no rounded
inset rows, no orange group heading, no focused-card outline. Nothing had been
edited in the picker rules.

Cause: VS Code updated to **1.134.0** on 2026-08-18 21:45 and replaced
`workbench.html`, which is the file `be5invis.vscode-custom-css` inlines the
stylesheet into. Measured on the installed build: the file's mtime is the update
timestamp, and it contains **zero** occurrences of any repository CSS marker.

Nothing is specific to References. Every injected rule and both injected scripts
went with it — the `⌘` letterpress, the tab geometry, the 4px line-number inset,
the quick-input border, the horizontal-scroll preserver, the quick-input anchor.
References is simply where the loss is most legible, because its two-line cards
are drawn entirely by injected CSS and by nothing else.

Fix: **Reload Custom CSS and JS**, then restart. Nothing else was broken —
`vscode_custom_css.imports` still resolves, all three targets are symlinks back
into this repository, and `workbench.html` is owned by the user and writable, so
the patch needs no `chown`.

Every DOM contract the picker cards depend on survives in 1.134.0, checked
directly against the installed bundle: `quick-input-list-label-meta`,
`quick-input-list-entry`, `quick-input-list-rows`, and
`quick-input-list-separator-as-item` are all still present, as are `.has-icon`
and `.close-action-off`.

One contract in `check_workbench_customizations.sh` did go stale, and it was
failing *before* the injection check could run — so the script reported a DOM
contract break and never got as far as saying the injection was missing. In
1.134.0 the modern tab base rule changed in two ways:

```css
/* 1.133 */ .modern-ui-tabs .part.editor .tabs-container>.tab{…padding:0 var(--vscode-spacing-size80) 0 var(--vscode-spacing-size40)!important}
/* 1.134 */ .modern-ui-tabs .part.editor .tabs-container>.tab,.modern-ui-tabs .modern-ui-editor-tab{…padding:0 var(--vscode-spacing-size80) 0 var(--vscode-spacing-size60)!important}
```

The selector grew a second comma-separated arm, and the left padding went from
`size40` to `size60`. Neither touches what the injected CSS actually relies on —
that modern tabs are padded from the `--vscode-spacing-*` scale — so the check's
regex now leaves the selector tail and the left value open.

Worth noting for a future pass, not changed here: VS Code now applies
`padding:0 var(--vscode-spacing-size80) 0 var(--vscode-spacing-size60)!important`
to `.close-action-off:not(.sticky-compact)` itself. That is most of what this
repository's actionless-tab padding rule was added to do; it now only pushes the
left side from `size60` up to `size80`.

Lesson: a VS Code update silently un-installs every workbench customization, and
the first visible symptom is likely to be a picker, not a tab. Run
`check_workbench_customizations.sh` after any update rather than diagnosing from
what looks wrong on screen — but read past the first FAIL, because a stale native
regex will pre-empt the injection check that actually explains the screen.

Verification:

- `workbench.html` at `/Applications/Visual Studio Code.app/…/workbench.html`,
  mtime 2026-08-18 21:45, contains no injection marker — 0 matches;
- `code --version` reports `1.134.0`;
- all eight native CSS contracts, both JS class markers, and the four quick-input
  class contracts were run individually against the installed bundle; only the
  tab-padding regex failed, for the reason above;
- after relaxing that regex, `check_workbench_customizations.sh` reaches and
  fails on the correct check — the missing injection — with the right
  instruction;
- not verified: the restored rendering. That needs **Reload Custom CSS and JS**
  and a restart, which cannot be run from a shell.

### 2026-08-20 — Correction: `list.hoverBackground` also paints the code action widget

The Macchiato block earlier today stepped `list.hoverBackground` down from the
theme's Surface0 `#363a4f` to Base `#24273a`, purely to keep the Explorer ladder
monotonic once Surface0 became the selection fill. That was wrong, and the
symptom showed up on the next Option+Enter: the code action widget highlighted
nothing. The selected action could be moved with the arrow keys and applied with
Enter — it just could not be seen.

`list.hoverBackground` is not only a hover. This build paints the **focused row
of the code action widget** with it, and with `!important`:

```css
.action-widget .monaco-list .monaco-list-row.action.focused:not(.option-disabled){
  background-color:var(--vscode-list-hoverBackground)!important;
  color:var(--vscode-list-hoverForeground);
  outline:1px solid var(--vscode-menu-selectionBorder, transparent);
  outline-offset:-2px}
```

The widget itself is `background-color:var(--vscode-menu-background)`, and this
theme sets `menu.background` to Base `#24273a` — the exact value hover had just
been given. Row and widget became one colour, and there was no outline to fall
back on: the theme sets `menu.selectionBorder` to `#00000000`.

Measured from the screenshot, 1634x666: the widget interior is a uniform
`#252739` from y=94 to y=589 — every row, no exceptions — and its border is
`#75789e`, which is `editorWidget.border` `#b7bdf88a` composited over Base. One
sample of the widget, no second value anywhere in it.

`editorActionList.focusBackground` is a red herring here and was checked before
being dismissed. It exists, and in the bundle it defaults to
`list.activeSelectionBackground`:

```js
ie("editorActionList.background",jd,…)        // jd = editorWidget.background
ie("editorActionList.focusBackground",tk,…)   // tk = list.activeSelectionBackground
```

But the widget's own CSS never reads it for the focused row — the
`list-hoverBackground` rule above wins with `!important`, and the measured widget
background is `menu.background` rather than `editorWidget.background`, which is
the second sign the `editorActionList.*` family is not what draws this widget.

Fix: the block no longer sets `list.hoverBackground` at all. The theme's Surface0
stands as the dimmest rung, which is 1.32:1 against the action widget — the
contrast that widget had before this block existed. The Explorer ladder moves up
one step to stay monotonic:

| state | 2026-08-20 first pass | corrected |
| --- | --- | --- |
| hover | Base `#24273a` | Surface0 `#363a4f` (theme's own) |
| revealed, Explorer unfocused | Surface0 `#363a4f` | Surface1 `#494d64` |
| selected, Explorer focused | Surface1 `#494d64` | Surface2 `#5b6078` |

This also supersedes the earlier decision to reject Surface2. That rejection was
sound on its own terms — Surface2 puts the theme's `list.*SelectionForeground`
`#b7bdf8` at 3.44:1, under AA — but the fix was available and is what both dark
blocks above already do: write the selected label out. `#f7f7f7` measures 5.78:1
on Surface2 and 7.75:1 on Surface1. The revealed file also gains contrast against
the sidebar in the move, 1.44:1 → 1.94:1.

`tab.selectedBackground` stays pinned to `#1e2030`; it still defaults to
`list.inactiveSelectionBackground`, which is now Surface1.

Lesson: a `list.*` colour is workbench-wide, and the widget it will be noticed in
is not necessarily a list. Before stepping one of these down, grep the bundled
CSS for `--vscode-list-<key>` and see what else consumes it — the code action
widget, whose background comes from `menu.background` rather than any list
colour, is not a place anyone would think to look for a regression in a hover.

Not changed, and worth knowing: `quickInputList.focusBackground` in this theme is
`#cad3f520`, a 12% wash, with `focusBorder` and `list.focusOutline` both
`#00000000`. That is the same defect one widget over, and the reason the
`[Catppuccin Noctis Frappé]` block writes `#626880` out. Under Macchiato the
focused row in a picker is currently carried by the injected CSS outline alone,
which is exactly the thing a VS Code update removes.

Verification:

- the `.action-widget … .focused` rule and `.action-widget{background-color:
  var(--vscode-menu-background)}` read from the installed 1.134.0 bundle;
- `editorActionList.*` defaults resolved from the bundle's registration calls;
- widget interior and border sampled from the screenshot PNG;
- contrast ratios from the sRGB relative-luminance formula;
- `settings.json` parses as JSONC and reads back the six keys;
- not verified: the rendered result. `colorCustomizations` apply live, so this
  should be visible on the next Option+Enter without a reload.

### 2026-08-26 — Cmd+B finds usages of a JSON key

Intent:

- make `Cmd+B` on a key in a vue-i18n locale file list the `t('...')` call sites
  that use it, the same way it already works for a PHP symbol.

Implementation:

- added `i18nKeyNavigation.js`, a reference provider registered for `json` and
  `jsonc`, with the JSON walk and the call-site match kept as pure functions;
- the walk builds the dotted path from every enclosing container, so object keys
  contribute their name and array elements contribute their index;
- the call-site match covers `t`, `$t`, `tc`, `te`, `tm` and qualified forms
  such as `i18n.global.t`, in single quotes, double quotes or backticks.

Decisions and lessons:

- the leaf name is not the key. `intro` appears twice in the file that prompted
  this, under `interface` and under `lab`, so a search for the word under the
  cursor would have conflated two unrelated strings;
- nothing registered a reference provider for JSON, so `Cmd+B` was not merely
  finding nothing there - its `editorHasReferenceProvider` clause was false and
  the keybinding never fired at all. Registering any provider for the language
  is what makes the existing binding live, so no keybinding change was needed;
- the existing Laravel translation support was not extended, because it runs the
  opposite direction: it resolves a key from inside `__()`/`trans()` and searches
  `**/lang/**`. Both ends are wrong for a locale file under `resources/js`;
- scoped to every JSON file rather than an i18n path pattern, on request. The
  workspace scan is gated on a key path resolving at the cursor, and reference
  providers are consulted on explicit request, so an ordinary `package.json` edit
  costs nothing;
- the closing-quote lookahead and the leading non-identifier boundary are both
  load-bearing: without them `interface.introduction` and `format('...')` would
  both register as usages. Each has a test.

Verification:

- JavaScript syntax on the new module and on `extension.js`, plus the complete
  Smart References suite: 144 tests, 0 failures, including 15 new ones;
- an end-to-end run against the real files outside VS Code resolved
  `ro.json:162` to `interface.intro` and `ro.json:193` to `lab.intro`, each
  finding exactly its one usage in `InterfacePage.vue:107` and
  `LabTilesPage.vue:30` across 73 scanned files;
- the installed extension is a symlink to this repository and already exposes
  the new file, so a window reload is the only step left;
- not verified: the rendered References picker. That needs a reloaded window.

### 2026-08-26 — Cmd+B on an import path stopped assuming `@` means `src/`

Intent:

- make `Cmd+B` on `'@/layout/AppShell.vue'` open that file, in a project whose
  `@` alias does not point at `src/` and from inside a `defineAsyncComponent`
  dynamic import.

Implementation:

- `importSpecifierNavigation.js` now reads `compilerOptions.paths` from the
  workspace `tsconfig.json` or `jsconfig.json` and resolves against it, keeping
  the old `@/` to `src/` rule as the fallback when no config declares one;
- the config is parsed as JSONC, because a real tsconfig carries comments;
- targets resolve against `baseUrl` when set and against the config file's own
  directory when not, which is the TypeScript 5+ rule the affected project
  depends on, since TypeScript 6 deprecates `baseUrl`;
- the specifier scanner now also recognises `import(...)` expressions, in single
  quotes, double quotes or backticks;
- the alias table is read per invocation rather than cached, so editing a
  tsconfig takes effect without a window reload.

Decisions and lessons:

- this reverses part of *Cmd+B opens static import paths directly*
  (2026-08-17), which excluded `import(...)` on the grounds that it was the
  language service's responsibility. That premise was tested and does not hold
  for a `.vue` target: asked to resolve `@/layout/AppShell.vue`, the project's
  own TypeScript 6.0.3 maps the alias correctly and then tries
  `AppShell.d.vue.ts`, `AppShell.vue.ts`, `AppShell.vue.tsx` and
  `AppShell.vue.d.ts`, never the `.vue` file present on disk. Nobody was
  answering, so the key did nothing;
- the `src/` assumption was never a general rule, only the shape of the project
  it was written against. The mapping is already declared in every project that
  has one, so it is read rather than guessed;
- package specifiers are still refused. Those resolve through `node_modules`,
  which the language service does handle;
- resolving a specifier that the language service could also resolve is
  harmless, because both open the same file at line one.

Verification:

- 20 Smart References test files pass individually and together, 0 failures,
  including 9 new cases covering dynamic imports, the `importSomething(` guard,
  commented tsconfig parsing, `baseUrl`, longest-prefix wins, and the preserved
  `src/` fallback;
- an end-to-end run against the real files, outside VS Code, resolved the alias
  table from `ribeit-depozit/tsconfig.json` to `resources/js` and turned
  `App.vue:9` from `<root>/src/layout/AppShell.vue` (missing, so Cmd+B did
  nothing) into `resources/js/layout/AppShell.vue` (present, so it opens). The
  static import on `App.vue:5` was broken in the same way and is fixed by the
  same change;
- not verified: the jump itself in a running editor. That needs a window reload.

### 2026-08-27 — The vertical rule between light-mode tabs removed

Intent:

- stop every tab in `GitHub Light` drawing a grey line down its right-hand side,
  which the dark themes have not done since `tab.border` was made transparent in
  both of them.

Diagnosis, from measuring the screenshot rather than reading the settings:

- the line between two tabs samples `#D2D7DD`, which is `#d0d7de` after the
  screenshot's scaling. That is `tab.border`, set literally in both light blocks
  while both dark blocks set it to `#00000000`;
- the note beside `tab.lastPinnedBorder` already asserted that `tab.border` "is
  already transparent per theme", so the settings file was describing a rule two
  of its four blocks did not follow;
- the obvious objection - that light needs the rule because its bar and its
  inactive tab are both `#ffffff` - does not hold. Reading the two dark themes'
  own `editorGroupHeader.tabsBackground` gives `#2d2a2e` for Monokai Pro against
  a `#2d2a2e` inactive tab, and `#303446` for Catppuccin Noctis Frappe against a
  `#303446` inactive tab. All three are a 1.000:1 separation. Dark has no
  divider between two inactive tabs either, and never has.

Implementation:

- set `tab.border` to `#00000000` in `[GitHub Light]` and
  `[GitHub Light Default]`, with the measurement recorded beside it.

Decisions and lessons:

- tabs are separated by the active fill and its ring, not by a rule between
  every pair. That was already the design in dark; light now matches rather than
  light gaining a new idea;
- the tint alternative was rejected: lifting the light bar off `#ffffff` to
  `#f6f8fa` would separate inactive tabs, but it would give light a divider
  scheme dark does not have, which is the inconsistency this entry removes.
  Worth revisiting only if adjacent inactive tabs prove genuinely hard to read.

Verification:

- the separator colour was sampled from the reported screenshot before changing
  anything, and the two dark themes' bar colours were read from their own
  installed theme JSON and compared by relative luminance;
- `settings.json` parses as JSONC and reads back `#00000000` for all four theme
  blocks, 150 top-level keys, and `git diff --check` passes;
- not verified: the rendered tab strip. `colorCustomizations` apply live, so this
  should show without a reload.

### 2026-08-31 — Cmd+B on a config key read through the `Config` facade

Intent:

- make `Config::integer('auth.passwords.users.expire', 60)` jump to
  `config/auth.php` the way `config('...')` already does. Before this it fell
  through to the reference peek and reported "No other references found."

Diagnosis:

- `resolveLaravelConfigTarget` and `findLaravelConfigKeyRange` were already
  correct; the gap was one regex. `getLaravelConfigKeyAtOffset` recognised the
  `config()` helper and `Log::channel()` and nothing else, so the facade form
  never produced a key to look up;
- `Config::` resolves to the same `Illuminate\Config\Repository` the helper
  returns, so every reader on it names a key just as directly. The typed readers
  (`string`, `integer`, `float`, `boolean`, `array`, `collection`) are the ones
  actually in use here - all three facade call sites in `ribeit-depozit` are
  typed readers, none is a plain `get`.

Implementation:

- lifted the three prefix regexes out of the function body into named constants,
  because a third one inline would have been the second unreadable literal in a
  row;
- added `CONFIG_FACADE_PATTERN`, matching the facade imported, root-namespaced,
  and fully qualified, over `get|has|set|push|prepend|string|integer|float|
  boolean|array|collection`.

Decisions and lessons:

- `getMany` is deliberately absent. Its keys sit inside an array literal, so the
  prefix ends at `[` rather than at the call's own paren and the pattern would
  never fire anyway; listing it would only imply support that does not exist;
- the leading `(?:^|[^A-Za-z0-9_])` is what keeps `AppConfig::string(...)` from
  matching, and it is tested.

Verification:

- 11 tests in `laravelConfigNavigation.test.js` (3 new), and 147 across the
  extension's whole suite, all passing;
- an end-to-end run outside VS Code against the real files resolved all three
  facade call sites in `ribeit-depozit`:
  `auth.passwords.users.expire` → `config/auth.php:101`,
  `horizon.authorized_emails` → `config/horizon.php:98`, and
  `app.url` → `config/app.php:57`;
- not verified: the jump in a running editor. The extension is symlinked into
  `~/.vscode/extensions`, so it needs a window reload.

### 2026-08-31 — The `Parent` CodeLens no longer lands inside a docblock

Intent:

- stop `Parent` rendering between two `*` lines in the middle of `User.php`'s
  class docblock, four lines above the class it annotates.

Diagnosis:

- the lens is this extension's own, from `createPhpParentCodeLensProvider`, and
  it was correct in substance - it pointed at `Model::getKey()`, which is where
  `User`'s `@method int getKey()` really comes from;
- it was misplaced because Intelephense reports a `@method` tag as an ordinary
  method symbol positioned on the tag's own line. `getKey` therefore resolved to
  `User.php:41`, inside the docblock, and a CodeLens renders on the line above
  its anchor - line 40, the blank `*`;
- `PHPDOC_TAG_LINE_PATTERN` already existed for exactly this, with the finding
  written beside it, and the reference-count lens already consulted it. The
  Parent provider was the one path that never got the guard.

Implementation:

- skip a method symbol whose line matches `PHPDOC_TAG_LINE_PATTERN`, and hoist
  `selectionRange || range` into a `range` local so the guard and the lens are
  anchored to the same thing;
- carried over the `range.start.line < document.lineCount` check from the
  reference lens: symbols are fetched asynchronously, so the document may be
  shorter by the time the lens is built, and an out-of-range `lineAt` rejects
  the whole batch and blanks every lens in the file.

Decisions and lessons:

- suppressed rather than relocated. A `@method` tag whose whole content is "this
  comes from the parent" gains nothing from a link that says the same, and
  Cmd+B on the tag already resolves;
- `@property` lines match the same pattern. They were never method symbols, so
  nothing changes for them, but the guard covers them for free.

Verification:

- 4 new tests in `phpDocParentLens.test.js` reading the pattern and the provider
  out of the shipped `extension.js`, the idiom `phpDocStaticCalls.test.js`
  already uses; 151 across the extension's suite, all passing;
- replayed the guard over the real `User.php`: it suppresses line 41 and the 11
  `@property` lines, and leaves `casts()` at 54, `sendPasswordResetNotification()`
  at 64, and `may()` at 73 untouched;
- not verified: the rendered lens. The extension is symlinked into
  `~/.vscode/extensions`, so it needs a window reload.

### 2026-08-31 — Volar's reflow folded a newline into a translation key

Intent:

- `Option+Cmd+L` in `ribeit-depozit/resources/js/pages/roles/RoleMatrixPage.vue`
  did not just rewrap the file, it changed a string. Stop that, without
  disturbing the `[vue]` default the 2026-08-11 entry deliberately kept.

Diagnosis:

- `[vue]` points at `Vue.volar`, which formats the template through the HTML
  formatter, which wraps at `html.format.wrapLineLength` - unset here, so the
  default 120. The measurement: the `<AppButton>` line came back at 115 columns
  with the next attribute pushed to a new line, and the prose line at 126;
- the rewrap does not stop at the mustache. It folded two newlines and their
  indentation *into* the JS string inside `t(...)`, and that string is the
  translation key - `en.json:51` and `ro.json:51` both hold it verbatim. The
  lookup would have missed and the Romanian page fallen back to a broken
  English string. That is a semantic edit made by a formatter;
- Prettier was ruled out as the culprit and then confirmed as the fix: piping
  the committed file through the project's own Prettier reproduced it
  byte-for-byte. Piping the *mangled* file through Prettier restored every line
  of layout and left the corrupted string exactly as it was — the newlines are
  content now, and no formatter will undo them.

Implementation:

- `[vue]` set to `esbenp.prettier-vscode` in `ribeit-depozit/.vscode/settings.json`,
  not in the dotfiles.

Decisions and lessons:

- **the global stays on Volar.** The 2026-08-11 entry rejected Prettier as a
  reconciliation on measurement — 5 of 60 `.vue` files matched in
  `construction-frontend`, whose formatting comes from JetBrains `ij_*`
  editorconfig keys VS Code cannot read. That measurement still holds, and it is
  about that repository. `ribeit-depozit` is the opposite case: `.prettierrc.json`,
  a `format:check` script, and `prettier --check .` reporting every file already
  clean. So the formatter follows the repository, per workspace;
- this is the second per-workspace override in that repository, after
  `intelephense.environment.phpVersion: 8.5.0`. Neither is tracked here —
  `/.vscode` is gitignored there — so this entry is where they are discoverable;
- the general trap, worth carrying to any Vue project still on the Volar
  formatter: an HTML-level rewrap treats a mustache as text. Any `t('long
  string')` that crosses the wrap column is a candidate for the same corruption,
  and it is invisible in review because the diff looks like reindentation.

Verification:

- the working-tree damage was reverted with `git checkout --`, and the file now
  matches `HEAD`;
- `npm run format:check` in `ribeit-depozit`: "All matched files use Prettier
  code style", so the new formatter is a no-op on the committed tree rather than
  a source of churn;
- `.vscode/settings.json` parses with the comments stripped, 3 keys, `[vue]`
  reading back `esbenp.prettier-vscode`;
- not verified: the keypress itself. Workspace settings apply live, so no reload
  is needed, but `Option+Cmd+L` has not been pressed again in that window.

### 2026-08-31 — Cmd+B on a middleware alias

Intent:

- `Route::middleware('frontend-vm-secret')` in `ribeit-api/routes/internal-api.php`
  reported no references. The alias is registered at `app/Http/Kernel.php:105`
  and points at `ValidateFrontendVmSecret`, but Laravel maps the two at runtime,
  so Intelephense sees a bare string.

Diagnosis:

- unlike the `Config` facade gap the same day, this was not a missing pattern -
  the extension had no middleware reader at all. `grep -n middleware *.js`
  returned nothing;
- the registration has moved between major versions but not in shape:
  `$middlewareAliases` in `Kernel.php` through Laravel 10, `$middleware->alias([...])`
  in `bootstrap/app.php` from 11 on. Both write `'alias' => Class::class`, so one
  reader answers for either. Both generations are live here - `ribeit-api` and
  `growee` on the first, `ribeit-depozit`, `construction-backend` and `dfs-api`
  on the second.

Implementation:

- new `laravelMiddlewareNavigation.js`, reusing `scanPhpString` and
  `skipPhpComment` from `laravelConfigNavigation` rather than re-deciding what a
  comment is;
- `resolveLaravelMiddlewareTarget` in `extension.js`, added to the fallback loop
  that runs only after native resolution comes back empty - which for a string
  literal it always does;
- the jump lands on the middleware class, not on the map that names it. The
  alias map is resolved to a class name, the class name through the file's own
  imports, and the FQN through composer PSR-4 including `vendor`.

Decisions and lessons:

- **a parameterised alias is split at the colon.** `throttle:60,1` and
  `auth:sanctum` name the alias before it; the rest is arguments to `handle()`;
- **the framework's own file is the third source, and it was found by testing
  rather than by reading.** `signed` in `construction-backend` read correctly as
  an alias and then resolved to nothing, because Laravel 11 stopped publishing
  the defaults into the app - they live only in the framework's
  `Configuration/Middleware.php`. It is last in the list so an app that
  overrides an alias still wins, and it is read only when the app files have
  already come back empty;
- **a conditional value is left alone.** That same file registers `throttle` as
  a ternary on `$this->throttleWithRedis`, naming two classes. The pattern is
  anchored to a plain `Class::class`, so it declines rather than guessing - and
  the ordinary case still works, because an app on Laravel 10 has `throttle` in
  its own Kernel;
- the alias-array prefix in the call pattern is what lets the cursor sit on any
  entry of `middleware(['backup-secret', 'throttle:60,1'])`, not only the first.

Verification:

- 10 tests in `laravelMiddlewareNavigation.test.js`, 161 across the extension's
  whole suite, all passing;
- an end-to-end run outside VS Code resolved five real call sites across both
  Laravel generations and both app and vendor middleware:
  `frontend-vm-secret` → `app/Http/Middleware/ValidateFrontendVmSecret.php:16`,
  `backup-secret` → `.../ValidateBackupSecret.php:9`,
  `throttle:66,1` → `vendor/.../Routing/Middleware/ThrottleRequests.php:18`
  (Kernel.php, Laravel 10), then in `construction-backend`
  `auth:sanctum` → `app/Http/Middleware/Authenticate.php:8` (bootstrap/app.php)
  and `signed` → `vendor/.../Routing/Middleware/ValidateSignature.php:9`
  (framework defaults);
- not verified: the jump in a running editor. Needs a window reload.

### 2026-08-31 — The slider under the tab strip hidden, scrolling kept

Intent:

- remove the horizontal scrollbar drawn under the editor tabs. The strip stays
  scrollable; only the slider goes.

Diagnosis:

- the first instinct was a `custom-workbench.css` rule, and the DOM for one was
  confirmed - `.tabs-and-actions-container` holds a `.monaco-scrollable-element`
  whose direct child is `.scrollbar.horizontal`, per VS Code's own stylesheet;
- it is not needed. `workbench.editor.titleScrollbarVisibility` exists in this
  build, `auto | visible | hidden`, defaulting to `auto`. Read out of the
  settings registry rather than guessed, with its own description: "Controls the
  visibility of the scrollbars used for tabs and breadcrumbs in the editor title
  area", and `hidden` documented as "The horizontal scrollbar will always be
  hidden";
- it changes only what is painted. The setting resolves to a `ScrollbarVisibility`
  value handed to the ScrollableElement, which keeps handling wheel and trackpad
  events either way. Dragging was never available here anyway: the workbench
  stylesheet sets `pointer-events: none` on `.scrollbar.horizontal`.

Implementation:

- `"workbench.editor.titleScrollbarVisibility": "hidden"` in `settings.json`,
  beside the other tab-strip keys.

Decisions and lessons:

- **check the settings registry before writing CSS.** This setup carries 569
  lines of workbench CSS, and the reflex is to add one more rule. A grep for
  `"workbench\.[a-zA-Z.]*[Ss]crollbar` in `workbench.desktop.main.js` answered
  it in one call, and a supported setting survives VS Code renaming a class
  where an injected rule silently stops matching;
- the setting also covers the breadcrumbs' scrollbar in the same title area.
  That is wider than what was asked for, but it is the same strip and the same
  ornament, so it was taken rather than narrowed with CSS.

Verification:

- the enum and both descriptions were read out of the shipped settings schema
  and `nls.messages.js`, not assumed;
- `settings.json` parses as JSONC, 151 top-level keys, and the new key reads
  back `hidden`;
- settings of this kind apply live, so no reload should be needed;
- not verified: the tab strip on screen. The honest check is one glance at the
  bar with more tabs open than fit.

### 2026-09-01 — Cmd+B on a key *inside* a config file finds its readers

Intent:

- `config/tls.php`, cursor on `'key_bits'`, Cmd+B answered "No other references
  found" while three call sites read it. The forward jump — from
  `config('tls.key_bits')` into the file — already worked; the return trip did
  not exist.

Diagnosis:

- Intelephense sees an array key on one side and a string argument on the other
  and relates neither, so it has nothing to report and is not wrong to say so;
- `smartReferences.go` already merges custom finders in `getReferenceTargets`,
  one per convention Intelephense cannot see. There was simply no config one.

Implementation:

- `laravelConfigNavigation.js` grew the reverse of each half it already had:
  - `getLaravelConfigKeyPathAtOffset(source, offset)` — the dotted path of the
    key under the cursor, minus the file name. The mirror of
    `findLaravelConfigKeyRange`, walking the same token stream from the `return`
    array down, one segment per enclosing array;
  - `findLaravelConfigKeyReadRanges(source, key)` — every literal in a file that
    names that key;
- both directions now read one walk, `forEachConfigKeyRead`, so a call site the
  forward jump follows is by construction a call site the reverse search finds.
  `getLaravelConfigKeyAtOffset` is the same walk stopping at the cursor;
- `findDirectArrayKey` became a `directArrayKeys` generator with the by-name
  lookup on top, because the reverse walk needs to enumerate keys rather than
  ask for one. Second caller, so the extraction is paid for;
- `getLaravelConfigKeyReferences` in `extension.js`, joined to the existing
  `Promise.all`.

Decisions and lessons:

- **flat `config/` only, matching the forward jump.** Laravel's
  `LoadConfiguration` does recurse and prefixes nested directories with dots,
  but `resolveLaravelConfigTarget` has always assumed `config/<name>.php`. All
  three repos are flat. Teaching one direction and not the other is how the two
  drift, so a nested config directory is a change to both or to neither;
- **exact key match, not ancestors.** `config('tls')` reads `key_bits` too, but
  counting parent reads would put every `config('app')` in the list of every key
  in `app.php`. The forward jump treats `config('tls')` as naming the file, and
  the reverse treats it as a different key;
- **the cheap pre-filter is the last segment, not the dotted key.**
  `Log::channel('single')` reads `logging.channels.single` while spelling only
  `single`, so a `text.includes(key)` guard would skip exactly the files the
  walk exists to recognise;
- the prefix window bounding `forEachConfigKeyRead` is 160 chars. Longest thing
  that can match is a root-namespaced facade call, `\Illuminate\Support\Facades\Config::collection(`,
  about 45. Without a bound, scanning a whole file's literals re-slices the
  source at each one.

Verification:

- `node --test files_to_symlink/vscode/extensions/local.smart-references-0.0.1/test/*.test.js`
  — 166 passing, 5 new;
- against the real `ribeit-api`: cursor on `'key_bits'` in `config/tls.php`
  resolves to `tls.key_bits` and returns exactly the three readers `grep` finds
  — `TlsCertHealthService.php:158`, `TlsCertificateService.php:103` and `:141`;
- round-trip over three repos: every dotted config key read anywhere in
  `ribeit-api`, `ribeit-depozit` and `construction-backend` that the forward
  jump resolves to a file position (166 of them) reads back as the same path.
  No mismatches;
- not verified in a running editor. Needs a window reload.

### 2026-09-01 — Cmd+B on `$model->increment()`

Intent:

- `TlsCertificateSyncController.php`, cursor on `increment` in
  `$record->increment('bundle_fetches', 1, [...])`, Cmd+B answered "No other
  references found".

Diagnosis:

- not a typing failure and not an extension gap at first sight — Intelephense is
  correct. Laravel 12 declares `increment` **protected** on
  `Illuminate\Database\Eloquent\Model` (`Model.php:1021`), so a controller
  calling it is calling an inaccessible member and there is nothing to resolve;
- it is not the Builder's `increment` either. A grep of `Model.php`, its
  `Concerns/` traits and `Database/Concerns/` finds exactly one declaration of
  the name reachable on a model, and it is the protected one;
- the call nevertheless does the right thing, because `Model::__call` opens with
  an explicit re-dispatch:

  ```php
  if (in_array($method, ['increment', 'decrement', 'incrementQuietly', 'decrementQuietly'])) {
      return $this->$method(...$parameters);
  }
  ```

  Inaccessible from outside, so `__call` fires; `$this->$method(...)` runs from
  inside the class, so the protected declaration executes. **Worth knowing that
  this special case exists**: without it the call would fall to
  `forwardCallTo($this->newQuery(), ...)` and hit `Builder::increment`, which is
  an unscoped bulk `UPDATE` over the whole table rather than one row;
- both call sites in `ribeit-api` are this shape — the controller, and
  `ProcessedPage.php:65` where the receiver is an `updateOrCreate()` result.

Implementation:

- `laravelModelMagicCalls.js`: `getModelMagicMethodAtOffset(source, offset)`
  reads the method name under the cursor when it is one of the four the
  framework re-dispatches. It walks with the shared `scanPhpString` /
  `skipPhpComment`, so `'$x->increment('` inside a message is not read as a call;
- `resolveLaravelModelMagicCallTarget` in `extension.js` opens the vendor
  `Model.php` and reuses the existing `getPhpMethodDeclarationRanges`, joined to
  the fallback list in `goToDefinition`.

Decisions and lessons:

- **the target is the protected declaration, not a stub or a doc line.** Landing
  on `Model.php:1021` puts `incrementOrDecrement` on the next screen, which is
  the code that answers what the call actually does to the row;
- **no check that the receiver is really a model.** Those four names are the
  whole of the framework's re-dispatch list, and the resolver runs only where
  native resolution already came back empty, so the only way to reach it wrongly
  is `->increment()` on a class that has no such method — a call that resolved
  nowhere before and now resolves somewhere explicable. Cheap receiver type
  inference for `$record` does not exist here, and an expensive one does not
  belong on a Cmd+B fallback;
- **the visibility is the version guard.** Where a framework declares these
  public, Intelephense resolves the call itself and this code never runs. Nothing
  has to test the Laravel version;
- sticky regex rather than `source.slice(index)` per `-`, so the walk stays
  linear on a long file.

Verification:

- `node --test files_to_symlink/vscode/extensions/local.smart-references-0.0.1/test/*.test.js`
  — 174 passing, 8 new, covering nullsafe calls, chains, `incrementBy` as a
  near-miss, static calls, and strings and comments;
- against the real `ribeit-api`, both call sites read `increment` and land on
  `Model.php:1021 protected function increment(...)`;
- not verified in a running editor. Needs a window reload.

### 2026-09-01 — Cmd+B on a trait landed on our own stub

Intent:

- `TlsCertificate.php`, Cmd+B on `HasCreator`, and the editor opens
  `_ide_helper_manual.php:207` — `trait HasCreator {}`, an empty body — instead
  of `app/Shared/Traits/HasCreator.php`.

Diagnosis:

- the stub is **ours**. `laravelIntelligence.js` writes it: a model concern earns
  a partial trait carrying `@mixin \Illuminate\Database\Eloquent\Model`, so
  `static::creating(…)` inside the trait resolves. The declaration is empty on
  purpose — Intelephense merges it with the real one — and that merge is exactly
  what makes it a plausible Go-to-Definition target;
- `resolveLaravelHelperTarget` exists to hop from stub to real source and was
  already wired in. It simply could not see a trait: `getStubClassDeclaration`
  matched `\bclass\s+`, `isMatchingPhpClassSource` matched `class`, and the
  inline pattern that finds the name in the real file matched `class`. Three
  regexes, one word each;
- the generator emits **65 trait stubs against 11 class stubs** in this repo. The
  half that was never read back was the larger half.

Implementation:

- `getStubClassDeclaration` → `getStubTypeDeclaration`, returning `typeName`, and
  `isMatchingPhpClassSource` → `isMatchingPhpTypeSource`. Both now accept
  `class|interface|trait`, as does the pattern in `resolveLaravelHelperTarget`
  that locates the name in the real file.

Decisions and lessons:

- **renamed rather than widened in place.** A function called
  `getStubClassDeclaration` that answers for traits is how the next reader
  reintroduces the bug. Four call sites, worth it;
- `findClassFileUri`'s symbol-kind filter was left alone. Whether Intelephense
  reports a PHP trait as `SymbolKind.Class` is not something to guess at: if it
  does, the symbol path answers, and if it does not, `classes.length === 0` falls
  to `findClassFileBySource`, which globs `**/HasCreator.php` and matches by
  source — and that fallback is precisely what the widened
  `isMatchingPhpTypeSource` fixes. Both paths now land;
- **a generator and its reader are one feature.** This extension writes the stub
  file and reads it back, and the two halves were taught different vocabularies.
  Anything added to `renderTraitMixinBlock`'s output has to be added to what
  `resolveLaravelHelperTarget` recognises in the same change.

Verification:

- `node --test files_to_symlink/vscode/extensions/local.smart-references-0.0.1/test/*.test.js`
  — 177 passing, 3 new for the trait shape;
- against the real `ribeit-api` stub: `HasCreator` at `_ide_helper_manual.php:207`
  now resolves to `app/Shared/Traits/HasCreator.php:17`, and 70 of the 76
  declarations in that file resolve to first-party source. The 6 that do not are
  all vendor types — `Illuminate\Http\Request`, `Rule`, `Blueprint`, `Http`, two
  Restify ones — which are `@method`/fluent-override stubs handled by the macro
  branch and were never meant to resolve by type;
- not verified in a running editor. Needs a window reload.

### 2026-09-02 — New windows open where the last one was, not offset from it

Intent:

- a new VS Code window should fill the screen with a margin, the way Swish's
  maximize leaves it. It was opening slightly right of centre and slightly small.

Diagnosis:

- measured first, with Hammerspoon rather than by eye. The screen's usable frame
  is `0,33 1512x949`; every already-placed window sat at `8,41 1496x933` — that
  frame inset 8px per side. So the target is not "maximized": it is the inset,
  and Swish is what puts windows there;
- the offset is VS Code's own, out of `main.js`:

  ```js
  s.x = centred; s.y = centred;
  let l = true;
  if (newWindowDimensions === "inherit") { s = {...lastActiveState}; l = false; }
  if (l) s = ensureNoOverlap(s);

  ensureNoOverlap(e) {
      while (openWindows.some(r => r.x === e.x || r.y === e.y)) { e.x += 30; e.y += 30; }
  }
  ```

  With the setting unset, `l` stays true and `ensureNoOverlap` nudges the new
  window +30,+30 until neither coordinate collides with an open one. That is the
  whole of "slightly to the right, and not quite full size".

Implementation:

- `"window.newWindowDimensions": "inherit"` in `settings.json`, beside
  `window.restoreWindows`.

Decisions and lessons:

- **`inherit`, not `maximized`.** `maximized` sets `mode = 0` and a real
  macOS maximize, which fills the usable frame edge to edge and loses the 8px
  gap that was the point of the request. `inherit` copies the last window's
  bounds verbatim, gap included;
- the setting's real work is the `l = false` it sets, which *skips*
  `ensureNoOverlap`. Reading the branch is what showed that the cascade — not the
  default size — was the complaint;
- **known weakness, stated rather than hidden.** `inherit` copies whatever the
  last active window was. Snap one to half-screen and the next new window is
  half-screen. It fits here because Swish's maximize is by far the most-used
  action on this machine (969 uses against 290 for halves), but if that bites,
  the deterministic version is a Hammerspoon `hs.window.filter` rule on VS Code
  window creation setting the frame to `screen:frame()` inset by 8 — this repo
  already symlinks `init.lua` to `~/.hammerspoon/init.lua`;
- no Hammerspoon rule was written. A supported setting that answers the request
  beats automation that would have to be maintained against it.

Verification:

- `settings.json` parses as JSONC, 152 top-level keys, and the key reads back
  `inherit`;
- end-to-end on the real machine: `code -n` with the setting live, then measured
  all three windows through Hammerspoon. The new one came up at `8,41 1496x933`,
  identical to the two already open, with no +30 offset;
- settings of this kind apply live, so no reload was needed and none was done.

### 2026-09-02 — Shift+Cmd+X leads with Remote Explorer

Intent: the SSH remotes are the destination worth one keystroke; Extensions is
rarely opened. The 2026-08-11 pair had it the other way round — first press
Extensions, second press Remote — so the common case cost two presses.

Implementation: the pair keeps its shape and swaps which view each clause is
keyed to. `keybindings.json` now ends with `activeViewlet == 'workbench.view.remote'`
→ `workbench.view.extensions`, then `activeViewlet != 'workbench.view.remote'`
→ `workbench.view.remote`.

Decisions and lessons:

- **the `!=` rule names the first destination and has to stay last.** VS Code
  resolves a chord to the last matching entry, and `!=` also matches a hidden
  sidebar, so that rule is what makes the first press land somewhere definite
  from anywhere. Writing the pair in the other order silently gives one view both
  presses;
- **this reverses 2026-08-11's cycle direction, not its shape.** That entry
  stands as written: its reasoning about `!=` covering a hidden sidebar is what
  this change reuses, only pointed at the other view. Pressing from Extensions
  now reaches Remote rather than returning, which is the same two-view cycle
  read from the other end;
- no third view was added. Explorer keeps its own binding; a three-way cycle
  would need a `when` clause per hop and would make the second press ambiguous.

Verification:

- `keybindings.json` parses as JSONC at 80 entries, and the last two read as
  written above;
- `~/Library/Application Support/Code/User/keybindings.json` is a symlink to the
  repository copy, and VS Code reloads that file live, so no window reload is
  needed;
- **not verified: the presses themselves.** Expect Remote Explorer from the
  Explorer or a hidden sidebar, and Extensions only from Remote Explorer.
