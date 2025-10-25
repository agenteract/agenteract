#!/bin/bash
# Integration test: Verify packages can be installed and imported
# This test assumes packages are already published to the configured registry

set -e

TEST_DIR="/tmp/agenteract-integration-test-$$"
REGISTRY="${REGISTRY:-http://localhost:4873}"
START_DIR=$(pwd)

echo "🧪 Running integration tests..."
echo "Registry: $REGISTRY"

npm cache clean --force; 

# Create test directory
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize test project
echo "Initializing test project..."
npm init -y > /dev/null

# Install packages
echo "Installing @agenteract packages from $REGISTRY..."
npm install @agenteract/core @agenteract/react @agenteract/agents --registry "$REGISTRY"


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

# Test 5: @agenteract/agents CLI
echo "Test 5: Verifying @agenteract/agents CLI..."

# Start mock server
pwd
npx tsx "$START_DIR/tests/integration/mock-server.ts" &
SERVER_PID=$!
sleep 2 # Give servers time to start

# check server process
ps -p $SERVER_PID > /dev/null || { echo "❌ mock server process not found"; exit 1; }

# Function to kill server on exit
cleanup_server() {
  kill $SERVER_PID > /dev/null 2>&1
}
trap cleanup_server EXIT

# Run CLI tests
echo "Running @agenteract/agents CLI tests..."

npx @agenteract/agents logs my-project | grep "agent log line 1" > /dev/null || { echo "❌ agents: logs command failed"; exit 1; }
echo "✓ agents: logs command works"

npx @agenteract/agents dev-logs expo | grep "expo log line 1" > /dev/null || { echo "❌ agents: dev-logs expo command failed"; exit 1; }
echo "✓ agents: dev-logs expo command works"

npx @agenteract/agents dev-logs vite | grep "vite log line 1" > /dev/null || { echo "❌ agents: dev-logs vite command failed"; exit 1; }
echo "✓ agents: dev-logs vite command works"

npx @agenteract/agents cmd expo r || { echo "❌ agents: cmd expo command failed"; exit 1; }
echo "✓ agents: cmd expo command works"

npx @agenteract/agents hierarchy my-project | grep '"hierarchy": "mock"' > /dev/null || { echo "❌ agents: hierarchy command failed"; exit 1; }
echo "✓ agents: hierarchy command works"

npx @agenteract/agents tap my-project my-button || { echo "❌ agents: tap command failed"; exit 1; }
echo "✓ agents: tap command works"

echo "✓ @agenteract/agents CLI tests passed!"

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo ""
echo "✅ All integration tests passed!"

