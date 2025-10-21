#!/bin/bash
# Script to create a prerelease version
# Usage: ./scripts/prerelease.sh [alpha|beta|rc] [identifier]

set -e

PRERELEASE_TYPE="${1:-alpha}"
IDENTIFIER="${2:-$(git rev-parse --short HEAD)}"

echo "🚀 Creating prerelease: $PRERELEASE_TYPE-$IDENTIFIER"

# Ensure we're on a clean working tree
if [[ -n $(git status -s) ]]; then
  echo "❌ Error: Working directory is not clean"
  echo "Please commit or stash your changes first"
  exit 1
fi

# Version all packages
echo "📦 Versioning packages..."
pnpm -r --filter "@agenteract/*" exec npm version prerelease --preid="$PRERELEASE_TYPE.$IDENTIFIER" --no-git-tag-version

# Also version the root
npm version prerelease --preid="$PRERELEASE_TYPE.$IDENTIFIER" --no-git-tag-version

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

echo "✅ Packages versioned to: $NEW_VERSION"

# Commit
git add .
git commit -m "chore: prerelease v$NEW_VERSION"

# Create tag
git tag -a "v$NEW_VERSION" -m "Prerelease v$NEW_VERSION"

echo ""
echo "✅ Prerelease version created!"
echo ""
echo "To publish:"
echo "  git push && git push --tags"
echo ""
echo "Or trigger manually via GitHub Actions:"
echo "  gh workflow run prerelease.yml"

