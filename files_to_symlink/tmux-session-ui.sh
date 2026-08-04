#!/usr/bin/env bash

set -euo pipefail

state_root="${XDG_STATE_HOME:-$HOME/.local/state}/tmux-session-ui"
order_file="$state_root/order"
drag_root="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/tmux-session-ui-$UID"

live_names() {
    tmux list-sessions -F '#{session_name}' 2>/dev/null | LC_ALL=C sort -f || true
}

contains_name() {
    local names="$1"
    local wanted="$2"
    local candidate

    while IFS= read -r candidate; do
        if [[ -n "$candidate" && "$candidate" == "$wanted" ]]; then
            return 0
        fi
    done <<< "$names"

    return 1
}

ordered_names() {
    local available
    local emitted=""
    local session_name

    available="$(live_names)"

    if [[ -f "$order_file" ]]; then
        while IFS= read -r session_name; do
            if [[ -n "$session_name" ]] &&
                contains_name "$available" "$session_name" &&
                ! contains_name "$emitted" "$session_name"; then
                printf '%s\n' "$session_name"
                emitted+="${emitted:+$'\n'}$session_name"
            fi
        done < "$order_file"
    fi

    while IFS= read -r session_name; do
        if [[ -n "$session_name" ]] && ! contains_name "$emitted" "$session_name"; then
            printf '%s\n' "$session_name"
            emitted+="${emitted:+$'\n'}$session_name"
        fi
    done <<< "$available"
}

write_order() {
    local new_live_order="$1"
    local temporary_order
    local session_name
    local written="$new_live_order"

    mkdir -p "$state_root"
    temporary_order="$(mktemp "$state_root/order.XXXXXX")"

    if [[ -n "$new_live_order" ]]; then
        printf '%s\n' "$new_live_order" > "$temporary_order"
    else
        : > "$temporary_order"
    fi

    # Keep stopped session names so reopening a project does not discard its
    # previously chosen position.
    if [[ -f "$order_file" ]]; then
        while IFS= read -r session_name; do
            if [[ -n "$session_name" ]] && ! contains_name "$written" "$session_name"; then
                printf '%s\n' "$session_name" >> "$temporary_order"
                written+="${written:+$'\n'}$session_name"
            fi
        done < "$order_file"
    fi

    mv "$temporary_order" "$order_file"
}

refresh_status_lines() {
    local client_tty

    while IFS= read -r client_tty; do
        if [[ -n "$client_tty" ]]; then
            tmux refresh-client -S -t "$client_tty" 2>/dev/null || true
        fi
    done < <(tmux list-clients -F '#{client_tty}' 2>/dev/null || true)
}

reorder_sessions() {
    local source_session="$1"
    local target_session="$2"
    local session_name
    local source_index=-1
    local target_index=-1
    local index=0
    local new_order=""
    local -a sessions=()

    while IFS= read -r session_name; do
        if [[ -n "$session_name" ]]; then
            sessions+=("$session_name")
            if [[ "$session_name" == "$source_session" ]]; then
                source_index=$index
            fi
            if [[ "$session_name" == "$target_session" ]]; then
                target_index=$index
            fi
            index=$((index + 1))
        fi
    done < <(ordered_names)

    if (( source_index < 0 || target_index < 0 || source_index == target_index )); then
        return 0
    fi

    for session_name in "${sessions[@]}"; do
        if (( source_index > target_index )) && [[ "$session_name" == "$target_session" ]]; then
            new_order+="${new_order:+$'\n'}$source_session"
        fi

        if [[ "$session_name" != "$source_session" ]]; then
            new_order+="${new_order:+$'\n'}$session_name"
        fi

        if (( source_index < target_index )) && [[ "$session_name" == "$target_session" ]]; then
            new_order+="${new_order:+$'\n'}$source_session"
        fi
    done

    write_order "$new_order"
    refresh_status_lines
}

move_session() {
    local source_session="$1"
    local direction="$2"
    local session_name
    local source_index=-1
    local target_index
    local index=0
    local -a sessions=()

    while IFS= read -r session_name; do
        if [[ -n "$session_name" ]]; then
            sessions+=("$session_name")
            if [[ "$session_name" == "$source_session" ]]; then
                source_index=$index
            fi
            index=$((index + 1))
        fi
    done < <(ordered_names)

    if (( source_index < 0 )); then
        return 0
    fi

    case "$direction" in
        up)
            target_index=$((source_index - 1))
            ;;
        down)
            target_index=$((source_index + 1))
            ;;
        *)
            return 2
            ;;
    esac

    if (( target_index < 0 || target_index >= ${#sessions[@]} )); then
        return 0
    fi

    reorder_sessions "$source_session" "${sessions[$target_index]}"
}

name_for_id() {
    local wanted_id="$1"
    local session_id
    local session_name

    while IFS=$'\t' read -r session_id session_name; do
        if [[ "$session_id" == "$wanted_id" ]]; then
            printf '%s\n' "$session_name"
            return 0
        fi
    done < <(tmux list-sessions -F $'#{session_id}\t#{session_name}' 2>/dev/null || true)

    return 1
}

id_for_range() {
    local mouse_range="$1"

    if [[ "$mouse_range" =~ ^s:([0-9]+)$ ]]; then
        printf '$%s\n' "${BASH_REMATCH[1]}"
        return 0
    fi

    return 1
}

session_for_client() {
    local wanted_client="$1"
    local client_tty
    local session_name

    while IFS=$'\t' read -r client_tty session_name; do
        if [[ "$client_tty" == "$wanted_client" ]]; then
            printf '%s\n' "$session_name"
            return 0
        fi
    done < <(tmux list-clients -F $'#{client_tty}\t#{session_name}' 2>/dev/null || true)

    return 1
}

switch_ordered() {
    local direction="$1"
    local client_tty="$2"
    local current_session
    local session_name
    local current_index=-1
    local target_index
    local index=0
    local -a sessions=()

    current_session="$(session_for_client "$client_tty")" || return 0

    while IFS= read -r session_name; do
        if [[ -n "$session_name" ]]; then
            sessions+=("$session_name")
            if [[ "$session_name" == "$current_session" ]]; then
                current_index=$index
            fi
            index=$((index + 1))
        fi
    done < <(ordered_names)

    if (( current_index < 0 || ${#sessions[@]} < 2 )); then
        return 0
    fi

    if [[ "$direction" == "next" ]]; then
        target_index=$(((current_index + 1) % ${#sessions[@]}))
    elif [[ "$direction" == "previous" ]]; then
        target_index=$(((current_index - 1 + ${#sessions[@]}) % ${#sessions[@]}))
    else
        return 2
    fi

    tmux switch-client -c "$client_tty" -t "=${sessions[$target_index]}"
}

delete_session() {
    local target_session="$1"
    local client_tty="${2:-${TMUX_SESSION_CLIENT_TTY:-}}"
    local current_session=""
    local session_name
    local target_index=-1
    local next_index
    local index=0
    local -a sessions=()

    if [[ -z "$target_session" ]] || ! tmux has-session -t "=$target_session" 2>/dev/null; then
        return 0
    fi

    if [[ -n "$client_tty" ]]; then
        current_session="$(session_for_client "$client_tty")" || current_session=""
    fi

    while IFS= read -r session_name; do
        if [[ -n "$session_name" ]]; then
            sessions+=("$session_name")
            if [[ "$session_name" == "$target_session" ]]; then
                target_index=$index
            fi
            index=$((index + 1))
        fi
    done < <(ordered_names)

    if [[ "$current_session" == "$target_session" ]]; then
        if (( ${#sessions[@]} < 2 || target_index < 0 )); then
            tmux display-message -c "$client_tty" "Cannot delete the only running session"
            return 0
        fi

        next_index=$(((target_index + 1) % ${#sessions[@]}))
        tmux switch-client -c "$client_tty" -t "=${sessions[$next_index]}"
    fi

    tmux kill-session -t "=$target_session"
    refresh_status_lines
}

mouse_down() {
    local mouse_range="$1"
    local client_pid="$2"
    local session_id

    if [[ -d "$drag_root" ]]; then
        rm -f "$drag_root/$client_pid"
    fi

    if ! session_id="$(id_for_range "$mouse_range")"; then
        return 0
    fi

    mkdir -p "$drag_root"
    printf '%s\n' "$session_id" > "$drag_root/$client_pid"
}

mouse_up() {
    local mouse_range="$1"
    local client_pid="$2"
    local client_tty="$3"
    local drag_file="$drag_root/$client_pid"
    local source_id
    local target_id

    if [[ ! -f "$drag_file" ]]; then
        return 0
    fi

    source_id="$(<"$drag_file")"
    rm -f "$drag_file"

    if target_id="$(id_for_range "$mouse_range")" && [[ "$source_id" == "$target_id" ]]; then
        tmux switch-client -c "$client_tty" -t "$target_id"
    fi
}

mouse_drag_end() {
    local mouse_range="$1"
    local client_pid="$2"
    local drag_file="$drag_root/$client_pid"
    local source_id
    local target_id
    local source_session
    local target_session

    if [[ ! -f "$drag_file" ]]; then
        return 0
    fi

    source_id="$(<"$drag_file")"
    rm -f "$drag_file"

    if ! target_id="$(id_for_range "$mouse_range")" || [[ "$source_id" == "$target_id" ]]; then
        return 0
    fi

    source_session="$(name_for_id "$source_id")" || return 0
    target_session="$(name_for_id "$target_id")" || return 0
    reorder_sessions "$source_session" "$target_session"
}

case "${1:-}" in
    list)
        ordered_names
        ;;
    list-status-records)
        while IFS= read -r session_name; do
            while IFS=$'\t' read -r session_id candidate_name; do
                if [[ "$candidate_name" == "$session_name" ]]; then
                    printf '%s\t%s\n' "$session_id" "$session_name"
                    break
                fi
            done < <(tmux list-sessions -F $'#{session_id}\t#{session_name}' 2>/dev/null || true)
        done < <(ordered_names)
        ;;
    list-project-records)
        while IFS= read -r session_name; do
            while IFS=$'\t' read -r candidate_name window_count; do
                if [[ "$candidate_name" == "$session_name" ]]; then
                    printf '%s|%s\n' "$session_name" "$window_count"
                    break
                fi
            done < <(tmux list-sessions -F $'#{session_name}\t#{session_windows}' 2>/dev/null || true)
        done < <(ordered_names)
        ;;
    reorder)
        reorder_sessions "${2:-}" "${3:-}"
        ;;
    move)
        move_session "${2:-}" "${3:-}"
        ;;
    switch)
        switch_ordered "${2:-}" "${3:-}"
        ;;
    delete)
        delete_session "${2:-}" "${3:-}"
        ;;
    mouse-down)
        mouse_down "${2:-}" "${3:-0}"
        ;;
    mouse-up)
        mouse_up "${2:-}" "${3:-0}" "${4:-}"
        ;;
    mouse-drag-end)
        mouse_drag_end "${2:-}" "${3:-0}"
        ;;
    *)
        printf 'Usage: %s {list|list-status-records|list-project-records|reorder|move|switch|delete|mouse-down|mouse-up|mouse-drag-end}\n' "$0" >&2
        exit 2
        ;;
esac
