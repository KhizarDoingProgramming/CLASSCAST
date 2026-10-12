#!/bin/bash
# ClassCast — Build and start the production server
# Students connect to: http://YOUR_IP:3000

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "========================================="
echo "  ClassCast — Building..."
echo "========================================="
npm run build

echo ""
echo "========================================="
echo "  ClassCast — Starting server on port 3000"
echo "========================================="
echo ""

# Dynamic IP resolution using the server's own network helper
SERVER_IP=$(node -e "try { console.log(require('./server/dist/network.js').getLocalIp()); } catch(e) { console.log('127.0.0.1'); }")

echo "  On your laptop:  http://localhost:3000"
echo "  On your phone:   http://${SERVER_IP}:3000"
echo ""
echo "  Phone opens the address above, sees active classes, taps Join."
echo ""

exec node server/dist/index.js
