# Agenteract Version Management

This directory contains scripts for managing package versions across the Agenteract monorepo.

## Version Script (`version.ts`)

Unified TypeScript script that handles versioning for both NPM and Dart packages.

### Features

- ✅ **Unified Interface**: Same commands work for both NPM and Dart packages
- ✅ **Auto-detection**: Automatically detects package type (package.json vs pubspec.yaml)
- ✅ **Cross-platform**: Pure TypeScript/Node.js, no platform-specific dependencies
- ✅ **Semver Compliance**: Follows semantic versioning for all package types
- ✅ **Git Integration**: Automatic commits and tagging
- ✅ **Prerelease Support**: Alpha, beta, and RC versions with git hash identifiers

### Usage

**Bump all packages:**
```bash
pnpm version:patch   # 0.0.1 → 0.0.2
pnpm version:minor   # 0.0.1 → 0.1.0
pnpm version:major   # 0.0.1 → 1.0.0
```

**Bump specific packages:**
```bash
pnpm version:patch agents,core
pnpm version:minor flutter,react
pnpm version:major flutter-cli
```

**Create prereleases:**
```bash
pnpm version:alpha           # 0.0.1 → 0.0.2-alpha.abc1234
pnpm version:beta agents     # 0.0.1 → 0.0.2-beta.abc1234
pnpm version:rc flutter,core # 0.0.1 → 0.0.2-rc.abc1234
```

### Package Types

The script automatically handles different package formats:

| Package Type | File | Managed By |
|-------------|------|------------|
| NPM packages | `package.json` | npm version logic |
| Dart packages | `pubspec.yaml` | String replacement |

**NPM Packages:**
- agents, cli, core, dom, expo, flutter-cli, gemini, pty, react, server, swift, vite, web

**Dart Packages:**
- flutter

### Git Tags

- **NPM-only updates**: `v0.0.6`
- **Dart-only updates**: `flutter-v0.0.2`
- **Mixed updates**: `v0.0.6` (highest version wins)

### How It Works

1. **Detection**: Scans `packages/` directory for target packages
2. **Type Check**: For each package, checks for `package.json` or `pubspec.yaml`
3. **Version Calculation**: Calculates new version using semver rules
4. **Confirmation**: Shows summary and prompts for confirmation
5. **Update**: Updates package files (JSON or YAML)
6. **Root Sync**: Updates root `package.json` to highest version
7. **Commit & Tag**: Creates git commit and tag

### Examples

**Example 1: Bump Flutter package**
```bash
$ pnpm version:patch flutter

🏷️  Agenteract Version Manager
📦 Mode: Update SPECIFIC packages
Version Type: patch

📋 Analyzing packages...
  ✓ agenteract
    0.0.1 → 0.0.2

Proceed with version bump? [y/N]: y

✅ Version bump complete!
Root version: 0.0.6 → 0.0.6
Updated packages:
  • agenteract: 0.0.1 → 0.0.2

Tag created: flutter-v0.0.2
```

**Example 2: Bump multiple NPM packages**
```bash
$ pnpm version:minor agents,react

🏷️  Agenteract Version Manager
📦 Mode: Update SPECIFIC packages
Version Type: minor

📋 Analyzing packages...
  ✓ @agenteract/agents
    0.0.6 → 0.1.0
  ✓ @agenteract/react
    0.0.6 → 0.1.0

Proceed with version bump? [y/N]: y

✅ Version bump complete!
Root version: 0.0.6 → 0.1.0
Updated packages:
  • @agenteract/agents: 0.0.6 → 0.1.0
  • @agenteract/react: 0.0.6 → 0.1.0

Tag created: v0.1.0
```

**Example 3: Create alpha prerelease**
```bash
$ pnpm version:alpha

🏷️  Agenteract Version Manager
📦 Mode: Update ALL packages
Release Type: Prerelease (alpha)
Identifier: alpha.5a50aa3

[... lists all packages ...]

Proceed with version bump? [y/N]: y

✅ Version bump complete!
Tag created: v0.0.7-alpha.5a50aa3
```

## Migration from Bash Scripts

The old bash scripts (`version.sh` and `version-flutter.sh`) have been replaced by the unified TypeScript solution. Benefits:

- ✅ No more separate commands for Flutter packages
- ✅ Cross-platform compatible (no `perl`, `sed`, or bash-isms)
- ✅ Type-safe with TypeScript
- ✅ Better error handling
- ✅ Consistent UX across all package types

The old scripts are kept for reference but should not be used.
