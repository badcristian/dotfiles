#!/bin/bash

set -euo pipefail

project_root="${TMUX_PROJECT_ROOT:-$HOME/dev}"
browse_root="${TMUX_PROJECT_BROWSE_ROOT:-$project_root}"
ui_accent="${TMUX_UI_ACCENT:-4}"
ui_accent_sgr="$(bash "$HOME/tmux-ui.sh" ansi-foreground "$ui_accent")"

for required_command in tmux fzf fd; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        echo "Missing required command: $required_command" >&2
        exit 1
    fi
done

if [[ ! -d "$project_root" ]]; then
    echo "Project directory does not exist: $project_root" >&2
    exit 1
fi

if [[ ! -d "$browse_root" ]]; then
    echo "Project browse directory does not exist: $browse_root" >&2
    exit 1
fi

running_sessions="$(bash "$HOME/tmux-session-ui.sh" list-project-records)"

tmux_client_tty=""
current_session=""
if [[ -n "${TMUX:-}" ]]; then
    tmux_client_tty="$(tmux display-message -p '#{client_tty}')"
    current_session="$(tmux display-message -p '#S')"
fi
export TMUX_SESSION_CLIENT_TTY="$tmux_client_tty"

picker_columns="$(tput cols 2>/dev/null || printf '80')"
if [[ ! "$picker_columns" =~ ^[0-9]+$ ]]; then
    picker_columns=80
fi

status_width=10
name_width=$((picker_columns - status_width - 6))
if (( name_width < 20 )); then
    name_width=20
fi

session_name_for() {
    printf '%s' "$1" | tr '.: ' '---'
}

project_paths() {
    printf '%s\n' "$HOME"
    fd --type d --exact-depth 1 --color never . "$project_root" | LC_ALL=C sort
}

project_records() {
    local project_path
    local project_name
    local display_name
    local session_name
    local window_count
    local window_label
    local running_session
    local running_windows
    local running_rank
    local rank

    while IFS= read -r project_path; do
        project_path="${project_path%/}"

        if [[ "$project_path" == "$HOME" ]]; then
            project_name="Home"
            session_name="home"
        else
            project_name="$(basename "$project_path")"
            session_name="$(session_name_for "$project_name")"
        fi

        display_name="$project_name"
        if (( ${#display_name} > name_width )); then
            display_name="${display_name:0:name_width-1}…"
        fi

        window_count=""
        running_rank=""
        rank=0
        while IFS='|' read -r running_session running_windows; do
            if [[ "$running_session" == "$session_name" ]]; then
                window_count="$running_windows"
                running_rank="$rank"
                break
            fi
            rank=$((rank + 1))
        done <<< "$running_sessions"

        if [[ -n "$window_count" ]]; then
            if [[ "$window_count" == "1" ]]; then
                window_label="1 window"
            else
                window_label="$window_count windows"
            fi

            printf '0\t%08d\t%s\t\033[32m●\033[0m %-*s %*s\topen\t%s\t%s\n' \
                "$running_rank" "$project_name" "$name_width" "$display_name" \
                "$status_width" "$window_label" "$session_name" "$project_path"
        else
            printf '1\t99999999\t%s\t\033[2m○ %-*s %*s\033[0m\topen\t%s\t%s\n' \
                "$project_name" "$name_width" "$display_name" \
                "$status_width" "stopped" "$session_name" "$project_path"
        fi
    done < <(project_paths)
}

project_rows() {
    printf '%s+\033[0m Find any folder…\tcustom\t\t\n' "$ui_accent_sgr"
    project_records |
        LC_ALL=C sort -t $'\t' -k1,1n -k2,2n -k3,3f |
        cut -f4-
}

project_position_for() {
    local target_session="$1"
    local row_position=0
    local display_text
    local row_action
    local row_session
    local row_path

    if [[ -z "$target_session" ]]; then
        printf '1'
        return 0
    fi

    while IFS=$'\t' read -r display_text row_action row_session row_path; do
        row_position=$((row_position + 1))
        if [[ "$row_session" == "$target_session" ]]; then
            printf '%s' "$row_position"
            return 0
        fi
    done

    printf '1'
}

display_path_for() {
    local directory_path="$1"

    if [[ "$directory_path" == "$HOME" ]]; then
        printf '~'
    elif [[ "$directory_path" == "$HOME/"* ]]; then
        printf '~/%s' "${directory_path#"$HOME/"}"
    else
        printf '%s' "$directory_path"
    fi
}

directory_rows() {
    local current_path="${1:-$browse_root}"
    local directory_path

    printf '\033[32m●\033[0m .  Open this folder\topen\t%s\n' "$current_path"

    if [[ "$current_path" != "/" ]]; then
        printf '%s↑\033[0m .. Go up\tparent\t%s\n' \
            "$ui_accent_sgr" "$(dirname "$current_path")"
    fi

    while IFS= read -r directory_path; do
        directory_path="${directory_path%/}"
        printf '  %s/\tenter\t%s\n' "$(basename "$directory_path")" "$directory_path"
    done < <(
        fd \
            --type d \
            --exact-depth 1 \
            --hidden \
            --color never \
            --exclude .git \
            --exclude .gradle \
            --exclude .idea \
            --exclude .Trash \
            --exclude .vscode \
            --exclude Library \
            --exclude build \
            --exclude dist \
            --exclude node_modules \
            --exclude target \
            --exclude vendor \
            . "$current_path" |
            LC_ALL=C sort
    )
}

choose_custom_path() {
    local browser_header
    local browser_result
    local browser_key
    local current_path
    local current_display_path
    local selection
    local selected_action
    local selected_path

    current_path="$(
        cd "$browse_root"
        pwd -P
    )"
    browse_root="$current_path"

    while true; do
        current_display_path="$(display_path_for "$current_path")"
        printf -v browser_header \
            '\033[1m%sCurrent folder:\033[0m  \033[1m%s\033[0m\n\n\033[2m↑/↓ select · type to filter\nEnter choose · . opens current · .. goes up · Esc projects · ⌘P close\033[0m' \
            "$ui_accent_sgr" "$current_display_path"

        browser_result="$(
            fzf \
                --ansi \
                --delimiter=$'\t' \
                --with-nth=1 \
                --layout=reverse \
                --border=none \
                --no-multi \
                --expect=alt-p \
                --prompt='Filter › ' \
                --header="$browser_header" \
                < <(directory_rows "$current_path")
        )" || return 1

        browser_key="${browser_result%%$'\n'*}"
        if [[ "$browser_key" == "alt-p" ]]; then
            return 2
        fi
        selection="${browser_result#*$'\n'}"

        selected_action="$(printf '%s' "$selection" | cut -f2)"
        selected_path="$(printf '%s' "$selection" | cut -f3-)"

        if [[ ! -d "$selected_path" ]]; then
            continue
        fi

        case "$selected_action" in
            open)
                printf '%s\n' "$current_path"
                return 0
                ;;
            parent|enter)
                current_path="$(
                    cd "$selected_path"
                    pwd -P
                )"
                ;;
        esac
    done
}

if [[ "${1:-}" == "--list" ]]; then
    project_rows
    exit 0
fi

if [[ "${1:-}" == "--browse-list" ]]; then
    directory_rows "${2:-$browse_root}"
    exit 0
fi

initial_rows="$(project_rows)"
initial_position="$(project_position_for "$current_session" <<< "$initial_rows")"

while true; do
    picker_result="$(
        fzf \
            --ansi \
            --delimiter=$'\t' \
            --with-nth=1 \
            --layout=reverse \
            --border=none \
            --no-multi \
            --sync \
            --track \
            --expect=alt-p \
            --prompt='Project › ' \
            --header='↑/↓ select · type to filter · Enter open · ⌥↑/⌥↓ reorder · Ctrl-X delete session · Esc / ⌘P close' \
            --bind="start:pos($initial_position)" \
            --bind='alt-up:execute-silent(bash "$HOME/tmux-session-ui.sh" move {3} up)+reload(bash "$HOME/tmux-project.sh" --list)' \
            --bind='alt-down:execute-silent(bash "$HOME/tmux-session-ui.sh" move {3} down)+reload(bash "$HOME/tmux-project.sh" --list)' \
            --bind='ctrl-x:execute-silent(bash "$HOME/tmux-session-ui.sh" delete {3})+reload(bash "$HOME/tmux-project.sh" --list)' \
            <<< "$initial_rows"
    )" || exit 0

    picker_key="${picker_result%%$'\n'*}"
    if [[ "$picker_key" == "alt-p" ]]; then
        exit 0
    fi
    selection="${picker_result#*$'\n'}"

    selected_action="$(printf '%s' "$selection" | cut -f2)"
    selected_session="$(printf '%s' "$selection" | cut -f3)"
    selected_path="$(printf '%s' "$selection" | cut -f4-)"

    if [[ "$selected_action" == "custom" ]]; then
        if selected_path="$(choose_custom_path)"; then
            :
        else
            browser_status=$?
            if (( browser_status == 2 )); then
                exit 0
            fi
            continue
        fi

        if [[ "$selected_path" == "$HOME" ]]; then
            selected_session="home"
        else
            selected_session="$(session_name_for "$(basename "$selected_path")")"
        fi
    fi

    break
done

if ! tmux has-session -t "=$selected_session" 2>/dev/null; then
    if ! tmux new-session -d -s "$selected_session" -c "$selected_path" -n shell; then
        tmux display-message "Could not open $selected_path"
        exit 1
    fi
fi

if [[ -n "${TMUX:-}" ]]; then
    if [[ "$current_session" == "$selected_session" ]]; then
        tmux display-message "Already in [$selected_session] · ${selected_path/#$HOME/~}"
        exit 0
    fi

    tmux switch-client -t "=$selected_session"
else
    exec tmux attach-session -t "=$selected_session"
fi
