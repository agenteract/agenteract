#!/bin/bash
# Script to test Verdaccio authentication
# Usage: ./scripts/test-verdaccio-auth.sh

set -e

VERDACCIO_URL="${VERDACCIO_URL:-http://localhost:4873}"
VERDACCIO_USER="${VERDACCIO_USER:-test}"
VERDACCIO_PASS="${VERDACCIO_PASS:-test}"
VERDACCIO_EMAIL="${VERDACCIO_EMAIL:-test@test.com}"

echo "🔍 Testing Verdaccio Authentication"
echo "===================================="
echo ""

# Test 1: Check if Verdaccio is running
echo "Test 1: Checking if Verdaccio is running..."
if curl -s "$VERDACCIO_URL/-/ping" > /dev/null 2>&1; then
  echo "✅ Verdaccio is running at $VERDACCIO_URL"
else
  echo "❌ Verdaccio is not running"
  echo "   Start with: pnpm verdaccio:start"
  exit 1
fi
echo ""

# Test 2: Check current registry configuration
echo "Test 2: Checking npm registry configuration..."
CURRENT_REGISTRY=$(npm config get registry)
echo "   Current registry: $CURRENT_REGISTRY"
if [ "$CURRENT_REGISTRY" = "$VERDACCIO_URL/" ] || [ "$CURRENT_REGISTRY" = "$VERDACCIO_URL" ]; then
  echo "✅ Registry is correctly configured"
else
  echo "⚠️  Registry is not pointing to Verdaccio"
  echo "   Run: npm config set registry $VERDACCIO_URL"
fi
echo ""

# Test 3: Check authentication status
echo "Test 3: Checking authentication status..."
if npm whoami --registry "$VERDACCIO_URL" > /dev/null 2>&1; then
  CURRENT_USER=$(npm whoami --registry "$VERDACCIO_URL")
  echo "✅ Already authenticated as: $CURRENT_USER"
  ALREADY_AUTHENTICATED=true
else
  echo "⚠️  Not authenticated"
  ALREADY_AUTHENTICATED=false
fi
echo ""

# Test 4: Try to authenticate if not already
if [ "$ALREADY_AUTHENTICATED" = false ]; then
  echo "Test 4: Testing authentication capability..."
  
  if command -v expect &> /dev/null; then
    echo "✅ 'expect' is installed (required for automated auth)"
    echo "   Run: pnpm verdaccio:publish to authenticate and publish"
  else
    echo "⚠️  'expect' is not installed"
    echo "   Install: brew install expect (macOS) or sudo apt-get install expect (Linux)"
    echo "   Or authenticate manually: npm adduser --registry $VERDACCIO_URL"
  fi
  echo ""
fi

# Test 5: Check if we can access Verdaccio API
echo "Test 5: Testing Verdaccio API access..."
if curl -s "$VERDACCIO_URL/-/whoami" > /dev/null 2>&1; then
  echo "✅ API is accessible"
else
  echo "❌ API is not accessible"
  exit 1
fi
echo ""

# Test 6: Check package listing
echo "Test 6: Checking for existing packages..."
PACKAGES=$(curl -s "$VERDACCIO_URL/-/v1/search?text=@agenteract" | grep -o '"name":"[^"]*"' | wc -l || echo "0")
if [ "$PACKAGES" -gt 0 ]; then
  echo "✅ Found $PACKAGES @agenteract packages"
  echo "   Packages:"
  curl -s "$VERDACCIO_URL/-/v1/search?text=@agenteract" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | sed 's/^/   - /'
else
  echo "⚠️  No @agenteract packages found"
  echo "   Publish with: pnpm verdaccio:publish"
fi
echo ""

# Test 7: Check npm auth token
echo "Test 7: Checking npm auth token..."
if grep -q "$VERDACCIO_URL" ~/.npmrc 2>/dev/null; then
  echo "✅ Auth token found in ~/.npmrc"
else
  echo "⚠️  No auth token found in ~/.npmrc"
  echo "   This is normal if you haven't authenticated yet"
fi
echo ""

# Summary
echo "===================================="
echo "Summary:"
echo ""
if [ "$ALREADY_AUTHENTICATED" = true ]; then
  echo "✅ All checks passed! Ready to publish."
else
  echo "ℹ️  Not authenticated yet (this is normal)"
fi
echo ""
echo "Next steps:"
echo "  • Publish packages: pnpm verdaccio:publish"
echo "  • Run integration tests: pnpm test:integration"
echo "  • Stop Verdaccio: pnpm verdaccio:stop"

