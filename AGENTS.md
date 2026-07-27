# Repository guidance for agents

This repository is the source of truth for the user's machine configuration.
Files installed into the home directory are often symlinks back into
`files_to_symlink`, so edit the repository copy rather than the live destination.

## VS Code changes

Before changing anything under `files_to_symlink/vscode`, read
[`files_to_symlink/vscode/CUSTOMIZATION_HISTORY.md`](files_to_symlink/vscode/CUSTOMIZATION_HISTORY.md).
It records the intended behavior, architectural decisions, known limitations,
verification steps, and the history of the custom VS Code extensions.

For every meaningful VS Code feature, behavior change, or lesson:

1. Keep the current-state sections accurate.
2. Add a dated entry at the bottom of the history log.
3. Record intent, implementation, decisions, lessons, and actual verification.
4. Preserve older entries. If an old conclusion is wrong, add a correction in a
   new entry instead of silently rewriting history.

Preserve unrelated working-tree changes and use the existing installer,
extensions, commands, and tests before introducing parallel mechanisms.
