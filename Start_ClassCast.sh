#!/bin/bash
# ClassCast Portable Launcher for Linux and macOS

set -e

# Resolve script directory dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  Starting ClassCast Platform"
echo "========================================="

# 1. Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not in PATH."
  echo "Please install Node.js (version 20 or newer) from https://nodejs.org/"
  read -p "Press Enter to exit..."
  exit 1
fi

# 2. Check for npm
if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not installed or not in PATH."
  read -p "Press Enter to exit..."
  exit 1
fi

# 3. Check dependencies
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "web/node_modules" ]; then
  echo "[INFO] First-time setup: Installing dependencies..."
  npm install
fi

# 4. Check build outputs
if [ ! -f "server/dist/index.js" ] || [ ! -f "web/dist/index.html" ] || [ ! -f "packages/shared/dist/index.js" ]; then
  echo "[INFO] Building ClassCast packages..."
  npm run build
fi

# 5. Open browser once server is responsive
(
  PORT=${PORT:-3000}
  MAX_RETRIES=30
  COUNT=0
  while [ $COUNT -lt $MAX_RETRIES ]; do
    sleep 1
    if curl -s "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
      echo "Server is ready! Opening ClassCast in default browser..."
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:${PORT}" >/dev/null 2>&1
      elif command -v open >/dev/null 2>&1; then
        open "http://localhost:${PORT}" >/dev/null 2>&1
      fi
      break
    fi
    COUNT=$((COUNT + 1))
  done
) &

# 6. Run server in foreground so closing terminal cleanly closes server
exec npm run start
