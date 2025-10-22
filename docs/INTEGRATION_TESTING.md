# Integration Testing with Verdaccio

This document describes how to run integration tests for the Agenteract monorepo using Verdaccio, a lightweight private npm proxy registry.

## Overview

Integration testing ensures that:
- All packages build correctly
- Packages can be published to an npm registry
- Packages can be installed and imported by consumers
- Workspace dependencies resolve correctly
- Package exports are properly configured

## Local Testing

### Prerequisites

- Docker installed and running
- Node.js and pnpm installed

### Quick Start

1. **Start Verdaccio:**
   ```bash
   pnpm verdaccio:start
   ```
   This starts Verdaccio in a Docker container at `http://localhost:4873`

2. **Build and publish packages:**
   ```bash
   pnpm verdaccio:publish
   ```
   This builds all packages and publishes them to the local Verdaccio registry.

3. **Run integration tests:**
   ```bash
   pnpm test:integration
   ```
   This creates a temporary npm project, installs your packages from Verdaccio, and verifies they can be imported.

4. **Stop Verdaccio:**
   ```bash
   pnpm verdaccio:stop
   ```
   This stops and removes the Verdaccio container and resets your npm registry config.

### Manual Testing

You can also manually test package installation:

```bash
# Start Verdaccio
pnpm verdaccio:start

# Publish packages
pnpm verdaccio:publish

# Create a test project
mkdir /tmp/my-test && cd /tmp/my-test
npm init -y

# Install your packages
npm install @agenteract/core @agenteract/react --registry http://localhost:4873

# Test imports
node -e "require('@agenteract/core'); console.log('Success!')"
```

### Verdaccio Web UI

While Verdaccio is running, you can access the web UI at:
```
http://localhost:4873
```

This shows all published packages and their versions.

## GitHub Actions

Integration tests run automatically on every push and pull request via GitHub Actions.

### Workflow: `.github/workflows/integration-test.yml`

The integration test workflow:

1. **Starts Verdaccio as a service** - Uses Docker to run Verdaccio in the background
2. **Installs dependencies** - Uses pnpm with frozen lockfile
3. **Builds all packages** - Runs `pnpm build`
4. **Publishes to Verdaccio** - Publishes all `@agenteract/*` packages
5. **Verifies publication** - Checks that packages are available
6. **Runs integration tests** - Creates a test project and installs packages
7. **Runs custom tests** - Executes any custom integration test scripts

### Workflow: `.github/workflows/ci.yml`

A separate CI workflow runs:
- Build verification
- Unit tests

This provides faster feedback for basic checks, while integration tests run in parallel.

## Configuration

### Environment Variables

You can customize Verdaccio settings:

```bash
export VERDACCIO_URL="http://localhost:4873"
export VERDACCIO_PORT="4873"
export VERDACCIO_USER="test"
export VERDACCIO_PASS="test"
export VERDACCIO_EMAIL="test@test.com"
```

## Quick Authentication Guide

See [VERDACCIO_AUTH_QUICK.md](./VERDACCIO_AUTH_QUICK.md) for a quick guide to how authentication works.

**Summary:** Authentication uses `expect` to automate `npm adduser`. The `pnpm verdaccio:publish` script handles this automatically.

## Troubleshooting

### Verdaccio won't start
```bash
# Check if port 4873 is already in use
lsof -i :4873

# Stop any existing containers
docker stop agenteract-verdaccio
docker rm agenteract-verdaccio
```

### Packages won't publish
```bash
# Check Verdaccio logs
docker logs agenteract-verdaccio

# Verify Verdaccio is running
curl http://localhost:4873/-/ping

# Reset npm config
npm config delete registry
pnpm config delete registry
```

### Integration tests fail
```bash
# Verify packages are published
npm view @agenteract/core --registry http://localhost:4873

# Check package contents
npm pack @agenteract/core --registry http://localhost:4873
tar -tzf agenteract-core-*.tgz

# Run tests with more verbose output
bash -x tests/integration/install-packages.test.sh
```

## Best Practices

1. **Always run integration tests** before publishing to public npm
2. **Test with fresh installs** to catch missing dependencies
3. **Verify all package exports** work as expected
4. **Test both CommonJS and ESM** imports
5. **Check workspace dependencies** resolve correctly

## Adding New Integration Tests

Create test scripts in `tests/integration/` and add them to the workflow:

```bash
#!/bin/bash
# tests/integration/my-new-test.sh

set -e
echo "Running my test..."

# Your test logic here

echo "✅ Test passed!"
```

Update `.github/workflows/integration-test.yml` to include your test:

```yaml
- name: Run my new test
  run: bash tests/integration/my-new-test.sh
```

## Related Scripts

- `scripts/start-verdaccio.sh` - Start Verdaccio in Docker
- `scripts/stop-verdaccio.sh` - Stop and cleanup Verdaccio
- `scripts/publish-local.sh` - Build and publish packages to Verdaccio
- `tests/integration/install-packages.test.sh` - Basic integration test

## Resources

- [Verdaccio Documentation](https://verdaccio.org/docs/what-is-verdaccio)
- [GitHub Actions Services](https://docs.github.com/en/actions/using-containerized-services/about-service-containers)
- [pnpm Workspace](https://pnpm.io/workspaces)

