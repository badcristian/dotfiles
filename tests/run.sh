#!/usr/bin/env bash

# Run the Neovim test suites.
#
# Always --headless, never --embed. An --embed instance speaks msgpack-rpc over
# stdio and waits for a UI to attach; if whatever launched it goes away, the
# process is reparented to init and runs forever, unreachable. Six of those
# accumulated here over five days holding 190 MB before anyone noticed, because
# the workspace test needs real windows and --embed looks like the way to get
# them. It is not: headless Neovim has windows and buffers too.
#
# Each file also gets a wall-clock limit, so a test that waits for input is
# killed rather than left behind.

set -uo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
time_limit="${TEST_TIME_LIMIT:-60}"
status=0

run_bounded() {
    local limit="$1"
    shift

    "$@" &
    local test_pid=$!
    local waited=0

    while kill -0 "$test_pid" 2>/dev/null; do
        if (( waited >= limit )); then
            kill -9 "$test_pid" 2>/dev/null
            wait "$test_pid" 2>/dev/null
            return 124
        fi
        sleep 1
        waited=$((waited + 1))
    done

    wait "$test_pid"
}

for test_file in "$repository"/tests/*-test.lua; do
    [[ -e $test_file ]] || continue
    printf '%s ... ' "$(basename "$test_file")"

    output="$(run_bounded "$time_limit" \
        nvim --headless -n -i NONE \
            -c "luafile $test_file" \
            -c 'qa!' 2>&1)"
    result=$?

    if (( result == 0 )); then
        printf 'passed\n'
    elif (( result == 124 )); then
        printf 'TIMED OUT after %ss (killed)\n' "$time_limit"
        status=1
    else
        printf 'FAILED\n'
        printf '%s\n' "$output" | sed 's/^/    /'
        status=1
    fi
done

# Nothing this script starts may outlive it.
strays="$(pgrep -f 'nvim .*-test\.lua' 2>/dev/null | wc -l | tr -d ' ')"
if (( strays > 0 )); then
    printf 'warning: %s stray nvim process(es) left behind; killing\n' "$strays" >&2
    pkill -f 'nvim .*-test\.lua' 2>/dev/null
    status=1
fi

exit "$status"
