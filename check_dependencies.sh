#!/bin/bash
DOTFILES=~/dotfiles

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

missing=()
optional_missing=()

echo "Checking dependencies..."

# Check if Homebrew is installed (required)
if ! command -v brew &> /dev/null; then
    echo -e "${RED}✗ Homebrew is not installed (required)${NC}"
    echo "  Install from https://brew.sh"
    exit 1
else
    echo -e "${GREEN}✓ Homebrew${NC}"
fi

# Function to check required commands
check_required() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed${NC}"
        missing+=("$1")
    else
        echo -e "${GREEN}✓ $1${NC}"
    fi
}

# Function to check optional commands
check_optional() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${YELLOW}○ $1 is not installed (optional)${NC}"
        optional_missing+=("$1")
    else
        echo -e "${GREEN}✓ $1${NC}"
    fi
}

# Required tools
check_required "git"
check_required "nvim"
check_required "tmux"
check_required "fzf"
check_required "fd"
check_required "bat"

# Development tools
check_required "php"
check_required "composer"
check_required "python3"
check_required "node"

# Optional tools
check_optional "valet"
check_optional "tree"
check_optional "lsd"
check_optional "gpg"
check_optional "ruby"
check_optional "cargo"
check_optional "pipx"
check_optional "mise"

# Check for Geometry theme
if [ ! -f "/opt/homebrew/opt/geometry/share/geometry/geometry.zsh" ]; then
    echo -e "${YELLOW}○ Geometry zsh theme not installed${NC}"
    optional_missing+=("geometry")
else
    echo -e "${GREEN}✓ Geometry theme${NC}"
fi

# Check for Ghostty config directory
if [ ! -d "$HOME/.config/ghostty" ]; then
    echo -e "${YELLOW}○ Ghostty config directory not found${NC}"
    optional_missing+=("ghostty")
else
    echo -e "${GREEN}✓ Ghostty${NC}"
fi

# Check for SoftHSM
if [ ! -f "/usr/local/lib/softhsm/libsofthsm2.so" ]; then
    echo -e "${YELLOW}○ SoftHSM not installed${NC}"
    optional_missing+=("softhsm")
else
    echo -e "${GREEN}✓ SoftHSM${NC}"
fi

echo ""

# Summary and install suggestions
if [ ${#missing[@]} -ne 0 ]; then
    echo -e "${RED}Missing required packages:${NC}"
fi

if [ ${#optional_missing[@]} -ne 0 ]; then
    echo -e "${YELLOW}Missing optional packages:${NC}"
fi
