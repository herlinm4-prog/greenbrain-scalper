#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [ -f ".greenbrain.env" ]; then
  set -a
  source ".greenbrain.env"
  set +a
fi

PORT="${GREENBRAIN_API_PORT:-8787}"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required to launch GreenBrain."
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparing GreenBrain for the first launch..."
  npm install
fi

if [ -n "${GREENBRAIN_MT5_PUSH_LOGIN:-}" ] && [ -n "${GREENBRAIN_MT5_PUSH_SERVER:-}" ]; then
  echo "Runtime: MT5 PUSH · DEMO"
elif [ "${GREENBRAIN_BROKER:-paper}" = "mt5" ]; then
  echo "Runtime: MT5 BRIDGE · DEMO"
else
  echo "Runtime: PAPER ENGINE · DEMO"
  echo "MT5 is not configured. No physical MT5 connection will be claimed."
fi

(sleep 2; open "http://127.0.0.1:${PORT}") &
echo "GreenBrain Core starting..."
echo "Local dashboard: http://127.0.0.1:${PORT}"
exec npm start
