# Integration Tests

This directory contains integration tests that verify packages can be installed and used correctly after publication.

## Running Tests

```bash
# From repository root:
pnpm test:integration
```

## What Gets Tested

- ✅ Packages can be installed from npm registry
- ✅ CommonJS imports work correctly
- ✅ ESM imports work correctly  
- ✅ Workspace dependencies resolve properly
- ✅ Package exports are configured correctly

## Adding New Tests

Create a new `.sh` script in this directory and add it to the workflow:

```bash
#!/bin/bash
set -e

echo "🧪 Testing feature X..."

# Your test code here

echo "✅ Feature X test passed!"
```

Make it executable:
```bash
chmod +x tests/integration/your-test.sh
```

## Local Testing Workflow

```bash
# 1. Start Verdaccio
pnpm verdaccio:start

# 2. Build and publish packages
pnpm verdaccio:publish

# 3. Run tests
pnpm test:integration

# 4. Clean up
pnpm verdaccio:stop
```

## Environment Variables

- `REGISTRY` - npm registry URL (default: `http://localhost:4873`)
- `VERDACCIO_URL` - Verdaccio server URL
- `VERDACCIO_PORT` - Verdaccio port (default: `4873`)

## Test Structure

Each test should:
1. Create a temporary directory
2. Set up a test project
3. Install packages from the configured registry
4. Run verification steps
5. Clean up temporary files
6. Exit with status 0 on success, non-zero on failure

