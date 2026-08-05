#!/usr/bin/env bash

# Add paths to the Spotlight privacy list, the same list System Settings writes.
#
# There is no supported CLI for this. `mdutil -i off` only accepts volumes and
# answers "invalid operation" for a directory, and a `.metadata_never_index`
# marker file was tested here and did not stop indexing: a probe under it was
# picked up in 2s against a 3s control. Editing VolumeConfiguration.plist is
# what the Settings pane itself does, so that is what this does — with a backup
# and a rollback, because a corrupt plist means a full Spotlight rebuild.
#
# Run with sudo. Paths default to the ones carrying almost the entire index
# while holding nothing a person would ever search for by name.

set -uo pipefail

plist='/System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist'

if [[ $EUID -ne 0 ]]; then
    printf 'Run with sudo: sudo bash %s\n' "$0" >&2
    exit 1
fi

home="$(eval echo "~${SUDO_USER:-$USER}")"

paths=("$@")
if [[ ${#paths[@]} -eq 0 ]]; then
    paths=(
        "$home/Library/Application Support"
        "$home/Library/Logs"
        "$home/Library/Containers"
        "$home/Library/Developer"
    )
fi

if [[ ! -f $plist ]]; then
    printf 'Spotlight configuration not found: %s\n' "$plist" >&2
    exit 1
fi

backup="/tmp/VolumeConfiguration.$(date +%Y%m%d-%H%M%S).plist"
cp "$plist" "$backup" || { printf 'Could not back up the plist\n' >&2; exit 1; }
printf 'Backup: %s\n\n' "$backup"

restore() {
    printf '\nRestoring the backup.\n' >&2
    cp "$backup" "$plist"
    exit 1
}

# Exclusions may not exist yet on a machine that has never had one.
if ! plutil -extract Exclusions raw -o - "$plist" >/dev/null 2>&1; then
    plutil -insert Exclusions -array "$plist" || restore
fi

added=0
for path in "${paths[@]}"; do
    if [[ ! -d $path ]]; then
        printf '  skip     %s (not a directory)\n' "$path"
        continue
    fi
    if plutil -extract Exclusions json -o - "$plist" 2>/dev/null | grep -qF "\"$path\""; then
        printf '  already  %s\n' "$path"
        continue
    fi
    if plutil -insert Exclusions.0 -string "$path" "$plist" 2>/dev/null; then
        printf '  added    %s\n' "$path"
        added=$((added + 1))
    else
        printf '  FAILED   %s\n' "$path" >&2
        restore
    fi
done

plutil -lint "$plist" >/dev/null 2>&1 || restore

if (( added == 0 )); then
    printf '\nNothing to change.\n'
    exit 0
fi

printf '\nExclusion list now:\n'
plutil -extract Exclusions json -o - "$plist" 2>/dev/null |
    tr ',' '\n' | tr -d '[]"' | sed '/^$/d' | sed 's/^/  /'

# The running metadata server holds the old list in memory.
printf '\nRestarting the metadata server…\n'
launchctl kickstart -k system/com.apple.metadata.mds 2>/dev/null ||
    killall mds 2>/dev/null || true

printf 'Done. Verify with:  mdfind -onlyin "%s" "kMDItemFSSize > 0" | wc -l\n' "${paths[0]}"
