#!/bin/bash
# Make Sublime Text the default app for every text-ish file type.
# Types with no explicit handler go to whichever app claimed them last (Cursor, TextEdit,
# Ghostty...) and flip on app updates -> pin each one. Rerun after installing a new editor.

SUBLIME=com.sublimetext.4

# Parent UTIs: catch types with a proper UTI not listed below.
UTIS=(
    public.plain-text
    public.utf8-plain-text
    public.text
    public.source-code
    public.script
    public.shell-script
)

# Extensions -> resolved to their UTI via a temp file: duti's own lookup yields a
# dyn.* id Finder never uses, and LaunchServices rejects it (-50).
# html (Chrome) and csv (TableTool) left alone - deliberate picks.
# ts shares a UTI with MPEG-2 video -> video .ts files open in Sublime too.
EXTENSIONS=(
    txt text md markdown log
    php phar blade.php inc
    js mjs cjs jsx ts tsx vue svelte
    json jsonc json5 yml yaml toml ini conf cfg env lock neon dist
    xml svg css scss sass less
    sh bash zsh fish ps1 bat
    py rb go rs java kt swift c h cpp hpp cs lua sql graphql
    gitignore gitattributes editorconfig dockerfile
)

for uti in "${UTIS[@]}"; do
    duti -s "$SUBLIME" "$uti" all
done

PROBE=$(mktemp -d)
trap 'rm -rf "$PROBE"' EXIT
for ext in "${EXTENSIONS[@]}"; do
    touch "$PROBE/probe.$ext"
    duti -s "$SUBLIME" "$(mdls -raw -name kMDItemContentType "$PROBE/probe.$ext")" all
done

# macOS asks to confirm each change; an unapproved one is silently dropped.
echo "Approve the macOS prompts, then rerun to check: duti -x <ext>"
