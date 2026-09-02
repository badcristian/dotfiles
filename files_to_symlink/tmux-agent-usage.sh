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

# Interior width of the popup. tput reports the popup's own size, so the rules
# and bars stretch to whatever width the popup was opened at instead of the
# hard-coded 60 that used to leave a ragged gap down the right-hand side.
# `tput cols` reports the terminfo default of 80 inside a popup rather than the
# real pane size, which silently ran every full-width line off the edge, wrapped
# it, and pushed the first provider off the top. `stty size` reads the actual
# window size from the tty and is correct.
popup_width() {
    local size
    local width=""

    size="$(stty size 2>/dev/null || printf '')"
    width="${size#* }"
    if [[ ! $width =~ ^[0-9]+$ ]] || (( width < 40 )); then
        width=76
    fi
    printf '%s' "$width"
}

# The popup is opened at a fixed height and the providers rarely fill it, so the
# height is read for the same reason the width is: to put the footer on the last
# row rather than directly under the final bar.
popup_height() {
    local size
    local height=""

    size="$(stty size 2>/dev/null || printf '')"
    height="${size%% *}"
    if [[ ! $height =~ ^[0-9]+$ ]] || (( height < 8 )); then
        height=13
    fi
    printf '%s' "$height"
}

rule() {
    local character="$1"
    local width="$2"
    local line

    printf -v line '%*s' "$width" ''
    printf '%s' "${line// /$character}"
}

progress_bar() {
    local percent="$1"
    local bar_width="${2:-18}"
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
    local width="$2"
    local bar_width
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
        printf ' \033[1m%s\033[0m  \033[2m%s\033[0m\n' "$name" "$plan"
    else
        printf ' \033[1m%s\033[0m\n' "$name"
    fi

    if [[ "$state" != "available" ]]; then
        message="$(jq -r '.message // "No usage data"' <<< "$provider")"
        printf '   \033[2m%s\033[0m\n' "$message"
        return
    fi

    # 1 indent + 5 label + 2 + bar + 2 + 4 percent + 2 + 18 reset + 2 right margin
    bar_width=$((width - 36))
    (( bar_width < 10 )) && bar_width=10

    while IFS= read -r row; do
        (( row_index > 0 )) && printf '\n'
        row_index=$((row_index + 1))

        label="$(jq -r '.label' <<< "$row")"
        percent="$(jq -r '(.percent // 0) | round' <<< "$row")"
        reset_at="$(jq -r '.reset_at // 0 | floor' <<< "$row")"
        reset_text="$(reset_label "$reset_at")"

        printf '   %-4s %s  %3d%%' \
            "$label" \
            "$(progress_bar "$percent" "$bar_width")" \
            "$percent"

        if [[ -n "$reset_text" ]]; then
            printf '  \033[2m%s\033[0m' "$reset_text"
        fi
        printf '\n'
    done < <(jq -c '.rows[]' <<< "$provider")
}

render_usage() {
    local fetched_at
    local fetched_text
    local provider
    local width
    local inner
    local header_right
    local first=1
    local footer_left="r refresh   q / Esc close"
    local footer_right="cached for 5 min"
    local gap
    local height
    local body
    local body_rows
    local padding

    width="$(popup_width)"
    height="$(popup_height)"
    # One column of left margin, two on the right, so nothing sits on the frame.
    inner=$((width - 3))
    fetched_at="$(jq -r '.fetched_at // 0' "$usage_cache_file")"
    fetched_text="$(date -r "$fetched_at" '+%H:%M' 2>/dev/null || printf '?')"

    printf '\033[2J\033[H'

    # The popup frame already reads " AI Usage ", so the title is not repeated
    # here. The header carries when the reading was taken; the footer carries how
    # long it is kept, which keeps the two facts apart.
    # Collected instead of printed as it goes, because how far down the footer
    # belongs cannot be known until the last provider has been drawn.
    body="$(
        header_right="updated $fetched_text"
        gap=$((inner - ${#header_right}))
        (( gap < 1 )) && gap=1
        printf ' %*s\033[2m%s\033[0m\n\n' "$gap" '' "$header_right"

        # A blank line before each provider after the first. The name line alone read
        # too tight against the metric above it, so providers get a clear break while
        # a provider's own metrics stay one row apart.
        while IFS= read -r provider; do
            (( first == 0 )) && printf '\n'
            first=0
            render_provider "$provider" "$width"
        done < <(jq -c '.providers[]' "$usage_cache_file")
    )"

    printf '%s\n' "$body"

    # Two rows for the rule and the keys, and at least one blank row above them.
    # Printing to a pipe has no bottom to sit on, so that mode keeps the single
    # blank line it always had.
    padding=1
    if (( print_only == 0 )); then
        body_rows="$(grep -c '' <<< "$body")"
        padding=$((height - body_rows - 2))
        (( padding < 1 )) && padding=1
    fi
    rule $'\n' "$padding"

    printf ' %s\n' "$(rule '─' "$inner")"
    gap=$((inner - ${#footer_left} - ${#footer_right}))
    (( gap < 1 )) && gap=1
    # No trailing newline: the footer is on the popup's last row, and ending it
    # with one would scroll the report up by a line.
    printf ' %sr\033[0m refresh   %sq / Esc\033[0m close%*s\033[2m%s\033[0m' \
        "$ui_accent_sgr" "$ui_accent_sgr" "$gap" '' "$footer_right"
}

if (( force_refresh == 1 )) || ! cache_is_fresh; then
    if (( print_only == 0 )); then
        printf '\033[2J\033[H\033[2mFetching Codex and Claude usage…\033[0m\n'
    fi
    refresh_cache
fi

render_usage

if (( print_only == 1 )); then
    printf '\n'
    exit 0
fi

printf '\033[?25l'
trap 'printf "\033[?25h"' EXIT

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
