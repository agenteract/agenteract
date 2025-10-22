# CI/CD Architecture

Visual guide to the complete CI/CD pipeline.

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENTERACT CI/CD                            │
└─────────────────────────────────────────────────────────────────────┘

                              Developer
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              Feature Branch   Develop       Main/Release
                    │             │             │
                    │             │             │
┌───────────────────┼─────────────┼─────────────┼───────────────────┐
│   CONTINUOUS INTEGRATION (CI)                                      │
│                   │             │             │                    │
│                   └─────────────┴─────────────┘                    │
│                              │                                     │
│                   ┌──────────▼──────────┐                         │
│                   │  Build & Unit Tests │                         │
│                   │     (~3 minutes)    │                         │
│                   └──────────┬──────────┘                         │
│                              │                                     │
│                        ✅ All Pass                                 │
└────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
              (develop)          (main/release)
                    │                   │
                    │                   │
┌───────────────────┘                   └───────────────────────────┐
│                                                                    │
│                  INTEGRATION TESTS                                │
│                  (main/release only)                              │
│                                                                    │
│              ┌──────────────────────┐                            │
│              │  Start Verdaccio     │                            │
│              │  (Docker Service)    │                            │
│              └──────────┬───────────┘                            │
│                         │                                         │
│              ┌──────────▼───────────┐                            │
│              │  Publish Packages    │                            │
│              │  to Local Registry   │                            │
│              └──────────┬───────────┘                            │
│                         │                                         │
│              ┌──────────▼───────────┐                            │
│              │  Install & Import    │                            │
│              │  Tests (~5 minutes)  │                            │
│              └──────────┬───────────┘                            │
│                         │                                         │
│                    ✅ All Pass                                    │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
                   (ready to release)
                         │
                         │
┌────────────────────────┴───────────────────────────────────────┐
│                    VERSIONING                                   │
│                                                                 │
│       Developer runs:                                           │
│       • pnpm version:patch  → 1.0.1                           │
│       • pnpm version:minor  → 1.1.0                           │
│       • pnpm version:major  → 2.0.0                           │
│       • pnpm version:prerelease alpha → 1.0.0-alpha.1        │
│                                                                 │
│       Creates git tag: v1.0.1                                  │
│       Commits version bumps                                     │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ git push --tags
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NPM PUBLISHING                                │
│                                                                 │
│              ┌──────────────────────┐                          │
│              │   Tag Pushed (v*)    │                          │
│              └──────────┬───────────┘                          │
│                         │                                       │
│              ┌──────────▼───────────┐                          │
│              │  Run Tests & Build   │                          │
│              └──────────┬───────────┘                          │
│                         │                                       │
│              ┌──────────▼───────────┐                          │
│              │  Detect Release Type │                          │
│              │  stable vs prerelease│                          │
│              └─────┬──────────┬─────┘                          │
│                    │          │                                 │
│            ┌───────┘          └────────┐                       │
│            ▼                           ▼                        │
│      ┌─────────┐                 ┌──────────┐                 │
│      │ @latest │                 │  @next   │                 │
│      │ (stable)│                 │(prerelease)│               │
│      └────┬────┘                 └─────┬────┘                 │
│           │                            │                        │
│           └────────────┬───────────────┘                       │
│                        │                                        │
│             ┌──────────▼──────────┐                           │
│             │  npm publish         │                           │
│             │  (with provenance)   │                           │
│             └──────────┬───────────┘                           │
│                        │                                        │
│             ┌──────────▼──────────┐                           │
│             │ Create GitHub Release│                           │
│             └──────────────────────┘                           │
│                                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
                  ✅ Published to NPM
```

## Workflow Triggers

```
┌──────────────────┬────────────┬────────────┬────────────┬──────────┐
│ Event            │ CI         │Integration │ Publish    │Duration  │
├──────────────────┼────────────┼────────────┼────────────┼──────────┤
│ Push to develop  │ ✅         │ ❌         │ ❌         │ ~3 min   │
│ PR to develop    │ ✅         │ ❌         │ ❌         │ ~3 min   │
│ PR to main       │ ✅         │ ✅         │ ❌         │ ~8 min   │
│ Push to main     │ ✅         │ ✅         │ ❌         │ ~8 min   │
│ Push to release/*│ ✅         │ ✅         │ ❌         │ ~8 min   │
│ Push tag v*      │ ❌         │ ❌         │ ✅         │ ~4 min   │
│ Manual trigger   │ ❌         │ ✅         │ ✅         │ varies   │
└──────────────────┴────────────┴────────────┴────────────┴──────────┘
```

## Branch Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      GITFLOW STRATEGY                            │
└──────────────────────────────────────────────────────────────────┘

    main (stable, protected)
      │
      ├─── v1.0.0 (tag) ──────► NPM @latest
      │
      ├─── v1.0.1 (tag) ──────► NPM @latest
      │
      ▲
      │ PR (with integration tests)
      │
    develop (active development)
      │
      ├─── feature/new-api
      │       └─── PR to develop (CI only)
      │
      ├─── feature/bug-fix
      │       └─── PR to develop (CI only)
      │
      ▲
      │
    feature branches
```

## Verdaccio Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                 VERDACCIO IN GITHUB ACTIONS                    │
└────────────────────────────────────────────────────────────────┘

   GitHub Actions Runner
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   │  ┌───────────────────┐      ┌──────────────────────┐  │
   │  │  Verdaccio        │      │  Integration Tests   │  │
   │  │  Docker Container │◄─────┤  Workflow            │  │
   │  │                   │      │                      │  │
   │  │  Port: 4873       │      │  1. Build packages   │  │
   │  │  RAM: ~50MB       │      │  2. npm publish      │  │
   │  │  Ephemeral        │◄─────┤  3. npm install      │  │
   │  │  (per run)        │      │  4. Import tests     │  │
   │  └───────────────────┘      └──────────────────────┘  │
   │           │                           │                │
   │           │  localhost:4873           │                │
   │           │  (runner-internal)        │                │
   │           └───────────────────────────┘                │
   │                                                          │
   │  No external network access                            │
   │  Isolated per workflow run                             │
   │  Automatic cleanup after run                           │
   └──────────────────────────────────────────────────────────┘
```

## Package Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                   FROM CODE TO NPM                               │
└──────────────────────────────────────────────────────────────────┘

   Source Code (TypeScript)
         │
         ▼
   ┌──────────┐
   │   pnpm   │
   │  build   │
   └────┬─────┘
         │
         ▼
   Compiled (dist/)
         │
         ├─── Local Testing (Verdaccio)
         │         │
         │         ▼
         │    Integration Tests Pass? ──No──► Fix & Retry
         │         │
         │        Yes
         │         │
         ▼         ▼
   Version Bump ───┘
         │
         ▼
   Git Tag (v1.0.0)
         │
         ▼
   GitHub Actions
         │
         ├─── Tests Pass?
         │         │
         │        Yes
         │         │
         ▼         ▼
   npm publish (with provenance)
         │
         ├────► @latest (stable)
         │
         └────► @next (prerelease)
         │
         ▼
   📦 Available on NPM
         │
         ▼
   Users install: npm install @agenteract/core
```

## Cost Analysis

```
┌──────────────────────────────────────────────────────────────────┐
│              MONTHLY CI COSTS (100 commits)                      │
└──────────────────────────────────────────────────────────────────┘

   OLD: Integration tests on every commit
   ┌────────────────────────────────────────────┐
   │  CI: 3 min × 100 = 300 min                │
   │  Integration: 5 min × 100 = 500 min       │
   │  TOTAL: 800 minutes                        │
   └────────────────────────────────────────────┘

   NEW: Optimized strategy
   ┌────────────────────────────────────────────┐
   │  CI: 3 min × 100 = 300 min                │
   │  Integration: 5 min × 30* = 150 min       │
   │  TOTAL: 450 minutes                        │
   │  SAVINGS: 350 minutes (44%)                │
   └────────────────────────────────────────────┘

   * Assumes 30% of commits go to main/release

   GitHub Actions free tier: 2,000 min/month
   Your usage: ~450 min/month ✅ (well under limit)
```

## Security Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    SUPPLY CHAIN SECURITY                         │
└──────────────────────────────────────────────────────────────────┘

   Source Code
      │
      ├─── GitHub (version control)
      │
      ▼
   CI/CD Pipeline
      │
      ├─── Tests (verify integrity)
      ├─── Build (reproducible)
      ├─── Provenance (SLSA attestation)
      │
      ▼
   NPM Registry
      │
      ├─── Published with provenance
      │    └─── Links to GitHub Actions run
      │         └─── Links to source commit
      │
      ▼
   User Installation
      │
      ├─── npm install @agenteract/core
      │    └─── Can verify provenance
      │         └─── npm view @agenteract/core --json
      │
      ▼
   Verified Package ✅
```

## Monitoring Points

```
┌─────────────────────────────────────────────────────────────┐
│                    WHERE TO MONITOR                         │
└─────────────────────────────────────────────────────────────┘

1. GitHub Actions
   └─── Actions tab → Workflow runs
        ├─── Success rate
        ├─── Duration trends
        └─── Failure patterns

2. NPM Registry
   └─── npmjs.com/@agenteract/core
        ├─── Download stats
        ├─── Version adoption
        └─── Deprecation notices

3. GitHub Releases
   └─── Releases tab
        ├─── Release notes
        ├─── Asset downloads
        └─── Tag history

4. Integration Test Results
   └─── Workflow summaries
        ├─── Package install success
        ├─── Import test results
        └─── Dependency resolution
```

## Decision Tree

```
┌──────────────────────────────────────────────────────────────┐
│              WHICH WORKFLOW SHOULD I USE?                    │
└──────────────────────────────────────────────────────────────┘

   Need to release?
        │
        ├─── No ──► Just push to develop (CI runs)
        │
        └─── Yes
              │
              ├─── Stable release?
              │       │
              │       └─── Yes ──► pnpm version:patch/minor/major
              │                    git push --tags
              │
              └─── Testing release?
                      │
                      └─── Yes ──► pnpm version:prerelease alpha
                                   git push --tags
                                   (or use GitHub Actions UI)
```

---

## Key Takeaways

✅ **Verdaccio is lightweight** (~50MB, 2s startup)  
✅ **Optimized for cost** (44% reduction in CI time)  
✅ **Strategic test placement** (fast feedback + thorough validation)  
✅ **Multiple release options** (manual, automated, prerelease)  
✅ **Supply chain security** (NPM provenance enabled)  
✅ **Developer friendly** (simple scripts, clear docs)  

---

For more details, see:
- [CI_CD_SUMMARY.md](../docs/CI_CD_SUMMARY.md) - Quick reference
- [RELEASE_PROCESS.md](../docs/RELEASE_PROCESS.md) - Release guide
- [INTEGRATION_TESTING.md](../docs/INTEGRATION_TESTING.md) - Testing guide

