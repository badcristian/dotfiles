#!/usr/bin/env bash

# System health checks surfaced in the tmux status bar.
#
# Every problem this looks for was found by hand at least once: a disk that
# reached 95% unnoticed, six orphaned Neovim processes holding 190 MB for five
# days, and a terminal shader repainting every frame. None of them announced
# themselves. This runs the same checks on a schedule instead.
#
# Cost, measured: the whole sweep is about 3.4 seconds — `top -l 2` for Energy is
# 1.6, `iostat -c 2` for CPU load is 1.1, and `top -l 1` for Top memory is 0.5.
# Hourly that is 0.09% of one core, so the monitor cannot become the problem it
# is looking for. Two of those three are sampling intervals rather than work, and
# the third buys a memory figure `ps` cannot give.
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

# Memory, reported as the gigabytes Activity Monitor shows.
#
# A percentage on its own does not say whether there is room: "81% free" was true
# on a machine with 700 MB unused, because `memory_pressure` counts the file
# cache as free — correctly, since it is reclaimable, but not usefully when the
# question is how much is left. `vm_stat` carries the breakdown behind it, and
# app + wired + compressed is exactly Activity Monitor's "Memory Used"; the file
# cache is reported beside it rather than inside it.
#
# The state still comes from `memory_pressure`. Reclaimability is the kernel's
# own signal and the right one to alarm on: macOS fills RAM with cache by design,
# so a used/total threshold would sit in warning permanently.
check_memory() {
    local free_pct used total app wired comp cache state fix=''

    free_pct="$(memory_pressure 2>/dev/null | awk '/free percentage/ {gsub("%","",$NF); print $NF}')"
    [[ $free_pct =~ ^[0-9]+$ ]] || free_pct=100

    read -r used total app wired comp cache < <(
        vm_stat 2>/dev/null | awk -v total="$(sysctl -n hw.memsize 2>/dev/null || printf 0)" '
            /page size of/ { match($0, /page size of [0-9]+/); ps = substr($0, RSTART + 13, RLENGTH - 13) }
            index($0, ":") {
                key = substr($0, 1, index($0, ":") - 1)
                val = substr($0, index($0, ":") + 1); gsub(/[^0-9]/, "", val)
                page[key] = val + 0
            }
            END {
                gb = 1073741824
                app = (page["Anonymous pages"] - page["Pages purgeable"]) * ps / gb
                wired = page["Pages wired down"] * ps / gb
                comp = page["Pages occupied by compressor"] * ps / gb
                cache = page["File-backed pages"] * ps / gb
                printf "%.1f %.1f %.1f %.1f %.1f %.1f\n", app + wired + comp, total / gb, app, wired, comp, cache
            }'
    )

    state=ok
    (( free_pct < 25 )) && state=warn
    (( free_pct < 12 )) && state=crit
    [[ $state != ok ]] && fix='Close the heaviest apps, or check for a leaking process in the Processes row.'

    [[ $used =~ ^[0-9.]+$ && $total =~ ^[0-9.]+$ ]] || { emit memory "Memory" "$state" "${free_pct}% free" "system-wide free memory" "$fix"; return; }
    # Abbreviated deliberately: the detail column is 62 wide at the popup's size and
    # the full words did not fit, so they were being clipped mid-phrase.
    emit memory "Memory" "$state" "${used} GB used of ${total} GB" \
        "app ${app} · wired ${wired} · comp ${comp} · cache ${cache} · ${free_pct}% reclaimable" "$fix"
}

# Swap, measured as a rate rather than as a ratio.
#
# This used to report `used / total` from `vm.swapusage` and warn past 50%. That
# fraction cannot mean what it looks like: macOS sizes the swap file on demand,
# so `total` is whatever the kernel has allocated so far, not a capacity. When
# more swap is needed macOS allocates another file and the percentage *falls*.
# A machine that swapped 1.2 GB once and has been comfortable for two days since
# read "57% of swap in use" and raised a warning with nothing wrong — the number
# was a high-water mark wearing a percentage.
#
# What matters is whether pages are leaving RAM *now*. `vm_stat`'s Swapouts is a
# monotonic page counter, so writing it down with its timestamp turns two
# consecutive refreshes into an interval measurement: no sleep, no second sample,
# and the refresh cadence is the window. The resident total is still reported,
# as context rather than as the alarm.
check_swap() {
    local stamp_file="$cache_dir/swapouts" pagesize pages used now
    local last_pages='' last_at='' elapsed rate state fix='' detail

    read -r pagesize pages < <(
        vm_stat 2>/dev/null | awk '
            /page size of/ { for (i = 1; i < NF; i++) if ($i == "of") { size = $(i + 1); break } }
            /^Swapouts:/ { gsub("[^0-9]", "", $2); outs = $2 }
            END { print (size ? size : 4096), (outs ? outs : 0) }'
    )
    used="$(sysctl -n vm.swapusage 2>/dev/null | awk '{gsub("M", "", $6); printf "%d", $6}')"
    [[ $pagesize =~ ^[0-9]+$ && $pages =~ ^[0-9]+$ ]] || { emit swap "Swap" ok "unknown" "vm_stat reported no swap counters" ""; return; }
    [[ $used =~ ^[0-9]+$ ]] || used=0
    printf -v now '%(%s)T' -1
    detail="${used} MB resident in swap"

    [[ -f $stamp_file ]] && read -r last_pages last_at < "$stamp_file" 2>/dev/null
    printf '%s %s\n' "$pages" "$now" > "$stamp_file"

    # A counter that went backwards is a reboot, and a missing one is the first
    # run. Both mean there is no interval to measure yet, not that swapping is
    # absent, so neither is reported as a clean bill of health.
    if [[ ! $last_pages =~ ^[0-9]+$ || ! $last_at =~ ^[0-9]+$ ]] || (( pages < last_pages || now <= last_at )); then
        emit swap "Swap" ok "no baseline" "$detail · rate from the next check" ""
        return
    fi

    elapsed=$(( now - last_at ))
    rate=$(( (pages - last_pages) * pagesize * 3600 / elapsed / 1048576 ))
    state=ok
    (( rate >= 128 )) && state=warn
    (( rate >= 1024 )) && state=crit
    [[ $state != ok ]] && fix='Pages are being written out of RAM continuously, which is the stutter you feel. The Top memory row names what is holding it.'
    emit swap "Swap" "$state" "${rate} MB/h out" "$detail" "$fix"
}

check_load() {
    local cores line kbt tps mbs us sy idle load1 busy ratio state fix='' detail

    cores="$(sysctl -n hw.ncpu 2>/dev/null || printf '8')"

    # Load average alone cannot tell CPU pressure from I/O wait: macOS counts
    # processes blocked on disk in it too. Three minutes after a reboot this
    # read 39.6 while the CPU was 68% idle, and the check cried wolf. iostat's
    # second sample is an interval measurement carrying CPU idle, disk
    # throughput and the load average together, so one call settles which it is.
    line="$(iostat -c 2 -w 1 2>/dev/null | tail -1)"
    read -r kbt tps mbs us sy idle load1 _ <<< "$line"

    [[ $idle =~ ^[0-9]+$ ]] || idle=100
    [[ $tps =~ ^[0-9]+$ ]] || tps=0
    [[ $load1 =~ ^[0-9.]+$ ]] || load1="$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')"
    busy=$(( 100 - idle ))
    ratio="$(awk -v l="$load1" -v c="$cores" 'BEGIN {printf "%d", (l/c)*100}')"

    # Only a queue that is actually competing for CPU counts as CPU pressure.
    state=ok
    (( ratio >= 150 && busy >= 60 )) && state=warn
    (( ratio >= 300 && busy >= 80 )) && state=crit

    # State the two measurements rather than asserting a cause: a high load with
    # an idle CPU is disk wait at boot, but it is also just a one-minute average
    # still draining after a spike. Both are "not CPU pressure", which is the
    # only claim worth making from one sample.
    if (( ratio >= 150 && busy < 60 )); then
        detail="not CPU-bound: ${busy}% busy, ${tps} tps"
    else
        detail="CPU ${busy}% busy"
    fi

    [[ $state != ok ]] && fix='Processes are queueing for CPU, not disk. Check the Energy row for what is holding it.'
    emit load "CPU load" "$state" "$load1 on ${cores} cores" "$detail" "$fix"
}

# Temperature, with the trend that makes a temperature mean something.
#
# This check used to read `CPU_Speed_Limit` from `pmset -g therm`. On Apple
# Silicon that field does not exist: all three lines come back as "No thermal
# warning level has been recorded", the parse fell through to its `limit=100`
# default, and the row has reported "100% clock available — no throttling
# recorded" ever since. A clean bill of health that nothing measured is worse
# than no row at all, because it answers the question without looking.
#
# Two sources do report, both without root and without installing anything:
#
#   - `AppleSmartBattery`'s `Temperature`, in hundredths of a degree. It is the
#     pack sensor rather than the die, so it lags a CPU spike by minutes — which
#     is the right instrument here. A laptop that grows warm over an afternoon is
#     describing accumulated chassis heat, not a millisecond transient, and the
#     pack is what that heat ends up in.
#   - `kOSThermalNotificationPressureLevelName`, macOS's own thermal pressure
#     level and the thing it decides to throttle from. 0 is nominal.
#
# The reading alone says little: 34 °C is meaningless without knowing it was 28
# an hour ago. The previous sample is stamped beside the swap counter, for the
# same reason and at the same cost — the refresh cadence is the interval.
check_thermal() {
    local stamp_file="$cache_dir/temperature" centi pressure now
    local last_centi='' last_at='' temp delta state fix='' detail trend

    centi="$(ioreg -rn AppleSmartBattery 2>/dev/null | awk -F'= ' '/"Temperature"/ {print $2; exit}')"
    pressure="$(notifyutil -g kOSThermalNotificationPressureLevelName 2>/dev/null | awk '{print $2}')"
    [[ $pressure =~ ^[0-9]+$ ]] || pressure=0
    printf -v now '%(%s)T' -1

    # A Mac without a battery reports no pack sensor. Pressure still does.
    if [[ ! $centi =~ ^[0-9]+$ ]]; then
        state=ok
        (( pressure > 0 )) && state=warn
        (( pressure >= 2 )) && state=crit
        [[ $state != ok ]] && fix='macOS is reporting thermal pressure. The Energy row names the process holding the CPU.'
        emit thermal "Temperature" "$state" "pressure ${pressure}" "no battery sensor on this machine" "$fix"
        return
    fi

    temp="$(awk -v c="$centi" 'BEGIN { printf "%.1f", c / 100 }')"

    [[ -f $stamp_file ]] && read -r last_centi last_at < "$stamp_file" 2>/dev/null
    printf '%s %s\n' "$centi" "$now" > "$stamp_file"

    if [[ $last_centi =~ ^[0-9]+$ && $last_at =~ ^[0-9]+$ ]] && (( now > last_at )); then
        delta="$(awk -v a="$centi" -v b="$last_centi" 'BEGIN { printf "%+.1f", (a - b) / 100 }')"
        # ±0.5 °C is the pack drifting, not a trend worth a sentence.
        if awk -v d="$delta" 'BEGIN { exit !(d < 0.5 && d > -0.5) }'; then
            trend="steady since $(date -r "$last_at" '+%H:%M' 2>/dev/null || printf 'the last check')"
        else
            trend="${delta} °C since $(date -r "$last_at" '+%H:%M' 2>/dev/null || printf 'the last check')"
        fi
    else
        trend="no earlier sample to compare"
    fi

    state=ok
    awk -v t="$temp" 'BEGIN { exit !(t >= 40) }' && state=warn
    awk -v t="$temp" 'BEGIN { exit !(t >= 45) }' && state=crit
    (( pressure > 0 )) && state=warn
    (( pressure >= 2 )) && state=crit

    detail="${trend} · pressure $( ((pressure == 0)) && printf 'nominal' || printf 'level %s' "$pressure" )"
    [[ $state != ok ]] && fix='Heat follows sustained CPU, so the Energy and Top memory rows name the cause before the fans do. A battery pack this warm has usually been fed by one process for a while.'
    emit thermal "Temperature" "$state" "${temp} °C battery" "$detail" "$fix"
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

# What a process is, said in the words its owner would use. Matching is on the
# full command line, not the executable, because every process worth naming here
# hides behind a generic one: Intelephense's language server is a
# `Code Helper (Plugin)`, and so is every other VS Code extension host.
hog_name() {
    case "$1" in
        *intelephense*) printf 'Intelephense' ;;
        *'Code Helper (Plugin)'*) printf 'VS Code extensions' ;;
        *'Code Helper (Renderer)'*) printf 'VS Code window' ;;
        *'Visual Studio Code'*) printf 'VS Code' ;;
        *'Google Chrome Helper (Renderer)'*) printf 'Chrome tab' ;;
        *'Google Chrome'*) printf 'Chrome' ;;
        */claude) printf 'claude CLI' ;;
        *Slack*) printf 'Slack' ;;
        *'GitHub Desktop'*) printf 'GitHub Desktop' ;;
        *Docker*|*com.docker*) printf 'Docker' ;;
        *WindowServer*) printf 'WindowServer' ;;
        *mysqld*|*mariadbd*) printf 'MySQL' ;;
        *postgres*) printf 'Postgres' ;;
        *) printf '%s' "$(basename "${1%% *}")" ;;
    esac
}

# The one thing to do about it. Advice is only given where it is specific enough
# to act on without further diagnosis; anything else says so rather than filling
# the row with a guess.
hog_fix() {
    case "$1" in
        *intelephense*)
            printf '%s' 'Intelephense holds the whole PHP symbol index in memory, so its size is set by how many files it was told to index. Check intelephense.files.exclude covers nested vendor trees (nova-components/*/vendor), then Developer: Restart Extension Host to drop the heap.' ;;
        *'Code Helper (Plugin)'*)
            printf '%s' 'A VS Code extension host. Each open window runs its own, so closing windows you are not using frees a whole set. Developer: Restart Extension Host reclaims a leaked one without losing the window.' ;;
        *'Code Helper (Renderer)'*|*'Visual Studio Code'*)
            printf '%s' 'A VS Code window. Close the ones you are not using — each carries its own renderer, extension host and language servers.' ;;
        *'Google Chrome'*)
            printf '%s' 'A Chrome renderer, which is one tab or a group of same-site tabs. Close it, or turn on Memory Saver to let Chrome discard idle tabs itself.' ;;
        */claude)
            printf '%s' 'A claude CLI session holding its conversation. Sessions do not exit on their own — /exit the ones you have finished with.' ;;
        *Slack*|*'GitHub Desktop'*)
            printf '%s' 'An Electron app that grows the longer it runs. Quitting and reopening it costs nothing and returns the memory.' ;;
        *WindowServer*)
            printf '%s' 'WindowServer grows with the number of windows and displays, and with animated wallpapers. It cannot be killed safely; log out to reset it.' ;;
        *mysqld*|*mariadbd*)
            printf '%s' 'MySQL sizes its per-connection buffers and performance_schema from max_connections, so a server configured for a production connection count holds that much on a laptop whether or not anything is connected. Check max_connections in /opt/homebrew/etc/my.cnf, or stop the service between projects with brew services stop mysql.' ;;
        *postgres*)
            printf '%s' 'Postgres holds shared_buffers plus one backend per connection. If it is the largest process here, look at shared_buffers in postgresql.conf before anything else.' ;;
        *)
            printf '%s' 'No specific advice for this one — check Activity Monitor before killing it.' ;;
    esac
}

# Every process with the memory it is actually charged for, biggest first, as
# "<MB>\t<pid>\t<full command line>".
#
# `ps` reports RSS, and on macOS that is not what the machine is charged: mysqld
# shows 36 MB there and 935 MB in Activity Monitor, so a check built on RSS ranked
# it 40th and never mentioned it. `top`'s MEM column is the physical footprint —
# dirty plus compressed — which is both the true cost and the number the user sees
# in Activity Monitor. One sample is enough; unlike CPU, memory needs no interval.
#
# The footprint has to be joined back to `ps` by pid because `top` truncates its
# command column to the terminal width, and every process worth naming here is one
# that hides behind a generic executable: "Code Helper (Ren" is not enough to tell
# Intelephense from any other extension host.
memory_by_process() {
    awk '
        # top pass: MEM is 935M, 2.1G or 4672K, sometimes with a +/- change marker.
        NR == FNR {
            if ($1 !~ /^[0-9]+$/) next
            value = $2
            sub(/[+-]$/, "", value)
            unit = substr(value, length(value), 1)
            number = value + 0
            footprint[$1] = (unit == "G") ? number * 1024 : (unit == "K") ? number / 1024 : number
            next
        }
        # ps pass: keep the command line whole, spaces and all.
        {
            pid = $1
            sub(/^[ ]*[0-9]+[ ]+/, "", $0)
            if (pid in footprint) printf "%d\t%s\t%s\n", footprint[pid], pid, $0
        }' \
        <(top -l 1 -o mem -stats pid,mem -n 200 2>/dev/null) \
        <(ps -Ao pid=,command= 2>/dev/null) |
        sort -rn
}

# The heaviest process on the machine, plus where the rest of the memory went.
# The Memory row says how much is left; this says who has it.
#
# Thresholds are a share of physical RAM rather than a fixed size, so the same
# check means the same thing on a 16 GB laptop as on a 64 GB one. The state is set
# by the single largest process: a footprint is per-process and does not
# double-count, but summing across an application still can, so the per-app totals
# below are reported as orientation rather than used as the trigger.
check_hogs() {
    local total_mb snapshot top_mb top_pid top_cmd name pct state fix='' detail

    total_mb=$(( $(sysctl -n hw.memsize 2>/dev/null || printf '0') / 1048576 ))
    (( total_mb > 0 )) || { emit hogs "Top memory" ok "unknown" "could not read physical memory size" ""; return; }

    snapshot="$(memory_by_process)"
    IFS=$'\t' read -r top_mb top_pid top_cmd <<< "$(head -1 <<< "$snapshot")"
    [[ $top_mb =~ ^[0-9]+$ && $top_pid =~ ^[0-9]+$ ]] || { emit hogs "Top memory" ok "unknown" "no per-process memory reported" ""; return; }

    name="$(hog_name "$top_cmd")"
    pct=$(( top_mb * 100 / total_mb ))

    detail="$(
        awk -F'\t' '
            { mb = $1; $0 = $3 }
            /Visual Studio Code/ { app = "VS Code" }
            !app && /Google Chrome/ { app = "Chrome" }
            !app && /(^|\/)claude( |$)/ { app = "claude" }
            !app && /Slack/ { app = "Slack" }
            !app && /GitHub Desktop/ { app = "GitHub Desktop" }
            !app && /(^|\/)(mysqld|mariadbd)( |$)/ { app = "MySQL" }
            !app && /(^|\/)postgres( |:|$)/ { app = "Postgres" }
            !app && /Docker/ { app = "Docker" }
            { if (app) total[app] += mb; app = "" }
            # Size first and tab-separated: every name here can contain a space, so
            # sorting or printing on whitespace fields would split "VS Code" in two.
            # GB past a gigabyte, because "2.6 GB" is read at a glance where
            # "2637 MB" has to be converted, and three of these share one row.
            END {
                for (a in total) {
                    mb = int(total[a])
                    printf "%d\t%s\t%s\n", mb, a, (mb >= 1024 ? sprintf("%.1f GB", mb / 1024) : sprintf("%d MB", mb))
                }
            }' <<< "$snapshot" |
            sort -rn | head -3 |
            awk -F'\t' '{ printf "%s%s %s", (NR > 1 ? " · " : ""), $2, $3 } END { print "" }'
    )"
    [[ -n $detail ]] || detail="no tracked application is holding memory"

    state=ok
    (( pct >= 10 )) && state=warn
    (( pct >= 18 )) && state=crit
    [[ $state != ok ]] && fix="$(hog_fix "$top_cmd")"
    emit hogs "Top memory" "$state" \
        "$(awk -v n="$name" -v mb="$top_mb" 'BEGIN { printf "%s %s", n, (mb >= 1024 ? sprintf("%.1f GB", mb / 1024) : sprintf("%d MB", mb)) }')" \
        "$detail" "$fix"
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

check_ids() { printf '%s\n' disk memory hogs swap load thermal energy processes; }

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
    local colour icon room shown pad

    colour="$(state_colour "$state")"
    icon="$(state_icon "$state")"

    case "$state" in
        running) printf '  %s%s%s %-11s %s%s%s\n' "$accent_sgr" "$icon_busy" "$reset" "$label" "$dim" "checking…" "$reset"; return ;;
        pending) printf '  %s%s %-11s %s%s\n' "$dim" '·' "$label" "waiting" "$reset"; return ;;
    esac

    # The value column is clipped to its 24; the detail has to be clipped too, to
    # whatever is left. A row that overruns does not simply look untidy — it wraps,
    # every wrapped row costs a line, and the footer slides off the bottom of a
    # popup sized for one line per check. 41 is the fixed prefix: two spaces, the
    # icon, a space, the label column, a space, the value column, a space.
    room=$(( width - 42 ))
    (( room < 12 )) && room=12

    # `printf %-24s` pads to a width counted in BYTES. "30.8 °C battery" is fifteen
    # columns on screen and sixteen bytes in memory, so the temperature row was
    # padded one short and its detail stopped lining up with every other row.
    # `${#var}` counts characters in a UTF-8 locale, so the padding is measured
    # rather than declared — and the same substring form already clips both fields.
    shown="${value:0:24}"
    pad=$(( 24 - ${#shown} ))
    (( pad < 0 )) && pad=0

    printf '  %s%s%s %-11s %s%*s %s%s%s\n' \
        "$colour" "$icon" "$reset" "$label" "$shown" "$pad" '' "$dim" "${detail:0:room}" "$reset"
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
        hogs) printf 'Top memory' ;;
        swap) printf 'Swap' ;;
        load) printf 'CPU load' ;;
        thermal) printf 'Temperature' ;;
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
