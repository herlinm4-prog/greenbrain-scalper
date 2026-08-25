#!/bin/zsh
set -e
cd "$(dirname "$0")"
PORT="${GREENBRAIN_API_PORT:-8787}"
if command -v npm >/dev/null 2>&1; then
  if [ ! -d node_modules ]; then
    echo "Preparing GreenBrain for the first launch..."
    npm install
  fi
  (sleep 2; open "http://127.0.0.1:${PORT}") &
  echo "GreenBrain Core starting..."
  echo "Local dashboard: http://127.0.0.1:${PORT}"
  exec npm start
else
  echo "Node.js and npm are required to launch GreenBrain."
  read -n 1 -s -r -p "Press any key to close"
fi
