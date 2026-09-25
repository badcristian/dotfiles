# Repository guidance for agents

This repository is the source of truth for the user's machine configuration.
Files installed into the home directory are often symlinks back into
`files_to_symlink`, so edit the repository copy rather than the live destination.

## On startup: thermal snapshots waiting to be reviewed

Check whether this file exists, before doing anything else:

```bash
~/.cache/tmux-health/thermal/REVIEW.md
```

**If it is absent, there is nothing to do.** That is the normal case and the
check costs a single `test -f`. Do not go looking further.

**If it is present**, `files_to_symlink/tmux-health.sh` has caught this machine
running hot on enough separate occasions to be worth analysing, and nobody has
looked yet. Read it — it states how many snapshots there are, the period they
cover, where they live, and how to clear them afterwards.

Then *tell the user it is waiting* and offer to do the analysis. Do not silently
start it: the user opened this session for something, and a queued investigation
is not automatically that something. If they say yes, the file explains the
question the snapshots exist to answer without prescribing how to answer it —
the useful finding may not be one anybody predicted, so treat its suggestions as
a starting point rather than a checklist.

Nothing here is tracked in git. The snapshots and the review file live in the
cache directory because they describe this machine at a moment, not the
configuration; a fresh clone correctly finds nothing.

## Performance questions: read the history first

`~/.cache/tmux-health/history.jsonl` carries one line per health refresh: the
memory split, the swap rate, the footprint of every tracked application, the
largest single process, and the uptime behind all of it. `bash
~/tmux-health.sh history` prints it.

Read it before proposing anything about this machine's performance. One reading
cannot tell a leak from a busy afternoon, and the row in the status bar is one
reading. Uptime is in each line because a footprint means something different on
hour 2 than on day 13. Not in git, for the same reason as the snapshots above.

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

## Tests

Run the Neovim suites with `bash tests/run.sh`. It runs each file with
`nvim --headless`, bounds it with a wall-clock limit, and refuses to exit while
a test process is still alive.

Never launch Neovim with `--embed` to run a test. An `--embed` instance waits
for a UI to attach over stdio; when the caller goes away it is reparented to
init and runs forever, unreachable and invisible. Six of those accumulated over
five days holding 190 MB and roughly 6% of a core. The workspace test needs real
windows, which is what makes `--embed` look necessary — it is not, headless
Neovim has windows and buffers too.
