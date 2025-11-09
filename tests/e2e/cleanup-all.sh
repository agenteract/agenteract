#!/bin/bash
# Script to clean up ALL orphaned E2E test processes (Vite, Flutter, Expo)

echo "🧹 Cleaning up ALL orphaned E2E test processes..."

# Kill all agenteract dev processes from /tmp
echo "  Killing agenteract dev processes..."
pkill -f "agenteract-e2e-test.*agenteract dev" || true

# Kill all platform-specific CLI processes
echo "  Killing platform CLI processes..."
pkill -f "@agenteract/vite.*--port" || true
pkill -f "@agenteract/flutter-cli.*--port" || true
pkill -f "@agenteract/expo.*--port" || true

# Kill any remaining flutter run processes
pkill -f "flutter run" || true

# Wait for processes to die
sleep 2

# Clean up temp directories
echo "🗑️  Removing temp directories..."
rm -rf /tmp/agenteract-e2e-test-vite-* 2>/dev/null || true
rm -rf /tmp/agenteract-e2e-test-flutter-* 2>/dev/null || true
rm -rf /tmp/agenteract-e2e-test-expo-* 2>/dev/null || true
rm -rf /tmp/agenteract-e2e-vite-app-* 2>/dev/null || true
rm -rf /tmp/agenteract-e2e-flutter-app-* 2>/dev/null || true
rm -rf /tmp/agenteract-e2e-expo-app-* 2>/dev/null || true

# Also clean up the test directories
rm -rf .e2e-test-* 2>/dev/null || true

echo "✅ Cleanup complete!"

# Show any remaining E2E processes
REMAINING=$(ps aux | grep -E "agenteract-e2e|@agenteract/(vite|expo|flutter-cli)" | grep -v grep | grep -v cleanup-all || true)
if [ -n "$REMAINING" ]; then
  echo ""
  echo "⚠️  Some E2E processes may still be running:"
  echo "$REMAINING"
  echo ""
  echo "To forcefully kill them, run:"
  echo "  pkill -9 -f 'agenteract-e2e'"
else
  echo ""
  echo "✓ No orphaned E2E processes found"
fi
