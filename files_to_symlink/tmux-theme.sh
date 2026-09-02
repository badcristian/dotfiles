#!/usr/bin/env bash
#
# Picks the Ghostty colour theme from a tmux popup.
#
# Ghostty has no runtime theme command, so the switch works the same way the
# moving background does: this script owns a generated `theme.ghostty` that the
# main config pulls in with `config-file = ?theme.ghostty`, rewrites it, then
# asks the running app to reload its configuration.
#
# Themes come from two places and are listed together: the ~463 that ship inside
# Ghostty.app, and the ones in ~/.config/ghostty/themes that
# ghostty/fetch-terminalcolors-themes.sh pulled from terminalcolors.com.
#
# The dark and light slots are stored separately, because the main config uses
# Ghostty's `theme = dark:...,light:...` form and follows the macOS appearance.

set -euo pipefail

state_root="${TMUX_THEME_STATE_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/tmux-ui}"
state_file="$state_root/ghostty-theme"
ghostty_config_dir="${TMUX_THEME_GHOSTTY_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/ghostty}"
ghostty_override="$ghostty_config_dir/theme.ghostty"
local_themes_dir="$ghostty_config_dir/themes"
bundle_themes_dir="${GHOSTTY_RESOURCES_DIR:-/Applications/Ghostty.app/Contents/Resources/ghostty}/themes"
stars_overlay="$ghostty_config_dir/stars-overlay.conf"
background_state="$state_root/moving-background"
no_reload="${TMUX_THEME_NO_RELOAD:-0}"

# Written by apply() when the moving background is on, and excluded from the
# picker so it never shows up as something to choose.
generated_theme="starfield-active"

default_dark="Catppuccin Macchiato"
default_light="Catppuccin Latte"

dark="$default_dark"
light="$default_light"

load_state() {
    local key
    local value

    dark="$default_dark"
    light="$default_light"

    if [[ -f $state_file ]]; then
        while IFS='=' read -r key value; do
            case "$key" in
                dark) dark="$value" ;;
                light) light="$value" ;;
            esac
        done < "$state_file"
    fi

    [[ -n $dark ]] || dark="$default_dark"
    [[ -n $light ]] || light="$default_light"
}

save_state() {
    local temporary_file

    mkdir -p "$state_root"
    temporary_file="$(mktemp "$state_root/ghostty-theme.XXXXXX")"
    printf 'dark=%s\nlight=%s\n' "$dark" "$light" > "$temporary_file"
    mv "$temporary_file" "$state_file"
}

# Ghostty resolves a theme name against ~/.config/ghostty/themes first and the
# bundled themes second, so look them up in that order.
theme_file() {
    local name="$1"
    local directory

    for directory in "$local_themes_dir" "$bundle_themes_dir"; do
        [[ -d $directory ]] || continue
        if [[ -f "$directory/$name" ]]; then
            printf '%s' "$directory/$name"
            return 0
        fi
    done

    return 1
}

list_themes() {
    local directory

    for directory in "$local_themes_dir" "$bundle_themes_dir"; do
        [[ -d $directory ]] || continue
        # -L so the dotfiles themes, which are symlinks, still count as files.
        find -L "$directory" -maxdepth 1 -type f -exec basename {} \;
    done | grep -vxF "$generated_theme" | sort -uf
}

is_dark_appearance() {
    [[ "$(defaults read -g AppleInterfaceStyle 2>/dev/null || printf 'Light')" == "Dark" ]]
}

# --- preview -----------------------------------------------------------------

hex_to_ansi() {
    local hex="${1#\#}"

    printf '%d;%d;%d' "0x${hex:0:2}" "0x${hex:2:2}" "0x${hex:4:2}"
}

swatch() {
    local name="$1"
    local file
    local key
    local value
    local index
    local background=""
    local foreground=""
    local -a palette=()

    file="$(theme_file "$name")" || {
        printf 'No theme file for %s\n' "$name"
        return 0
    }

    while IFS= read -r line; do
        key="${line%%=*}"
        key="${key// /}"
        value="${line#*=}"
        value="${value// /}"
        case "$key" in
            background) background="$value" ;;
            foreground) foreground="$value" ;;
            palette)
                index="${value%%=*}"
                palette[$index]="${value#*=}"
                ;;
        esac
    done < <(grep -E '^[[:space:]]*(background|foreground|palette)[[:space:]]*=' "$file")

    [[ -n $background ]] || background="#000000"
    [[ -n $foreground ]] || foreground="#ffffff"

    printf '\n  \033[1m%s\033[0m\n\n' "$name"

    # Two rows of eight, normal colours above their bright counterparts.
    local row
    local column
    for row in 0 8; do
        printf '  '
        for column in 0 1 2 3 4 5 6 7; do
            printf '\033[48;2;%sm    \033[0m' "$(hex_to_ansi "${palette[$((row + column))]:-$foreground}")"
        done
        printf '\n'
    done

    printf '\n'
    printf '  \033[48;2;%s;38;2;%sm %-30s\033[0m\n' \
        "$(hex_to_ansi "$background")" "$(hex_to_ansi "$foreground")" "$ $(basename "$PWD") git status"
    printf '  \033[48;2;%s;38;2;%sm %-30s\033[0m\n' \
        "$(hex_to_ansi "$background")" "$(hex_to_ansi "${palette[2]:-$foreground}")" "On branch main"
    printf '  \033[48;2;%s;38;2;%sm %-30s\033[0m\n' \
        "$(hex_to_ansi "$background")" "$(hex_to_ansi "${palette[1]:-$foreground}")" "modified:   ghostty.config"
    printf '  \033[48;2;%s;38;2;%sm %-30s\033[0m\n' \
        "$(hex_to_ansi "$background")" "$(hex_to_ansi "${palette[4]:-$foreground}")" "untracked:  tmux-theme.sh"
    printf '  \033[48;2;%sm %-30s\033[0m\n' "$(hex_to_ansi "$background")" ""

    printf '\n  bg %s   fg %s\n' "$background" "$foreground"
}

# --- applying ----------------------------------------------------------------

# The moving background is dark-only, so only the dark slot gets wrapped. The
# wrapper is a real theme file - the selected palette followed by the shader and
# background-image lines - which is why the stars now work with any theme.
render_starfield() {
    local source_file
    local temporary_file

    source_file="$(theme_file "$dark")" || return 1
    [[ -f $stars_overlay ]] || return 1

    mkdir -p "$local_themes_dir"
    temporary_file="$(mktemp "$local_themes_dir/$generated_theme.XXXXXX")"
    {
        printf '# Generated by tmux-theme.sh from "%s"; edit through the tmux popup.\n' "$dark"
        cat "$source_file"
        printf '\n'
        cat "$stars_overlay"
    } > "$temporary_file"
    chmod 0644 "$temporary_file"
    mv "$temporary_file" "$local_themes_dir/$generated_theme"
}

moving_background_enabled() {
    local key
    local value

    [[ -f $background_state ]] || return 0
    while IFS='=' read -r key value; do
        [[ $key == "enabled" ]] && [[ $value == "off" ]] && return 1
    done < "$background_state"

    return 0
}

write_ghostty_override() {
    local dark_theme="$dark"
    local temporary_file

    if moving_background_enabled && render_starfield; then
        dark_theme="$generated_theme"
    else
        # Nothing references it now, and leaving it behind would make the next
        # `ghostty +list-themes` advertise a stale palette.
        rm -f "$local_themes_dir/$generated_theme"
    fi

    mkdir -p "$ghostty_config_dir"
    temporary_file="$(mktemp "$ghostty_config_dir/theme.ghostty.XXXXXX")"
    printf '# Generated by tmux-theme.sh; edit through the tmux popup.\n' > "$temporary_file"
    printf 'theme = dark:%s,light:%s\n' "$dark_theme" "$light" >> "$temporary_file"
    mv "$temporary_file" "$ghostty_override"
}

reload_ghostty() {
    local hs_bin

    [[ $no_reload == "1" ]] && return 0
    hs_bin="$(command -v hs 2>/dev/null || true)"
    if [[ -n $hs_bin ]]; then
        "$hs_bin" -c \
            'local app=hs.application.get("com.mitchellh.ghostty"); return not app or app:selectMenuItem("Reload Configuration")' \
            >/dev/null 2>&1 || true
    fi
}

apply_settings() {
    save_state
    write_ghostty_override
    reload_ghostty
}

set_slot() {
    local slot="$1"
    local name="$2"

    theme_file "$name" >/dev/null || return 2
    case "$slot" in
        dark) dark="$name" ;;
        light) light="$name" ;;
        *) return 2 ;;
    esac
}

# --- picker ------------------------------------------------------------------

# Which theme each slot holds, with an arrow on the one the window is currently
# drawing. Ghostty picks the slot from the macOS appearance, not from how dark
# the palette looks, so a pale theme parked in the dark slot leaves the window
# white while macOS is still in dark mode - which reads as the picker editing
# something other than what is on screen.
slot_summary() {
    local appearance="$1"
    local dark_marker=" "
    local light_marker=" "

    [[ $appearance == "dark" ]] && dark_marker="→" || light_marker="→"
    printf '%s dark:  %s\n%s light: %s' \
        "$dark_marker" "$dark" "$light_marker" "$light"
}

picker() {
    local slot="${1:-}"
    local appearance
    local themes
    local other_slot
    local current
    local position
    local apply_binding
    local header
    local result

    load_state
    appearance="light"
    is_dark_appearance && appearance="dark"
    # Default to the slot that is actually on screen, since that is the one the
    # eye is asking about.
    [[ -n $slot ]] || slot="$appearance"

    themes="$(list_themes)"

    while true; do
        [[ $slot == "dark" ]] && other_slot="light" || other_slot="dark"
        [[ $slot == "dark" ]] && current="$dark" || current="$light"

        # Start on the theme already in use rather than pre-filling the query
        # with its name, which would hide every other theme behind a backspace.
        position="$(printf '%s\n' "$themes" | grep -nxF "$current" | cut -d: -f1 | head -1 || true)"
        [[ -n $position ]] || position=1

        # Enter applies without accepting, so the popup stays up and the next
        # theme is one keypress away - comparing two themes is Enter, arrow,
        # Enter rather than reopening the picker each time. Nothing is written
        # until Enter, so Esc leaves whichever theme was last applied, which is
        # also the one on screen.
        #
        # execute-silent blocks fzf until the command returns, which is fine
        # here: rewriting the override and driving Ghostty's Reload
        # Configuration through Hammerspoon measures 20-30ms.
        printf -v apply_binding 'execute-silent(bash %q set %s {})' \
            "${BASH_SOURCE[0]}" "$slot"

        # Naming both slots on the second line is the whole point of the header.
        # A light-looking theme parked in the dark slot leaves the window white
        # while macOS is still in dark mode, and without this the picker looks
        # like it is editing something other than what is on screen.
        # The prompt carries which slot is being edited, so the header can spend
        # its width on the keys and on naming both slots without truncating.
        printf -v header 'Enter apply · Tab switch slot · Esc close\n%s' \
            "$(slot_summary "$appearance")"

        # Enter is bound to apply, so the only key that accepts is Tab, which
        # comes back here to reopen against the other slot.
        result="$(
            fzf \
                --ansi \
                --layout=reverse \
                --border=none \
                --no-multi \
                --info=inline \
                --sync \
                --expect=tab \
                --prompt="$slot theme › " \
                --header="$header" \
                --bind="start:pos($position)" \
                --bind="enter:$apply_binding" \
                --bind="double-click:$apply_binding" \
                --preview="bash ${BASH_SOURCE[0]@Q} swatch {}" \
                --preview-window='right,40,border-left' \
                <<< "$themes"
        )" || return 0

        [[ ${result%%$'\n'*} == "tab" ]] || return 0
        slot="$other_slot"
        # Re-read, so the summary reflects whatever the last Enter applied.
        load_state
    done
}

case "${1:-}" in
    ensure)
        load_state
        save_state
        write_ghostty_override
        ;;
    apply)
        load_state
        apply_settings
        ;;
    set)
        load_state
        if ! set_slot "${2:-}" "${3:-}"; then
            printf 'Unknown theme slot or name: %s %s\n' "${2:-}" "${3:-}" >&2
            exit 2
        fi
        apply_settings
        ;;
    show)
        load_state
        printf 'dark=%s\nlight=%s\n' "$dark" "$light"
        appearance="light"
        is_dark_appearance && appearance="dark"
        printf '%s\n' "$(slot_summary "$appearance")"
        ;;
    list)
        list_themes
        ;;
    swatch)
        swatch "${2:-}"
        ;;
    picker)
        picker "${2:-}"
        ;;
    *)
        printf 'Usage: %s {ensure|apply|set dark|light NAME|show|list|swatch NAME|picker [dark|light]}\n' "$0" >&2
        exit 2
        ;;
esac
