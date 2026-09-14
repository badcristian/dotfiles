#!/usr/bin/env bash
# Keeps Codex's 5h window running back to back. The window anchors to the first
# request after a reset, so a lapsed one is started with a tiny ping. launchd runs
# this every 30 min (symlink.sh); the check is one curl and spends no tokens.

set -u

state_dir="${XDG_CACHE_HOME:-$HOME/.cache}/codex-warmup"
log_file="$state_dir/log"
ping_stamp="$state_dir/last-ping"
auth_file="${CODEX_HOME:-$HOME/.codex}/auth.json"
force=0

[[ ${1:-} == --force ]] && force=1

mkdir -p "$state_dir"

log() {
    printf '%s %s\n' "$(date '+%F %T')" "$1" >> "$log_file"
}

# Prints "idle" or "active <reset_at>"; fails when usage cannot be read.
window_state() {
    local access_token
    local account_id
    local response

    access_token="$(jq -r '.tokens.access_token // empty' "$auth_file" 2>/dev/null)"
    account_id="$(jq -r '.tokens.account_id // empty' "$auth_file" 2>/dev/null)"
    [[ -n $access_token ]] || return 1

    # Token through --config on stdin, so it never shows in ps.
    response="$(
        printf 'header = "Authorization: Bearer %s"\nheader = "ChatGPT-Account-Id: %s"\n' "$access_token" "$account_id" |
            /usr/bin/curl --silent --fail --max-time 20 --config - https://chatgpt.com/backend-api/wham/usage
    )" || return 1

    # Unstarted shape never observed -> null, past reset_at, or full-length
    # countdown at 0% all read as idle.
    jq -er '
        .rate_limit.primary_window as $window
        | if $window == null or ($window.reset_at // 0) <= now then "idle"
          elif ($window.used_percent // 0) == 0
              and ($window.reset_after_seconds // 0) >= ($window.limit_window_seconds // 18000) - 60 then "idle"
          else "active \($window.reset_at)"
          end
    ' <<< "$response"
}

# Unreadable = expired token or changed API; the ping itself refreshes the token.
state="$(window_state)" || state="usage unreadable"
[[ $state == active* ]] && (( force == 0 )) && exit 0

# Window we started lasts 18000s, so a sooner ping = misread payload. Stamped on
# success only -> a ping failing on wake, network not up yet, retries next check.
last_ping="$(stat -f %m "$ping_stamp" 2>/dev/null || printf 0)"
(( force == 1 || $(date +%s) - last_ping >= 18000 )) || exit 0

cd "$state_dir" || exit 1

# No user config -> no MCP servers, notify hooks. Ephemeral -> not in resume list.
# luna at low effort measured 6.9k tokens, 4s.
if "$HOME/.local/bin/codex" exec --ephemeral --ignore-user-config --skip-git-repo-check \
    --sandbox read-only --model gpt-5.6-luna -c 'model_reasoning_effort="low"' \
    'Reply with the single word: ok' < /dev/null > "$state_dir/last-ping.out" 2>&1; then
    touch "$ping_stamp"
    log "pinged ($state)"
else
    log "ping failed ($state), see last-ping.out"
fi
