#!/usr/bin/env bash

set -euo pipefail

normalize_remote_url() {
    local remote="${1:-}"
    local authority
    local host
    local path
    local without_scheme

    remote="${remote%%\#*}"
    remote="${remote%%\?*}"
    remote="${remote%/}"

    case "$remote" in
        http://* | https://*)
            without_scheme="${remote#*://}"
            authority="${without_scheme%%/*}"
            authority="${authority##*@}"
            host="${authority%%:*}"
            path="${without_scheme#*/}"
            ;;
        ssh://*)
            without_scheme="${remote#ssh://}"
            authority="${without_scheme%%/*}"
            authority="${authority##*@}"
            host="${authority%%:*}"
            path="${without_scheme#*/}"
            ;;
        *@*:*)
            host="${remote#*@}"
            host="${host%%:*}"
            path="${remote#*:}"
            ;;
        *)
            return 1
            ;;
    esac

    path="${path#/}"
    path="${path%/}"
    path="${path%.git}"

    [[ -n $host && $path == */* ]] || return 1
    printf 'https://%s/%s\n' "$host" "$path"
}

repo_url_for_path() {
    local project_path="${1:-}"
    local repo_root
    local remote
    local remote_name

    [[ -d $project_path ]] || return 1
    repo_root="$(git -C "$project_path" rev-parse --show-toplevel 2>/dev/null)" || return 1

    if remote="$(git -C "$repo_root" remote get-url origin 2>/dev/null)"; then
        :
    else
        remote_name="$(git -C "$repo_root" remote 2>/dev/null | /usr/bin/head -1)"
        [[ -n $remote_name ]] || return 1
        remote="$(git -C "$repo_root" remote get-url "$remote_name" 2>/dev/null)" || return 1
    fi

    normalize_remote_url "$remote"
}

open_repo_for_path() {
    local project_path="${1:-}"
    local repo_url

    repo_url="$(repo_url_for_path "$project_path")" || return 1
    /usr/bin/open "$repo_url"
}

case "${1:-}" in
    normalize)
        normalize_remote_url "${2:-}"
        ;;
    url)
        repo_url_for_path "${2:-}"
        ;;
    open)
        open_repo_for_path "${2:-}"
        ;;
    *)
        printf 'Usage: %s {normalize <remote>|url <project-path>|open <project-path>}\n' "$0" >&2
        exit 2
        ;;
esac
