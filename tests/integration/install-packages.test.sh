#!/bin/bash
# Integration test: Verify packages can be installed and imported
# This test assumes packages are already published to the configured registry

set -e

TEST_DIR="/tmp/agenteract-integration-test-$$"
REGISTRY="${REGISTRY:-http://localhost:4873}"

echo "🧪 Running integration tests..."
echo "Registry: $REGISTRY"

# Create test directory
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize test project
echo "Initializing test project..."
npm init -y > /dev/null

# Install packages
echo "Installing @agenteract packages from $REGISTRY..."
npm install @agenteract/core @agenteract/react --registry "$REGISTRY"

# Test 1: CommonJS require
echo "Test 1: CommonJS import..."
node -e "
  const core = require('@agenteract/core');
  console.log('✓ @agenteract/core imported successfully');
" || {
  echo "❌ Failed to import @agenteract/core via CommonJS"
  exit 1
}

# Test 2: ESM import
echo "Test 2: ESM import..."
cat > test.mjs << 'EOF'
import '@agenteract/core';
console.log('✓ @agenteract/core imported via ESM');
EOF

node test.mjs || {
  echo "❌ Failed to import @agenteract/core via ESM"
  exit 1
}

# Test 3: Verify workspace dependencies are resolved
echo "Test 3: Checking workspace dependencies..."
node -e "
  const react = require('@agenteract/react');
  console.log('✓ @agenteract/react and its dependencies imported successfully');
" || {
  echo "❌ Failed to import @agenteract/react"
  exit 1
}

# Test 4: Check package.json exports
echo "Test 4: Verifying package exports..."
node -e "
  const corePackage = require('@agenteract/core/package.json');
  if (!corePackage.exports) {
    throw new Error('Package exports not found');
  }
  console.log('✓ Package exports are properly configured');
" || {
  echo "❌ Package exports verification failed"
  exit 1
}

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo ""
echo "✅ All integration tests passed!"

