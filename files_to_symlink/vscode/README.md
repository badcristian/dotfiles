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
   - `drcika.apc-extension` only if custom CSS injection is still wanted
   
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

- `local.smart-references`: PhpStorm-style references popup, custom `Cmd+B`, smart Backspace behavior. Also ships `laravelIntelligence.js` — a command-driven Laravel IDE-helper **generator** (command palette → **"Laravel: Refresh IDE Helpers & Icons"**). It scans models for Eloquent accessors (`getXAttribute` / `x(): Attribute`) and writes `@property-read` tags plus Restify fluent `: self`→`: static` overrides into `_ide_helper_manual.php` (a passive, IDE-only stub Intelephense merges over your models/vendor — so `$model->signature_count` and `->usingRelation()` resolve without editing app/vendor code), then refreshes the PhpStorm file icons. Reads files with `workspace.fs` (never opens documents) and registers **no** language providers, so it can't trigger a re-analysis storm. Pure helpers are unit-tested (`test/laravelIntelligence.test.js`). An earlier live-provider version was removed after it caused exactly that storm.
- `local.php-smart-docblock`: local-variable PHPDoc action and `Cmd+Enter` jump-to-definition fallback.
- `local.preview-pin-on-click`: preview tab reuse, pin on editor click, carry the last Markdown Preview/source mode across all `.md` files, and keep bottom breathing room in rendered Markdown previews.
- `local.phpstorm-project-icons`: command palette command to scan PHP files and update PhpStorm icon mappings.
- `local.statusbar-toggle`: local status bar toggle helper.

## Icon Refresh

After installing the PhpStorm Icon Theme, run this from the command palette:

`PhpStorm Icons: Refresh PHP File Icons From Workspace`

It scans the current workspace PHP files and maps class, enum, interface, trait, abstract class, test class, exception, and anonymous class icons into the installed PhpStorm icon theme.

VS Code icon themes cannot distinguish two files with the same basename in different folders. If duplicate basenames need different icons, the refresh command skips those conflicted names.

## Notes

The APC extension patches VS Code application files and may break after VS Code updates. If it fails, the regular settings and local extensions still work.
