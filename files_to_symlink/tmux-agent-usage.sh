#!/usr/bin/env bash

set -u

usage_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tmux-agent-usage"
usage_cache_file="$usage_cache_dir/status.json"
usage_cache_ttl=300
force_refresh=0
print_only=0
ui_accent="${TMUX_UI_ACCENT:-4}"
ui_accent_sgr="$(bash "$HOME/tmux-ui.sh" ansi-foreground "$ui_accent")"

for argument in "$@"; do
    case "$argument" in
        --refresh) force_refresh=1 ;;
        --print) print_only=1 ;;
    esac
done

provider_unavailable() {
    local provider_id="$1"
    local provider_name="$2"
    local message="$3"

    jq -nc \
        --arg id "$provider_id" \
        --arg name "$provider_name" \
        --arg message "$message" \
        '{id: $id, name: $name, plan: "", state: "unavailable", message: $message, rows: []}'
}

curl_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

fetch_json() {
    local url="$1"
    local access_token="$2"
    shift 2

    local curl_config
    local header
    local response
    local response_body
    local response_status

    printf -v curl_config 'url = "%s"\nrequest = "GET"\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/json"\n' \
        "$(curl_escape "$url")" \
        "$(curl_escape "$access_token")"

    for header in "$@"; do
        printf -v curl_config '%sheader = "%s"\n' "$curl_config" "$(curl_escape "$header")"
    done

    response="$(
        printf '%s' "$curl_config" |
            /usr/bin/curl \
                --silent \
                --show-error \
                --location \
                --max-time 20 \
                --write-out $'\n%{http_code}' \
                --config - \
                2>/dev/null
    )" || return 1

    response_status="${response##*$'\n'}"
    response_body="${response%$'\n'*}"

    if [[ ! "$response_status" =~ ^2[0-9][0-9]$ ]]; then
        return 1
    fi

    if ! jq -e . >/dev/null 2>&1 <<< "$response_body"; then
        return 1
    fi

    printf '%s' "$response_body"
}

fetch_codex() {
    local auth_file=""
    local candidate
    local access_token
    local account_id
    local response

    for candidate in \
        "${CODEX_HOME:-$HOME/.codex}/auth.json" \
        "$HOME/.config/codex/auth.json"; do
        if [[ -f "$candidate" ]]; then
            auth_file="$candidate"
            break
        fi
    done

    if [[ -z "$auth_file" ]]; then
        provider_unavailable codex Codex "Sign in to Codex"
        return
    fi

    access_token="$(jq -r '.tokens.access_token // .accessToken // empty' "$auth_file" 2>/dev/null)"
    account_id="$(jq -r '.tokens.account_id // .accountID // .account_id // empty' "$auth_file" 2>/dev/null)"

    if [[ -z "$access_token" ]]; then
        provider_unavailable codex Codex "Sign in to Codex"
        return
    fi

    codex_headers=()
    if [[ -n "$account_id" ]]; then
        codex_headers+=("ChatGPT-Account-Id: $account_id")
    fi

    if ! response="$(fetch_json \
        "https://chatgpt.com/backend-api/wham/usage" \
        "$access_token" \
        "${codex_headers[@]}")"; then
        provider_unavailable codex Codex "Unable to fetch usage"
        return
    fi

    jq -c '
        def title($value):
            if ($value | length) == 0 then ""
            elif ($value | ascii_downcase) == "prolite" then "Pro 5x"
            elif ($value | ascii_downcase) == "pro" then "Pro 20x"
            else ($value[0:1] | ascii_upcase) + $value[1:]
            end;
        def usage_row($window; $fallback):
            if $window == null then empty
            else {
                label: (
                    if $window.limit_window_seconds == 18000 then "5h"
                    elif $window.limit_window_seconds == 604800 then
                        (if $fallback == "Reviews" then "Reviews" else "7d" end)
                    else $fallback
                    end
                ),
                percent: ($window.used_percent // null),
                reset_at: ($window.reset_at // 0)
            }
            end;
        . as $payload |
        {
            id: "codex",
            name: "Codex",
            plan: title(($payload.plan_type // $payload.plan // "") | tostring),
            state: "available",
            message: "",
            rows: [
                usage_row($payload.rate_limit.primary_window; "5h"),
                usage_row($payload.rate_limit.secondary_window; "7d"),
                usage_row($payload.code_review_rate_limit.primary_window; "Reviews")
            ]
        }
        | if (.rows | length) == 0 then
            .state = "unavailable" | .message = "No usage data"
          else . end
    ' <<< "$response"
}

claude_credentials() {
    local credential_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json"
    local keychain_account
    local keychain_payload

    if [[ -f "$credential_file" ]]; then
        /bin/cat "$credential_file"
        return 0
    fi

    for keychain_account in "${USER:-}" ""; do
        if [[ -n "$keychain_account" ]]; then
            keychain_payload="$(
                /usr/bin/security find-generic-password \
                    -s "Claude Code-credentials" \
                    -a "$keychain_account" \
                    -w \
                    2>/dev/null
            )" || true
        else
            keychain_payload="$(
                /usr/bin/security find-generic-password \
                    -s "Claude Code-credentials" \
                    -w \
                    2>/dev/null
            )" || true
        fi

        if jq -e '.claudeAiOauth.accessToken' >/dev/null 2>&1 <<< "$keychain_payload"; then
            printf '%s' "$keychain_payload"
            return 0
        fi
    done

    return 1
}

fetch_claude() {
    local credentials
    local access_token
    local plan
    local response

    if ! credentials="$(claude_credentials)"; then
        provider_unavailable claude "Claude Code" "Sign in to Claude"
        return
    fi

    access_token="$(jq -r '.claudeAiOauth.accessToken // empty' <<< "$credentials")"
    plan="$(jq -r '.claudeAiOauth.subscriptionType // empty' <<< "$credentials")"

    if [[ -z "$access_token" ]]; then
        provider_unavailable claude "Claude Code" "Sign in to Claude"
        return
    fi

    if ! response="$(fetch_json \
        "https://api.anthropic.com/api/oauth/usage" \
        "$access_token" \
        "Content-Type: application/json" \
        "anthropic-beta: oauth-2025-04-20" \
        "User-Agent: claude-code/2.1.69")"; then
        provider_unavailable claude "Claude Code" "Unable to fetch usage"
        return
    fi

    jq -c --arg plan "$plan" '
        def reset_epoch($value):
            if $value == null then 0
            elif ($value | type) == "number" then $value
            else ((
                $value
                | sub("\\.[0-9]+Z$"; "Z")
                | sub("\\.[0-9]+\\+00:00$"; "Z")
                | sub("\\+00:00$"; "Z")
                | fromdateiso8601?
            ) // 0)
            end;
        def usage_row($window; $label):
            if $window == null then empty
            else {
                label: $label,
                percent: ($window.utilization // $window.used_percent // null),
                reset_at: reset_epoch($window.resets_at // $window.reset_at)
            }
            end;
        . as $payload |
        {
            id: "claude",
            name: "Claude Code",
            plan: ($plan | gsub("_"; " ") | if length > 0 then (.[0:1] | ascii_upcase) + .[1:] else "" end),
            state: "available",
            message: "",
            rows: [
                usage_row($payload.five_hour; "5h"),
                usage_row($payload.seven_day; "7d"),
                usage_row($payload.seven_day_sonnet; "7d Sonnet"),
                usage_row($payload.seven_day_omelette; "7d Omelette")
            ]
        }
        | if (.rows | length) == 0 then
            .state = "unavailable" | .message = "No usage data"
          else . end
    ' <<< "$response"
}

cache_is_fresh() {
    local modified_at
    local now

    if [[ ! -f "$usage_cache_file" ]]; then
        return 1
    fi

    modified_at="$(stat -f '%m' "$usage_cache_file" 2>/dev/null || printf '0')"
    now="$(date +%s)"
    (( now - modified_at < usage_cache_ttl ))
}

refresh_cache() {
    local codex_snapshot
    local claude_snapshot
    local temporary_cache

    codex_snapshot="$(fetch_codex)"
    claude_snapshot="$(fetch_claude)"

    mkdir -p "$usage_cache_dir"
    temporary_cache="$(mktemp "$usage_cache_dir/status.XXXXXX")"

    jq -nc \
        --argjson fetched_at "$(date +%s)" \
        --argjson codex "$codex_snapshot" \
        --argjson claude "$claude_snapshot" \
        '{version: 1, fetched_at: $fetched_at, providers: [$codex, $claude]}' \
        > "$temporary_cache"

    chmod 600 "$temporary_cache"
    mv -f "$temporary_cache" "$usage_cache_file"
}

progress_bar() {
    local percent="$1"
    local bar_width=18
    local filled=$((percent * bar_width / 100))
    local empty=$((bar_width - filled))
    local filled_text=""
    local empty_text=""

    printf -v filled_text '%*s' "$filled" ''
    printf -v empty_text '%*s' "$empty" ''
    printf '%s%s' "${filled_text// /█}" "${empty_text// /░}"
}

reset_label() {
    local reset_at="$1"
    local now
    local remaining
    local days
    local hours
    local minutes

    if [[ ! "$reset_at" =~ ^[0-9]+$ ]] || (( reset_at <= 0 )); then
        printf ''
        return
    fi

    now="$(date +%s)"
    remaining=$((reset_at - now))
    if (( remaining <= 0 )); then
        printf 'reset due'
        return
    fi

    days=$((remaining / 86400))
    hours=$((remaining % 86400 / 3600))
    minutes=$((remaining % 3600 / 60))

    if (( days > 0 )); then
        printf 'resets in %dd %dh' "$days" "$hours"
    elif (( hours > 0 )); then
        printf 'resets in %dh %dm' "$hours" "$minutes"
    else
        printf 'resets in %dm' "$minutes"
    fi
}

render_provider() {
    local provider="$1"
    local name
    local plan
    local state
    local message
    local row
    local label
    local percent
    local reset_at
    local reset_text
    local row_index=0

    name="$(jq -r '.name' <<< "$provider")"
    plan="$(jq -r '.plan // empty' <<< "$provider")"
    state="$(jq -r '.state' <<< "$provider")"

    if [[ -n "$plan" ]]; then
        printf '\033[1m%s\033[0m  \033[2m%s\033[0m\n' "$name" "$plan"
    else
        printf '\033[1m%s\033[0m\n' "$name"
    fi

    if [[ "$state" != "available" ]]; then
        message="$(jq -r '.message // "No usage data"' <<< "$provider")"
        printf '  \033[2m%s\033[0m\n\n' "$message"
        return
    fi

    while IFS= read -r row; do
        if (( row_index > 0 )); then
            printf '\n'
        fi

        label="$(jq -r '.label' <<< "$row")"
        percent="$(jq -r '(.percent // 0) | round' <<< "$row")"
        reset_at="$(jq -r '.reset_at // 0 | floor' <<< "$row")"
        reset_text="$(reset_label "$reset_at")"

        printf '  %-11s %s  %3d%% used' \
            "$label" \
            "$(progress_bar "$percent")" \
            "$percent"

        if [[ -n "$reset_text" ]]; then
            printf '  \033[2m%s\033[0m' "$reset_text"
        fi
        printf '\n'
        ((row_index += 1))
    done < <(jq -c '.rows[]' <<< "$provider")

    printf '\n'
}

render_usage() {
    local fetched_at
    local fetched_text
    local provider

    printf '\033[2J\033[H'
    printf '\033[1m%s✦ AI Usage\033[0m\n' "$ui_accent_sgr"
    printf '════════════════════════════════════════════════════════════\n\n'

    while IFS= read -r provider; do
        render_provider "$provider"
    done < <(jq -c '.providers[]' "$usage_cache_file")

    fetched_at="$(jq -r '.fetched_at // 0' "$usage_cache_file")"
    fetched_text="$(date -r "$fetched_at" '+%H:%M' 2>/dev/null || printf '?')"
    printf '────────────────────────────────────────────────────────────\n'
    printf '\033[2mUpdated %s · cached for 5 min\033[0m\n' "$fetched_text"
    printf '%sr\033[0m refresh   %sq / Esc\033[0m close\n' \
        "$ui_accent_sgr" "$ui_accent_sgr"
}

if (( force_refresh == 1 )) || ! cache_is_fresh; then
    if (( print_only == 0 )); then
        printf '\033[2J\033[H\033[2mFetching Codex and Claude usage…\033[0m\n'
    fi
    refresh_cache
fi

render_usage

if (( print_only == 1 )); then
    exit 0
fi

while IFS= read -rsn1 key; do
    case "$key" in
        r|R)
            printf '\033[2J\033[H\033[2mRefreshing usage…\033[0m\n'
            refresh_cache
            render_usage
            ;;
        q|Q|$'\e')
            break
            ;;
    esac
done
