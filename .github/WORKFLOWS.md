# GitHub Actions Workflows

This document describes the CI/CD workflows configured for this repository.

## Workflows

### `ci.yml` - Continuous Integration

**Triggers:** Push and PR to `main` or `develop` branches

**Purpose:** Fast feedback for basic checks

**Steps:**
1. Checkout code
2. Setup Node.js & pnpm
3. Install dependencies
4. Build all packages
5. Run unit tests

**Duration:** ~2-3 minutes

---

### `integration-test.yml` - Integration Tests

**Triggers:** Push and PR to `main` or `develop` branches

**Purpose:** Verify packages work after publication

**Steps:**
1. Start Verdaccio as a Docker service
2. Checkout code
3. Setup Node.js & pnpm
4. Install dependencies
5. **Install `expect` for authentication** (Ubuntu runners don't include it)
6. Build all packages
7. Configure npm registry to use Verdaccio
8. Authenticate with Verdaccio using `expect`
9. Publish all `@agenteract/*` packages to Verdaccio
10. Verify packages are available
11. Run integration tests (install and import packages)
12. Run custom integration test scripts (if present)

**Duration:** ~5-6 minutes (includes `expect` installation)

**Services:**
- `verdaccio` - Lightweight npm registry on port 4873
  - Health checks every 10s
  - Auto-restarts on failure

---

## Workflow Visualization

```
┌──────────────────────────────────────┐
│         Push / PR to main            │
└──────────┬───────────────────────────┘
           │
           ├─────────────┬─────────────┐
           ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │   CI     │  │Integration│  │  Other   │
    │  Build   │  │   Tests   │  │ Checks   │
    │  & Test  │  │(Verdaccio)│  │          │
    └──────────┘  └──────────┘  └──────────┘
```

Both workflows run in parallel for faster feedback.

---

## Local Simulation

You can simulate the GitHub Actions workflows locally:

### Simulate CI Workflow

```bash
pnpm install
pnpm build
pnpm test
```

### Simulate Integration Tests

```bash
# Start Verdaccio (simulates the service)
docker run -d --name verdaccio -p 4873:4873 verdaccio/verdaccio:5

# Run the integration test workflow
pnpm install
pnpm build
npm config set registry http://localhost:4873/
npx npm-cli-adduser -r http://localhost:4873 -u test -p test -e test@test.com
pnpm -r --filter "@agenteract/*" exec npm publish --registry http://localhost:4873
pnpm test:integration

# Cleanup
docker stop verdaccio && docker rm verdaccio
npm config delete registry
```

Or use the helper scripts:

```bash
pnpm verdaccio:start
pnpm verdaccio:publish
pnpm test:integration
pnpm verdaccio:stop
```

---

## Adding New Workflows

To add a new workflow:

1. Create a `.yml` file in `.github/workflows/`
2. Define triggers (e.g., `on: push`, `on: pull_request`)
3. Define jobs with steps
4. Test locally if possible
5. Commit and push to trigger the workflow

Example:

```yaml
name: My Workflow

on:
  push:
    branches: [ main ]

jobs:
  my-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello World"
```

---

## Troubleshooting

### Workflow fails at "Install dependencies"

**Cause:** Lock file out of sync or network issues

**Fix:**
```bash
pnpm install
# Commit pnpm-lock.yaml if changed
```

### Integration tests fail at "Publish packages"

**Cause:** Package version already exists in Verdaccio cache

**Fix:** Verdaccio service is recreated each run, so this shouldn't happen. If it does, bump the version in `package.json`.

### Verdaccio service doesn't start

**Cause:** Docker image pull failure or port conflict

**Fix:** GitHub Actions handles this automatically. If persistent, check GitHub status page.

### Tests pass locally but fail in CI

**Cause:** Environment differences, missing files, or race conditions

**Fix:**
- Check the workflow logs for specific errors
- Verify all files are committed (not in `.gitignore`)
- Ensure tests don't depend on local state

---

## Best Practices

1. **Keep workflows fast** - Parallel jobs, minimal steps
2. **Cache dependencies** - Use `cache: 'pnpm'` in setup-node action
3. **Use specific versions** - Pin action versions (e.g., `@v4`)
4. **Test locally first** - Simulate workflows before pushing
5. **Meaningful names** - Clear workflow and job names
6. **Fail fast** - Don't continue if critical steps fail
7. **Artifacts** - Save build outputs for debugging if needed

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [pnpm in CI](https://pnpm.io/continuous-integration)
- [Verdaccio in CI](https://verdaccio.org/docs/ci)
- [Service Containers](https://docs.github.com/en/actions/using-containerized-services)

