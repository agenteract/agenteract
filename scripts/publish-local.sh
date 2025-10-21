#!/bin/bash
# Script to publish packages to local Verdaccio for local testing
# Usage: ./scripts/publish-local.sh

set -e

VERDACCIO_URL="${VERDACCIO_URL:-http://localhost:4873}"
VERDACCIO_USER="${VERDACCIO_USER:-test}"
VERDACCIO_PASS="${VERDACCIO_PASS:-test}"
VERDACCIO_EMAIL="${VERDACCIO_EMAIL:-test@test.com}"

echo "🔧 Publishing to Verdaccio at $VERDACCIO_URL"

# Check if Verdaccio is running
if ! curl -s "$VERDACCIO_URL/-/ping" > /dev/null 2>&1; then
  echo "❌ Error: Verdaccio is not running at $VERDACCIO_URL"
  echo "   Start with: pnpm verdaccio:start"
  exit 1
fi

echo "✓ Verdaccio is running"

# Configure npm to use local registry
echo "📝 Configuring npm registry..."
npm config set registry "$VERDACCIO_URL"
pnpm config set registry "$VERDACCIO_URL"

# Setup authentication
echo "🔐 Setting up authentication..."

# Check if already authenticated
if npm whoami --registry "$VERDACCIO_URL" &> /dev/null; then
  echo "✓ Already authenticated as: $(npm whoami --registry $VERDACCIO_URL)"
else
  # Authenticate using expect
  if ! command -v expect &> /dev/null; then
    echo "❌ Error: 'expect' is required but not installed"
    echo ""
    echo "Install expect:"
    echo "  macOS:  brew install expect"
    echo "  Ubuntu: sudo apt-get install expect"
    echo ""
    echo "Or authenticate manually:"
    echo "  npm adduser --registry $VERDACCIO_URL"
    exit 1
  fi
  
  echo "   Authenticating user '$VERDACCIO_USER'..."
  if bash "$(dirname "$0")/verdaccio-auth.sh"; then
    echo "✓ Successfully authenticated"
  else
    echo "❌ Authentication failed"
    exit 1
  fi
fi

# Build packages
echo ""
echo "📦 Building packages..."
pnpm run build

# Publish packages
echo ""
echo "📤 Publishing packages to Verdaccio..."

# Use a flag to track if any new packages were published
PUBLISHED_COUNT=0
ALREADY_EXISTS_COUNT=0
FAILED_COUNT=0

# Publish each package, handling "already exists" errors gracefully
for pkg in packages/*/package.json; do
  if [ ! -f "$pkg" ]; then
    continue
  fi
  
  PKG_DIR=$(dirname "$pkg")
  PKG_NAME=$(node -p "require('./$pkg').name" 2>/dev/null || echo "unknown")
  
  cd "$PKG_DIR"
  
  if npm publish --registry "$VERDACCIO_URL" 2>&1 | tee /tmp/npm-publish.log | grep -q "this package is already present"; then
    echo "   ⏭️  $PKG_NAME (already exists)"
    ALREADY_EXISTS_COUNT=$((ALREADY_EXISTS_COUNT + 1))
  elif grep -q "npm notice Publishing" /tmp/npm-publish.log; then
    echo "   ✅ $PKG_NAME (published)"
    PUBLISHED_COUNT=$((PUBLISHED_COUNT + 1))
  else
    echo "   ❌ $PKG_NAME (failed)"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
  
  cd - > /dev/null
done

# Summary
echo ""
echo "──────────────────────────────────────"
if [ $PUBLISHED_COUNT -gt 0 ]; then
  echo "✅ Successfully published $PUBLISHED_COUNT package(s)"
fi
if [ $ALREADY_EXISTS_COUNT -gt 0 ]; then
  echo "ℹ️  $ALREADY_EXISTS_COUNT package(s) already existed"
fi
if [ $FAILED_COUNT -gt 0 ]; then
  echo "❌ $FAILED_COUNT package(s) failed"
  echo ""
  echo "To republish, restart Verdaccio to clear packages:"
  echo "  pnpm verdaccio:stop && pnpm verdaccio:start"
  exit 1
fi

echo ""
echo "Next steps:"
echo "  • Test installation: pnpm test:integration"
echo "  • Install a package: npm install @agenteract/core --registry $VERDACCIO_URL"
echo "  • Stop when done: pnpm verdaccio:stop"

