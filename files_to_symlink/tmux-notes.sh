#!/bin/bash

set -euo pipefail

popup_mode=false

if [[ "${1:-}" == "--popup" ]]; then
    popup_mode=true
    shift
fi

project_name="${1:-}"
notes_root="${TMUX_PROJECT_NOTES_DIR:-$HOME/.local/share/tmux-project-notes}"
notes_editor="${TMUX_NOTES_EDITOR:-nvim}"
notes_workspace="${TMUX_NOTES_WORKSPACE:-$HOME/tmux-notes.lua}"

if [[ "$popup_mode" == true ]]; then
    trap 'tmux set-option -gu @notes_popup_open 2>/dev/null || true' EXIT
fi

for required_command in tmux pbcopy "$notes_editor"; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        echo "Missing required command: $required_command" >&2
        exit 1
    fi
done

if [[ "$(basename "$notes_editor")" != "nvim" ]]; then
    echo "The inline notes workspace requires Neovim: $notes_editor" >&2
    exit 1
fi

if [[ ! -f "$notes_workspace" ]]; then
    echo "Notes workspace does not exist: $notes_workspace" >&2
    exit 1
fi

if [[ -z "$project_name" ]]; then
    project_name="$(tmux display-message -p '#S' 2>/dev/null || true)"
fi

if [[ -z "$project_name" ]]; then
    echo "Open notes from inside a Tmux project." >&2
    exit 1
fi

safe_project_name="$(printf '%s' "$project_name" | tr '/:' '--')"
project_notes_dir="$notes_root/projects/$safe_project_name"
global_notes_dir="$notes_root/global"

mkdir -p "$project_notes_dir" "$global_notes_dir"

export TMUX_NOTES_GLOBAL_DIR="$global_notes_dir"
export TMUX_NOTES_PROJECT_DIR="$project_notes_dir"
export TMUX_NOTES_PROJECT_NAME="$project_name"
export TMUX_NOTES_ROOT="$notes_root"
export TMUX_NOTES_WORKSPACE="$notes_workspace"

"$notes_editor" -c 'lua dofile(vim.env.TMUX_NOTES_WORKSPACE)'
