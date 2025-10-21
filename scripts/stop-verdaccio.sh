#!/bin/bash
# Script to stop and clean up Verdaccio container
# Usage: ./scripts/stop-verdaccio.sh

set -e

CONTAINER_NAME="agenteract-verdaccio"

echo "🛑 Stopping Verdaccio..."

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker stop "$CONTAINER_NAME"
  docker rm "$CONTAINER_NAME"
  echo "✅ Verdaccio stopped and removed"
else
  echo "ℹ️  Container $CONTAINER_NAME not found"
fi

# Reset npm registry to default
echo "Resetting npm registry to default..."
npm config delete registry 2>/dev/null || true
pnpm config delete registry 2>/dev/null || true

echo "✅ Done!"

