#!/bin/bash
# Script to start Verdaccio in Docker for local testing
# Usage: ./scripts/start-verdaccio.sh

set -e

CONTAINER_NAME="agenteract-verdaccio"
VERDACCIO_PORT="${VERDACCIO_PORT:-4873}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_PATH="$PROJECT_ROOT/.verdaccio/config.yaml"

echo "🚀 Starting Verdaccio..."

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "⚠️  Container $CONTAINER_NAME already exists"
  echo "Removing existing container..."
  docker rm -f "$CONTAINER_NAME"
fi

# Check if custom config exists
if [ ! -f "$CONFIG_PATH" ]; then
  echo "⚠️  Warning: Custom config not found at $CONFIG_PATH"
  echo "Using default Verdaccio configuration"
  CONFIG_MOUNT=""
else
  echo "✓ Using custom configuration from .verdaccio/config.yaml"
  CONFIG_MOUNT="-v $CONFIG_PATH:/verdaccio/conf/config.yaml"
fi

# Start Verdaccio with custom config
docker run -d \
  --name "$CONTAINER_NAME" \
  -p ${VERDACCIO_PORT}:4873 \
  $CONFIG_MOUNT \
  verdaccio/verdaccio:5

echo "⏳ Waiting for Verdaccio to be ready..."
sleep 5

# Health check with retries
MAX_RETRIES=10
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s "http://localhost:${VERDACCIO_PORT}/-/ping" > /dev/null 2>&1; then
    echo "✅ Verdaccio is running at http://localhost:${VERDACCIO_PORT}"
    echo ""
    echo "Web UI: http://localhost:${VERDACCIO_PORT}"
    echo "Username: test"
    echo "Password: test"
    echo ""
    echo "Next steps:"
    echo "  1. Publish packages: pnpm verdaccio:publish"
    echo "  2. Run tests: pnpm test:integration"
    echo ""
    echo "To stop Verdaccio:"
    echo "  pnpm verdaccio:stop"
    exit 0
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "❌ Failed to start Verdaccio"
echo "Docker logs:"
docker logs "$CONTAINER_NAME"
exit 1

