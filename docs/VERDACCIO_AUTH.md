# Verdaccio Authentication - Quick Guide

**TL;DR:** Authentication works automatically with the `pnpm verdaccio:publish` script using `expect`.

## How It Works

1. **Verdaccio Config** (`.verdaccio/config.yaml`)
   - Allows up to 1000 user registrations
   - Uses htpasswd authentication
   - Stores users in `/verdaccio/storage/htpasswd`

2. **Authentication Script** (`scripts/verdaccio-auth.sh`)
   - Uses `expect` to automate `npm adduser`
   - Creates user: `test` / `test` / `test@test.com`
   - Non-interactive (no manual input needed)

3. **Publish Script** (`scripts/publish-local.sh`)
   - Checks if already authenticated
   - Calls auth script if needed
   - Handles "already exists" errors gracefully
   - Provides clear summary of what was published

## Prerequisites

**macOS:** `expect` is pre-installed ✅

**Linux:**
```bash
sudo apt-get install expect
```

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

After trying several approaches (HTTP API, npm-cli-adduser with args, etc.), the working solution is:

**Use `expect` to automate the interactive `npm adduser` command.**

```bash
# scripts/verdaccio-auth.sh
expect << EOF
spawn npm adduser --registry http://localhost:4873
expect "Username:"
send "test\r"
expect "Password:"
send "test\r"
expect "Email:"
send "test@test.com\r"
expect "Logged in"
EOF
```

This works because:
- ✅ Verdaccio's htpasswd plugin expects interactive authentication
- ✅ `expect` handles the prompts automatically
- ✅ Simple and reliable
- ✅ Works with default Verdaccio configuration

## Troubleshooting

### Error: "user registration disabled"

**Cause:** Verdaccio config has `max_users: -1`

**Fix:** Change to `max_users: 1000` in `.verdaccio/config.yaml`

### Error: "expect: command not found"

**Cause:** `expect` not installed

**Fix:** 
- macOS: Already installed (should not happen)
- Linux: `sudo apt-get install expect`

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

In CI, authentication uses `expect` (same as local):

```yaml
- name: Install expect (for authentication)
  run: sudo apt-get update && sudo apt-get install -y expect

- name: Authenticate with Verdaccio
  run: |
    expect << 'EOF'
    spawn npm adduser --registry http://localhost:4873
    expect "Username:"
    send "test\r"
    expect "Password:"
    send "test\r"
    expect "Email:"
    send "test@test.com\r"
    expect "Logged in"
    EOF
```

**Why install expect?**
- Ubuntu runners don't have `expect` pre-installed by default
- Ensures consistency between local and CI environments
- Simple, reliable authentication method

## Key Files

- `.verdaccio/config.yaml` - Verdaccio configuration
- `scripts/verdaccio-auth.sh` - Authentication helper (uses expect)
- `scripts/publish-local.sh` - Main publish script (calls auth helper)
- `scripts/test-verdaccio-auth.sh` - Diagnostic tool

## What We Fixed

1. ✅ **Error handling** - Scripts now fail with non-zero exit codes
2. ✅ **Authentication** - Works automatically with `expect`
3. ✅ **Config** - Changed `max_users: -1` to `max_users: 1000`
4. ✅ **Graceful handling** - "Already exists" errors don't fail the script
5. ✅ **Clear output** - Shows summary of what was published

## Related Documentation

- [VERDACCIO_AUTH.md](./VERDACCIO_AUTH.md) - Comprehensive guide
- [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md) - Full integration testing guide

