#!/bin/bash
# Script to version packages and create a git tag
# Usage: ./scripts/version.sh [major|minor|patch|prerelease]

set -e

VERSION_TYPE="${1:-patch}"

echo "🏷️  Versioning packages as: $VERSION_TYPE"

# Ensure we're on a clean working tree
if [[ -n $(git status -s) ]]; then
  echo "❌ Error: Working directory is not clean"
  echo "Please commit or stash your changes first"
  exit 1
fi

# Ensure we're on main or develop
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" && "$BRANCH" != "develop" ]]; then
  echo "⚠️  Warning: You are not on main or develop branch (current: $BRANCH)"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull --rebase

# Version all packages
echo "📦 Versioning packages..."
pnpm -r --filter "@agenteract/*" exec npm version "$VERSION_TYPE" --no-git-tag-version

# Also version the root package
npm version "$VERSION_TYPE" --no-git-tag-version

# Get the new version from root package.json
NEW_VERSION=$(node -p "require('./package.json').version")

echo "✅ Packages versioned to: $NEW_VERSION"

# Commit the version changes
echo "📝 Committing version changes..."
git add .
git commit -m "chore: release v$NEW_VERSION"

# Create git tag
echo "🏷️  Creating git tag: v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo "✅ Version bump complete!"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git show"
echo "  2. Push to remote: git push && git push --tags"
echo "  3. GitHub Actions will automatically publish to NPM"
echo ""
echo "To undo this version bump:"
echo "  git reset --hard HEAD~1"
echo "  git tag -d v$NEW_VERSION"

