#!/usr/bin/env bash

set -u

client_width=${1:-80}
current_session=${2:-}
window_name=${3:-}
pane_index=${4:-0}
pane_command=${5:-shell}
prefix_active=${6:-0}
window_target=${7:-}
session_path=${8:-}
render_mode=${9:-content}
ui_accent="${TMUX_UI_ACCENT:-colour4}"
active_session_colour="#eb927b"
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

tmux_label="󰆍 TMUX"
battery_label="󰁹 $battery"
# Health monitor. Reading one short line keeps the redraw fork-free; a refresh
# is only spawned when the report is genuinely stale, which is hourly at most.
health_state="unknown"
health_stamp=0
health_state_file="${XDG_CACHE_HOME:-$HOME/.cache}/tmux-health/state"
if [[ -f $health_state_file ]]; then
    read -r health_state health_stamp < "$health_state_file" 2>/dev/null || true
fi
[[ $health_stamp =~ ^[0-9]+$ ]] || health_stamp=0
printf -v health_now '%(%s)T' -1
if [[ $health_state != checking ]] && (( health_now - health_stamp > 3600 )); then
    nohup bash "$HOME/tmux-health.sh" refresh >/dev/null 2>&1 &
    disown 2>/dev/null || true
fi

case "$health_state" in
    ok)       health_icon="󰗠"; health_colour="$ui_accent" ;;
    warn)     health_icon="󰀨"; health_colour="#e5c890" ;;
    crit)     health_icon="󰅙"; health_colour="#e78284" ;;
    checking) health_icon="󰓦"; health_colour="colour8" ;;
    *)        health_icon="󰓦"; health_colour="colour8" ;;
esac
health_selector_visible="[$health_icon]"
health_selector="#[range=user|health]#[fg=default][#[fg=${health_colour}]$health_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"

pane_label="󱂬 $pane_index"
vim_help_icon="󰘥"
vim_help_selector_visible="[$vim_help_icon]"
vim_help_selector="#[range=user|vimhelp]#[fg=default][#[fg=${ui_accent}]$vim_help_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"
colour_picker_icon="󰏘"
accent_selector_visible="[$colour_picker_icon]"
accent_selector="#[range=user|accent]#[fg=default][#[fg=${ui_accent}]$colour_picker_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"
# Five groups a side. The two clickable buttons sit together on the left, the
# other two on the right, so each edge carries the same weight.
left_visible=" [$tmux_label] [$battery_label] $health_selector_visible $vim_help_selector_visible $accent_selector_visible [$pane_label]"
left=" [$tmux_label] [$battery_label] $health_selector $vim_help_selector $accent_selector [$pane_label]"
if [[ $prefix_active != 0 ]]; then
    left_visible+=" [󰌌 ^A]"
    left+=" [󰌌 ^A]"
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

agent_label="󰚩"
if [[ -n "$agent_usage" ]]; then
    agent_label+=" $agent_usage%"
fi

repo_url=""
if [[ -n $session_path ]]; then
    repo_url="$(bash "$HOME/tmux-repo.sh" url "$session_path" 2>/dev/null || true)"
fi

repo_selector=""
repo_selector_visible=""
if [[ -n $repo_url ]]; then
    repo_icon="󰖟"
    repo_selector_visible=" [$repo_icon]"
    repo_selector=" #[range=user|repo]#[fg=default][#[fg=${ui_accent}]$repo_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"
fi

window_label="󰖯 $window_name"
command_label="󰘳 $pane_command"
background_icon="󰸉"
background_colour="colour8"
background_state_file="${XDG_STATE_HOME:-$HOME/.local/state}/tmux-ui/moving-background"
if [[ ! -f $background_state_file ]] || ! /usr/bin/grep -qx 'enabled=off' "$background_state_file"; then
    background_colour="$ui_accent"
fi
background_selector_visible="[$background_icon]"
background_selector="#[range=user|background]#[fg=default][#[fg=${background_colour}]$background_icon#[fg=default]]#[fg=${ui_accent}]#[norange]"
right_visible=" [$agent_label]$repo_selector_visible $background_selector_visible [$window_label] [$command_label] "
right=" #[range=user|agents]#[bold][$agent_label]#[nobold]#[norange]$repo_selector $background_selector [$window_label] [$command_label] "
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
        # The whole token changes colour, brackets included, so the active
        # session reads at a glance without a marker glyph or an underline.
        token="#[fg=${active_session_colour},bold][$session_name]#[fg=${ui_accent},nobold]"
    else
        token="[#[fg=default]$session_name#[fg=${ui_accent}]]"
    fi
    token="#[range=user|s:$session_id]$token#[norange]"
    token_visible="[$session_name]"

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
