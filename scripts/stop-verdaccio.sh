#!/bin/bash
# Script to stop and clean up Verdaccio process
# Usage: ./scripts/stop-verdaccio.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.verdaccio/verdaccio.pid"

echo "🛑 Stopping Verdaccio..."

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "   Killing process $PID..."
    kill "$PID" 2>/dev/null || true

    # Wait for process to die
    for i in {1..10}; do
      if ! ps -p "$PID" > /dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "   Force killing process $PID..."
      kill -9 "$PID" 2>/dev/null || true
    fi

    echo "✅ Verdaccio stopped (PID: $PID)"
  else
    echo "ℹ️  Process $PID not running"
  fi
  rm -f "$PID_FILE"
else
  echo "ℹ️  PID file not found"

  # Try to find and kill any running verdaccio processes
  if pgrep -f "verdaccio" > /dev/null 2>&1; then
    echo "   Found running verdaccio processes, killing them..."
    pkill -f "verdaccio" 2>/dev/null || true
    echo "✅ Verdaccio processes stopped"
  fi
fi

# Reset npm registry to default
echo "Resetting npm registry to default..."
npm config delete registry 2>/dev/null || true
pnpm config delete registry 2>/dev/null || true

echo "✅ Done!"

