#!/usr/bin/env bash

# Searchable Vim keybinding reference. Rows are grouped by task so the list can
# be browsed top to bottom, and each description is phrased in the words someone
# would actually type to look it up, because fzf applies --with-nth before it
# matches: only the visible column is searchable, so a hidden synonym column
# would never be found.

set -u

ui_accent="${TMUX_UI_ACCENT:-4}"
accent_sgr="$(bash "$HOME/tmux-ui.sh" ansi-foreground "$ui_accent" 2>/dev/null || printf '')"
bold=$'\033[1m'
reset=$'\033[0m'

# Visible column, then the raw key sequence that Enter puts on the clipboard.
row() {
    local keys="$1"
    local description="$2"

    printf '  %s%-17s%s%s\t%s\n' \
        "$accent_sgr" "$keys" "$reset" "$description" "$keys"
}

section() {
    printf '%s%s%s %s%s\t\n' "$bold" "$accent_sgr" '▌' "$1" "$reset"
}

cheatsheet_rows() {
    section 'RECIPES — COPY AND PASTE TASKS'
    row 'ggVG"+y'   'Select all and copy the whole file to the system clipboard'
    row ':%y+'      'Select all and copy to the clipboard, as one command'
    row 'ggVGy'     'Select all and copy inside Vim only, not the clipboard'
    row 'V j j y'   'Select a few lines and copy them: V, then j to extend, then y'
    row '5yy'       'Select and copy 5 lines starting at the cursor'
    row 'V } y'     'Select from here to the end of the paragraph and copy'
    row 'Gp'        'Move to the bottom of the file and paste below the last line'
    row 'G"+p'      'Move to the bottom and paste the system clipboard below'
    row 'Go'        'Move to the bottom, open a new line, and start typing'
    row 'G"+gP'     'Move to the bottom, paste the clipboard, land after it'
    row 'yyp'       'Duplicate the current line: copy it and paste it below'
    row 'ddp'       'Move the current line down one'
    row 'ddkP'      'Move the current line up one'
    row 'V > '      'Select lines and indent them right; repeat with . or use 3>'
    row 'V "_dP'    'Paste over a selection and keep what you copied'
    row 'dG'        'Delete everything from the cursor to the bottom of the file'
    row ':%s/a/b/g' 'Find and replace every a with b in the whole file'

    section 'MODES'
    row 'Esc'       'Back to normal mode, where the keys below work; Ctrl-[ is the same'
    row 'i / a'     'Insert and start typing before / after the cursor'
    row 'I / A'     'Insert at the start / end of the current line'
    row 'o / O'     'Open a new line below / above and start typing'
    row 'v'         'Start selecting character by character'
    row 'V'         'Start selecting whole lines'
    row 'Ctrl-v'    'Start selecting a rectangular block or column'
    row 'R'         'Replace mode: type over the existing text'
    row ':'         'Command line, for :w :q :s and the rest'

    section 'MOVE THE CURSOR'
    row 'h j k l'   'Move left, down, up, right'
    row 'w / b'     'Move between words, forward with w and back with b'
    row 'e'         'Move forward to the end of the word'
    row '0 / ^'     'Jump to the start of the line / first non-blank character'
    row '$'         'Jump to the end of the line'
    row 'gg'        'Move to the top, the first line of the file'
    row 'G'         'Move to the bottom, the last line of the file'
    row '42G'       'Move to line 42; :42 does the same'
    row '{ / }'     'Move up / down a whole paragraph'
    row 'Ctrl-d'    'Scroll half a page down; Ctrl-u scrolls up'
    row 'Ctrl-f'    'Scroll a full page down; Ctrl-b scrolls up'
    row 'H / M / L' 'Move to the top / middle / bottom of the visible screen'
    row 'f x'       'Jump to the next x on this line; t x stops just before it'
    row '; / ,'     'Repeat that f or t jump forwards / backwards'
    row '%'         'Jump to the matching bracket, paren, or brace'
    row '*'         'Jump to the next place the word under the cursor appears'
    row 'Ctrl-o'    'Jump back to where you just were; Ctrl-i goes forward again'
    row 'zz'        'Scroll the screen so the cursor line sits in the middle'

    section 'SELECT'
    row 'v / V'     'Start selecting by character / by whole lines'
    row 'ggVG'      'Select all, the entire file'
    row 'gv'        'Select again whatever you had selected last time'
    row 'o'         'While selecting, jump to the other end of the selection'
    row 'viw / vaw' 'Select the word under the cursor; vaw takes the space too'
    row 'vip / vap' 'Select this whole paragraph or block'
    row 'vi" / va"' 'Select the text inside the quotes / including the quotes'
    row 'vi{ / va{' 'Select inside the braces / including them; works for ( [ < too'
    row 'V 5 j'     'Select a few lines: this one plus the 5 below it'

    section 'COPY, CUT AND PASTE'
    row 'y'         'Copy, or yank, whatever is selected right now'
    row 'yy  or  Y' 'Copy the whole current line'
    row '3yy'       'Copy 3 lines starting here'
    row 'yiw'       'Copy the single word under the cursor'
    row 'y$'        'Copy from the cursor to the end of the line'
    row 'p / P'     'Paste after / before the cursor'
    row 'dd'        'Cut the current line; it goes on the paste stack'
    row '"+y'       'Copy to the macOS system clipboard, for other apps'
    row '"+p'       'Paste from the macOS system clipboard'
    row '"0p'       'Paste the last thing you copied, not the last thing deleted'
    row ':reg'      'Show every register: what is on the clipboard and paste stack'

    section 'DELETE AND CHANGE'
    row 'x'         'Delete the single character under the cursor'
    row 'dd'        'Delete or cut the whole current line'
    row '3dd'       'Delete 3 lines'
    row 'dw'        'Delete forward to the start of the next word'
    row 'D  or  d$' 'Delete from the cursor to the end of the line'
    row 'ciw'       'Change the word under the cursor: delete it and start typing'
    row 'cc  or  S' 'Change the whole line: clear it and start typing'
    row 'C'         'Change from the cursor to the end of the line'
    row 'r x'       'Replace only the character under the cursor with x'
    row 'J'         'Join this line and the next one together'
    row 'u'         'Undo; Ctrl-r redoes it'
    row '.'         'Repeat the last change you made'

    section 'SEARCH AND REPLACE'
    row '/text'     'Search forwards for text; ?text searches backwards'
    row 'n / N'     'Jump to the next / previous search match'
    row '* / #'     'Search for the word under the cursor, forwards / backwards'
    row ':%s/a/b/g' 'Find and replace every a with b in the whole file'
    row ':%s/a/b/gc' 'Find and replace, confirming each one with y n a or q'
    row ':s/a/b/g'  'Find and replace on the current line only'
    row ':noh'      'Clear the leftover yellow search highlighting'

    section 'FILES AND SPLITS'
    row ':w'        'Save the file'
    row ':q  /  :q!' 'Quit / quit and throw away every change'
    row 'ZZ  /  ZQ' 'Save and quit / quit without saving'
    row ':e file'   'Open a different file'
    row 'Ctrl-w v'  'Split the window vertically; Ctrl-w s splits horizontally'
    row 'Ctrl-w hjkl' 'Move between the open splits'
    row ':bn / :bp' 'Switch to the next / previous open file buffer'

    section 'THE GRAMMAR — HOW KEYS COMBINE'
    row 'count op motion' 'Commands combine: 3dw means delete 3 words'
    row 'd2j'       'Delete this line and the 2 below: operator plus motion'
    row 'y}'        'Copy from here to the end of the paragraph'
    row 'd  c  y'   'The operators: delete, change, copy'
    row '>  <  ='   'The operators: indent right, indent left, auto-format'
    row 'gu / gU'   'The operators: lowercase / uppercase, so guiw lowercases a word'

    section 'COMMAND LINE - ZSH VI MODE'
    row 'Esc'        'Leave typing; every key below then works on the command line'
    row 'i / a'      'Back to typing, before / after the cursor'
    row 'I / A'      'Jump to the start / end of the line and start typing'
    row '0 / $'      'Jump to the start / end of the line without typing'
    row '^'          'Jump to the first character that is not a space'
    row 'w / b'      'Jump between words, forward with w and back with b'
    row 'W / B'      'Jump between whole space-separated words, ignoring punctuation'
    row 'e'          'Jump to the end of the current word'
    row 'f x / F x'  'Jump to the next / previous x on the line'
    row '; / ,'      'Repeat that jump forwards / backwards'
    row 'h / l'      'Move one character left / right'
    row 'cw / dw'    'Change / delete from the cursor to the end of the word'
    row 'ciw / diw'  'Change / delete the whole word under the cursor'
    row 'cia / dia'  'Change / delete a whole argument, such as --timeout=0'
    row 'C / D'      'Change / delete from the cursor to the end of the line'
    row 'S / dd'     'Change / delete the entire command line'
    row 'x / s'      'Delete the character / delete it and start typing'
    row 'r x'        'Replace the character under the cursor with x'
    row 'u / .'      'Undo / repeat the last change'
    row 'y / p'      'Yank with a motion such as yw, then paste it with p'
    row 'k / j'      'Recall the previous / next command from history'
    row '/text'      'Search history backwards for text; n and N step the matches'
    row 'v'          'Start a visual selection on the command line'
    row 'Ctrl-X Ctrl-E' 'Open the command in Neovim; save and quit to run it'
    row 'Ctrl-R'     'Fuzzy-search your command history with fzf'
    row 'Ctrl-T'     'Fuzzy-find a file and drop its path onto the line'
    row 'Ctrl-W'     'Delete the word before the cursor'
    row 'Ctrl-E'     'Jump to the end of the line, kept from emacs on purpose'
    row 'Ctrl-K'     'Delete to the end of the line, kept from emacs on purpose'

    section 'TMUX SCROLLBACK - VI KEYS TOO'
    row 'Ctrl-A ['   'Scroll back through this pane, using vi keys'
    row 'v'          'Start selecting, the same as Vim visual mode'
    row 'V'          'Select whole lines'
    row 'Ctrl-v'     'Toggle a rectangular block selection'
    row 'y'          'Copy the selection to the clipboard and leave'
    row 'Enter'      'Copy the selection and leave, the same as y'
    row '/text'      'Search down the scrollback; ?text searches up'
    row 'n / N'      'Jump to the next / previous search match'
    row 'g / G'      'Jump to the top / bottom of the scrollback'
    row 'H / L'      'Jump to the top / bottom of the visible screen'
    row 'q  or  Esc' 'Leave the scrollback and return to the bottom'
    row 'drag mouse' 'Select with the mouse; it copies on release'
}

open_cheatsheet() {
    local selection
    local keys

    if ! command -v fzf > /dev/null 2>&1; then
        printf 'The Vim reference needs fzf: brew install fzf\n' >&2
        return 1
    fi

    selection="$(
        cheatsheet_rows | fzf \
            --ansi \
            --delimiter=$'\t' \
            --with-nth=1 \
            --layout=reverse \
            --border=none \
            --no-multi \
            --info=inline \
            --prompt='vim › ' \
            --header='type to search · Enter copies the keys · Esc closes'
    )" || return 0

    keys="$(printf '%s' "$selection" | cut -f2)"
    if [[ -n $keys ]]; then
        printf '%s' "$keys" | pbcopy 2>/dev/null || return 0
        tmux display-message "Copied: $keys" 2>/dev/null || true
    fi
}

case "${1:-picker}" in
    picker)
        open_cheatsheet
        ;;
    rows)
        cheatsheet_rows
        ;;
    *)
        printf 'Usage: %s {picker|rows}\n' "$0" >&2
        exit 2
        ;;
esac
