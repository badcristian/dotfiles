#!/usr/bin/env bash
#
# Refreshes files_to_symlink/ghostty/themes/ from terminalcolors.com.
#
# Ghostty already bundles ~463 themes inside the app, so this only downloads the
# schemes the bundle is missing - Noctis, Nightfly, Panda, most of Zenbones and
# so on. Anything whose name already exists in the bundle is skipped rather than
# shadowed, so `theme = Gruvbox Dark` keeps meaning Ghostty's own Gruvbox.
#
# Run it by hand when the site adds schemes; the downloaded files are committed.

set -euo pipefail

site="https://terminalcolors.com"
themes_dir="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)/themes"
bundle_dir="${GHOSTTY_RESOURCES_DIR:-/Applications/Ghostty.app/Contents/Resources/ghostty}/themes"

# Families whose variants are already fully named on their own - `duckbones`,
# `zenwritten-dark` - so the family prefix would only stutter.
self_named_families="zenbones"

title_case() {
    local slug="$1"

    case "$slug" in
        github) printf 'GitHub' ;;
        rose-pine) printf 'Rosé Pine' ;;
        cobalt2) printf 'Cobalt2' ;;
        seoul256) printf 'Seoul256' ;;
        shades-of-purple) printf 'Shades of Purple' ;;
        *)
            # BSD sed has no \u, so capitalise each dash-separated word by hand.
            local word
            local separator=""
            local IFS='-'
            for word in $slug; do
                printf '%s%s%s' "$separator" \
                    "$(printf '%s' "${word:0:1}" | tr '[:lower:]' '[:upper:]')" \
                    "${word:1}"
                separator=" "
            done
            ;;
    esac
}

theme_name() {
    local family="$1"
    local variant="$2"

    if [[ $variant == "default" ]]; then
        title_case "$family"
        return
    fi
    if [[ " $self_named_families " == *" $family "* ]]; then
        title_case "$variant"
        return
    fi
    printf '%s %s' "$(title_case "$family")" "$(title_case "$variant")"
}

# The homepage links one page per variant, except for the six large families
# that collapse behind a family page.
theme_paths() {
    local family

    curl -fsSL "$site/" | grep -oE 'href="/themes/[a-z0-9-]+/[a-z0-9-]+/"'
    for family in github gruvbox nightfox noctis sonokai zenbones; do
        curl -fsSL "$site/themes/$family/" | grep -oE 'href="/themes/[a-z0-9-]+/[a-z0-9-]+/"'
    done
}

# Folds a display name down to letters and digits so the near-misses between the
# two catalogues still collide: "Rosé Pine" against "Rose Pine", "Tokyo Night
# Storm" against "TokyoNight Storm".
normalise() {
    printf '%s' "$1" |
        iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null |
        tr '[:upper:]' '[:lower:]' |
        tr -cd '[:alnum:]'
}

bundled=""
if [[ -d $bundle_dir ]]; then
    while IFS= read -r bundled_theme; do
        bundled="$bundled $(normalise "$(basename "$bundled_theme")")"
    done < <(find "$bundle_dir" -maxdepth 1 -type f)
fi

added=0
skipped=0
mkdir -p "$themes_dir"

while IFS=/ read -r _ _ family variant _; do
    [[ -n $variant ]] || continue
    name="$(theme_name "$family" "$variant")"

    if [[ " $bundled " == *" $(normalise "$name") "* ]]; then
        skipped=$((skipped + 1))
        continue
    fi

    if curl -fsSL "$site/downloads/ghostty/$family-$variant" -o "$themes_dir/$name.part"; then
        {
            printf '# %s, from %s/themes/%s/%s/\n' "$name" "$site" "$family" "$variant"
            cat "$themes_dir/$name.part"
        } > "$themes_dir/$name"
        rm -f "$themes_dir/$name.part"
        added=$((added + 1))
    else
        rm -f "$themes_dir/$name.part"
        printf 'Failed to download %s\n' "$name" >&2
    fi
done < <(theme_paths | sed 's/href="//;s/"//' | sort -u)

printf '%d themes downloaded, %d already bundled with Ghostty\n' "$added" "$skipped"
