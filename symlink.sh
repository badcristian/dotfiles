#!/bin/bash
DOTFILES=~/dev/dotfiles/files_to_symlink/

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "Error: Homebrew is not installed."
    echo "Install it from https://brew.sh"
    exit 1
fi


# The tmux health monitor reads die temperature and fan speed through macmon,
# which talks to IOReport and so needs no root — powermetrics reports the same
# figures but only to a process that can sudo, which an hourly unattended check
# cannot. Without it the Temperature row falls back to the battery pack sensor,
# which works but reads ~25 degrees cooler and has no fan data.
if ! command -v macmon &> /dev/null; then
    brew install macmon
fi

# dot files
if [ ! -d ~/.hammerspoon ]; then
    brew install --cask hammerspoon
    mkdir -p ~/.hammerspoon
fi

if [ ! -d ~/.hammerspoon ]; then
    mkdir -p ~/.hammerspoon
fi

if [ ! -d ~/.config/ghostty ]; then
    mkdir -p ~/.config/ghostty
fi

if [ ! -d ~/.config/ghostty/shaders ]; then
    mkdir -p ~/.config/ghostty/shaders
fi

if [ ! -d ~/.config/ghostty/backgrounds ]; then
    mkdir -p ~/.config/ghostty/backgrounds
fi

if [ ! -d ~/.config/ghostty/themes ]; then
    mkdir -p ~/.config/ghostty/themes
fi

if [ ! -d ~/.config/nvim/lua/plugins ]; then
    mkdir -p ~/.config/nvim/lua/plugins
fi

MUXY_CONFIG_DIR="$HOME/Library/Application Support/Muxy"
if [ ! -d "$MUXY_CONFIG_DIR" ]; then
    mkdir -p "$MUXY_CONFIG_DIR"
fi

OBSIDIAN_SNIPPETS_DIR="$HOME/Documents/mac_obisidian_vault/.obsidian/snippets"
if [ ! -d "$OBSIDIAN_SNIPPETS_DIR" ]; then
    mkdir -p "$OBSIDIAN_SNIPPETS_DIR"
fi

if [ ! -d ~/.cloudflared ]; then
    mkdir -p ~/.cloudflared
fi

ln -sf $DOTFILES/init.lua ~/.hammerspoon/init.lua
ln -sf $DOTFILES/tmux.conf ~/.tmux.conf
ln -sf $DOTFILES/zshrc ~/.zshrc
ln -sf $DOTFILES/editorconfig ~/.editorconfig

# Git. The signing key id and the noreply address are already public in every
# commit, so the only thing versioning this adds is the alias set and the delta
# wiring. Credentials are not here: `credential.helper = cache` keeps them in
# memory, and the GPG secret key stays in the keyring.
ln -sf $DOTFILES/gitconfig ~/.gitconfig
ln -sf $DOTFILES/gitignore ~/.gitignore
ln -sf $DOTFILES/gitattributes ~/.gitattributes

# lazygit renders diffs itself and ignores git's core.pager, so delta is named
# separately there.
if [ ! -d ~/.config/lazygit ]; then
    mkdir -p ~/.config/lazygit
fi
ln -sf $DOTFILES/lazygit/config.yml ~/.config/lazygit/config.yml

# cloudflared tunnel configs (credentials JSON + cert.pem are secrets — NOT versioned)
ln -sf $DOTFILES/cloudflared/vanta.yml ~/.cloudflared/vanta.yml
ln -sf $DOTFILES/cloudflared/growee.yml ~/.cloudflared/growee.yml
ln -sf $DOTFILES/cloudflared/spro-marketing.yml ~/.cloudflared/spro-marketing.yml
ln -sf $DOTFILES/cloudflared/ribeit-depozit.yml ~/.cloudflared/ribeit-depozit.yml

# bash scripts
ln -sf $DOTFILES/init_tmux_sessions.sh ~/init_tmux_sessions.sh
ln -sf $DOTFILES/tmux-notes.lua ~/tmux-notes.lua
ln -sf $DOTFILES/tmux-notes-core.lua ~/tmux-notes-core.lua
ln -sf $DOTFILES/tmux-notes.sh ~/tmux-notes.sh
ln -sf $DOTFILES/nvim/tmux-notes.lua ~/.config/nvim/lua/plugins/tmux-notes.lua
bash "$DOTFILES/nvim/install-notes-support.sh"
ln -sf $DOTFILES/tmux-project.sh ~/tmux-project.sh
ln -sf $DOTFILES/tmux-session-ui.sh ~/tmux-session-ui.sh
ln -sf $DOTFILES/tmux-status.sh ~/tmux-status.sh
ln -sf $DOTFILES/tmux-agent-usage.sh ~/tmux-agent-usage.sh
ln -sf $DOTFILES/tmux-background.sh ~/tmux-background.sh
ln -sf $DOTFILES/tmux-theme.sh ~/tmux-theme.sh
ln -sf $DOTFILES/tmux-ui.sh ~/tmux-ui.sh
ln -sf $DOTFILES/tmux-open-url.sh ~/tmux-open-url.sh
ln -sf $DOTFILES/tmux-repo.sh ~/tmux-repo.sh
ln -sf $DOTFILES/tmux-vim-cheatsheet.sh ~/tmux-vim-cheatsheet.sh
ln -sf $DOTFILES/tmux-health.sh ~/tmux-health.sh
ln -sf $DOTFILES/switch_php_ver.sh ~/switch_php_ver.sh
ln -sf $DOTFILES/ghostty.config ~/.config/ghostty/config
ln -sf $DOTFILES/ghostty/shaders/cursor_warp.glsl ~/.config/ghostty/shaders/cursor_warp.glsl
ln -sf $DOTFILES/ghostty/shaders/moving_stars.glsl ~/.config/ghostty/shaders/moving_stars.glsl
ln -sf $DOTFILES/ghostty/backgrounds/stars-black.jpg ~/.config/ghostty/backgrounds/stars-black.jpg
ln -sf $DOTFILES/ghostty/backgrounds/stars-blue.jpg ~/.config/ghostty/backgrounds/stars-blue.jpg
ln -sf $DOTFILES/ghostty/backgrounds/stars-cyan.jpg ~/.config/ghostty/backgrounds/stars-cyan.jpg
ln -sf $DOTFILES/ghostty/backgrounds/stars-purple.jpg ~/.config/ghostty/backgrounds/stars-purple.jpg
ln -sf $DOTFILES/ghostty/stars-overlay.conf ~/.config/ghostty/stars-overlay.conf

# The colour schemes Ghostty does not already bundle, pulled from
# terminalcolors.com by ghostty/fetch-terminalcolors-themes.sh. Linked one by one
# because Ghostty only looks one level deep in ~/.config/ghostty/themes.
for ghostty_theme in "$DOTFILES"ghostty/themes/*; do
    [ -f "$ghostty_theme" ] || continue
    ln -sf "$ghostty_theme" ~/.config/ghostty/themes/"$(basename "$ghostty_theme")"
done

# Superseded by the generated `starfield-active`, which composes the stars onto
# whichever theme is selected instead of onto Catppuccin alone.
rm -f ~/.config/ghostty/themes/'Catppuccin Macchiato Stars' ~/.config/ghostty/background.ghostty
ln -sf $DOTFILES/starship.toml ~/.config/starship.toml
ln -sf $DOTFILES/starship-light.toml ~/.config/starship-light.toml
ln -sf "$DOTFILES/muxy/ghostty.conf" "$MUXY_CONFIG_DIR/ghostty.conf"
ln -sf "$DOTFILES/obsidian/snippets/file-explorer-font.css" "$OBSIDIAN_SNIPPETS_DIR/file-explorer-font.css"

# Preserve the user's theme and moving-background choices while ensuring the
# generated Ghostty override and active shader exist on a new installation.
# `ensure` chains into tmux-theme.sh, which writes theme.ghostty.
bash "$DOTFILES/tmux-background.sh" ensure

# VS Code settings, keybindings, and local extensions
bash $DOTFILES/vscode/install_vscode.sh
# add more as needed
