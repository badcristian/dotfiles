#!/usr/bin/env bash

set -u

client_width=${1:-80}
current_session=${2:-}
window_index=${3:-0}
pane_command=${4:-shell}
prefix_active=${5:-0}
window_target=${6:-}
session_path=${7:-}
render_mode=${8:-content}
window_count=${9:-1}
pane_path=${10:-}
client_pid=${11:-0}
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

# The icon and its colour already carry the state, so the label is cut to the
# state's initial: enough to name what the icon is saying without spending four
# columns the session list would rather have.
case "$health_state" in
    ok)       health_icon="󰗠"; health_colour="$ui_accent"; health_text="o" ;;
    warn)     health_icon="󰀨"; health_colour="#e5c890"; health_text="w" ;;
    crit)     health_icon="󰅙"; health_colour="$active_session_colour"; health_text="c" ;;
    checking) health_icon="󰓦"; health_colour="colour8"; health_text="s" ;;
    *)        health_icon="󰓦"; health_colour="colour8"; health_text="s" ;;
esac
health_selector_visible="[$health_icon $health_text]"
health_selector="#[range=user|health]#[fg=default][#[fg=${health_colour}]$health_icon#[fg=default] $health_text]#[fg=${ui_accent}]#[norange]"

window_icon="󱂬"
window_selector_visible="[$window_icon $window_index]"
if [[ $window_count =~ ^[0-9]+$ ]] && (( window_count > 1 )); then
    window_selector="#[range=user|windows]#[fg=${active_session_colour},bold][$window_icon $window_index]#[fg=${ui_accent},nobold]#[norange]"
else
    window_selector="#[range=user|windows][$window_icon $window_index]#[norange]"
fi
vim_help_icon=""
vim_help_selector_visible="[$vim_help_icon vi]"
vim_help_selector="#[range=user|vimhelp]#[fg=default][#[fg=${ui_accent}]$vim_help_icon#[fg=default] vi]#[fg=${ui_accent}]#[norange]"
colour_picker_icon="󰏘"
accent_selector_visible="[$colour_picker_icon col]"
accent_selector="#[range=user|accent]#[fg=default][#[fg=${ui_accent}]$colour_picker_icon#[fg=default] col]#[fg=${ui_accent}]#[norange]"
# Five groups a side. The two clickable buttons sit together on the left, the
# other two on the right, so each edge carries the same weight.
left_visible=" [$battery_label] $health_selector_visible $vim_help_selector_visible $accent_selector_visible $window_selector_visible"
left=" [$battery_label] $health_selector $vim_help_selector $accent_selector $window_selector"
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
# A pane may cd into, or be opened directly in, a different checkout from the
# session project. Resolve that first; the helper treats the session path as a
# fallback when the pane is outside Git or its repository has no browser remote.
if [[ -n $pane_path || -n $session_path ]]; then
    repo_url="$(bash "$HOME/tmux-repo.sh" url "$pane_path" "$session_path" 2>/dev/null || true)"
fi

repo_selector=""
repo_selector_visible=""
if [[ -n $repo_url ]]; then
    repo_icon="󰖟"
    repo_selector_visible=" [$repo_icon git]"
    repo_selector=" #[range=user|repo]#[fg=default][#[fg=${ui_accent}]$repo_icon#[fg=default] git]#[fg=${ui_accent}]#[norange]"
fi

# A shell name tells you nothing you did not already know, so the group only
# appears when something is actually running. Claude Code's binary is named by
# version, which reads as noise, so it is shown by name instead.
command_group=""
case "$pane_command" in
    zsh | bash | sh | fish | "") ;;
    [0-9]*.[0-9]*.[0-9]*) command_group=" [󰘳 claude]" ;;
    *) command_group=" [󰘳 $pane_command]" ;;
esac
background_icon="󰸉"
background_colour="colour8"
background_state_file="${XDG_STATE_HOME:-$HOME/.local/state}/tmux-ui/moving-background"
if [[ ! -f $background_state_file ]] || ! /usr/bin/grep -qx 'enabled=off' "$background_state_file"; then
    background_colour="$ui_accent"
fi
background_selector_visible="[$background_icon bg]"
background_selector="#[range=user|background]#[fg=default][#[fg=${background_colour}]$background_icon#[fg=default] bg]#[fg=${ui_accent}]#[norange]"
right_visible=" [$agent_label]$repo_selector_visible $background_selector_visible$command_group "
right=" #[range=user|agents]#[bold][$agent_label]#[nobold]#[norange]$repo_selector $background_selector$command_group "
right_visible_width=${#right_visible}

session_ids=()
session_names=()
while IFS=$'\t' read -r session_id session_name; do
    if [[ -n $session_id && -n $session_name ]]; then
        session_ids+=("$session_id")
        session_names+=("$session_name")
    fi
done < <(bash "$HOME/tmux-session-ui.sh" list-status-records)

# Keep session names in the user's persistent manual order. When they do not all
# fit, a window slides over the list rather than its tail being dropped.

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

session_widths=()
for ((session_index = 0; session_index < session_count; session_index++)); do
    # The separating space belongs to the token, along with its two brackets, so
    # a window of them can be measured by summing widths.
    session_widths+=($((${#session_names[$session_index]} + 3)))
done

active_index=-1
for ((session_index = 0; session_index < session_count; session_index++)); do
    if [[ ${session_names[$session_index]} == "$current_session" ]]; then
        active_index=$session_index
        break
    fi
done

# Count the sessions that fit from `start`, leaving the count and its width for
# the caller rather than forking a subshell on every redraw.
fit_count=0
fit_width=0
fit_forward() {
    local start=$1
    local budget=$2
    local index

    fit_count=0
    fit_width=0
    for ((index = start; index < session_count; index++)); do
        if (( fit_width + session_widths[index] > budget )); then
            break
        fi
        fit_width=$((fit_width + session_widths[index]))
        fit_count=$((fit_count + 1))
    done
}

# Where the window sits is per client: two clients on the same server look at
# different sessions and scroll independently. The session it was last drawn for
# is remembered next to it, because chasing the active session on every redraw
# would undo a manual scroll the moment it happened.
scroll_root="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/tmux-session-ui-$UID/scroll"
scroll_file="$scroll_root/$client_pid"
scroll_start=0
scroll_session=""
if [[ -f $scroll_file ]]; then
    { read -r scroll_start && read -r scroll_session; } < "$scroll_file" 2>/dev/null || true
fi
[[ $scroll_start =~ ^[0-9]+$ ]] || scroll_start=0
switched=0
if [[ $scroll_session != "$current_session" ]]; then
    switched=1
fi

# A chevron a side, each carrying the count of what it hides: " 󰅁-2" and " 2-󰅂".
# Every enclosed numeral in the font draws its digit at a fraction of a text
# digit's size, so the count is set in plain text and the room reserved for it
# has to allow for the widest count the list could produce.
chevron_width=$((2 * (3 + ${#session_count})))

window_start=0
scrolling=0
fit_forward 0 "$session_budget"

if (( fit_count < session_count )); then
    scrolling=1
    session_window_budget=$((session_budget - chevron_width))
    if (( session_window_budget < 0 )); then
        session_window_budget=0
    fi

    window_start=$scroll_start
    if (( window_start > session_count - 1 )); then
        window_start=$((session_count - 1))
    fi

    # A session switched into from off the left edge simply becomes the first
    # name shown.
    if (( switched && active_index >= 0 && active_index < window_start )); then
        window_start=$active_index
    fi

    fit_forward "$window_start" "$session_window_budget"

    # One switched into from off the right edge drags the window along by the
    # least it can, landing as the last name shown.
    if (( switched && active_index >= window_start + fit_count )); then
        window_start=$active_index
        window_width=${session_widths[$active_index]}
        while (( window_start > 0 )) &&
            (( window_width + session_widths[window_start - 1] <= session_window_budget )); do
            window_start=$((window_start - 1))
            window_width=$((window_width + session_widths[window_start]))
        done
        fit_forward "$window_start" "$session_window_budget"
    fi

    # At the end of the list there is nothing left to pull in from the right, so
    # the leftover room is filled from the left instead of showing as a gap.
    while (( window_start > 0 && window_start + fit_count >= session_count )); do
        if (( fit_width + session_widths[window_start - 1] > session_window_budget )); then
            break
        fi
        window_start=$((window_start - 1))
        fit_forward "$window_start" "$session_window_budget"
    done
fi

visible_count=$fit_count

# The window that was actually drawn is what the next click scrolls from, and
# the session it was drawn for is what the next redraw compares against.
if (( switched )) || (( window_start != scroll_start )); then
    mkdir -p "$scroll_root" 2>/dev/null &&
        printf '%s\n%s\n' "$window_start" "$current_session" > "$scroll_file" 2>/dev/null || true
fi

# Brackets are what separate one session from the next, so the chevrons go
# without: they are not sessions, and a bare glyph reads as the edge of the list.
# Both are drawn the same weight — which way there is more to see is the count's
# job to say, not something to infer from one chevron being brighter.
chevron() {
    local direction=$1
    local glyph=$2
    local count=$3
    local body="#[fg=colour8]$glyph"

    # The dash is the arrow's shaft: it joins the count to the chevron so the
    # pair reads as one mark pointing at what is out of sight, and it belongs to
    # the chevron rather than to the count, dimmed along with it.
    if [[ -n $count ]]; then
        if [[ $direction == left ]]; then
            body="#[fg=colour8]$glyph-#[fg=default]$count"
        else
            body="#[fg=default]$count#[fg=colour8]-$glyph"
        fi
    fi

    printf ' #[range=user|sessions-%s]%s#[fg=%s]#[norange]' \
        "$direction" "$body" "$ui_accent"
}

sessions=""
sessions_visible=""

# A chevron with nothing left to reach shows no count, so the styled and the
# measured string stay in step by sharing one glyph.
hidden_before=""
hidden_after=""
if (( window_start > 0 )); then
    hidden_before=$window_start
fi
if (( window_start + visible_count < session_count )); then
    hidden_after=$((session_count - window_start - visible_count))
fi

if (( scrolling && visible_count > 0 )); then
    sessions+="$(chevron left "󰅁" "$hidden_before")"
    sessions_visible+=" 󰅁${hidden_before:+-$hidden_before}"
fi

for ((session_index = window_start; session_index < window_start + visible_count; session_index++)); do
    session_id="${session_ids[$session_index]#\$}"
    session_name="${session_names[$session_index]}"
    if (( session_index == active_index )); then
        # The whole token changes colour, brackets included, so the active
        # session reads at a glance without a marker glyph or an underline.
        token="#[fg=${active_session_colour},bold][$session_name]#[fg=${ui_accent},nobold]"
    else
        token="[#[fg=default]$session_name#[fg=${ui_accent}]]"
    fi
    sessions+=" #[range=user|s:$session_id]$token#[norange]"
    sessions_visible+=" [$session_name]"
done

if (( scrolling && visible_count > 0 )); then
    sessions+="$(chevron right "󰅂" "$hidden_after")"
    sessions_visible+=" ${hidden_after:+$hidden_after-}󰅂"
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
