# CI/CD Summary

Quick reference for continuous integration and deployment setup.

## 🎯 Optimized Branch Strategy

| Branch | CI | Integration Tests | Publish |
|--------|----|--------------------|---------|
| `develop` | ✅ | ❌ | ❌ |
| `feature/*` | ✅ (on PR) | ❌ | ❌ |
| `main` | ✅ | ✅ | ✅ (on tag) |
| `release/*` | ✅ | ✅ | ✅ (on tag) |

**Why this strategy?**
- ⚡ Fast feedback on develop (~3 min)
- 🔒 Thorough validation before production (~8 min)
- 💰 ~40% reduction in CI costs
- 🎯 Integration tests run where they matter most

## 📊 Performance Metrics

### Verdaccio Overhead
- Memory: ~50MB RAM
- Startup: 2-3 seconds  
- CPU: Minimal (~1-2%)
- Cost: Nearly zero (part of existing runner)

### Workflow Times
- **CI (unit tests)**: ~2-3 minutes
- **Integration tests**: ~4-5 minutes
- **Total for main/release**: ~6-8 minutes
- **Total for develop**: ~2-3 minutes

**Estimated monthly costs** (based on 100 commits/month):
- Old approach (integration on all): ~800 minutes
- New approach (optimized): ~480 minutes
- **Savings: 40%** ⚡

## 🚀 Quick Commands

### Development
```bash
pnpm dev                  # Start dev servers
pnpm build                # Build all packages
pnpm test                 # Run unit tests
```

### Integration Testing (Local)
```bash
pnpm verdaccio:start     # Start local npm registry
pnpm verdaccio:publish   # Publish to local registry
pnpm test:integration    # Run integration tests
pnpm verdaccio:stop      # Cleanup
```

### Versioning & Release
```bash
# Stable releases (all packages)
pnpm version:patch       # 1.0.0 → 1.0.1
pnpm version:minor       # 1.0.0 → 1.1.0
pnpm version:major       # 1.0.0 → 2.0.0

# Prereleases (all packages)
pnpm version:alpha       # 1.0.0 → 1.0.1-alpha.abc123
pnpm version:beta        # Beta prerelease
pnpm version:rc          # Release candidate

# Specific packages (use script directly)
./scripts/version.sh minor agents        # Single package
./scripts/version.sh patch core,react    # Multiple packages
```

### Publishing
```bash
# After version bump:
git push && git push --tags

# Or trigger prerelease via GitHub Actions:
gh workflow run prerelease.yml -f tag=alpha
```

## 📋 Workflows

### 1. `ci.yml` - Basic Checks
- **Runs on:** All pushes, all PRs
- **Duration:** ~3 minutes
- **Purpose:** Fast feedback

### 2. `integration-test.yml` - Package Validation  
- **Runs on:** PRs to main, pushes to main/release
- **Duration:** ~5 minutes
- **Purpose:** Verify packages work after installation

### 3. `publish-npm.yml` - NPM Publishing
- **Runs on:** Git tags (v*)
- **Duration:** ~4 minutes
- **Purpose:** Publish to public NPM

### 4. `prerelease.yml` - Beta/Alpha Testing
- **Runs on:** Manual trigger
- **Duration:** ~4 minutes
- **Purpose:** Publish test versions

### 5. `release-please.yml` - Automated Releases
- **Runs on:** Pushes to main (when enabled)
- **Status:** Disabled by default
- **Purpose:** Fully automated versioning via conventional commits

## 🔄 Typical Workflows

### Feature Development
```
1. Create feature branch from develop
2. Make changes
3. Push → CI runs (~3 min)
4. Create PR to develop
5. Merge → CI runs (~3 min)
```

### Release to Production
```
1. Create PR from develop to main
2. PR triggers integration tests (~5 min)
3. Review and merge
4. Run: pnpm version:patch (or minor/major)
5. Push tags: git push && git push --tags
6. GitHub Actions publishes to NPM (~4 min)
7. Packages available on NPM ✅
```

### Prerelease Testing
```
Option A - Manual (All packages):
1. Run: pnpm version:alpha (or beta/rc)
2. Push tags: git push && git push --tags
3. Packages published with @next tag

Option B - Manual (Specific packages):
1. Run: ./scripts/version.sh alpha agents,core
2. Push tags: git push && git push --tags
3. Only specified packages published with @next tag

Option C - GitHub Actions:
1. Go to Actions → Prerelease
2. Click "Run workflow"
3. Select tag type (alpha/beta/rc)
4. All packages published with @next tag
```

## 🛡️ Security & Quality Gates

### Before Merge to Main
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Packages can be installed
- ✅ Imports work (CommonJS & ESM)
- ✅ Workspace dependencies resolve

### Before NPM Publish
- ✅ Clean git working tree
- ✅ All tests pass
- ✅ Build successful
- ✅ Valid semver version
- ✅ NPM provenance enabled

## 📦 Package Distribution

### NPM Tags
- `latest` - Stable releases (default install)
- `next` - Prereleases (alpha/beta/rc)
- `dev` - Development builds

### Version Formats
- `1.2.3` - Stable
- `1.2.3-alpha.1` - Alpha testing
- `1.2.3-beta.1` - Beta testing  
- `1.2.3-rc.1` - Release candidate
- `1.2.3-dev.abc123` - Dev build

## 🔧 Setup Requirements

### GitHub Secrets
- `NPM_TOKEN` - Automation token from npmjs.com

### Permissions
- Repository: Write access to push tags
- NPM: Publish rights to @agenteract scope

### Tools
- pnpm 10.9.0+
- Node.js 20+
- Docker (for local Verdaccio)

## 📚 Documentation

- **[INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md)** - Verdaccio setup and integration testing
- **[RELEASE_PROCESS.md](./RELEASE_PROCESS.md)** - Complete release guide
- **[../.github/WORKFLOWS.md](../.github/WORKFLOWS.md)** - GitHub Actions workflows
- **[README.md](../README.md)** - Main project documentation

## 🎓 Best Practices

1. **Never skip tests** - They catch issues early
2. **Use prerelease for testing** - Don't publish untested code to latest
3. **Keep develop and main in sync** - Regular merges prevent drift
4. **Tag consistently** - Always use `v` prefix (v1.0.0)
5. **Document breaking changes** - Update docs before major releases
6. **Monitor CI costs** - GitHub provides usage analytics
7. **Test locally first** - Use verdaccio:* scripts before pushing

## ❓ FAQ

**Q: Why not run integration tests on every branch?**  
A: Cost vs benefit. Unit tests catch most issues. Integration tests validate the full package lifecycle, which matters most before production.

**Q: Can I run integration tests on my feature branch?**  
A: Yes! Use the manual trigger: `gh workflow run integration-test.yml`

**Q: What if integration tests fail on main?**  
A: Don't panic. Fix the issue and push again. Integration tests are a safety net, not a blocker.

**Q: Do I need Docker to contribute?**  
A: No, only for local integration testing. CI/CD works without Docker locally.

**Q: How do I publish a hotfix?**  
A: Create branch from main → fix → merge → version:patch → push tags

**Q: Can I unpublish from NPM?**  
A: Within 72 hours of publish. After that, NPM policy prevents unpublishing. Use deprecation instead.

## 🆘 Troubleshooting

See the troubleshooting sections in:
- [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md#troubleshooting)
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md#troubleshooting)

---

**Last updated:** 2025-10-21  
**Maintained by:** Agenteract Team

