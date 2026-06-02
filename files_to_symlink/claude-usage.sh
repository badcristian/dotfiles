#!/bin/bash

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RESET='\033[0m'
BOLD='\033[1m'

# Spinner
spinner() {
  local pid=$1
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r${CYAN}${frames[$i]}${RESET} Fetching Claude usage..."
    i=$(( (i+1) % ${#frames[@]} ))
    sleep 0.1
  done
  printf "\r\033[K"
}

TMPFILE=$(mktemp)

expect -c '
  log_user 1
  set timeout 15
  spawn claude
  expect "❯"
  send "/usage\r"
  expect "Esc to cancel"
  send "\033"
  expect "❯"
  send "/exit\r"
  expect eof
' 2>/dev/null > "$TMPFILE" &

BG_PID=$!
spinner $BG_PID
wait $BG_PID

# Extract the relevant lines, strip ANSI codes
OUTPUT=$(cat "$TMPFILE" | \
  sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | \
  sed 's/\r//g' | \
  grep -E "(Current session|Current week|Extra usage|used|spent|Resets|████)" | \
  grep -v "^$")

rm -f "$TMPFILE"

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Claude Code Usage${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "$OUTPUT"
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
