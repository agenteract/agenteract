#!/bin/bash
# Script to clean up orphaned E2E test processes

echo "🧹 Cleaning up orphaned E2E test processes..."

# Kill all agenteract dev processes from /tmp
pkill -f "agenteract-e2e-test-flutter.*agenteract dev" || true

# Kill all flutter-cli processes from /tmp
pkill -f "agenteract-e2e-flutter-app.*@agenteract/flutter-cli" || true

# Kill any remaining flutter run processes
pkill -f "flutter run" || true

# Wait for processes to die
sleep 2

# Clean up temp directories
echo "🗑️  Removing temp directories..."
rm -rf /tmp/agenteract-e2e-test-flutter-* 2>/dev/null || true
rm -rf /tmp/agenteract-e2e-flutter-app-* 2>/dev/null || true

echo "✅ Cleanup complete!"

# Show any remaining processes
REMAINING=$(ps aux | grep -E "agenteract|flutter" | grep -v grep | grep -v cleanup-orphans || true)
if [ -n "$REMAINING" ]; then
  echo ""
  echo "⚠️  Some processes may still be running:"
  echo "$REMAINING"
else
  echo ""
  echo "✓ No orphaned processes found"
fi
