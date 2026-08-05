#!/usr/bin/env bash

# System health checks surfaced in the tmux status bar.
#
# Every problem this looks for was found by hand at least once: a disk that
# reached 95% unnoticed, six orphaned Neovim processes holding 190 MB for five
# days, and a terminal shader repainting every frame. None of them announced
# themselves. This runs the same checks on a schedule instead.
#
# Cost, measured: the whole sweep is about 2 seconds, of which `top -l 2` is
# 1.7. Hourly that is 0.055% of one core, so the monitor cannot become the
# problem it is looking for.
#
# The status bar reads only `state_file`, a single line of "<state> <epoch>",
# so a redraw costs one builtin read and no forks.

set -uo pipefail

cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tmux-health"
report_file="$cache_dir/report.json"
state_file="$cache_dir/state"
lock_dir="$cache_dir/refresh.lock"
max_age="${TMUX_HEALTH_MAX_AGE:-3600}"

icon_ok=$'\U000F05E0'
icon_warn=$'\U000F0028'
icon_crit=$'\U000F0159'
icon_busy=$'\U000F04E6'

ui_accent="${TMUX_UI_ACCENT:-4}"
accent_sgr="$(bash "$HOME/tmux-ui.sh" ansi-foreground "$ui_accent" 2>/dev/null || printf '')"
green=$'\033[38;2;166;209;137m'
yellow=$'\033[38;2;229;200;144m'
red=$'\033[38;2;231;130;132m'
dim=$'\033[2m'
bold=$'\033[1m'
reset=$'\033[0m'

# ─── check helpers ───────────────────────────────────────────────────────────

# Rank states so the worst one wins when they are combined.
rank() {
    case "$1" in
        crit) printf '3' ;;
        warn) printf '2' ;;
        ok) printf '1' ;;
        *) printf '0' ;;
    esac
}

emit() {
    jq -nc \
        --arg id "$1" --arg label "$2" --arg state "$3" \
        --arg value "$4" --arg detail "$5" --arg fix "$6" \
        '{id:$id, label:$label, state:$state, value:$value, detail:$detail, fix:$fix}'
}

check_disk() {
    local avail capacity free_gb total_gb state fix=''
    read -r total_gb avail capacity < <(
        df -k /System/Volumes/Data 2>/dev/null |
            awk 'NR==2 {gsub("%","",$5); print int($2/1048576), int($4/1048576), $5}'
    )
    free_gb="$avail"
    state=ok
    (( capacity >= 85 )) && state=warn
    (( capacity >= 92 )) && state=crit
    [[ $state != ok ]] && fix='macOS swaps and thrashes caches below ~10% free. Clear ~/Library/Caches, npm cache clean --force, brew cleanup --prune=all.'
    emit disk "Disk" "$state" "${capacity}% full" "${free_gb} GB free of ${total_gb} GB" "$fix"
}

check_memory() {
    local free_pct state fix=''
    free_pct="$(memory_pressure 2>/dev/null | awk '/free percentage/ {gsub("%","",$NF); print $NF}')"
    [[ $free_pct =~ ^[0-9]+$ ]] || free_pct=100
    state=ok
    (( free_pct < 25 )) && state=warn
    (( free_pct < 12 )) && state=crit
    [[ $state != ok ]] && fix='Close the heaviest apps, or check for a leaking process in the Processes row.'
    emit memory "Memory" "$state" "${free_pct}% free" "system-wide free memory" "$fix"
}

check_swap() {
    local used total pct state fix=''
    read -r total used < <(
        sysctl -n vm.swapusage 2>/dev/null |
            awk '{gsub("M","",$3); gsub("M","",$6); print int($3), int($6)}'
    )
    [[ $total =~ ^[0-9]+$ && $total -gt 0 ]] || { emit swap "Swap" ok "unused" "no swap file" ""; return; }
    pct=$(( used * 100 / total ))
    state=ok
    (( pct >= 50 )) && state=warn
    (( pct >= 80 )) && state=crit
    [[ $state != ok ]] && fix='Sustained swap means RAM is oversubscribed; it shows up as stutter and heat.'
    emit swap "Swap" "$state" "${used} MB of ${total} MB" "${pct}% of swap in use" "$fix"
}

check_load() {
    local cores load1 ratio state fix=''
    cores="$(sysctl -n hw.ncpu 2>/dev/null || printf '8')"
    load1="$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')"
    ratio="$(awk -v l="$load1" -v c="$cores" 'BEGIN {printf "%d", (l/c)*100}')"
    state=ok
    (( ratio >= 150 )) && state=warn
    (( ratio >= 300 )) && state=crit
    [[ $state != ok ]] && fix='Load above core count means work is queueing. Check the Energy row for the cause.'
    emit load "CPU load" "$state" "$load1 on ${cores} cores" "$(( ratio ))% of capacity" "$fix"
}

check_thermal() {
    local limit state fix=''
    limit="$(pmset -g therm 2>/dev/null | awk -F= '/CPU_Speed_Limit/ {gsub(" ","",$2); print $2}')"
    [[ $limit =~ ^[0-9]+$ ]] || limit=100
    state=ok
    (( limit < 100 )) && state=warn
    (( limit < 70 )) && state=crit
    [[ $state != ok ]] && fix='The CPU is being throttled to shed heat. Find the sustained load below.'
    emit thermal "Thermal" "$state" "${limit}% clock available" "no throttling recorded" "$fix"
}

check_energy() {
    local line name power state fix=''
    # A single `top` sample reports averages since boot, which cannot reflect
    # anything recent. Two samples make the second one an interval measurement.
    # The field must be matched as a literal number, not coerced with $1+0:
    # top's own timestamp line ("2026/08/05 11:35:14") is also two fields and
    # coerces to 2026, which then wins any numeric sort.
    line="$(
        top -l 2 -s 1 -n 12 -stats power,command 2>/dev/null |
            awk '/^Processes/ {n++} n==2 && NF==2 && $1 ~ /^[0-9]+(\.[0-9]+)?$/ {print $1, $2}' |
            sort -rn | head -1
    )"
    power="${line%% *}"
    name="${line#* }"
    [[ $power =~ ^[0-9.]+$ ]] || { emit energy "Energy" ok "idle" "no process drawing power" ""; return; }
    state=ok
    awk -v p="$power" 'BEGIN {exit !(p >= 80)}' && state=warn
    awk -v p="$power" 'BEGIN {exit !(p >= 150)}' && state=crit
    [[ $state != ok ]] && fix="$name is drawing sustained power. If it is WindowServer, suspect a continuously animating shader or wallpaper."
    emit energy "Energy" "$state" "$name at $power" "highest sustained power draw" "$fix"
}

check_processes() {
    local orphans count state fix=''
    # Reparented to init, still alive after a day. This is the shape the six
    # stranded `nvim --embed` instances had: unreachable but still scheduled.
    orphans="$(
        ps -Ao ppid,etime,comm 2>/dev/null |
            awk '$1==1 && $2 ~ /-/ && $3 ~ /(nvim|node|python3|ruby|php)$/ {n=split($3,p,"/"); print p[n]}' |
            sort | uniq -c | awk '{printf "%s x%s ", $2, $1}'
    )"
    count="$(printf '%s' "$orphans" | wc -w | tr -d ' ')"
    state=ok
    [[ -n ${orphans// /} ]] && state=warn
    [[ $state != ok ]] && fix='Long-lived processes whose parent died. Usually leaked by a tool that exited badly; safe to kill once identified.'
    emit processes "Processes" "$state" \
        "$([[ -n ${orphans// /} ]] && printf '%s' "${orphans% }" || printf 'none stranded')" \
        "orphaned dev processes older than a day" "$fix"
}

check_ids() { printf '%s\n' disk memory swap load thermal energy processes; }

# ─── refresh ─────────────────────────────────────────────────────────────────

write_state() {
    local now
    printf -v now '%(%s)T' -1
    mkdir -p "$cache_dir"
    printf '%s %s\n' "$1" "$now" > "$state_file"
}

refresh_clients() {
    tmux refresh-client -S 2>/dev/null || true
}

run_refresh() {
    local results=() line overall=ok id

    mkdir -p "$cache_dir"
    # mkdir is atomic, so two refreshes cannot overlap.
    if ! mkdir "$lock_dir" 2>/dev/null; then
        return 0
    fi
    trap 'rmdir "$lock_dir" 2>/dev/null' EXIT

    write_state checking
    refresh_clients

    while IFS= read -r id; do
        line="$("check_$id")" || continue
        results+=("$line")
        state="$(jq -r '.state' <<< "$line")"
        (( $(rank "$state") > $(rank "$overall") )) && overall="$state"
    done < <(check_ids)

    printf '%s\n' "${results[@]}" |
        jq -sc --arg overall "$overall" --argjson at "$(printf '%(%s)T' -1)" \
            '{checked_at:$at, overall:$overall, checks:.}' > "$report_file.tmp" &&
        mv "$report_file.tmp" "$report_file"

    write_state "$overall"
    refresh_clients
}

# Only spawn a refresh when the report is genuinely stale, so the status bar
# stays fork-free on every other redraw.
ensure_fresh() {
    local state age now
    printf -v now '%(%s)T' -1

    if [[ -f $state_file ]]; then
        read -r state age < "$state_file" 2>/dev/null || true
        [[ $state == checking ]] && return 0
        [[ $age =~ ^[0-9]+$ ]] && (( now - age < max_age )) && return 0
    fi

    nohup bash "$0" refresh >/dev/null 2>&1 &
}

# ─── rendering ───────────────────────────────────────────────────────────────

state_colour() {
    case "$1" in
        ok) printf '%s' "$green" ;;
        warn) printf '%s' "$yellow" ;;
        crit) printf '%s' "$red" ;;
        *) printf '%s' "$dim" ;;
    esac
}

state_icon() {
    case "$1" in
        ok) printf '%s' "$icon_ok" ;;
        warn) printf '%s' "$icon_warn" ;;
        crit) printf '%s' "$icon_crit" ;;
        *) printf '%s' "$icon_busy" ;;
    esac
}

popup_width() {
    local size width=''
    size="$(stty size 2>/dev/null || printf '')"
    width="${size#* }"
    [[ $width =~ ^[0-9]+$ ]] && (( width >= 40 )) || width=86
    printf '%s' "$width"
}

rule() {
    local line
    printf -v line '%*s' "$2" ''
    printf '%s' "${line// /$1}"
}

# One row per check. `running` and `pending` are drawn from the same function so
# a refresh redraws in place instead of clearing the window.
render_row() {
    local label="$1" state="$2" value="$3" detail="$4" width="$5"
    local colour icon

    colour="$(state_colour "$state")"
    icon="$(state_icon "$state")"

    case "$state" in
        running) printf '  %s%s%s %-11s %s%s%s\n' "$accent_sgr" "$icon_busy" "$reset" "$label" "$dim" "checking…" "$reset"; return ;;
        pending) printf '  %s%s %-11s %s%s\n' "$dim" '·' "$label" "waiting" "$reset"; return ;;
    esac

    printf '  %s%s%s %-11s %-24s %s%s%s\n' \
        "$colour" "$icon" "$reset" "$label" "${value:0:24}" "$dim" "$detail" "$reset"
}

render_report() {
    local width overall checked_at when
    width="$(popup_width)"

    printf '\033[2J\033[H'

    if [[ ! -f $report_file ]]; then
        printf '\n  %sNo report yet.%s Press %sr%s to run the checks.\n' \
            "$dim" "$reset" "$accent_sgr" "$reset"
        return
    fi

    overall="$(jq -r '.overall' "$report_file")"
    checked_at="$(jq -r '.checked_at' "$report_file")"
    when="$(date -r "$checked_at" '+%H:%M' 2>/dev/null || printf '?')"

    local title right gap
    title="$(overall_text "$overall")"
    right="checked $when"
    # 4 = leading space, icon, two spaces. Right margin of 2 keeps it off the frame.
    gap=$(( width - 4 - ${#title} - ${#right} - 2 ))
    (( gap < 1 )) && gap=1
    printf ' %s%s%s  %s%s%s%*s%s%s%s\n' \
        "$(state_colour "$overall")" "$(state_icon "$overall")" "$reset" \
        "$bold" "$title" "$reset" "$gap" '' "$dim" "$right" "$reset"
    printf ' %s\n\n' "$(rule '═' $(( width - 3 )))"

    while IFS=$'\t' read -r label state value detail; do
        render_row "$label" "$state" "$value" "$detail" "$width"
    done < <(jq -r '.checks[] | [.label, .state, .value, .detail] | @tsv' "$report_file")

    # Only failing checks carry advice, so the list stays short when all is well.
    if jq -e '[.checks[] | select(.state != "ok")] | length > 0' "$report_file" >/dev/null; then
        printf '\n %s\n' "$(rule '─' $(( width - 3 )))"
        while IFS=$'\t' read -r label fix; do
            # Wrap to the popup, indenting continuation lines under the text so
            # the label stays scannable down the left edge.
            printf '%s\n' "$fix" | fold -s -w $(( width - ${#label} - 5 )) |
                while IFS= read -r part; do
                    if [[ -z ${shown:-} ]]; then
                        printf ' %s%s:%s %s%s%s\n' "$bold" "$label" "$reset" "$dim" "$part" "$reset"
                        shown=1
                    else
                        printf ' %*s %s%s%s\n' $(( ${#label} + 1 )) '' "$dim" "$part" "$reset"
                    fi
                done
            unset shown
        done < <(jq -r '.checks[] | select(.state != "ok" and .fix != "") | [.label, .fix] | @tsv' "$report_file")
    fi

    printf '\n %s\n' "$(rule '─' $(( width - 3 )))"
    printf ' %sr%s recheck   %sq / Esc%s close\n' "$accent_sgr" "$reset" "$accent_sgr" "$reset"
}

overall_text() {
    case "$1" in
        ok) printf 'All checks passing' ;;
        warn) printf 'Needs attention' ;;
        crit) printf 'Problems found' ;;
        *) printf 'Checking…' ;;
    esac
}

# Run the checks in the foreground, redrawing after each so the popup shows
# progress rather than freezing for two seconds.
interactive_refresh() {
    local ids=() done_rows=() id line state overall=ok index=0 total width
    mapfile -t ids < <(check_ids)
    total=${#ids[@]}
    width="$(popup_width)"

    for (( index = 0; index < total; index++ )); do
        printf '\033[2J\033[H'
        printf ' %s%s%s  %sChecking…%s   %s%s of %s%s\n' \
            "$accent_sgr" "$icon_busy" "$reset" "$bold" "$reset" \
            "$dim" "$index" "$total" "$reset"
        printf ' %s\n\n' "$(rule '═' $(( width - 3 )))"

        local shown=0
        for row in "${done_rows[@]}"; do
            IFS=$'\t' read -r l s v d <<< "$row"
            render_row "$l" "$s" "$v" "$d" "$width"
            shown=$((shown + 1))
        done
        render_row "$(label_for "${ids[$index]}")" running '' '' "$width"
        for (( j = index + 1; j < total; j++ )); do
            render_row "$(label_for "${ids[$j]}")" pending '' '' "$width"
        done

        line="$("check_${ids[$index]}")" || line=''
        [[ -z $line ]] && continue
        done_rows+=("$(jq -r '[.label, .state, .value, .detail] | @tsv' <<< "$line")")
        state="$(jq -r '.state' <<< "$line")"
        (( $(rank "$state") > $(rank "$overall") )) && overall="$state"
        printf '%s\n' "$line" >> "$cache_dir/partial.jsonl"
    done

    jq -sc --arg overall "$overall" --argjson at "$(printf '%(%s)T' -1)" \
        '{checked_at:$at, overall:$overall, checks:.}' \
        < "$cache_dir/partial.jsonl" > "$report_file.tmp" &&
        mv "$report_file.tmp" "$report_file"
    rm -f "$cache_dir/partial.jsonl"

    write_state "$overall"
    refresh_clients
    render_report
}

label_for() {
    case "$1" in
        disk) printf 'Disk' ;;
        memory) printf 'Memory' ;;
        swap) printf 'Swap' ;;
        load) printf 'CPU load' ;;
        thermal) printf 'Thermal' ;;
        energy) printf 'Energy' ;;
        processes) printf 'Processes' ;;
    esac
}

popup() {
    mkdir -p "$cache_dir"
    rm -f "$cache_dir/partial.jsonl"

    # Nothing here is editable, so the caret is only noise.
    printf '\033[?25l'
    trap 'printf "\033[?25h"' EXIT

    if [[ ! -f $report_file ]]; then
        interactive_refresh
    else
        render_report
    fi

    local key
    while IFS= read -rsn1 key; do
        case "$key" in
            r|R)
                rm -f "$cache_dir/partial.jsonl"
                interactive_refresh
                ;;
            q|Q|$'\e')
                break
                ;;
        esac
    done
}

# ─── status bar ──────────────────────────────────────────────────────────────

status_icon() {
    local state='' age
    [[ -f $state_file ]] && read -r state age < "$state_file" 2>/dev/null
    case "$state" in
        ok) printf '%s' "$icon_ok" ;;
        warn) printf '%s' "$icon_warn" ;;
        crit) printf '%s' "$icon_crit" ;;
        *) printf '%s' "$icon_busy" ;;
    esac
}

status_state() {
    local state='' age
    [[ -f $state_file ]] && read -r state age < "$state_file" 2>/dev/null
    printf '%s' "${state:-unknown}"
}

case "${1:-}" in
    refresh) run_refresh ;;
    ensure-fresh) ensure_fresh ;;
    popup) popup ;;
    status-icon) status_icon ;;
    status-state) status_state ;;
    report) [[ -f $report_file ]] && jq . "$report_file" || echo '{}' ;;
    *)
        printf 'Usage: %s {refresh|ensure-fresh|popup|status-icon|status-state|report}\n' "$0" >&2
        exit 2
        ;;
esac
