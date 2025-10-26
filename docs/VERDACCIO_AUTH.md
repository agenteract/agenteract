# Verdaccio Authentication - Quick Guide

**TL;DR:** Authentication works automatically with the `pnpm verdaccio:publish` script using a TypeScript helper.

## How It Works

1. **Verdaccio Config** (`.verdaccio/config.yaml`)
   - Allows up to 1000 user registrations
   - Uses htpasswd authentication
   - Stores users in `/verdaccio/storage/htpasswd`

2. **Authentication Script** (`scripts/verdaccio-auth.ts`)
   - TypeScript script that automates `npm adduser`
   - Uses Node.js child_process to handle interactive prompts
   - Creates user: `test` / `test` / `test@test.com`
   - Non-interactive (no manual input needed)
   - No external dependencies required (just Node.js)

3. **Publish Script** (`scripts/publish-local.sh`)
   - Checks if already authenticated
   - Calls auth script if needed
   - Handles "already exists" errors gracefully
   - Provides clear summary of what was published

## Prerequisites

**All platforms:** Just Node.js and npm (already required for the project) ✅

No additional dependencies needed!

## Usage

```bash
# Start Verdaccio
pnpm verdaccio:start

# Publish (authenticates automatically)
pnpm verdaccio:publish

# Test authentication status
pnpm verdaccio:test

# Clean up
pnpm verdaccio:stop
```

## The Solution

After trying several approaches (HTTP API, npm-cli-adduser with args, expect, etc.), the working solution is:

**Use a TypeScript script with Node.js child_process to automate the interactive `npm adduser` command.**

```typescript
// scripts/verdaccio-auth.ts
import { spawn } from 'child_process';

const npmProcess = spawn('npm', ['adduser', '--registry', VERDACCIO_URL], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Listen for prompts and respond automatically
npmProcess.stdout?.on('data', (data: Buffer) => {
  const text = data.toString();
  if (text.includes('Username:')) {
    npmProcess.stdin?.write(`${VERDACCIO_USER}\n`);
  } else if (text.includes('Password:')) {
    npmProcess.stdin?.write(`${VERDACCIO_PASS}\n`);
  } else if (text.includes('Email:')) {
    npmProcess.stdin?.write(`${VERDACCIO_EMAIL}\n`);
  }
});
```

This works because:
- ✅ Verdaccio's htpasswd plugin expects interactive authentication
- ✅ Node.js child_process handles stdin/stdout piping
- ✅ Simple and reliable
- ✅ Works with default Verdaccio configuration
- ✅ No external dependencies (just Node.js)
- ✅ Cross-platform compatible
- ✅ Faster CI runs (no need to install expect package)

## Troubleshooting

### Error: "user registration disabled"

**Cause:** Verdaccio config has `max_users: -1`

**Fix:** Change to `max_users: 1000` in `.verdaccio/config.yaml`

### Error: "ENEEDAUTH"

**Cause:** Not authenticated

**Fix:** 
- Run `pnpm verdaccio:publish` (authenticates automatically)
- Or manually: `npm adduser --registry http://localhost:4873`

### Packages already exist

**Cause:** Already published (Verdaccio storage persists until container restart)

**Fix:**
```bash
pnpm verdaccio:stop   # Clears storage
pnpm verdaccio:start  # Fresh start
pnpm verdaccio:publish
```

## GitHub Actions

In CI, authentication uses the TypeScript script (same as local):

```yaml
- name: Authenticate with Verdaccio
  run: npx tsx scripts/verdaccio-auth.ts
  env:
    VERDACCIO_URL: http://localhost:4873
    VERDACCIO_USER: test
    VERDACCIO_PASS: test
    VERDACCIO_EMAIL: test@test.com
```

**Benefits for CI:**
- ✅ No need to install external packages (like expect)
- ✅ Faster CI runs (no apt-get update/install step)
- ✅ Uses Node.js which is already available in CI
- ✅ Ensures consistency between local and CI environments
- ✅ Simple, reliable authentication method

## Key Files

- `.verdaccio/config.yaml` - Verdaccio configuration
- `scripts/verdaccio-auth.ts` - TypeScript authentication helper (uses Node.js child_process)
- `scripts/verdaccio-auth.sh` - Legacy bash authentication helper (deprecated, kept for reference)
- `scripts/publish-local.sh` - Main publish script (calls auth helper)
- `scripts/test-verdaccio-auth.sh` - Diagnostic tool

## What We Fixed

1. ✅ **Error handling** - Scripts now fail with non-zero exit codes
2. ✅ **Authentication** - Migrated from `expect` to TypeScript for faster CI and no external dependencies
3. ✅ **Config** - Changed `max_users: -1` to `max_users: 1000`
4. ✅ **Graceful handling** - "Already exists" errors don't fail the script
5. ✅ **Clear output** - Shows summary of what was published
6. ✅ **CI Performance** - Removed apt-get install step, significantly faster CI runs

## Related Documentation

- [VERDACCIO_AUTH.md](./VERDACCIO_AUTH.md) - Comprehensive guide
- [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md) - Full integration testing guide

