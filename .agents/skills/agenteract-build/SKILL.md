---
name: agenteract-build
description: Build the Agenteract monorepo, link packages locally for development, bump versions, and publish packages to npm
license: Apache-2.0
compatibility: opencode
metadata:
  audience: maintainers
  workflow: build-release
---

## What I do

Cover the full build and release workflow for the Agenteract pnpm monorepo: installing dependencies, building all packages in the correct order, linking for local development, versioning, and publishing to npm.

## Prerequisites

```bash
git clone https://github.com/agenteract/agenteract.git
cd agenteract
git submodule update --init --recursive
npm install -g pnpm
```

## Install & Build

```bash
pnpm install
pnpm build
```

Build order is enforced: `@agenteract/core` and `@agenteract/pty` build first, then all remaining packages in parallel.

### Build a Single Package

```bash
pnpm --filter @agenteract/react build
pnpm --filter @agenteract/core build
```

### Clean All Packages

```bash
pnpm clean
```

### Watch Mode (Development)

```bash
pnpm dev
```

Runs each package's `dev` script in parallel (TypeScript watch mode).

## Local Package Linking

When testing CLI tools against local builds, link packages globally so `npx` resolves to the local workspace versions:

```bash
cd packages/server && pnpm link --global
cd packages/agents && pnpm link --global
cd packages/cli    && pnpm link --global
cd packages/pty    && pnpm link --global
```

After linking, the local dev server can be started with:

```bash
pnpm agenteract dev
# (equivalent to: npx @agenteract/cli dev once published)
```

## Versioning

### Bump All Packages

```bash
pnpm version:patch   # 1.0.0 → 1.0.1
pnpm version:minor   # 1.0.0 → 1.1.0
pnpm version:major   # 1.0.0 → 2.0.0
```

### Bump Specific Packages

```bash
./scripts/version.sh minor agents          # Single package
./scripts/version.sh patch core,react      # Multiple (comma-separated)
```

### Prerelease Versions

```bash
pnpm version:alpha   # → x.y.z-alpha.N (all packages)
pnpm version:beta    # → x.y.z-beta.N  (all packages)
pnpm version:rc      # → x.y.z-rc.N    (all packages)

./scripts/version.sh alpha agents          # Single package
./scripts/version.sh beta agents,core      # Multiple packages
```

Prerelease builds publish to npm with the `@next` tag.

### Version Utilities

```bash
pnpm version:check    # Verify all package versions are consistent
pnpm version:pending  # List packages with uncommitted version bumps
pnpm prerelease:list  # Show current prerelease version numbers
```

## Publishing to npm

Push version tags to trigger the GitHub Actions publish workflow:

```bash
git push && git push --tags
```

See `docs/RELEASE_PROCESS.md` for the full release guide and `docs/CI_CD_SUMMARY.md` for a quick CI reference.
