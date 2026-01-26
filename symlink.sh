#!/bin/bash
DOTFILES=~/dev/dotfiles/files_to_symlink/

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "Error: Homebrew is not installed."
    echo "Install it from https://brew.sh"
    exit 1
fi


# dot files
if [ ! -d ~/.hammerspoon ]; then
    brew install --cask hammerspoon
    mkdir -p ~/.hammerspoon
fi

if [ ! -d ~/.hammerspoon ]; then
    mkdir -p ~/.hammerspoon
fi

ln -sf $DOTFILES/init.lua ~/.hammerspoon/init.lua
ln -sf $DOTFILES/tmux.conf ~/.tmux.conf
ln -sf $DOTFILES/zshrc ~/.zshrc

# bash scripts
ln -sf $DOTFILES/init_tmux_sessions.sh ~/init_tmux_sessions.sh
ln -sf $DOTFILES/switch_php_ver.sh ~/switch_php_ver.sh
# add more as needed
