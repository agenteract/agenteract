# Expo E2E Tests

End-to-end tests for the Expo example app using the Agenteract CLI.

## Prerequisites

### Required
- **Node.js 20+** and **pnpm**: For running the test scripts
- **Xcode** (macOS only): For iOS simulator
- **Docker**: For Verdaccio (local package registry)

### Verify Prerequisites

```bash
# Check Node.js and pnpm
node --version
pnpm --version

# Check for iOS simulators (macOS only)
xcrun simctl list devices available | grep iPhone

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

# 3. Run Expo iOS E2E tests
pnpm test:e2e:expo:ios
```

### What the Test Does

The Expo E2E test (`test-app-launch-ios.ts`):

1. **Starts Verdaccio**: Local npm registry for testing published packages
2. **Publishes packages**: Builds and publishes all `@agenteract/*` packages to Verdaccio
3. **Copies Expo app**: Creates a clean copy of the Expo example in `/tmp`
4. **Replaces workspace dependencies**: Converts `workspace:*` to `*` for Verdaccio
5. **Installs dependencies**: Runs `npm install` with packages from Verdaccio
6. **Starts Agenteract dev server**: Launches Expo Metro and AgentDebugBridge
7. **Launches iOS app**: Sends 'i' command to start the app on simulator
8. **Waits for connection**: Waits up to 5 minutes for Expo to build and connect
9. **Tests interactions**: Verifies hierarchy fetching works
10. **Cleans up**: Quits Expo gracefully and kills processes

### Test Duration

- **First run**: ~5-8 minutes (Expo needs to compile the app)
- **Subsequent runs**: ~3-5 minutes (cached builds are faster)

## Test Structure

```
tests/e2e/expo/
├── test-app-launch-ios.ts  # iOS simulator test
└── README.md               # This file
```

## Test Coverage

The Expo E2E test verifies:

- ✅ Expo app builds and launches on iOS simulator
- ✅ AgentDebugBridge connects successfully
- ✅ UI hierarchy can be fetched via CLI
- ✅ Metro bundler runs correctly
- ✅ App logs are captured correctly
- ✅ Dev server logs are accessible
- ✅ Graceful shutdown works (quit command)

### Interaction Tests

The test performs the following interactions with the Expo example app:

- ✅ **Button tap**: Taps the "Simulate Target" button (testID: `test-button`)
- ✅ **Text input**: Enters "Hello from E2E test" into username input (testID: `username-input`)
- ✅ **Horizontal scroll**: Scrolls the horizontal scroll view (testID: `horizontal-scroll`)
- ✅ **Swipe gesture**: Swipes left on the swipeable card (testID: `swipeable-card`)

All interactions are verified through:
- Command success responses
- App logs (console.log output)
- UI hierarchy updates

## Troubleshooting

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

1. **Check Expo build errors**: Look at the Expo dev logs in the test output
2. **Manual test**: Try running `expo start` manually in the Expo example directory
3. **Simulator issues**: Restart the iOS simulator or reboot your Mac
4. **Port conflicts**: Ensure ports 8765, 8766, 8790 are not in use

### "Address already in use" (port conflicts)

Kill existing processes on Agenteract ports:

```bash
lsof -ti:8765,8766,8790 | xargs kill -9
```

### Test hangs or doesn't clean up

If the test gets stuck, manually clean up:

```bash
# Use the cleanup script (recommended)
pnpm test:e2e:cleanup

# Or manually:
# Kill Expo processes
pkill -f "expo start"
pkill -f "metro"

# Kill Agenteract processes
pkill -f "@agenteract/cli"

# Stop Verdaccio
pnpm verdaccio:stop

# Clean up temp directories
rm -rf /tmp/agenteract-e2e-*
```

**Expo-specific cleanup:**
```bash
# Clean up only Expo E2E processes
pkill -f "agenteract-e2e-expo"
pkill -f "agenteract-e2e-test-expo"
```

## Running in CI

The Expo E2E tests are designed to run in GitHub Actions CI. See the E2E Testing Strategy document for CI configuration.

**Security Note**: Expo E2E tests should only run on protected branches (main, release/*) because they require macOS runners.

## Differences from Vite/Flutter Tests

### Similar to Vite
- Node.js-based (uses npm/pnpm)
- All dependencies in one directory
- No separate language package manager (like Flutter's pub)

### Different from Vite
- Longer startup time (Metro bundler + native compilation)
- Requires iOS simulator or Android emulator
- Uses Expo CLI commands for launching ('i' for iOS, 'a' for Android)
- More complex build process (React Native + native code)

### Different from Flutter
- No need to install CLI tools in app directory
- Workspace dependencies work like Vite
- Uses Metro bundler instead of Flutter's compilation

## Architecture

The Expo E2E tests follow the same architecture as Vite and Flutter tests:

- **TypeScript-based**: Uses Node.js and TypeScript for test scripts
- **Agenteract CLI**: Tests the actual published packages from Verdaccio
- **Shared helpers**: Reuses helper functions from `tests/e2e/common/helpers.ts`
- **Isolated environment**: Copies app to `/tmp` to avoid polluting source directory
- **Clean setup/teardown**: Ensures proper cleanup with graceful shutdown

## Related Documentation

- [E2E Testing Strategy](../../../docs/E2E_TESTING_STRATEGY.md) - Overall E2E testing approach
- [Agenteract Agents CLI](../../../docs/AGENTS.md) - CLI commands used in tests
- [Integration Testing](../../../docs/INTEGRATION_TESTING.md) - Verdaccio setup
