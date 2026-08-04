#!/usr/bin/env bash

set -euo pipefail

state_root="${XDG_STATE_HOME:-$HOME/.local/state}/tmux-ui"
accent_file="$state_root/accent"
default_accent="colour4"

normalize_accent() {
    local accent="${1:-}"

    if [[ $accent == hex:* ]]; then
        accent="#${accent#hex:}"
    fi

    case "$accent" in
        [0-9] | 1[0-5])
            printf 'colour%s' "$accent"
            return 0
            ;;
        colour[0-9] | colour1[0-5])
            printf '%s' "$accent"
            return 0
            ;;
    esac

    if [[ ${#accent} -eq 7 && ${accent:0:1} == "#" && ${accent:1} =~ ^[[:xdigit:]]{6}$ ]]; then
        printf '%s' "$accent" | tr '[:upper:]' '[:lower:]'
        return 0
    fi

    return 1
}

ansi_foreground() {
    local accent
    local hex
    local red
    local green
    local blue

    accent="$(normalize_accent "${1:-}")" || return 2

    case "$accent" in
        colour*)
            printf '\033[38;5;%sm' "${accent#colour}"
            ;;
        \#*)
            hex="${accent#\#}"
            red=$((16#${hex:0:2}))
            green=$((16#${hex:2:2}))
            blue=$((16#${hex:4:2}))
            printf '\033[38;2;%d;%d;%dm' "$red" "$green" "$blue"
            ;;
    esac
}

current_accent() {
    local accent=""
    local environment_value=""
    local normalized=""

    if [[ -f "$accent_file" ]]; then
        IFS= read -r accent < "$accent_file" || true
    fi

    if normalized="$(normalize_accent "$accent")"; then
        printf '%s' "$normalized"
        return 0
    fi

    if [[ -z $normalized ]]; then
        environment_value="$(tmux show-environment -g TMUX_UI_ACCENT 2>/dev/null || true)"
        accent="${environment_value#TMUX_UI_ACCENT=}"
    fi

    if normalized="$(normalize_accent "$accent")"; then
        printf '%s' "$normalized"
    else
        printf '%s' "$default_accent"
    fi
}

refresh_clients() {
    local client_tty

    while IFS= read -r client_tty; do
        if [[ -n "$client_tty" ]]; then
            tmux refresh-client -S -t "$client_tty" 2>/dev/null || true
        fi
    done < <(tmux list-clients -F '#{client_tty}' 2>/dev/null || true)
}

apply_accent() {
    local requested="${1:-$(current_accent)}"
    local accent

    accent="$(normalize_accent "$requested")" || return 2

    tmux set-environment -g TMUX_UI_ACCENT "$accent"
    tmux set-option -g pane-border-style "bg=default,fg=$accent"
    tmux set-option -g pane-active-border-style "bg=default,fg=$accent"
    tmux set-option -g popup-border-style "bg=default,fg=$accent"
    tmux set-option -g display-panes-active-colour "$accent"
    tmux set-option -g clock-mode-colour "$accent"
    tmux set-option -g status-style "bg=default,fg=$accent"
    refresh_clients
}

save_accent() {
    local requested="$1"
    local accent
    local temporary_file

    accent="$(normalize_accent "$requested")" || {
        printf 'Unsupported tmux accent: %s\n' "$requested" >&2
        return 2
    }

    mkdir -p "$state_root"
    temporary_file="$(mktemp "$state_root/accent.XXXXXX")"
    printf '%s\n' "$accent" > "$temporary_file"
    mv "$temporary_file" "$accent_file"
    apply_accent "$accent"
}

accent_entries() {
    printf '%s\n' \
        '#7aa2f7|Omarchy' \
        'colour6|Teal' \
        'colour7|Silver' \
        'colour2|Green' \
        'colour3|Gold' \
        'colour5|Pink' \
        'colour4|Blue' \
        'colour1|Red' \
        'colour14|Bright Teal' \
        'colour15|Bright Silver' \
        'colour10|Bright Green' \
        'colour11|Bright Gold' \
        'colour13|Bright Pink' \
        'colour12|Bright Blue' \
        'colour9|Bright Red'
}

accent_picker_rows() {
    local selected="$(current_accent)"
    local entry
    local accent
    local name
    local marker=""
    local accent_sgr

    while IFS='|' read -r accent name; do
        accent_sgr="$(ansi_foreground "$accent")"
        marker=""
        if [[ "$accent" == "$selected" ]]; then
            marker="✓ current"
        fi

        printf '%s●\033[0m  %-14s %-9s\t%s\n' \
            "$accent_sgr" "$name" "$marker" "$accent"
    done < <(accent_entries)
}

accent_picker() {
    local selected
    local rows
    local selection
    local accent
    local current_position=1
    local row_position=0
    local row_label
    local row_accent

    selected="$(current_accent)"
    rows="$(accent_picker_rows)"

    while IFS=$'\t' read -r row_label row_accent; do
        row_position=$((row_position + 1))
        if [[ "$row_accent" == "$selected" ]]; then
            current_position=$row_position
            break
        fi
    done <<< "$rows"

    selection="$(
        fzf \
            --ansi \
            --delimiter=$'\t' \
            --with-nth=1 \
            --layout=reverse \
            --border=none \
            --no-multi \
            --sync \
            --prompt='Color › ' \
            --header='↑/↓ select · Enter or click apply · Esc close' \
            --bind="start:pos($current_position)" \
            --bind='left-click:accept' \
            <<< "$rows"
    )" || return 0

    accent="$(printf '%s' "$selection" | cut -f2)"
    save_accent "$accent"
}

open_accent_picker() {
    local client_tty="$1"

    tmux display-popup -c "$client_tty" -E -w 42 -h 20 \
        -T " Color Palette " "bash ~/tmux-ui.sh accent-picker"
}

open_background_picker() {
    local client_tty="$1"

    tmux display-popup -c "$client_tty" -E -w 48 -h 10 \
        -T " Moving Background " "bash ~/tmux-background.sh picker"
}

status_mouse_down() {
    local mouse_range="$1"
    local client_pid="$2"
    local client_tty="$3"

    case "$mouse_range" in
        agents)
            tmux display-popup -c "$client_tty" -E -w 78 -h 15 \
                -T " AI Usage " "bash ~/tmux-agent-usage.sh"
            ;;
        accent | background)
            # Open on mouse-up so the release that launched the popup cannot
            # be interpreted as a popup click.
            :
            ;;
        *)
            bash "$HOME/tmux-session-ui.sh" mouse-down "$mouse_range" "$client_pid"
            ;;
    esac
}

status_mouse_up() {
    local mouse_range="$1"
    local client_pid="$2"
    local client_tty="$3"

    case "$mouse_range" in
        accent)
            open_accent_picker "$client_tty"
            ;;
        background)
            open_background_picker "$client_tty"
            ;;
        *)
            bash "$HOME/tmux-session-ui.sh" mouse-up \
                "$mouse_range" "$client_pid" "$client_tty"
            ;;
    esac
}

case "${1:-}" in
    ansi-foreground)
        ansi_foreground "${2:-}"
        ;;
    apply-accent)
        apply_accent
        ;;
    set-accent)
        save_accent "${2:-}"
        ;;
    accent-picker)
        accent_picker
        ;;
    accent-picker-rows)
        accent_picker_rows
        ;;
    status-mouse-down)
        status_mouse_down "${2:-}" "${3:-0}" "${4:-}" "${5:-C}" "${6:-3}"
        ;;
    status-mouse-up)
        status_mouse_up "${2:-}" "${3:-0}" "${4:-}"
        ;;
    *)
        printf 'Usage: %s {ansi-foreground|apply-accent|set-accent|accent-picker|accent-picker-rows|status-mouse-down|status-mouse-up}\n' "$0" >&2
        exit 2
        ;;
esac
