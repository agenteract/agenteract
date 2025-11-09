# Flutter E2E Tests

End-to-end tests for the Flutter example app using the Agenteract CLI.

## Prerequisites

### Required
- **Flutter SDK 3.27.2+**: Install from [flutter.dev](https://flutter.dev/docs/get-started/install)
- **Xcode** (macOS only): For iOS simulator
- **Node.js 20+** and **pnpm**: For running the test scripts
- **Docker**: For Verdaccio (local package registry)

### Verify Prerequisites

```bash
# Check Flutter installation
flutter --version
flutter doctor

# Check for iOS simulators (macOS only)
xcrun simctl list devices available | grep iPhone

# Check Node.js and pnpm
node --version
pnpm --version

# Check Docker
docker --version
```

## Running Tests Locally

### Quick Start

From the repository root:

```bash
# 1. Start Verdaccio (if not already running)
pnpm verdaccio:start

# 2. Build and publish packages to Verdaccio
pnpm verdaccio:publish

# 3. Run Flutter iOS E2E tests
pnpm test:e2e:flutter:ios
```

### What the Test Does

The Flutter E2E test (`test-app-launch-ios.ts`):

1. **Checks prerequisites**: Verifies Flutter SDK and iOS simulator are available
2. **Starts Verdaccio**: Local npm registry for testing published packages
3. **Publishes packages**: Builds and publishes all `@agenteract/*` packages to Verdaccio
4. **Copies Flutter app**: Creates a clean copy of the Flutter example in `/tmp`
5. **Installs dependencies**: Runs `flutter pub get` with local packages
6. **Starts Agenteract dev server**: Launches Flutter app and AgentDebugBridge
7. **Waits for connection**: Waits up to 2 minutes for Flutter to build and connect
8. **Tests interactions**: Verifies:
   - Hierarchy fetching
   - Tap interactions (increment button)
   - Text input
   - Long press
   - Scrolling
   - Swiping
   - Log verification
9. **Cleans up**: Kills processes and removes temp directories

### Test Duration

- **First run**: ~3-5 minutes (Flutter needs to compile the app)
- **Subsequent runs**: ~2-3 minutes (cached builds are faster)

## Test Structure

```
tests/e2e/flutter/
├── test-app-launch-ios.ts  # iOS simulator test
└── README.md               # This file
```

## Test Coverage

The Flutter E2E test verifies:

- ✅ Flutter app builds and launches on iOS simulator
- ✅ AgentDebugBridge connects successfully
- ✅ UI hierarchy can be fetched via CLI
- ✅ Tap interactions work (buttons with `.withAgent()`)
- ✅ Text input works
- ✅ Long press interactions work
- ✅ Scroll interactions work
- ✅ Swipe interactions work
- ✅ App logs are captured correctly
- ✅ Dev server logs are accessible

## Troubleshooting

### "Flutter is not installed or not in PATH"

Install Flutter SDK from [flutter.dev](https://flutter.dev/docs/get-started/install) and ensure it's in your PATH:

```bash
export PATH="$PATH:$HOME/flutter/bin"
flutter doctor
```

### "No iOS simulator found"

Install Xcode and ensure simulators are available:

```bash
# Open Xcode and go to: Xcode > Settings > Platforms
# Download iOS simulators

# Or via command line:
xcodebuild -downloadAllPlatforms

# List available simulators:
xcrun simctl list devices available
```

### "AgentDebugBridge to connect" timeout

If the test times out waiting for the bridge connection:

1. **Check Flutter build errors**: Look at the Flutter dev logs in the test output
2. **Manual test**: Try running `flutter run` manually in the Flutter example directory
3. **Simulator issues**: Restart the iOS simulator or reboot your Mac
4. **Port conflicts**: Ensure ports 8765, 8766, 8792 are not in use

### "Address already in use" (port conflicts)

Kill existing processes on Agenteract ports:

```bash
lsof -ti:8765,8766,8792 | xargs kill -9
```

### Test hangs or doesn't clean up

If the test gets stuck, manually clean up:

```bash
# Use the cleanup script (recommended)
pnpm test:e2e:cleanup

# Or manually:
# Kill Flutter processes
pkill -f "flutter run"

# Kill Agenteract processes
pkill -f "@agenteract/cli"

# Stop Verdaccio
pnpm verdaccio:stop

# Clean up temp directories
rm -rf /tmp/agenteract-e2e-*
```

**Flutter-specific cleanup:**
```bash
# Clean up only Flutter E2E processes
bash tests/e2e/flutter/cleanup-orphans.sh
```

## Running in CI

The Flutter E2E tests are designed to run in GitHub Actions CI. See `.github/workflows/e2e-flutter.yml` for the CI configuration.

### CI Workflow Features

The GitHub Actions workflow (`.github/workflows/e2e-flutter.yml`):

1. **macOS runners**: Uses `macos-latest` for iOS simulator support
2. **Flutter setup**: Installs Flutter SDK 3.27.2 via `subosito/flutter-action@v2`
3. **Verdaccio**: Runs Verdaccio in Docker for package testing
4. **Simulator boot**: Automatically boots an iPhone simulator before tests
5. **Artifacts**: Uploads test logs on failure for debugging
6. **Cleanup**: Stops Verdaccio, kills processes, and shuts down simulators

### CI-Specific Behavior

The test script detects the CI environment (`process.env.CI`) and:

- **Version bumping**: Adds `-e2e.{timestamp}` suffix to package versions to avoid npm conflicts
- **Artifact preservation**: Skips cleanup of temp directories so artifacts can be uploaded
- **Extended timeouts**: Allows for slower CI environment performance

**Security Note**: Flutter E2E tests should only run on protected branches (main, release/*) because they require macOS runners which are expensive and could be a security risk if run on untrusted PRs.

## Next Steps

### Android Support

To add Android emulator support, create `test-app-launch-android.ts` following the same pattern but:

1. Check for Android SDK and emulator: `adb devices`
2. Start Android emulator if needed
3. Use `flutter run -d <android-device-id>` instead of relying on auto-detection
4. Handle longer build times for Android

### Comprehensive Test Suite

Consider adding more specific test files:

- `test-widget-interaction.ts`: Focus on all widget interactions
- `test-bridge-connection.ts`: Test connection robustness (reconnection, etc.)
- `test-performance.ts`: Measure app startup and interaction latency

## Architecture

The Flutter E2E tests follow the same architecture as Vite E2E tests:

- **TypeScript-based**: Uses Node.js and TypeScript for test scripts
- **Agenteract CLI**: Tests the actual published packages from Verdaccio
- **Shared helpers**: Reuses helper functions from `tests/e2e/common/helpers.ts`
- **Isolated environment**: Copies app to `/tmp` to avoid polluting source directory
- **Clean setup/teardown**: Ensures proper cleanup even if test fails

## Related Documentation

- [E2E Testing Strategy](../../../docs/E2E_TESTING_STRATEGY.md) - Overall E2E testing approach
- [Agenteract Agents CLI](../../../docs/AGENTS.md) - CLI commands used in tests
- [Integration Testing](../../../docs/INTEGRATION_TESTING.md) - Verdaccio setup
