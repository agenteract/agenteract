---
name: agenteract-testing
description: Run unit, integration, Flutter, and e2e tests for the Agenteract monorepo during development, including Verdaccio-based integration tests
license: Apache-2.0
compatibility: opencode
metadata:
  audience: maintainers
  workflow: testing
---

## What I do

Cover all dev-time testing for the Agenteract monorepo itself: unit tests per package, Flutter package tests, Verdaccio-based integration tests, and full end-to-end tests across all supported platforms.

## Unit Tests

The monorepo uses Jest.

```bash
# Run all package unit tests + version script tests
pnpm test

# Run tests for a single package
pnpm --filter @agenteract/react test
pnpm --filter @agenteract/core test
pnpm --filter @agenteract/server test

# Flutter package tests (run separately from JS tests)
pnpm test:flutter
# Equivalent to:
#   cd packages/flutter && flutter test
#   cd examples/flutter_example && flutter test
```

CI runs `pnpm test` on every push and pull request to `main`.

## Integration Tests (Verdaccio)

Integration tests verify that packages install and work correctly after publication, using [Verdaccio](https://verdaccio.org/) as a local private npm registry.

```bash
# Full workflow: start Verdaccio → publish → test → stop
pnpm test:full_integration

# Or step by step:
pnpm verdaccio:start
pnpm verdaccio:publish
pnpm test:integration
pnpm verdaccio:stop
```

### Verdaccio Commands

Verdaccio uses a build cache so unchanged packages are not republished. The cache is keyed on build output.

| Command | Description |
|---------|-------------|
| `pnpm verdaccio:start` | Start the registry server |
| `pnpm verdaccio:stop` | Stop the registry server |
| `pnpm verdaccio:publish` | Publish packages (respects cache) |
| `pnpm verdaccio:publish:no-cache` | Force republish all packages |
| `pnpm verdaccio:clean` | Stop, clear cache, restart fresh |
| `pnpm verdaccio:test` | Verify authentication works |
| `pnpm cache:clear:verdaccio` | Clear only the Verdaccio build cache |

If you suspect stale packages, do a clean republish before running tests:

```bash
pnpm verdaccio:start
pnpm verdaccio:clean
pnpm build
pnpm verdaccio:publish
```

CI runs integration tests automatically on PRs and pushes to `main` and `release/**` branches using Verdaccio as a service container. Authentication is automated via `expect` — see `docs/VERDACCIO_AUTH.md`.

See `docs/INTEGRATION_TESTING.md` for complete details.

## E2E Tests

E2E tests confirm that `AgentDebugBridge` and the dev CLI work together correctly end-to-end. They require a built + published local registry before running.

```bash
pnpm test:e2e:vite
pnpm test:e2e:expo:ios
pnpm test:e2e:expo:ios:prebuild
pnpm test:e2e:expo:android
pnpm test:e2e:expo:android:prebuild
pnpm test:e2e:flutter:ios
pnpm test:e2e:swift:ios
pnpm test:e2e:kotlin
pnpm test:e2e:kotlin:ios-build
pnpm test:e2e:kotlin:android
pnpm test:e2e:lifecycle

# Run Vite + Expo iOS + Flutter iOS + Swift iOS together
pnpm test:e2e:all
```

> **Note:** Expo e2e tests are currently disabled in CI due to an undiagnosed issue where the app doesn't respond. They can still be run locally.

### E2E Test Source Locations

| Suite | File |
|-------|------|
| Vite | `tests/e2e/vite/test-app-launch.ts` |
| Expo | `tests/e2e/expo/test-app-launch.ts` |
| Flutter iOS | `tests/e2e/flutter/test-app-launch-ios.ts` |
| Swift/iOS | `tests/e2e/swiftui/test-app-launch-ios.ts` |
| Kotlin | `tests/e2e/kotlin/test-app-launch.ts` |
| Lifecycle | `tests/e2e/lifecycle/test-lifecycle-commands.ts` |
| AgentClient API | `tests/e2e/node-client/test-agent-client.ts` |

### Cleanup

```bash
pnpm test:e2e:cleanup
```

Runs `tests/e2e/cleanup-all.ts` to kill any leftover processes from e2e runs.

## Verification Checklist

After changes, confirm:

- [ ] `pnpm build` succeeds for all packages
- [ ] `pnpm test` passes
- [ ] Agenteract server starts on the configured port (default 8766)
- [ ] All configured apps connect to the server
- [ ] `getViewHierarchy` returns a valid JSON tree:
  ```bash
  curl -s -X POST http://localhost:8766/expo-app -d '{"action":"getViewHierarchy"}'
  ```
