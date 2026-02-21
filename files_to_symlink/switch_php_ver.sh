#!/usr/bin/env bash

# What changed and why:
# The old scripts were doing brew services stop/start and brew link/unlink on all versions — that's what broke everything. Now the script never touches services. Your four FPM daemons (7.4, 8.2, 8.3, 8.4) run permanently, managed by launchd, owned by Valet. You never stop or start them through this script.
# The only two things the script touches are:
# $PATH — tells the current terminal which php binary to use. Affects: php artisan, composer, anything you run in that terminal. Does not affect Valet, nginx, or any other terminal.
# brew link — updates the symlink at /opt/homebrew/bin/php. Affects: tools that resolve php via that path rather than $PATH — PhpStorm, some composer scripts, tools running outside your terminal session. Does not affect Valet (it uses sockets, not this symlink).
# ~/.php-version — written by the switch, read by precmd on every prompt in every tmux window. So other windows silently adopt the new version next time they show a prompt, without you having to do anything.
#
# What to do if FPM ever breaks again — don't touch it through this script. Use:
# bashsudo launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/homebrew.mxcl.php@8.X.plist
# sudo launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/homebrew.mxcl.php@8.X.plist
# # or simply:
# valet restart

php-switch() {
    local RED='\033[0;31m'   GREEN='\033[0;32m' YELLOW='\033[1;33m'
    local CYAN='\033[0;36m'  BOLD='\033[1m'     DIM='\033[2m'
    local RESET='\033[0m'    CHECK="✓"           CROSS="✗"  ARROW="➜"

    _step_done() { echo -e "  ${GREEN}${CHECK}${RESET}  $1"; }
    _step_fail() { echo -e "  ${RED}${CROSS}${RESET}  $1"; }
    _step_info() { echo -e "  ${CYAN}${ARROW}${RESET}  $1"; }

    # Scan installed versions
    local INSTALLED_VERSIONS
    INSTALLED_VERSIONS=($(ls /opt/homebrew/opt | grep '^php@' | sed 's/php@//'))

    if [[ ${#INSTALLED_VERSIONS[@]} -eq 0 ]]; then
        _step_fail "No PHP versions installed via Homebrew."
        return 1
    fi

    # Detect current CLI version
    local CURRENT_VERSION
    CURRENT_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null)

    # Resolve target version
    local VERSION
    if [[ $# -eq 0 ]]; then
        if ! command -v fzf &>/dev/null; then
            _step_fail "fzf not installed. Run: brew install fzf"
            return 1
        fi

        local SELECTED
        SELECTED=$(for v in "${INSTALLED_VERSIONS[@]}"; do
            [[ "$v" == "$CURRENT_VERSION" ]] \
                && printf '%s  ← current\n' "$v" \
                || printf '%s\n' "$v"
        done | fzf \
            --height=~50% \
            --prompt="  PHP version: " \
            --pointer="$ARROW" \
            --color="prompt:cyan,pointer:green,hl:yellow" \
            --ansi)

        [[ -z "$SELECTED" ]] && echo -e "${YELLOW}  Aborted.${RESET}" && return 1
        VERSION=$(echo "$SELECTED" | awk '{print $1}')
    else
        VERSION=$1
    fi

    # Validate
    if [[ ! -f "/opt/homebrew/opt/php@${VERSION}/bin/php" ]]; then
        _step_fail "PHP ${VERSION} is not installed."
        echo -e "${DIM}    Installed: ${INSTALLED_VERSIONS[*]}${RESET}"
        return 2
    fi

    if [[ "$VERSION" == "$CURRENT_VERSION" ]]; then
        _step_info "Already on PHP ${BOLD}${VERSION}${RESET}."
        return 0
    fi

    _step_info "Switching CLI PHP ${DIM}${CURRENT_VERSION}${RESET} ${ARROW} ${BOLD}${VERSION}${RESET}"
    echo ""

    # ── Action 1: update PATH for this shell session ──────────────────
    local CLEAN_PATH
    CLEAN_PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '/opt/homebrew/opt/php' | tr '\n' ':' | sed 's/:$//')
    export PATH="/opt/homebrew/opt/php@${VERSION}/bin:/opt/homebrew/opt/php@${VERSION}/sbin:${CLEAN_PATH}"
    _step_done "PATH updated → PHP ${VERSION}"

    # ── Action 2: update brew symlink ────────────────────────────────
    # So /opt/homebrew/bin/php, composer, IDE helpers resolve correctly
    brew link --force --overwrite "php@$VERSION" > /dev/null 2>&1
    _step_done "Brew symlink updated"

    # ── Action 3: persist version for new terminal windows ───────────
    echo "$VERSION" > "$HOME/.php-version"
    _step_done "Version persisted (~/.php-version)"

    echo ""
    echo -e "  ${GREEN}${CHECK} CLI switched${RESET} ${DIM}${CURRENT_VERSION}${RESET} ${ARROW} ${GREEN}${BOLD}${VERSION}${RESET}"
    echo -e "\n  ${DIM}$(php -v | head -1)${RESET}"
    echo -e "  ${DIM}Valet web requests unaffected — use 'valet use php@X.X' per site${RESET}\n"
}

php-switch "$@"
# php-switch() {
#     # ── Colours & symbols ────────────────────────────────────────────
#     local RED='\033[0;31m'
#     local GREEN='\033[0;32m'
#     local YELLOW='\033[1;33m'
#     local CYAN='\033[0;36m'
#     local BOLD='\033[1m'
#     local DIM='\033[2m'
#     local RESET='\033[0m'
#     local CHECK="✓"
#     local CROSS="✗"
#     local ARROW="➜"

#     # ── Spinner ───────────────────────────────────────────────────────
#     _spinner_pid=""
#     _start_spinner() {
#         local msg="$1"
#         local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
#         (
#             local i=0
#             while true; do
#                 printf "\r  ${CYAN}${frames[$i]}${RESET}  %s" "$msg"
#                 i=$(( (i + 1) % ${#frames[@]} ))
#                 sleep 0.08
#             done
#         ) &
#         _spinner_pid=$!
#     }
#     _stop_spinner() {
#         if [[ -n "$_spinner_pid" ]]; then
#             kill "$_spinner_pid" 2>/dev/null
#             wait "$_spinner_pid" 2>/dev/null
#             _spinner_pid=""
#             printf "\r\033[2K"
#         fi
#     }
#     # Print a completed step (clears spinner line, prints, spinner already stopped)
#     _step_done() {
#         echo -e "  ${GREEN}${CHECK}${RESET}  $1"
#     }
#     _step_info() {
#         echo -e "  ${CYAN}${ARROW}${RESET}  $1"
#     }

#     # ── Step 1: scan installed versions ──────────────────────────────
#     _start_spinner "Scanning installed PHP versions…"
#     local INSTALLED_VERSIONS
#     INSTALLED_VERSIONS=($(ls /opt/homebrew/opt | grep '^php@' | sed 's/php@//'))
#     _stop_spinner

#     if [[ ${#INSTALLED_VERSIONS[@]} -eq 0 ]]; then
#         echo -e "${RED}${CROSS} No PHP versions installed via Homebrew.${RESET}"
#         return 1
#     fi
#     _step_done "Found: ${INSTALLED_VERSIONS[*]}"

#     # ── Step 2: detect current version ───────────────────────────────
#     _start_spinner "Detecting active PHP version…"
#     local CURRENT_VERSION
#     CURRENT_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null)
#     _stop_spinner
#     _step_done "Active: PHP ${BOLD}${CURRENT_VERSION}${RESET}"

#     # ── Step 3: resolve target version ───────────────────────────────
#     local VERSION
#     if [[ $# -eq 0 ]]; then
#         if ! command -v fzf &>/dev/null; then
#             echo -e "${RED}${CROSS} fzf not installed. Pass a version as argument or: brew install fzf${RESET}"
#             return 1
#         fi

#         local FZF_LIST
#         FZF_LIST=$(for v in "${INSTALLED_VERSIONS[@]}"; do
#             [[ "$v" == "$CURRENT_VERSION" ]] && printf '%s  ← current\n' "$v" || printf '%s\n' "$v"
#         done)

#         local SELECTED
#         SELECTED=$(printf '%s\n' "$FZF_LIST" | fzf \
#             --height=~50% \
#             --prompt="  PHP version: " \
#             --pointer="$ARROW" \
#             --color="prompt:cyan,pointer:green,hl:yellow" \
#             --ansi)

#         [[ -z "$SELECTED" ]] && echo -e "${YELLOW}  Aborted.${RESET}" && return 1
#         VERSION=$(echo "$SELECTED" | awk '{print $1}')
#     else
#         VERSION=$1
#     fi

#     # ── Validate ──────────────────────────────────────────────────────
#     if [[ ! -f "/opt/homebrew/opt/php@${VERSION}/bin/php" ]]; then
#         echo -e "${RED}${CROSS} PHP ${VERSION} is not installed.${RESET}"
#         echo -e "${DIM}  Installed: ${INSTALLED_VERSIONS[*]}${RESET}"
#         return 2
#     fi

#     if [[ "$VERSION" == "$CURRENT_VERSION" ]]; then
#         echo -e "${CYAN}  Already on PHP ${BOLD}${VERSION}${RESET}${CYAN}.${RESET}"
#         return 0
#     fi

#     _step_info "Switching ${DIM}${CURRENT_VERSION}${RESET} ${ARROW} ${BOLD}${VERSION}${RESET}"
#     echo ""

#     # ── Step 4: check running services ───────────────────────────────
#     _start_spinner "Checking running services…"
#     local SERVICES_LIST
#     SERVICES_LIST=$(brew services list 2>/dev/null)
#     _stop_spinner

#     _is_running()     { echo "$SERVICES_LIST" | grep -q "^php@${1}[[:space:]].*started"; }
#     _is_root_service(){ echo "$SERVICES_LIST" | grep "^php@${1}[[:space:]]" | grep -q "root"; }

#     local RUNNING_VERSIONS=()
#     for v in "${INSTALLED_VERSIONS[@]}"; do
#         _is_running "$v" && RUNNING_VERSIONS+=("$v")
#     done

#     if [[ ${#RUNNING_VERSIONS[@]} -gt 0 ]]; then
#         _step_done "Running: ${RUNNING_VERSIONS[*]}"
#     else
#         _step_done "No PHP services currently running"
#     fi

#     # ── Step 5: sudo upfront if needed ───────────────────────────────
#     local NEEDS_SUDO=false
#     for v in "${INSTALLED_VERSIONS[@]}"; do
#         if _is_running "$v" && _is_root_service "$v"; then
#             NEEDS_SUDO=true
#             break
#         fi
#     done

#     if [[ "$NEEDS_SUDO" == true ]]; then
#         echo -e "  ${YELLOW}⚠${RESET}  Some services were started as root — sudo required:"
#         sudo -v || { echo -e "${RED}${CROSS} sudo authentication failed.${RESET}"; return 1; }
#         _step_done "sudo credentials cached"
#     fi

#     echo ""

#     # ── Step 6: unlink all (parallel) ────────────────────────────────
#     local ERRORS=""
#     _stop_service() {
#         local svc="$1"
#         local out code
#         out=$(brew services stop "$svc" 2>&1); code=$?
#         if [[ $code -ne 0 ]] && echo "$out" | grep -q "started as \`root\`"; then
#             out=$(sudo brew services stop "$svc" 2>&1); code=$?
#         fi
#         [[ $code -ne 0 ]] && echo "  stop ${svc}: ${out}"
#     }

#     _start_spinner "Unlinking all PHP versions…"
#     local unlink_pids=()
#     for v in "${INSTALLED_VERSIONS[@]}"; do
#         brew unlink "php@$v" > /dev/null 2>&1 &
#         unlink_pids+=($!)
#     done
#     for pid in "${unlink_pids[@]}"; do wait "$pid"; done
#     _stop_spinner
#     _step_done "Unlinked: ${INSTALLED_VERSIONS[*]}"

#     # ── Step 7: stop running services ────────────────────────────────
#     for v in "${RUNNING_VERSIONS[@]}"; do
#         _start_spinner "Stopping PHP ${v}…"
#         local err
#         err=$(_stop_service "php@$v")
#         _stop_spinner
#         if [[ -n "$err" ]]; then
#             ERRORS+="${err}\n"
#             echo -e "  ${YELLOW}⚠${RESET}  Could not stop PHP ${v} ${DIM}(see warnings below)${RESET}"
#         else
#             _step_done "Stopped PHP ${v}"
#         fi
#     done

#     # ── Step 8: link target ───────────────────────────────────────────
#     _start_spinner "Linking PHP ${VERSION}…"
#     local link_out
#     link_out=$(brew link --force --overwrite "php@$VERSION" 2>&1)
#     if [[ $? -ne 0 ]]; then
#         _stop_spinner
#         echo -e "${RED}${CROSS} Failed to link PHP ${VERSION}:${RESET}\n${DIM}${link_out}${RESET}"
#         return 3
#     fi
#     _stop_spinner
#     _step_done "Linked PHP ${VERSION}"

#     # ── Step 9: start target ──────────────────────────────────────────
#     _start_spinner "Starting PHP-FPM ${VERSION}…"
#     local start_out
#     start_out=$(brew services start "php@$VERSION" 2>&1)
#     if [[ $? -ne 0 ]]; then
#         if echo "$start_out" | grep -q "started as \`root\`"; then
#             start_out=$(sudo brew services start "php@$VERSION" 2>&1)
#         fi
#         if [[ $? -ne 0 ]]; then
#             _stop_spinner
#             echo -e "${RED}${CROSS} Failed to start PHP ${VERSION}:${RESET}\n${DIM}${start_out}${RESET}"
#             return 3
#         fi
#     fi
#     _stop_spinner
#     _step_done "Started PHP-FPM ${VERSION}"

#     # ── Done ──────────────────────────────────────────────────────────
#     echo ""
#     echo -e "  ${GREEN}${CHECK} Switched${RESET} ${DIM}${CURRENT_VERSION}${RESET} ${ARROW} ${GREEN}${BOLD}${VERSION}${RESET}"
#     echo -e "\n  ${DIM}$(php -v | head -1)${RESET}\n"

#     if [[ -n "$ERRORS" ]]; then
#         echo -e "${YELLOW}  ⚠ Non-fatal warnings:${RESET}"
#         echo -e "${DIM}${ERRORS}${RESET}"
#     fi
# }

# php-switch "$@"
