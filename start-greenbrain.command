#!/bin/zsh
set -e
cd "$(dirname "$0")"
PORT=8080
if command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "http://localhost:${PORT}") &
  echo "GreenBrain starting..."
  echo "Dashboard: http://localhost:${PORT}"
  cd dashboard
  exec python3 -m http.server "$PORT"
else
  echo "Python 3 is required to launch GreenBrain."
  read -n 1 -s -r -p "Press any key to close"
fi
