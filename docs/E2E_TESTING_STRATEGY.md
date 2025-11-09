# End-to-End Testing Strategy

This document outlines the strategy for implementing end-to-end (E2E) tests for Agenteract example applications across multiple platforms (Flutter, Expo/React Native, Vite/React).

## Overview

### Current State

- **Unit tests:** Jest for JS/TS packages, Flutter test for Dart
- **Integration tests:** Verdaccio-based package installation and import verification
- **Example apps:** Three platforms (Flutter, Expo, Vite) exist with `AgentDebugBridge` already integrated
- **Agenteract instrumentation:** All example apps already have `@agenteract/agents` CLI capabilities for app control
- **CI/CD:** Runs on GitHub-hosted `ubuntu-latest` runners

### Key Insight

**Agenteract already provides E2E testing capabilities!** Instead of adding separate testing frameworks (Playwright, Detox, etc.), we can leverage the existing `@agenteract/agents` CLI that is designed to interact with apps programmatically. This provides:

- ✅ Cross-platform API (same test commands work on Flutter, Expo, Vite, Swift)
- ✅ Already integrated in all example apps via `AgentDebugBridge`
- ✅ No additional dependencies or complex setup
- ✅ Tests written in simple shell scripts using the CLI
- ✅ Same tooling developers use for debugging

### Goals

1. Verify example apps work with published packages from Verdaccio
2. Test app functionality using `@agenteract/agents` CLI (programmatic control)
3. Run locally on developer workstations before pushing
4. Run in CI on appropriate runners (self-hosted macOS for mobile, GitHub-hosted for web)
5. Maintain security against malicious contributor changes

## Architecture

### Test Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Package Publishing Phase                                 │
│    - Build all @agenteract packages                         │
│    - Publish to Verdaccio (already implemented)             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. App Installation & Build Phase                           │
│    - Install packages from Verdaccio into example apps      │
│    - Build Flutter app (if testing iOS/Android)             │
│    - Build Expo app (if testing iOS/Android)                │
│    - Build Vite app (always for web tests)                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Dev Server & App Launch                                  │
│    - Start agenteract dev (multiplexed terminal)            │
│    - Launch app(s) on simulator/emulator/browser            │
│    - Wait for AgentDebugBridge connection                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. E2E Test Execution via Agenteract CLI                    │
│    - Use agenteract-agents hierarchy to inspect UI          │
│    - Use agenteract-agents tap/input/scroll to interact     │
│    - Use agenteract-agents logs to verify behavior          │
│    - All tests are shell scripts calling CLI commands       │
└─────────────────────────────────────────────────────────────┘
```

### Agenteract CLI Commands for Testing

All E2E tests will use these existing CLI commands:

| Command | Purpose | Example |
|---------|---------|---------|
| `hierarchy <project>` | Get UI component tree | `pnpm agenteract-agents hierarchy react-app` |
| `tap <project> <testID>` | Tap/click element | `pnpm agenteract-agents tap expo-app login-button` |
| `input <project> <testID> <text>` | Enter text | `pnpm agenteract-agents input expo-app username "test@example.com"` |
| `scroll <project> <testID> <dir> [amount]` | Scroll element | `pnpm agenteract-agents scroll expo-app list down 200` |
| `swipe <project> <testID> <dir> [velocity]` | Swipe gesture | `pnpm agenteract-agents swipe expo-app card left` |
| `longPress <project> <testID>` | Long press | `pnpm agenteract-agents longPress expo-app item-1` |
| `logs <project> --since <n>` | Get app console logs | `pnpm agenteract-agents logs react-app --since 20` |
| `dev-logs <type> --since <n>` | Get dev server logs | `pnpm agenteract-agents dev-logs vite --since 20` |
| `cmd <type> <key>` | Send dev server command | `pnpm agenteract-agents cmd expo r` |

### Cross-Platform Compatibility

**Key advantage:** The same test script works across all platforms!

Example test script that works on Flutter, Expo, AND Vite:
```bash
#!/bin/bash
# Test login flow (works on any platform!)

PROJECT_NAME=$1  # "flutter-app", "expo-app", or "react-app"

# 1. Get UI hierarchy to verify login screen
pnpm agenteract-agents hierarchy $PROJECT_NAME | grep "username-input" || exit 1

# 2. Enter credentials
pnpm agenteract-agents input $PROJECT_NAME username-input "test@example.com"
pnpm agenteract-agents input $PROJECT_NAME password-input "password123"

# 3. Tap login button
pnpm agenteract-agents tap $PROJECT_NAME login-button

# 4. Wait and check logs for success
sleep 2
pnpm agenteract-agents logs $PROJECT_NAME --since 10 | grep "Login successful" || exit 1

echo "✅ Login test passed for $PROJECT_NAME"
```

## Implementation Plan

### Phase 1: Vite/React Web E2E Tests (Simplest)

**Setup requirements:**
- ✅ `AgentDebugBridge` already integrated in `examples/react-example/src/main.tsx`
- ✅ Configuration exists in `agenteract.config.js` (or needs to be created)
- ✅ All required packages already installed

**Implementation:**
```bash
tests/e2e/
├── common/                        # Shared test utilities
│   ├── assertions.sh             # Helper functions for test assertions
│   └── wait-for-connection.sh    # Wait for AgentDebugBridge to connect
├── vite/
│   ├── test-app-launch.sh        # Test: App loads successfully
│   ├── test-bridge-connection.sh # Test: AgentDebugBridge connects
│   └── test-basic-interaction.sh # Test: Click buttons, enter text
└── run-vite-e2e.sh               # Main runner script
```

**Test script example:**
```bash
#!/bin/bash
# tests/e2e/vite/test-app-launch.sh
set -e

echo "Starting Vite E2E test: App Launch"

# Start Verdaccio (if not already running)
pnpm verdaccio:start

# Install packages from Verdaccio
cd examples/react-example
npm config set registry http://localhost:4873
pnpm install --no-frozen-lockfile

# Build and start dev server in background
pnpm build
pnpm preview &
DEV_SERVER_PID=$!

# Start agenteract dev server in background
pnpm agenteract dev &
AGENT_SERVER_PID=$!

# Wait for servers to be ready
sleep 5

# Open browser (or use headless browser)
# For CI, use Puppeteer or similar to open http://localhost:4173

# Wait for AgentDebugBridge connection
timeout 30 bash -c 'until pnpm agenteract-agents hierarchy react-app 2>/dev/null; do sleep 1; done'

# Verify UI loaded
pnpm agenteract-agents hierarchy react-app | grep "root" || {
  echo "❌ App failed to load"
  kill $DEV_SERVER_PID $AGENT_SERVER_PID
  exit 1
}

echo "✅ Vite app launched successfully"

# Cleanup
kill $DEV_SERVER_PID $AGENT_SERVER_PID
```

**Estimated effort:** 2-3 days

### Phase 2: Flutter E2E Tests

**Setup requirements:**
- ✅ `AgentDebugBridge` already integrated in `examples/flutter_example/lib/main.dart`
- Need to verify `agenteract.config.js` includes Flutter config
- Need iOS Simulator / Android Emulator

**Implementation:**
```bash
tests/e2e/
├── flutter/
│   ├── test-app-launch-ios.sh        # Test: Launch on iOS simulator
│   ├── test-app-launch-android.sh    # Test: Launch on Android emulator
│   ├── test-widget-interaction.sh    # Test: Tap buttons with .withAgent()
│   └── test-bridge-connection.sh     # Test: Bridge connects on both platforms
└── run-flutter-e2e.sh                # Main runner script
```

**Test script example:**
```bash
#!/bin/bash
# tests/e2e/flutter/test-app-launch-ios.sh
set -e

echo "Starting Flutter E2E test: iOS Launch"

# Prerequisites check
flutter doctor || exit 1
xcrun simctl list devices | grep "iPhone" || exit 1

# Start Verdaccio
pnpm verdaccio:start

# Install packages from Verdaccio
cd examples/flutter_example
flutter pub get

# Start agenteract dev server
pnpm agenteract dev &
AGENT_SERVER_PID=$!

# Launch app on iOS simulator (will auto-start Flutter dev server via PTY)
flutter run -d iphone &
FLUTTER_PID=$!

# Wait for AgentDebugBridge connection
timeout 60 bash -c 'until pnpm agenteract-agents hierarchy flutter-app 2>/dev/null; do sleep 2; done'

# Check both dev logs and app logs
pnpm agenteract-agents dev-logs flutter --since 20 | grep "Flutter run key commands" || exit 1
pnpm agenteract-agents logs flutter-app --since 10 | grep "AgentDebugBridge" || exit 1

# Verify UI hierarchy
pnpm agenteract-agents hierarchy flutter-app | grep "MaterialApp" || exit 1

echo "✅ Flutter iOS app launched successfully"

# Cleanup
kill $FLUTTER_PID $AGENT_SERVER_PID
```

**Estimated effort:** 3-4 days

### Phase 3: Expo E2E Tests

**Setup requirements:**
- ✅ `AgentDebugBridge` already integrated in `examples/expo-example/app/App.tsx`
- Need to verify `agenteract.config.js` includes Expo config
- Need iOS Simulator / Android Emulator

**Implementation:**
```bash
tests/e2e/
├── expo/
│   ├── test-app-launch-ios.sh        # Test: Launch on iOS simulator
│   ├── test-app-launch-android.sh    # Test: Launch on Android emulator
│   ├── test-navigation.sh            # Test: Navigate between screens
│   └── test-bridge-connection.sh     # Test: Bridge connects
└── run-expo-e2e.sh                   # Main runner script
```

**Test script example:**
```bash
#!/bin/bash
# tests/e2e/expo/test-app-launch-ios.sh
set -e

echo "Starting Expo E2E test: iOS Launch"

# Start Verdaccio
pnpm verdaccio:start

# Install packages
cd examples/expo-example
npm config set registry http://localhost:4873
pnpm install --no-frozen-lockfile

# Start agenteract dev server
pnpm agenteract dev &
AGENT_SERVER_PID=$!

# Expo dev server starts automatically via agenteract config

# Wait for Expo to be ready
sleep 5

# Launch iOS app via agenteract CLI
pnpm agenteract-agents cmd expo i

# Wait for AgentDebugBridge connection
timeout 60 bash -c 'until pnpm agenteract-agents hierarchy expo-app 2>/dev/null; do sleep 2; done'

# Verify UI
pnpm agenteract-agents hierarchy expo-app | grep "View" || exit 1

echo "✅ Expo iOS app launched successfully"

# Cleanup
pnpm agenteract-agents cmd expo q  # Quit Expo
kill $AGENT_SERVER_PID
```

**Estimated effort:** 3-4 days

### Phase 4: Common Test Suite

Create a shared test suite that runs across all platforms:

```bash
tests/e2e/
├── common-tests/
│   ├── test-login-flow.sh           # Reusable login test
│   ├── test-navigation.sh           # Reusable navigation test
│   ├── test-form-input.sh           # Reusable form test
│   └── test-scroll-and-tap.sh       # Reusable interaction test
└── run-all-platforms.sh             # Run common tests on all platforms
```

**Example of cross-platform test:**
```bash
#!/bin/bash
# tests/e2e/common-tests/test-login-flow.sh
# Usage: ./test-login-flow.sh <project-name>

PROJECT=$1
set -e

echo "Testing login flow on $PROJECT"

# 1. Verify login screen loaded
pnpm agenteract-agents hierarchy $PROJECT --filter-key testID --filter-value login-form \
  | grep "username-input" || exit 1

# 2. Enter username
pnpm agenteract-agents input $PROJECT username-input "test@example.com"
sleep 0.5

# 3. Enter password
pnpm agenteract-agents input $PROJECT password-input "password123"
sleep 0.5

# 4. Tap login button
pnpm agenteract-agents tap $PROJECT login-button --wait 2000

# 5. Verify success in logs
pnpm agenteract-agents logs $PROJECT --since 20 | grep "Login successful" || exit 1

# 6. Verify navigation to home screen
pnpm agenteract-agents hierarchy $PROJECT | grep "home-screen" || exit 1

echo "✅ Login flow test passed on $PROJECT"
```

**Estimated effort:** 2 days

## Local Development Workflow

### Prerequisites

**All developers need:**
- Docker (for Verdaccio)
- Node.js 20+ and pnpm
- Git

**Platform-specific (optional):**
- **Web only:** Any browser (Chrome, Firefox, Safari)
- **Flutter:** Flutter SDK 3.27.2+, iOS Simulator or Android Emulator
- **iOS:** macOS with Xcode
- **Android:** Android Studio with emulator (works on macOS, Linux, Windows)

### Complete Local E2E Test Workflow

```bash
# 1. Start Verdaccio
pnpm verdaccio:start

# 2. Build and publish packages
pnpm verdaccio:publish

# 3. Run E2E tests for each platform
pnpm test:e2e:vite           # Web tests (works on any OS)
pnpm test:e2e:flutter:ios    # Flutter iOS tests (macOS only)
pnpm test:e2e:flutter:android # Flutter Android tests (any OS)
pnpm test:e2e:expo:ios       # Expo iOS tests (macOS only)
pnpm test:e2e:expo:android   # Expo Android tests (any OS)

# Or run all E2E tests (skips unavailable platforms)
pnpm test:e2e:all

# 4. Cleanup
pnpm verdaccio:stop
```

### Add to package.json

```json
{
  "scripts": {
    "test:e2e:vite": "bash tests/e2e/run-vite-e2e.sh",
    "test:e2e:flutter": "bash tests/e2e/run-flutter-e2e.sh",
    "test:e2e:flutter:ios": "bash tests/e2e/flutter/test-app-launch-ios.sh",
    "test:e2e:flutter:android": "bash tests/e2e/flutter/test-app-launch-android.sh",
    "test:e2e:expo": "bash tests/e2e/run-expo-e2e.sh",
    "test:e2e:expo:ios": "bash tests/e2e/expo/test-app-launch-ios.sh",
    "test:e2e:expo:android": "bash tests/e2e/expo/test-app-launch-android.sh",
    "test:e2e:all": "bash tests/e2e/run-all-e2e.sh"
  }
}
```

### Pre-Push Hook (Optional)

Add to `.husky/pre-push`:
```bash
#!/bin/sh
# Run E2E tests before pushing to main/release branches
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$BRANCH" == "main" || "$BRANCH" == release/* ]]; then
  echo "Running E2E tests before push to $BRANCH..."

  # Run web tests (always available)
  pnpm test:e2e:vite || exit 1

  # Run mobile tests if available (won't fail if simulators not installed)
  pnpm test:e2e:flutter:ios || echo "⚠️ Flutter iOS tests skipped"
  pnpm test:e2e:expo:android || echo "⚠️ Expo Android tests skipped"
fi
```

## CI/CD Workflow

### Security Considerations for Self-Hosted Runners

#### Critical Security Risks

**Self-hosted runners are NOT safe for public repositories** because:
- Any contributor can open a pull request with malicious code
- Malicious workflows can execute arbitrary code on the runner
- Attackers can access internal networks
- Non-ephemeral runners can be backdoored for persistent access

Recent incidents (2025):
- `tj-actions/changed-files@v44` compromised with obfuscated RCE code
- Affected 20,000+ repositories
- Multiple Fortune-500 companies exploited via `pull_request_target` misconfiguration

#### Recommended Security Measures

**1. Never Run E2E Tests on PRs from Forks**

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, release/**]  # Only on protected branches
  workflow_dispatch:              # Manual trigger only

  # NEVER use:
  # pull_request:                 # ❌ Runs untrusted code
  # pull_request_target:          # ❌ Dangerous if misused
```

**2. Web Tests on GitHub-Hosted (PRs Welcome)**

Web E2E tests are safe to run on PRs because:
- They run on ephemeral GitHub-hosted runners
- No access to internal infrastructure
- Isolated containers destroyed after each run

```yaml
# .github/workflows/e2e-web.yml
name: E2E Web Tests

on:
  pull_request:    # Safe to run on PRs
    branches: [main, develop]
  push:
    branches: [main, release/**]

jobs:
  e2e-web:
    runs-on: ubuntu-latest
    services:
      verdaccio:
        image: verdaccio/verdaccio:5
        ports:
          - 4873:4873
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10.9.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm build

      - name: Publish to Verdaccio
        run: |
          npm config set registry http://localhost:4873
          node scripts/verdaccio-auth.ts
          pnpm run -r publish --no-git-checks --registry http://localhost:4873 || true

      - name: Install Puppeteer (headless browser)
        run: pnpm add -g puppeteer

      - name: Run Vite E2E Tests
        run: pnpm test:e2e:vite
```

**3. Mobile Tests on Self-Hosted (Protected Branches Only)**

```yaml
# .github/workflows/e2e-mobile.yml
name: E2E Mobile Tests

on:
  push:
    branches: [main, release/**]  # ONLY protected branches
  workflow_dispatch:              # Manual trigger

jobs:
  e2e-mobile:
    runs-on: [self-hosted, macOS, ephemeral]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10.9.0

      - name: Start Verdaccio
        run: pnpm verdaccio:start

      - name: Build and publish packages
        run: pnpm verdaccio:publish

      - name: Run Flutter E2E Tests
        run: |
          pnpm test:e2e:flutter:ios
          pnpm test:e2e:flutter:android

      - name: Run Expo E2E Tests
        run: |
          pnpm test:e2e:expo:ios
          pnpm test:e2e:expo:android

      - name: Cleanup
        if: always()
        run: |
          pnpm verdaccio:stop
          # Kill any remaining simulator processes
          killall Simulator || true
```

**4. Use Ephemeral Runners**

Create fresh runner VMs for each job:
```bash
# Option A: GitHub's ephemeral runner mode
./config.sh --ephemeral

# Option B: Use VM snapshots (Tart, Anka, etc.)
# Restore clean VM snapshot before each job

# Option C: Docker-based runners (macOS-in-Docker via Tart)
# Spin up containerized macOS for each job
```

**5. Network Isolation & Monitoring**

Self-hosted runners should:
- Run in isolated VLAN/subnet
- Have no access to internal production systems
- Use egress filtering (allow only necessary outbound: npm, GitHub, etc.)
- Monitor network activity for anomalies
- Log all process execution (auditd/OpenBSM)

### Recommended CI Strategy

**Hybrid Approach (Recommended):**

```
┌─────────────────────────────────────────────────────────┐
│ Pull Requests (GitHub-Hosted)                           │
│ ✅ Run: CI + Unit Tests + Web E2E Tests                 │
│ ⏩ Duration: ~5-8 minutes                                │
│ 💰 Cost: ~$0.04/run (ubuntu-latest)                     │
│ 🔒 Security: High (ephemeral, isolated)                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Push to main/release (Self-Hosted macOS)                │
│ ✅ Run: CI + Unit Tests + All E2E Tests (web + mobile)  │
│ ⏩ Duration: ~15-20 minutes                              │
│ 💰 Cost: Low (self-hosted)                              │
│ 🔒 Security: Medium (only approved code)                │
└─────────────────────────────────────────────────────────┘
```

**Benefits:**
- PRs get fast feedback with web E2E tests (safe)
- Mobile E2E tests only run on approved code
- Cost-effective (most runs are web-only on cheap runners)
- Secure (no untrusted code on self-hosted runners)

### Alternative: GitHub-Hosted Only (Most Secure)

If security concerns outweigh cost, use GitHub-hosted runners exclusively with smart caching.

#### Option 1: iOS-Only + Smart Caching (Recommended)

**Strategy:**
- Test iOS Simulator only (Android issues usually show up on iOS too)
- Use path filtering to skip unchanged apps
- Cache dependencies and builds

```yaml
# .github/workflows/e2e-mobile.yml
name: E2E Mobile Tests

on:
  push:
    branches: [main, release/**]

jobs:
  check-changes:
    runs-on: ubuntu-latest  # Cheap runner for checking
    outputs:
      expo-changed: ${{ steps.changes.outputs.expo }}
      flutter-changed: ${{ steps.changes.outputs.flutter }}
      packages-changed: ${{ steps.changes.outputs.packages }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: dorny/paths-filter@v2
        id: changes
        with:
          filters: |
            expo:
              - 'examples/expo-example/**'
              - 'packages/expo/**'
              - 'packages/react/**'
              - 'packages/core/**'
              - 'packages/server/**'
              - 'pnpm-lock.yaml'
            flutter:
              - 'examples/flutter_example/**'
              - 'packages/flutter/**'
              - 'pubspec.lock'
            packages:
              - 'packages/**'

  e2e-expo-ios:
    needs: check-changes
    if: needs.check-changes.outputs.expo-changed == 'true' || needs.check-changes.outputs.packages-changed == 'true'
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10.9.0

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.pnpm-store
            node_modules
            examples/expo-example/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Cache iOS build
        uses: actions/cache@v4
        with:
          path: |
            ~/Library/Developer/Xcode/DerivedData
            examples/expo-example/ios/build
          key: ${{ runner.os }}-expo-ios-${{ hashFiles('examples/expo-example/ios/**', 'examples/expo-example/package.json') }}

      - name: Run Expo iOS E2E Tests
        run: pnpm test:e2e:expo:ios

  e2e-flutter-ios:
    needs: check-changes
    if: needs.check-changes.outputs.flutter-changed == 'true' || needs.check-changes.outputs.packages-changed == 'true'
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: 3.27.2
          cache: true

      - name: Run Flutter iOS E2E Tests
        run: pnpm test:e2e:flutter:ios

  e2e-vite:
    runs-on: ubuntu-latest  # Web tests always run
    steps:
      - uses: actions/checkout@v4
      - name: Run Vite E2E Tests
        run: pnpm test:e2e:vite
```

**Cost breakdown (iOS-only with smart caching):**

*Per-run costs:*
- Expo iOS: ~8 min × $0.16/min = **$1.28** (when Expo changes)
- Flutter iOS: ~8 min × $0.16/min = **$1.28** (when Flutter changes)
- Vite web: ~5 min × $0.008/min = **$0.04** (every run)
- Change detection: ~1 min × $0.008/min = **$0.008** (every run)

*Monthly costs (50 pushes, typical scenario):*
- 15 pushes affect all platforms: 15 × ($1.28 + $1.28 + $0.04) = **$39.00**
- 20 pushes affect Expo only: 20 × ($1.28 + $0.04) = **$26.40**
- 10 pushes affect Flutter only: 10 × ($1.28 + $0.04) = **$13.20**
- 5 pushes affect web only: 5 × $0.04 = **$0.20**
- **Monthly total: ~$78.80** (vs $120 without optimization)
- **Annual cost: ~$945**

**Savings with caching:**
- Path filtering: **~35% reduction** (skips unchanged apps)
- Dependency caching: **~20% time reduction** per run (2-3 min saved)
- Combined savings: **~45-50% vs naive approach**

**Benefits:**
- ✅ Most cost-effective GitHub-hosted option
- ✅ Covers majority of platform issues (iOS catches most bugs)
- ✅ Fast feedback (skips unchanged apps)
- ✅ Secure (ephemeral runners)
- ✅ No infrastructure maintenance

**Trade-offs:**
- ⚠️ Android-specific issues not caught immediately
- ⚠️ Need manual Android testing before major releases
- ⚠️ Can add Android testing later if needed

#### Option 2: iOS + Android with Smart Caching

If you need both platforms tested:

**Cost estimation:**
- Per full run (iOS + Android): ~16 min × $0.16/min = **$2.56**
- Monthly (with smart caching, 50 pushes): **~$110-130**
- Annual: **~$1,320-1,560**

**When to choose this:**
- Production app with significant Android user base
- History of Android-specific bugs
- Budget allows for comprehensive testing

#### Option 3: Rotating Platform Testing

Test iOS on every push, Android only on releases or weekly:

**Cost estimation:**
- iOS tests (50 pushes): 50 × $1.28 = **$64**
- Android tests (8 releases/month): 8 × $1.28 = **$10.24**
- Monthly total: **~$75**

**Benefits:**
- ✅ Similar cost to iOS-only
- ✅ Regular Android validation
- ✅ Full coverage before releases

## Advantages of Using Agenteract for E2E Testing

### 1. **Zero Additional Dependencies**
- No need for Playwright, Detox, Maestro, or Appium
- Uses existing `@agenteract/agents` CLI
- Already integrated in all example apps

### 2. **Cross-Platform Test Reuse**
- Same test commands work on Flutter, Expo, Vite, and Swift
- Write once, run everywhere
- Reduces maintenance burden

### 3. **Simple Shell Script Tests**
- Tests are bash scripts calling CLI commands
- Easy to read, write, and debug
- No complex test framework to learn
- Can be run manually for debugging

### 4. **Consistent with Development Workflow**
- Same tools developers use for debugging
- Same `AgentDebugBridge` setup
- No "test-only" code paths

### 5. **Headless or Interactive**
- Can run tests with visible UI (local development)
- Can run tests headless (CI/CD)
- Easy to switch between modes

### 6. **Built-in Logging**
- Automatic log capture with every interaction
- Dev server logs AND app console logs
- No need for separate logging setup

### 7. **Future-Proof**
- As Agenteract adds new platforms (Swift, etc.), tests work automatically
- New CLI features benefit test scripts immediately
- Tests evolve with the product

## Open Questions and Decisions Needed

### 1. Runner Strategy ✅ DECISION: Option 1 (iOS-Only + Smart Caching)

**Question:** Which CI strategy should we use?

**Chosen approach:** **GitHub-hosted runners with iOS-only testing and smart caching**
- Cost: ~$78/month (~$945/year)
- Path filtering skips unchanged apps (~35% cost reduction)
- Dependency caching reduces build time (~20% time reduction)
- Combined savings: ~45-50% vs naive approach

**Why this approach:**
- ✅ Most cost-effective for security (ephemeral runners)
- ✅ iOS Simulator catches majority of cross-platform bugs
- ✅ No infrastructure maintenance overhead
- ✅ Can add Android testing later if needed

**Alternative options considered:**
- A. Hybrid (web on GitHub, mobile on self-hosted): Security risks with self-hosted runners
- B. GitHub-hosted iOS + Android: ~$110-130/month (~40% more expensive)
- C. Manual mobile E2E: Slows down release velocity

### 2. Headless Browser for Web Tests

**Question:** How to run web E2E tests in CI without visible browser?

**Options:**
- A. Use Puppeteer to launch headless Chrome and navigate to preview URL
- B. Use Playwright (more complex, but supports multiple browsers)
- C. Use simple HTTP check to verify app loads, skip actual interactions

**Recommendation:** **Option A (Puppeteer)** for simplicity. Just need to open the page, AgentDebugBridge will connect automatically.

**Implementation:**
```javascript
// tests/e2e/common/launch-browser.js
const puppeteer = require('puppeteer');

async function launchAndWait(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url);

  // Wait for AgentDebugBridge to connect
  await page.waitForSelector('[data-agenteract-bridge]', { timeout: 30000 });

  console.log('✅ Browser launched and AgentDebugBridge connected');

  // Keep browser open for tests
  return browser;
}

module.exports = { launchAndWait };
```

### 3. Test Scope

**Question:** How comprehensive should initial E2E tests be?

**Options:**
- A. Smoke tests only (app launches, bridge connects)
- B. Critical path tests (basic interactions: tap, input, scroll)
- C. Comprehensive tests (all features, edge cases)

**Recommendation:** Start with **Option B (Critical path)**, expand to C over time.

**Initial test suite:**
- ✅ App launches successfully
- ✅ AgentDebugBridge connects
- ✅ Basic UI interactions work (tap, input)
- ✅ Logs are captured correctly
- ✅ Navigation works
- ⏭️ Complex gestures (swipe, longPress) - Phase 2
- ⏭️ Error handling - Phase 2
- ⏭️ Performance tests - Phase 3

### 4. Self-Hosted Runner Infrastructure (if using)

**Question:** What infrastructure for self-hosted runners?

**Options:**
- A. Dedicated Mac Mini (one-time cost ~$600, 3-5 year lifespan)
- B. MacStadium or similar (cloud macOS VMs, ~$50-100/month)
- C. Tart + Anka for ephemeral VMs (more secure, complex setup)

**Recommendation:** Start with **Option B (MacStadium)** for easy ephemeral VMs, evaluate A for cost savings later.

### 5. Test Data and Fixtures

**Question:** How do we manage test data for E2E tests?

**Options:**
- A. Hardcoded test data in scripts (simple, works for basic tests)
- B. Mock backend responses via AgentDebugBridge
- C. Test backend server with seed data

**Recommendation:** Start with **Option A (Hardcoded)**, add B if needed for complex scenarios.

### 6. CI Test Timeouts

**Question:** What timeouts for E2E tests in CI?

**Recommendation:**
- App launch timeout: 60 seconds
- Bridge connection timeout: 30 seconds
- Individual test timeout: 5 minutes
- Total E2E suite timeout: 20 minutes

## Implementation Timeline

**Realistic estimate: 3-5 days** (not 6 weeks!)

Since `AgentDebugBridge` is already integrated and `@agenteract/agents` CLI works, this is much simpler than a traditional E2E setup.

### Day 1: Basic Test Infrastructure (3-4 hours)
- [ ] Create `tests/e2e/` directory structure
- [ ] Write simple bash script to:
  - Start Verdaccio
  - Publish packages
  - Launch one example app (Vite is easiest)
  - Wait for bridge connection
  - Run `agenteract-agents hierarchy` to verify it works
  - Kill processes and cleanup
- [ ] Test locally to validate approach

### Day 2: Web E2E Tests (4-5 hours)
- [ ] Add Puppeteer to launch headless browser for Vite app
- [ ] Write basic test: verify hierarchy, tap button, check logs
- [ ] Create helper script for assertions
- [ ] Add npm script: `pnpm test:e2e:vite`
- [ ] Test locally

### Day 3: Mobile E2E Tests (4-6 hours)
- [ ] Copy and adapt Vite test script for Expo iOS
- [ ] Copy and adapt Vite test script for Flutter iOS
- [ ] Handle platform-specific startup:
  - Expo: `pnpm agenteract dev` → launch via CLI
  - Flutter: `flutter run -d iphone` in background
- [ ] Add npm scripts: `pnpm test:e2e:expo:ios`, `pnpm test:e2e:flutter:ios`
- [ ] Test locally on simulators

### Day 4: CI/CD Integration (3-4 hours)
- [ ] Create `.github/workflows/e2e-web.yml` for web tests (PRs)
- [ ] Create `.github/workflows/e2e-mobile.yml` with path filtering
- [ ] Add caching for dependencies and builds
- [ ] Test workflows on a branch
- [ ] Adjust timeouts and cleanup steps as needed

### Day 5: Polish & Documentation (2-3 hours)
- [ ] Add master runner script: `pnpm test:e2e:all`
- [ ] Update root package.json with all E2E scripts
- [ ] Add basic troubleshooting to README or docs
- [ ] Create simple example of adding a new test

**Total effort: ~20-25 hours spread over 3-5 days**

## Success Criteria

- [ ] All three example apps have automated E2E tests using Agenteract CLI
- [ ] E2E tests run locally on developer workstations
- [ ] E2E tests run in CI on appropriate branches
- [ ] Security measures prevent untrusted code execution
- [ ] Tests catch regressions before releases
- [ ] Documentation enables new contributors to run tests
- [ ] Test execution time is reasonable (<20 minutes total)
- [ ] CI costs are within budget
- [ ] Tests use only Agenteract instrumentation (no external testing frameworks)
- [ ] Test scripts are simple bash scripts (easy to maintain)

## Comparison: Agenteract vs Traditional Testing Tools

| Feature | Agenteract CLI | Playwright/Cypress | Detox/Maestro |
|---------|---------------|-------------------|---------------|
| **Cross-platform** | ✅ Flutter, Expo, Vite, Swift | ⚠️ Web only | ⚠️ Mobile only |
| **Setup complexity** | ✅ Already integrated | ⚠️ Additional config | ❌ Complex setup |
| **Test language** | ✅ Bash (simple) | ⚠️ JS/TS | ⚠️ JS/YAML |
| **Dependencies** | ✅ Zero (uses existing CLI) | ❌ Large (chromium, etc.) | ❌ Native automation |
| **Maintenance** | ✅ Low (evolves with product) | ⚠️ Medium (API changes) | ❌ High (brittle) |
| **Debug workflow** | ✅ Same as dev | ⚠️ Different | ❌ Very different |
| **CI requirements** | ✅ Minimal | ⚠️ Browser binaries | ❌ Simulators/emulators |
| **Test reusability** | ✅ Write once, run everywhere | ❌ Web-specific | ❌ Mobile-specific |

## Resources

### Agenteract Documentation
- [AGENTS.md](./AGENTS.md) - Complete guide to `@agenteract/agents` CLI
- [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md) - Verdaccio setup
- [CI_CD_SUMMARY.md](./CI_CD_SUMMARY.md) - Current CI/CD workflows
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) - Release procedures

### Security References
- **GitHub Actions Security:** https://docs.github.com/en/actions/security-for-github-actions
- **Self-Hosted Runner Security:** https://actuated.com/blog/is-the-self-hosted-runner-safe-github-actions
- **CI/CD Security (OWASP):** https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html
- **NSA CI/CD Security Guidance:** https://media.defense.gov/2023/Jun/28/2003249466/-1/-1/0/CSI_DEFENDING_CI_CD_ENVIRONMENTS.PDF

### Tools for CI
- **Puppeteer (headless browser):** https://pptr.dev
- **Tart (macOS VMs):** https://github.com/cirruslabs/tart
- **GitHub Actions Services:** https://docs.github.com/en/actions/using-containerized-services

---

**Status:** Ready for review and implementation
**Created:** 2025-11-09
**Updated:** 2025-11-09 (revised to use Agenteract CLI)
**Author:** Claude Code
**Next Steps:**
1. Review and approve approach
2. Answer open questions (runner strategy, headless browser method)
3. Begin Week 1 implementation
