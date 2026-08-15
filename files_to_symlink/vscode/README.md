# VS Code

This folder stores the VS Code user settings and local extensions that make VS Code behave closer to PhpStorm.

Before changing this configuration or a local extension, read
[`CUSTOMIZATION_HISTORY.md`](CUSTOMIZATION_HISTORY.md). It is the canonical
record of the setup's intent, architectural decisions, known limitations,
verification steps, and major feature history.

## Install On A New Mac

1. Install VS Code.
2. Install marketplace extensions used by the settings, especially:
   - `bmewburn.vscode-intelephense-client`
   - `neilbrayfield.php-docblocker`
   - `phantriviethoang.phpstorm-icon`
   - `open-southeners.laravel-pint`
   - `be5invis.vscode-custom-css` only if the workbench CSS and JS are wanted

   Or install the saved marketplace extension list:

```bash
bash ~/dev/dotfiles/files_to_symlink/vscode/install_marketplace_extensions.sh
```

3. Run:

```bash
bash ~/dev/dotfiles/files_to_symlink/vscode/install_vscode.sh
```

4. Open VS Code and run `Developer: Reload Window`.

## Included Local Extensions

- `local.current-file-runner`: file-aware **Run Current File** command. `Cmd+R`
  currently saves and runs ordinary `.ts` files through the workspace's local
  `tsx`; unsupported files get an explicit informational message. Add future
  language, filename, or location rules to this extension rather than stacking
  conditional shell keybindings.
- `local.smart-references`: PhpStorm-style references popup, custom `Cmd+B`, smart Backspace behavior. Also ships `laravelIntelligence.js` — a command-driven Laravel IDE-helper **generator** (command palette → **"Laravel: Refresh IDE Helpers & Icons"**). It scans models for Eloquent accessors (`getXAttribute` / `x(): Attribute`) and writes `@property-read` tags plus Restify fluent `: self`→`: static` overrides into `_ide_helper_manual.php` (a passive, IDE-only stub Intelephense merges over your models/vendor — so `$model->signature_count` and `->usingRelation()` resolve without editing app/vendor code), then refreshes the PhpStorm file icons. Reads files with `workspace.fs` (never opens documents) and registers **no** language providers, so it can't trigger a re-analysis storm. Pure helpers are unit-tested (`test/laravelIntelligence.test.js`). An earlier live-provider version was removed after it caused exactly that storm.
- `local.php-smart-docblock`: local-variable PHPDoc action and `Cmd+Enter` jump-to-definition fallback.
- `local.preview-pin-on-click`: preview tab reuse, pin on editor click, carry the last Markdown Preview/source mode across all `.md` files, and keep bottom breathing room in rendered Markdown previews.
- `local.phpstorm-project-icons`: command palette command to scan PHP files and update PhpStorm icon mappings.
- `local.statusbar-toggle`: local status bar toggle helper.
- `local.project-chooser`: PhpStorm-style project picker on `Cmd+O`. Lists recently opened folders and workspaces first, then git repositories found one level under `projectChooser.projectRoots` (default `~/dev`), and ends with an **Open Folder…** entry that falls back to the native dialog. An empty window always opens the picked project in place; a window that already has a project open follows the **Open in a new window** toggle, which is on by default and persists across windows.

## Open Project

`Cmd+O` opens the picker instead of the macOS folder dialog.

| Key | Action |
| --- | --- |
| `Enter` | Open the highlighted project using the current target |
| `Cmd+Enter` | Open it in the other window instead |
| `Option+Cmd+N` | Flip the persisted **Open in a new window** toggle |

The toggle is also the title-bar button in the picker, and each row has a
button for the one-off alternative. The toggle state lives in the extension's
`globalState`, not in `settings.json`, because a runtime settings write can
replace the symlink that points back at this repository.

Recent projects are read through VS Code's internal `_workbench.getRecentlyOpened`
command. If that command ever disappears, the picker falls back to the projects
this extension recorded itself plus the scanned roots.

### Picker position and border

`User/custom-anchor-quick-input-to-command-center.js` anchors the quick input
widget under the command center pill in the title bar, so this picker and every
other one (`Cmd+P`, double `Shift`) open out of that rounded rectangle.
`User/custom-workbench.css` outlines the same widget: a bright border on dark
themes, a dark one on light themes.

VS Code otherwise positions the widget from `workbench.quickInput.viewState`,
which records the last position the widget was dragged to and applies it to all
pickers. Only the hidden-to-visible transition re-anchors, so a picker can still
be dragged while it is open; the next one opens back under the pill.

Both files are injected by the Custom CSS and JS Loader. See
[Workbench CSS and JS](#workbench-css-and-js) for how to apply changes to them.

## Icon Refresh

After installing the PhpStorm Icon Theme, run this from the command palette:

`PhpStorm Icons: Refresh PHP File Icons From Workspace`

It scans the current workspace PHP files and maps class, enum, interface, trait, abstract class, test class, exception, and anonymous class icons into the installed PhpStorm icon theme.

VS Code icon themes cannot distinguish two files with the same basename in different folders. If duplicate basenames need different icons, the refresh command skips those conflicted names.

## Workbench CSS and JS

Some behavior cannot be reached from the extension API and needs styles or
scripts inside the workbench itself. Those live in the repository as ordinary
files and are symlinked into the live user folder like the settings:

| File | Purpose |
| --- | --- |
| `User/custom-workbench.css` | Compact tabs, per-theme label contrast, quick input border |
| `User/custom-preserve-editor-horizontal-scroll.js` | Keeps horizontal editor scroll across pointer and selection changes |
| `User/custom-anchor-quick-input-to-command-center.js` | Anchors the quick input widget under the command center pill |

`be5invis.vscode-custom-css` injects them, driven by `vscode_custom_css.imports`
in the settings. To enable it on a new machine:

1. Install the extension.
2. Run **Enable Custom CSS and JS** from the command palette.
3. Restart VS Code.

The loader needs write access to the VS Code application directory. If the
command reports that it cannot patch, take ownership once:

```bash
sudo chown -R "$(whoami)" "/Applications/Visual Studio Code.app"
```

The loader **inlines** each file into `workbench.html`, so editing one of them
has no effect until **Reload Custom CSS and JS** is run and VS Code is
restarted. A VS Code update replaces `workbench.html` and drops the injection;
re-run **Enable Custom CSS and JS** after upgrades.

Run the compatibility check after every VS Code upgrade:

```bash
bash ~/dev/dotfiles/files_to_symlink/vscode/check_workbench_customizations.sh
```

Immediately after an upgrade it normally reports that the injection is missing
and tells you to re-enable it. It checks the bundled modern-tab selectors before
that, so a changed DOM contract stops the workflow instead of silently loading
CSS against the wrong elements. After **Enable Custom CSS and JS**, restart VS
Code and rerun the command; all three checks should pass. This catches structural
and deployment regressions. A close visual smoke test is still required because
CSS and DOM checks cannot prove the final pixels.

### Corruption warning

VS Code verifies ten workbench files against the checksums in `product.json` at
startup, so a patched `workbench.html` produces:

> Your Code installation appears to be corrupt. Please reinstall.

Either dismiss the notification through its gear icon with **Don't Show Again**,
or realign the checksums with the files on disk:

```bash
bash ~/dev/dotfiles/files_to_symlink/vscode/fix_vscode_checksums.sh
```

It recomputes every entry, rewrites only the values that changed so
`product.json` keeps its formatting, prints each file it updates, and refuses to
run when `product.json` is not writable. Restart VS Code afterwards.

Re-run it after each **Reload Custom CSS and JS**, because the loader re-inlines
the imported files and changes the hash, and after each VS Code update, once the
loader has been re-enabled.

The script trusts whatever is on disk, so it would equally bless a modification
that was not intentional. That is inherent to silencing this check; the printed
file list is the only signal that the change was the expected one. Verify that
the injection is still present before treating a clean run as success:

```bash
grep -c CUSTOM_CSS_JS_INDICATOR_CLS \
  "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html"
```

## Notes

Workbench injection patches VS Code application files and may break after VS Code
updates. If it fails, the regular settings and local extensions still work.

This setup previously used `drcika.apc-extension` for the same purpose. That
extension hooks the removed AMD bootstrap and stopped injecting anything once VS
Code moved to ESM; its last release is 0.4.1 from August 2024. Do not reintroduce
`apc.stylesheet` or `apc.imports` without first verifying that a current APC
release actually patches the running VS Code version.
