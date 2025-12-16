#!/bin/bash
# This script prints a greeting message

tmux new-session -d -s ribeit-api -c /Users/mac/dev/ribeit-api
tmux split-window -v -t ribeit-api -c /Users/mac/dev/ribeit-api
tmux split-window -v -t ribeit-api -c /Users/mac/dev/ribeit-api

tmux new-session -d -s ribeit-ui -c /Users/mac/dev/ribeit-ui
tmux split-window -v -t ribeit-ui -c /Users/mac/dev/ribeit-ui

tmux new-session -d -s spro-app -c /Users/mac/dev/spro-app
tmux split-window -v -t spro-app -c /Users/mac/dev/spro-app
tmux split-window -v -t spro-app -c /Users/mac/dev/spro-app

tmux new-session -d -s spro-wordpress -c /Users/mac/dev/spro-wordpress
tmux split-window -v -t spro-wordpress -c /Users/mac/dev/spro-wordpress

tmux downloads -d -s spro-wordpress -c /Users/mac/Downloads

tmux ssh -d -s spro-wordpress -c ~/

tmux new-session -d -s public-api -c /Users/mac/dev/public-api
tmux new-session -d -s dfs-api -c /Users/mac/dev/dfs-api
tmux new-session -d -s spro-marketing -c /Users/mac/dev/spro-marketing

tmux attach -t ribeit-api
