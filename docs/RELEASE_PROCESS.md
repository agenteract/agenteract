# Release Process

This document describes the release and publishing process for the Agenteract monorepo.

## Table of Contents

- [Overview](#overview)
- [Branch Strategy](#branch-strategy)
- [Versioning](#versioning)
- [Release Workflows](#release-workflows)
- [Manual Release Process](#manual-release-process)
- [Automated Release Process](#automated-release-process)
- [Prerelease Process](#prerelease-process)
- [NPM Publishing](#npm-publishing)
- [Setup Requirements](#setup-requirements)

---

## Overview

We support multiple release strategies:

| Strategy | When to Use | Automation Level |
|----------|-------------|------------------|
| **Manual Tag-Based** | Full control, traditional workflow | Semi-automated |
| **Release Please** | Conventional commits, automated changelogs | Fully automated |
| **Manual Prerelease** | Testing before stable release | Manual trigger |

---

## Branch Strategy

```
main (stable)
  ├── develop (active development)
  │   └── feature branches
  └── release/v1.x.x (optional release branches)
```

### Workflow Triggers

| Workflow | Branches | Purpose |
|----------|----------|---------|
| **CI** | All branches | Fast feedback |
| **Integration Tests** | PRs to `main`, pushes to `main`, `release/**` | Pre/post merge validation |
| **Publish to NPM** | Tags matching `v*` | Automated publishing |
| **Prerelease** | Manual trigger | Publish dev/alpha/beta versions |

**Why limit integration tests?**
- ✅ Faster feedback on develop (CI only, ~3 min)
- ✅ Thorough validation before production (integration tests, ~5 min)
- ✅ Reduced CI costs (~40% reduction)
- ✅ Integration tests run where they matter most

---

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Patch** (1.0.0 → 1.0.1): Bug fixes
- **Prerelease** (1.0.0 → 1.1.0-alpha.1): Testing versions

### Version Formats

```
1.2.3           - Stable release
1.2.3-alpha.1   - Alpha release (early testing)
1.2.3-beta.1    - Beta release (feature complete)
1.2.3-rc.1      - Release candidate (production-ready testing)
1.2.3-dev.abc123 - Development build (from commit SHA)
```

---

## Release Workflows

### 1. `publish-npm.yml` (Recommended for most teams)

**Trigger:** Push a git tag matching `v*`

**What it does:**
1. ✅ Runs all tests
2. ✅ Builds packages
3. ✅ Publishes to NPM (with provenance)
4. ✅ Creates GitHub Release
5. ✅ Auto-detects prerelease vs stable

**Pros:**
- Full control over when to publish
- Explicit version tagging
- Simple and predictable

**Cons:**
- Manual version bumping required

---

### 2. `release-please.yml` (For teams using conventional commits)

**Trigger:** Push to `main` branch

**What it does:**
1. ✅ Analyzes commit messages
2. ✅ Determines version bump automatically
3. ✅ Creates/updates a "Release PR"
4. ✅ Publishes when PR is merged
5. ✅ Generates CHANGELOG automatically

**Pros:**
- Fully automated
- Automatic changelog generation
- Great for teams using conventional commits

**Cons:**
- Requires commit message discipline
- Currently disabled (set `if: false`)

**To enable:** Change `if: false` to `if: true` in `.github/workflows/release-please.yml`

---

### 3. `prerelease.yml` (For testing before stable release)

**Trigger:** Manual workflow dispatch

**What it does:**
1. ✅ Creates versioned prerelease
2. ✅ Publishes with prerelease tag
3. ✅ Doesn't affect `latest` tag on NPM

**Pros:**
- Test in production-like environment
- Doesn't affect stable users
- Easy rollback

---

## Manual Release Process

### Stable Release

```bash
# 1. Ensure you're on main and up to date
git checkout main
git pull

# 2. Run the version script
./scripts/version.sh patch  # or minor, major

# 3. Review changes
git show

# 4. Push to trigger publish
git push && git push --tags

# 5. GitHub Actions automatically publishes to NPM
```

### Prerelease

```bash
# 1. Checkout develop or feature branch
git checkout develop

# 2. Create prerelease version
./scripts/prerelease.sh alpha

# 3. Push to trigger publish
git push && git push --tags
```

Or use the GitHub Actions UI:
1. Go to Actions → Prerelease
2. Click "Run workflow"
3. Select tag type (dev, alpha, beta, rc)
4. Click "Run"

---

## Automated Release Process (Release Please)

### Setup

1. Enable in `.github/workflows/release-please.yml`:
   ```yaml
   if: false  # Change to: if: true
   ```

2. Use conventional commits:
   ```bash
   feat: add new feature        # Minor version bump
   fix: resolve bug             # Patch version bump
   feat!: breaking change       # Major version bump
   chore: update dependencies   # No version bump
   ```

3. Merge to main triggers the workflow

### Workflow

1. **Automatic Release PR created**
   - Contains version bumps
   - Generated CHANGELOG
   - Lists all changes since last release

2. **Review the Release PR**
   - Check version number is correct
   - Review CHANGELOG entries
   - Verify all changes are documented

3. **Merge the Release PR**
   - Automatically triggers NPM publish
   - Creates GitHub Release
   - Tags the commit

---

## Prerelease Process

### Manual Script Method

```bash
# Alpha release (early testing)
./scripts/prerelease.sh alpha

# Beta release (feature complete, testing)
./scripts/prerelease.sh beta

# Release candidate (production-ready testing)
./scripts/prerelease.sh rc

# Push to publish
git push && git push --tags
```

### GitHub Actions Method

```bash
# Using GitHub CLI
gh workflow run prerelease.yml -f tag=alpha

# Or via GitHub UI:
# Actions → Prerelease → Run workflow → Select tag type
```

### Installing Prereleases

Users can install specific versions:

```bash
# Install latest alpha
npm install @agenteract/core@alpha

# Install specific version
npm install @agenteract/core@1.0.0-alpha.1

# Install latest stable (unaffected by prereleases)
npm install @agenteract/core
```

---

## NPM Publishing

### How Publishing Works

1. **Tag pushed** → `publish-npm.yml` triggered
2. **Tests run** → Build happens
3. **Publish to NPM** with provenance (supply chain security)
4. **GitHub Release created** automatically

### NPM Tags

| Git Tag | NPM Tag | Description |
|---------|---------|-------------|
| `v1.0.0` | `latest` | Stable release (default install) |
| `v1.0.0-alpha.1` | `next` | Prerelease (opt-in) |
| `v1.0.0-beta.1` | `next` | Prerelease (opt-in) |
| `v1.0.0-rc.1` | `next` | Prerelease (opt-in) |

### Provenance

We use NPM provenance for supply chain security:
- ✅ Verifiable build artifacts
- ✅ Links packages to source code
- ✅ Shows which GitHub Action built it
- ✅ Increases trust for consumers

---

## Setup Requirements

### GitHub Secrets

Add `NPM_TOKEN` to GitHub repository secrets:

1. Create NPM token at https://www.npmjs.com/settings/[your-username]/tokens
2. Select "Automation" token type
3. Copy the token
4. Go to GitHub repo → Settings → Secrets and variables → Actions
5. Add secret: `NPM_TOKEN` = [your token]

### NPM Account Setup

Ensure your NPM account:
- ✅ Has publish rights to `@agenteract` scope
- ✅ Has 2FA enabled (required for publishing)
- ✅ Allows automation tokens

### Package Configuration

All packages must have:

```json
{
  "name": "@agenteract/package-name",
  "version": "0.0.1",
  "publishConfig": {
    "access": "public"
  }
}
```

---

## Comparison of Strategies

| Feature | Manual Tag-Based | Release Please | Prerelease |
|---------|-----------------|----------------|------------|
| Setup complexity | Low | Medium | Low |
| Automation | Semi | Full | Manual trigger |
| Changelog | Manual | Auto | N/A |
| Version control | Manual | Auto | Manual |
| Best for | Small teams, full control | Large teams, conventional commits | Testing |
| Recommended | ✅ Yes | Optional | Yes (for testing) |

---

## Best Practices

1. **Test before releasing**
   - Run integration tests locally
   - Use prerelease for production testing

2. **Version bumping**
   - Use scripts to avoid manual errors
   - Keep all packages in sync

3. **Git hygiene**
   - Clean working tree before versioning
   - Meaningful commit messages
   - Tag format: `v1.2.3` (lowercase v)

4. **NPM tags**
   - `latest` = stable (default)
   - `next` = prerelease
   - Never move `latest` backward

5. **Communication**
   - Document breaking changes
   - Update CHANGELOG
   - Announce major releases

---

## Troubleshooting

### Publishing fails with 403

**Cause:** NPM token invalid or expired

**Fix:**
1. Generate new token
2. Update `NPM_TOKEN` secret in GitHub

### Wrong version published

**Cause:** Multiple tags pointing to same commit

**Fix:**
```bash
# Delete remote tag
git push --delete origin v1.0.0

# Delete local tag
git tag -d v1.0.0

# Re-create correct version
./scripts/version.sh patch
git push && git push --tags
```

### Packages out of sync

**Cause:** Manual version edits

**Fix:**
```bash
# Reset to last tag
git reset --hard v1.0.0

# Use version script
./scripts/version.sh patch
```

---

## Quick Reference

```bash
# Setup
chmod +x scripts/*.sh

# Stable releases
./scripts/version.sh patch  # 1.0.0 → 1.0.1
./scripts/version.sh minor  # 1.0.0 → 1.1.0
./scripts/version.sh major  # 1.0.0 → 2.0.0

# Prereleases
./scripts/prerelease.sh alpha
./scripts/prerelease.sh beta
./scripts/prerelease.sh rc

# Publish
git push && git push --tags

# Manual GitHub Actions trigger
gh workflow run prerelease.yml -f tag=alpha
```

---

## Related Files

- `.github/workflows/publish-npm.yml` - Main publishing workflow
- `.github/workflows/release-please.yml` - Automated releases (optional)
- `.github/workflows/prerelease.yml` - Prerelease workflow
- `scripts/version.sh` - Version bumping script
- `scripts/prerelease.sh` - Prerelease creation script

