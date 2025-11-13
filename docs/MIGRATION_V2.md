# Migration Guide: Type-Based to Generic PTY Config

This guide helps you migrate from the old type-based configuration (`type: 'expo'`) to the new generic `devServer` configuration.

## Why Migrate?

The new generic PTY configuration:
- ✅ **Works with any dev server** (Next.js, Astro, Django, etc.)
- ✅ **More explicit** - no hidden command mappings
- ✅ **Better validation** - catch setup issues early
- ✅ **More flexible** - custom env vars, working directories
- ✅ **Fewer dependencies** - no need for type-specific packages

The old type-based packages (`@agenteract/expo`, `@agenteract/vite`, `@agenteract/flutter-cli`) are deprecated and will be removed in a future major version.

## Deprecation Timeline

- **v0.1.x**: Both formats supported, deprecation warnings shown
- **v0.2.x**: Type-based format still works but strongly discouraged
- **v1.0.0**: Type-based format removed (breaking change)

## Quick Migration

### Before (Old Format)

```javascript
// agenteract.config.js
export default {
  port: 8766,
  projects: [
    {
      name: 'expo-app',
      type: 'expo',
      path: './apps/mobile',
      ptyPort: 8790
    },
    {
      name: 'react-app',
      type: 'vite',
      path: './apps/web',
      ptyPort: 8791
    },
    {
      name: 'flutter-app',
      type: 'flutter',
      path: './apps/flutter',
      ptyPort: 8792
    },
    {
      name: 'swift-app',
      type: 'native',
      path: './apps/ios'
    }
  ]
};
```

### After (New Format)

```javascript
// agenteract.config.js
export default {
  port: 8766,
  projects: [
    {
      name: 'expo-app',
      path: './apps/mobile',
      devServer: {
        command: 'npx expo start',
        port: 8790,
        keyCommands: { reload: 'r', ios: 'i', android: 'a' }
      }
    },
    {
      name: 'react-app',
      path: './apps/web',
      devServer: {
        command: 'npx vite',
        port: 8791,
        keyCommands: { reload: 'r', quit: 'q' }
      }
    },
    {
      name: 'flutter-app',
      path: './apps/flutter',
      devServer: {
        command: 'flutter run',
        port: 8792,
        validation: {
          fileExists: ['pubspec.yaml'],
          commandInPath: 'flutter',
          errorHints: {
            'command not found': 'Install Flutter: https://flutter.dev/docs/get-started/install'
          }
        },
        keyCommands: { reload: 'r', restart: 'R', quit: 'q' }
      }
    },
    {
      name: 'swift-app',
      type: 'native',  // Native apps don't change - no dev server
      path: './apps/ios'
    }
  ]
};
```

## Type-Specific Migrations

### Expo

**Old:**
```javascript
{
  name: 'expo-app',
  type: 'expo',
  path: './apps/mobile',
  ptyPort: 8790
}
```

**New:**
```javascript
{
  name: 'expo-app',
  path: './apps/mobile',
  devServer: {
    command: 'npx expo start',
    port: 8790,
    keyCommands: { reload: 'r', ios: 'i', android: 'a' }
  }
}
```

### Vite

**Old:**
```javascript
{
  name: 'react-app',
  type: 'vite',
  path: './apps/web',
  ptyPort: 8791
}
```

**New:**
```javascript
{
  name: 'react-app',
  path: './apps/web',
  devServer: {
    command: 'npx vite',
    port: 8791,
    keyCommands: { reload: 'r', quit: 'q' }
  }
}
```

### Flutter

**Old:**
```javascript
{
  name: 'flutter-app',
  type: 'flutter',
  path: './apps/flutter',
  ptyPort: 8792
}
```

**New:**
```javascript
{
  name: 'flutter-app',
  path: './apps/flutter',
  devServer: {
    command: 'flutter run',
    port: 8792,
    validation: {
      fileExists: ['pubspec.yaml'],
      commandInPath: 'flutter',
      errorHints: {
        'command not found': 'Install Flutter: https://flutter.dev/docs/get-started/install',
        'No pubspec.yaml': 'Flutter projects require a pubspec.yaml file'
      }
    },
    keyCommands: { reload: 'r', restart: 'R', quit: 'q', help: 'h' }
  }
}
```

### Native (No Changes)

Native projects (Swift, Kotlin) don't have dev servers, so they remain the same:

```javascript
{
  name: 'swift-app',
  type: 'native',
  path: './apps/ios'
}
```

## Agent Command Changes

The agent CLI commands have been updated to use project names instead of types.

### `dev-logs` Command

**Old:**
```bash
pnpm agenteract-agents dev-logs expo
pnpm agenteract-agents dev-logs vite
pnpm agenteract-agents dev-logs flutter
```

**New:**
```bash
pnpm agenteract-agents dev-logs expo-app
pnpm agenteract-agents dev-logs react-app
pnpm agenteract-agents dev-logs flutter-app
```

### `cmd` Command

**Old:**
```bash
pnpm agenteract-agents cmd expo r
pnpm agenteract-agents cmd vite r
pnpm agenteract-agents cmd flutter r
```

**New:**
```bash
pnpm agenteract-agents cmd expo-app r
pnpm agenteract-agents cmd react-app r
pnpm agenteract-agents cmd flutter-app r
```

### Other Commands (Unchanged)

These commands already used project names, so they don't change:

```bash
pnpm agenteract-agents logs <project-name>
pnpm agenteract-agents hierarchy <project-name>
pnpm agenteract-agents tap <project-name> <testID>
```

## Step-by-Step Migration

### Step 1: Update Config File

1. Open `agenteract.config.js`
2. For each project with `type` (except `native`):
   - Remove `type` and `ptyPort` fields
   - Add `devServer` object with `command` and `port`
   - Optionally add `validation`, `env`, `keyCommands`
3. Save the file

### Step 2: Test the Configuration

Start the dev environment to test the new configuration:

```bash
pnpm agenteract dev
```

You should see:
- ⚠️ Deprecation warnings if you kept the old format
- ✅ All dev servers starting correctly
- ✅ Ability to switch between terminals with Tab

### Step 3: Update Scripts and Documentation

If you have scripts or documentation that reference the old commands:

1. Update `dev-logs <type>` → `dev-logs <project-name>`
2. Update `cmd <type>` → `cmd <project-name>`
3. Update any internal docs or READMEs

### Step 4: Verify E2E Tests

If you have tests that use Agenteract:

```bash
pnpm test:e2e:expo
pnpm test:e2e:vite
pnpm test:e2e:flutter
```

All tests should pass with the new configuration.

### Step 5: Remove Type-Specific Packages (Optional)

If you have the deprecated packages installed directly:

```bash
# These are no longer needed
pnpm remove @agenteract/expo @agenteract/vite @agenteract/flutter-cli
```

Note: The CLI will still work if these are installed (for backward compatibility), but they're no longer necessary.

## Common Migration Issues

### Issue: "Project not found or has no dev server"

**Cause:** Old command using type instead of project name

**Solution:** Use the project name from your config:
```bash
# Old (doesn't work anymore)
pnpm agenteract-agents dev-logs expo

# New (correct)
pnpm agenteract-agents dev-logs expo-app
```

### Issue: Dev server fails to start

**Cause:** Command might be incorrect or missing dependencies

**Solution:**
1. Test the command directly in terminal: `npx expo start`
2. Add validation to catch issues early:
```javascript
validation: {
  fileExists: ['package.json'],
  commandInPath: 'node'
}
```

### Issue: Deprecation warnings on startup

**Cause:** Still using old `type` and `ptyPort` fields

**Solution:** Convert to `devServer` format (see examples above)

### Issue: Port conflicts

**Cause:** Multiple projects using the same port

**Solution:** Ensure each project has a unique `devServer.port`:
```javascript
// Project 1
devServer: { command: '...', port: 8790 }

// Project 2
devServer: { command: '...', port: 8791 }

// Project 3
devServer: { command: '...', port: 8792 }
```

## Backward Compatibility

The old format still works! Agenteract automatically migrates old configs internally:

**What happens when you use the old format:**
1. You'll see a deprecation warning on startup
2. Agenteract converts it to the new format internally
3. Everything continues to work normally

**Auto-migration mapping:**
- `type: 'expo'` → `devServer: { command: 'npx expo start', port: <ptyPort> }`
- `type: 'vite'` → `devServer: { command: 'npx vite', port: <ptyPort> }`
- `type: 'flutter'` → `devServer: { command: 'flutter run', port: <ptyPort>, validation: {...} }`

However, **we strongly recommend migrating** to avoid issues in future versions.

## Getting Help

If you encounter issues during migration:

1. **Check logs**: `pnpm agenteract-agents dev-logs <project-name>`
2. **Review config**: Ensure `devServer` fields are correct
3. **Test command**: Run the dev command directly in terminal
4. **Open an issue**: https://github.com/agenteract/agenteract/issues

## Additional Resources

- [Generic PTY Configuration Guide](./GENERIC_PTY.md) - Full guide on the new config format
- [Agenteract Documentation](../README.md) - Main documentation
- [Examples](../examples/) - See updated example configurations

## Summary

**Migration checklist:**
- [ ] Update `agenteract.config.js` to use `devServer` instead of `type`/`ptyPort`
- [ ] Test with `pnpm agenteract dev`
- [ ] Update agent commands to use project names instead of types
- [ ] Update scripts and documentation
- [ ] Run E2E tests to verify
- [ ] (Optional) Remove deprecated packages

**Benefits after migration:**
- ✅ Support for any dev server (Next.js, Astro, Django, etc.)
- ✅ Better error messages with validation
- ✅ More control with env vars and cwd
- ✅ Future-proof configuration
- ✅ No more deprecation warnings
