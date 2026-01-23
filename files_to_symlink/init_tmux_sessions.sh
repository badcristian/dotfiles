#!/bin/bash

tmux new-session -d -s downloads -c /Users/mac/Downloads
tmux new-session -d -s ~ -c ~/

# ribeit-api
tmux new-session -d -s ribeit-api -c /Users/mac/dev/ribeit-api
tmux split-window -v -t ribeit-api -c /Users/mac/dev/ribeit-api
tmux split-window -v -t ribeit-api -c /Users/mac/dev/ribeit-api
tmux select-pane -t ribeit-api:1.0

# public-api
tmux new-session -d -s public-api -c /Users/mac/dev/public-api
tmux new-session -d -s dfs-api -c /Users/mac/dev/dfs-api

# ribeit-ui
tmux new-session -d -s ribeit-ui -c /Users/mac/dev/ribeit-ui
tmux split-window -v -t ribeit-ui -c /Users/mac/dev/ribeit-ui
tmux select-pane -t ribeit-ui:1.0

# usb-token-client
tmux new-session -d -s usb-token-client -c /Users/mac/dev/usb-token-client

# spro-app
tmux new-session -d -s spro-app -c /Users/mac/dev/spro-app
tmux split-window -v -t spro-app -c /Users/mac/dev/spro-app
tmux split-window -v -t spro-app -c /Users/mac/dev/spro-app
tmux send-keys -t spro-app:1.1 "npm run watch" # Command ready but not executed
tmux send-keys -t spro-app:1.2 "redis-server" # Command ready but not executed
tmux select-pane -t spro-app:1.0

# spro-wordpress
tmux new-session -d -s spro-wordpress -c /Users/mac/dev/spro-wordpress
tmux split-window -v -t spro-wordpress -c /Users/mac/dev/spro-wordpress
tmux select-pane -t spro-wordpress:1.0

# spro-marketing
tmux new-session -d -s spro-marketing -c /Users/mac/dev/spro-marketing
tmux split-window -v -t spro-marketing -c /Users/mac/dev/spro-marketing
tmux split-window -v -t spro-marketing -c /Users/mac/dev/spro-marketing
tmux select-pane -t spro-marketing:1.0

# Attach to first session
#tmux attach -t ribeit-api
tmux attach -t spro-marketing
