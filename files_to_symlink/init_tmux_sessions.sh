#!/bin/bash

tmux new-session -d -s downloads -c /Users/mac/Downloads
tmux new-session -d -s ~ -c ~/

# ── ribeit-api ────────────────────────────────────────────────────────────────
tmux new-session -d -s ribeit-api -c /Users/mac/dev/ribeit-api

# Window 1: left full-height (claude) | right split in 2
tmux split-window -h -t ribeit-api:1 -c /Users/mac/dev/ribeit-api
tmux split-window -v -t ribeit-api:1.1 -c /Users/mac/dev/ribeit-api
tmux send-keys -t ribeit-api:1.0 "claude"
tmux select-pane -t ribeit-api:1.0

# Window 2: 4-pane grid for services
tmux new-window -t ribeit-api -c /Users/mac/dev/ribeit-api
tmux split-window -t ribeit-api:2 -c /Users/mac/dev/ribeit-api
tmux split-window -t ribeit-api:2 -c /Users/mac/dev/ribeit-api
tmux split-window -t ribeit-api:2 -c /Users/mac/dev/ribeit-api
tmux select-layout -t ribeit-api:2 tiled
tmux select-pane -t ribeit-api:1.0

# ── public-api ────────────────────────────────────────────────────────────────
tmux new-session -d -s public-api -c /Users/mac/dev/public-api
tmux new-session -d -s dfs-api -c /Users/mac/dev/dfs-api

# ── ribeit-ui ────────────────────────────────────────────────────────────────
tmux new-session -d -s ribeit-ui -c /Users/mac/dev/ribeit-ui

# Window 1: left full-height (claude) | right split in 2
tmux split-window -h -t ribeit-ui:1 -c /Users/mac/dev/ribeit-ui
tmux split-window -v -t ribeit-ui:1.1 -c /Users/mac/dev/ribeit-ui
tmux send-keys -t ribeit-ui:1.0 "claude"
tmux select-pane -t ribeit-ui:1.0

# Window 2: 4-pane grid for services
tmux new-window -t ribeit-ui -c /Users/mac/dev/ribeit-ui
tmux split-window -t ribeit-ui:2 -c /Users/mac/dev/ribeit-ui
tmux split-window -t ribeit-ui:2 -c /Users/mac/dev/ribeit-ui
tmux split-window -t ribeit-ui:2 -c /Users/mac/dev/ribeit-ui
tmux select-layout -t ribeit-ui:2 tiled
tmux select-pane -t ribeit-ui:1.0

# ── usb-token-client ──────────────────────────────────────────────────────────
tmux new-session -d -s usb-token-client -c /Users/mac/dev/usb-token-client

# ── spro-app ──────────────────────────────────────────────────────────────────
tmux new-session -d -s spro-app -c /Users/mac/dev/spro-app

# Window 1: left full-height (claude) | right split in 2
tmux split-window -h -t spro-app:1 -c /Users/mac/dev/spro-app
tmux split-window -v -t spro-app:1.1 -c /Users/mac/dev/spro-app
tmux send-keys -t spro-app:1.0 "claude"
tmux select-pane -t spro-app:1.0

# Window 2: 4-pane grid for services
tmux new-window -t spro-app -c /Users/mac/dev/spro-app
tmux split-window -t spro-app:2 -c /Users/mac/dev/spro-app
tmux split-window -t spro-app:2 -c /Users/mac/dev/spro-app
tmux split-window -t spro-app:2 -c /Users/mac/dev/spro-app
tmux select-layout -t spro-app:2 tiled
tmux send-keys -t spro-app:2.0 "npm run watch"
tmux send-keys -t spro-app:2.1 "redis-server"
tmux select-pane -t spro-app:1.0

# ── spro-wordpress ────────────────────────────────────────────────────────────
tmux new-session -d -s spro-wordpress -c /Users/mac/dev/spro-wordpress

# Window 1: left full-height (claude) | right split in 2
tmux split-window -h -t spro-wordpress:1 -c /Users/mac/dev/spro-wordpress
tmux split-window -v -t spro-wordpress:1.1 -c /Users/mac/dev/spro-wordpress
tmux send-keys -t spro-wordpress:1.0 "claude"
tmux select-pane -t spro-wordpress:1.0

# Window 2: 4-pane grid for services
tmux new-window -t spro-wordpress -c /Users/mac/dev/spro-wordpress
tmux split-window -t spro-wordpress:2 -c /Users/mac/dev/spro-wordpress
tmux split-window -t spro-wordpress:2 -c /Users/mac/dev/spro-wordpress
tmux split-window -t spro-wordpress:2 -c /Users/mac/dev/spro-wordpress
tmux select-layout -t spro-wordpress:2 tiled
tmux select-pane -t spro-wordpress:1.0

# ── spro-marketing ────────────────────────────────────────────────────────────
tmux new-session -d -s spro-marketing -c /Users/mac/dev/spro-marketing

# Window 1: left full-height (claude) | right split in 2
tmux split-window -h -t spro-marketing:1 -c /Users/mac/dev/spro-marketing
tmux split-window -v -t spro-marketing:1.1 -c /Users/mac/dev/spro-marketing
tmux send-keys -t spro-marketing:1.0 "claude"
tmux select-pane -t spro-marketing:1.0

# Window 2: 4-pane grid for services
tmux new-window -t spro-marketing -c /Users/mac/dev/spro-marketing
tmux split-window -t spro-marketing:2 -c /Users/mac/dev/spro-marketing
tmux split-window -t spro-marketing:2 -c /Users/mac/dev/spro-marketing
tmux split-window -t spro-marketing:2 -c /Users/mac/dev/spro-marketing
tmux select-layout -t spro-marketing:2 tiled
tmux select-pane -t spro-marketing:1.0

tmux attach -t ribeit-api
