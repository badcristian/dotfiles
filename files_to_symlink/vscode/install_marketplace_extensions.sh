#!/bin/bash
set -euo pipefail

EXTENSIONS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/marketplace_extensions.txt"

if ! command -v code >/dev/null 2>&1; then
  echo "VS Code command line tool 'code' is not installed."
  echo "In VS Code, run: Shell Command: Install 'code' command in PATH"
  exit 1
fi

while IFS= read -r extension; do
  if [ -z "$extension" ] || [[ "$extension" == \#* ]]; then
    continue
  fi

  code --install-extension "$extension"
done < "$EXTENSIONS_FILE"

echo "Marketplace VS Code extensions installed."
