#!/bin/bash
# Script to start Verdaccio using npm for local testing
# Usage: ./scripts/start-verdaccio.sh

set -e

VERDACCIO_PORT="${VERDACCIO_PORT:-4873}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_PATH="$PROJECT_ROOT/.verdaccio/config-local.yaml"
STORAGE_PATH="$PROJECT_ROOT/.verdaccio/storage"
PID_FILE="$PROJECT_ROOT/.verdaccio/verdaccio.pid"
LOG_FILE="$PROJECT_ROOT/.verdaccio/verdaccio.log"

echo "🚀 Starting Verdaccio via npm..."

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "⚠️  Verdaccio is already running (PID: $PID)"
    echo "   Stop it first with: pnpm verdaccio:stop"
    exit 1
  else
    echo "   Removing stale PID file..."
    rm -f "$PID_FILE"
  fi
fi

# Create storage directory if it doesn't exist
mkdir -p "$STORAGE_PATH"
mkdir -p "$(dirname "$LOG_FILE")"

# Check if custom config exists
if [ ! -f "$CONFIG_PATH" ]; then
  echo "⚠️  Warning: Custom config not found at $CONFIG_PATH"
  echo "Using default Verdaccio configuration"
  CONFIG_ARG=""
else
  echo "✓ Using custom configuration from .verdaccio/config-local.yaml"
  CONFIG_ARG="--config $CONFIG_PATH"
fi

# Start Verdaccio in the background
echo "   Starting Verdaccio on port ${VERDACCIO_PORT}..."
npx verdaccio --listen ${VERDACCIO_PORT} $CONFIG_ARG > "$LOG_FILE" 2>&1 &
VERDACCIO_PID=$!

# Save PID to file
echo "$VERDACCIO_PID" > "$PID_FILE"
echo "   Process ID: $VERDACCIO_PID"

echo "⏳ Waiting for Verdaccio to be ready..."
sleep 3

# Health check with retries
MAX_RETRIES=15
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s "http://localhost:${VERDACCIO_PORT}/-/ping" > /dev/null 2>&1; then
    echo "✅ Verdaccio is running at http://localhost:${VERDACCIO_PORT}"
    echo ""
    echo "Web UI: http://localhost:${VERDACCIO_PORT}"
    echo "Username: test"
    echo "Password: test"
    echo ""
    echo "Logs: $LOG_FILE"
    echo ""
    echo "Next steps:"
    echo "  1. Publish packages: pnpm verdaccio:publish"
    echo "  2. Run tests: pnpm test:integration"
    echo ""
    echo "To stop Verdaccio:"
    echo "  pnpm verdaccio:stop"
    exit 0
  fi

  # Check if process is still running
  if ! ps -p "$VERDACCIO_PID" > /dev/null 2>&1; then
    echo "❌ Verdaccio process died unexpectedly"
    echo "Log file: $LOG_FILE"
    if [ -f "$LOG_FILE" ]; then
      echo "Full log contents:"
      cat "$LOG_FILE"
    else
      echo "Log file does not exist"
    fi
    rm -f "$PID_FILE"
    exit 1
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "❌ Failed to start Verdaccio - health check timeout"
echo "Log file: $LOG_FILE"
if [ -f "$LOG_FILE" ]; then
  echo "Full log contents:"
  cat "$LOG_FILE"
else
  echo "Log file does not exist"
fi
echo ""
echo "Process status:"
if ps -p "$VERDACCIO_PID" > /dev/null 2>&1; then
  echo "Verdaccio process is still running (PID: $VERDACCIO_PID)"
else
  echo "Verdaccio process is not running"
fi
kill "$VERDACCIO_PID" 2>/dev/null || true
rm -f "$PID_FILE"
exit 1

