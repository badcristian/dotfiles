#!/usr/bin/env bash

set -u

client_width=${1:-80}
current_session=${2:-}
window_name=${3:-}
pane_index=${4:-0}
pane_command=${5:-shell}
prefix_active=${6:-0}
window_target=${7:-}
render_mode=${8:-content}
ui_accent="${TMUX_UI_ACCENT:-colour4}"
active_session_icon_colour="#eb927b"
case "$ui_accent" in
    [0-9] | 1[0-5]) ui_accent="colour${ui_accent}" ;;
esac

repeat_separator() {
    local count=${1:-0}
    local start_column=${2:-0}
    local junction_column
    local offset
    local separator=""

    if (( count > 0 )); then
        printf -v separator '%*s' "$count" ''
        separator=${separator// /═}

        for junction_column in $junction_columns; do
            offset=$((junction_column - start_column))
            if (( offset >= 0 && offset < count )); then
                separator="${separator:0:offset}╦${separator:offset+1}"
            fi
        done
    fi

    printf '%s' "$separator"
}

repeat_padding() {
    local count=${1:-0}

    if (( count > 0 )); then
        printf '%*s' "$count" ''
    fi
}

junction_columns=""
if [[ -n $window_target ]]; then
    while IFS=' ' read -r pane_right pane_at_right pane_at_top; do
        if [[ $pane_at_right == 0 && $pane_at_top == 1 ]]; then
            junction_columns+=" $((pane_right + 1))"
        fi
    done < <(
        tmux list-panes -t "$window_target" \
            -F '#{pane_right} #{pane_at_right} #{pane_at_top}' \
            2>/dev/null
    )
fi

if [[ $render_mode == "rule-top" ]]; then
    junction_columns=""
    repeat_separator "$client_width" 0
    exit 0
fi

if [[ $render_mode == "rule" || $render_mode == "rule-bottom" ]]; then
    repeat_separator "$client_width" 0
    exit 0
fi

if [[ $render_mode != "content" ]]; then
    printf 'Unknown tmux status render mode: %s\n' "$render_mode" >&2
    exit 2
fi

battery=$(/usr/bin/pmset -g batt | /usr/bin/grep -Eo '[0-9]+%' | /usr/bin/head -1)
battery=${battery:-?}

tmux_label="◈ TMUX"
battery_label="■ $battery"
left_visible=" [$tmux_label] [$battery_label]"
left="$left_visible"
if [[ $prefix_active != 0 ]]; then
    left_visible+=" [⌨ ^A]"
    left+=" [⌨ ^A]"
fi

agent_usage=""
agent_usage_cache="${XDG_CACHE_HOME:-$HOME/.cache}/tmux-agent-usage/status.json"
if [[ -f "$agent_usage_cache" ]] && command -v jq >/dev/null 2>&1; then
    agent_usage="$(
        jq -r \
            '[.providers[]? | select(.state == "available") | .rows[]?.percent] | max // empty | round' \
            "$agent_usage_cache" \
            2>/dev/null
    )"
fi

agent_label="◆"
if [[ -n "$agent_usage" ]]; then
    agent_label+=" $agent_usage%"
fi

window_label="□ $window_name"
pane_label="▪ $pane_index"
command_label="⌘ $pane_command"
colour_picker_icon="◐"
accent_selector_visible="[$colour_picker_icon]"
accent_selector="#[range=user|accent]#[fg=default][#[fg=${ui_accent}]$colour_picker_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"
background_icon="✧"
background_colour="colour8"
background_state_file="${XDG_STATE_HOME:-$HOME/.local/state}/tmux-ui/moving-background"
if [[ ! -f $background_state_file ]] || ! /usr/bin/grep -qx 'enabled=off' "$background_state_file"; then
    background_colour="$ui_accent"
fi
background_selector_visible="[$background_icon]"
background_selector="#[range=user|background]#[fg=default][#[fg=${background_colour}]$background_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"
right_visible=" [$agent_label] $background_selector_visible $accent_selector_visible [$window_label] [$pane_label] [$command_label] "
right=" #[range=user|agents]#[bold][$agent_label]#[nobold]#[norange] $background_selector $accent_selector [$window_label] [$pane_label] [$command_label] "
right_visible_width=${#right_visible}

session_ids=()
session_names=()
while IFS=$'\t' read -r session_id session_name; do
    if [[ -n $session_id && -n $session_name ]]; then
        session_ids+=("$session_id")
        session_names+=("$session_name")
    fi
done < <(bash "$HOME/tmux-session-ui.sh" list-status-records)

# Keep session names in the user's persistent manual order. Hidden sessions
# collapse into +N when there is not enough room.

minimum_separator=2
session_count=${#session_names[@]}
fixed_width=${#left_visible}
if (( right_visible_width > fixed_width )); then
    fixed_width=$right_visible_width
fi

# A centered block must clear both fixed edge groups by the same amount.
center_budget=$((client_width - (2 * (fixed_width + minimum_separator))))
# Session strings already begin with one space; reserve a matching trailing
# space so the names themselves remain optically centered.
session_budget=$((center_budget - 1))
if (( session_budget < 0 )); then
    session_budget=0
fi

sessions=""
sessions_visible=""
visible_count=0

for ((session_index = 0; session_index < session_count; session_index++)); do
    session_id="${session_ids[$session_index]#\$}"
    session_name="${session_names[$session_index]}"
    if [[ $session_name == "$current_session" ]]; then
        session_label="▼ $session_name"
        token="[#[fg=${active_session_icon_colour},bold]▼#[fg=default,bold,underscore] $session_name#[fg=${ui_accent},nobold,nounderscore]]"
    else
        session_label="▽ $session_name"
        token="[#[fg=default]$session_label#[fg=${ui_accent}]]"
    fi
    token="#[range=user|s:$session_id]$token#[norange]"
    token_visible="[$session_label]"

    candidate="$sessions $token"
    candidate_visible="$sessions_visible $token_visible"

    hidden_after=$((session_count - visible_count - 1))
    overflow=""
    if (( hidden_after > 0 )); then
        overflow=" [+$hidden_after]"
    fi

    if (( ${#candidate_visible} + ${#overflow} <= session_budget )); then
        sessions=$candidate
        sessions_visible=$candidate_visible
        visible_count=$((visible_count + 1))
    else
        break
    fi
done

hidden_count=$((session_count - visible_count))
if (( hidden_count > 0 )); then
    overflow=" [+$hidden_count]"
    if (( ${#sessions_visible} + ${#overflow} <= session_budget )); then
        sessions+="$overflow"
        sessions_visible+="$overflow"
    else
        sessions=""
        sessions_visible=""
    fi
fi

center=""
center_visible=""
if [[ -n $sessions_visible ]]; then
    center="$sessions "
    center_visible="$sessions_visible "
fi

if [[ -n $center_visible ]]; then
    center_start=$(((client_width - ${#center_visible}) / 2))
    left_separator_length=$((center_start - ${#left_visible}))
    right_separator_start=$((center_start + ${#center_visible}))
    right_separator_length=$((client_width - right_visible_width - right_separator_start))

    printf '%s%s%s%s%s' \
        "$left" \
        "$(repeat_padding "$left_separator_length")" \
        "$center" \
        "$(repeat_padding "$right_separator_length")" \
        "$right"
else
    separator_length=$((client_width - ${#left_visible} - right_visible_width))
    if (( separator_length < 0 )); then
        separator_length=0
    fi

    printf '%s%s%s' \
        "$left" \
        "$(repeat_padding "$separator_length")" \
        "$right"
fi
