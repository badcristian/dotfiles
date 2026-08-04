#!/bin/bash

set -euo pipefail

spell_dir="$HOME/.config/nvim/spell"
romanian_dictionary="$spell_dir/ro.utf-8.spl"

mkdir -p "$spell_dir"

if [[ ! -s "$romanian_dictionary" ]]; then
    curl -fL "https://ftp.nluug.nl/pub/vim/runtime/spell/ro.utf-8.spl" -o "$romanian_dictionary"
fi
