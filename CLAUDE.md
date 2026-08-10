# Claude repository guidance

Follow [`AGENTS.md`](AGENTS.md) for repository-wide instructions.

Its first section is a startup check: whether
`~/.cache/tmux-health/thermal/REVIEW.md` exists. It usually does not, and then
there is nothing to do. When it does, thermal snapshots are waiting to be
analysed — read that file, tell the user, and offer. It is repeated here because
it is the one instruction that has to run before the session's actual work, not
when some particular file is edited.

For any VS Code settings, keybindings, symlink installation, or local-extension
work, first read
[`files_to_symlink/vscode/CUSTOMIZATION_HISTORY.md`](files_to_symlink/vscode/CUSTOMIZATION_HISTORY.md).
That document is the canonical intent, decision, lesson, verification, and
change-history record for this setup.
