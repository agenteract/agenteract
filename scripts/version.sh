#!/usr/bin/env bash
# Unified version script for single, multiple, or all packages
# Supports stable releases (patch, minor, major) and prereleases (alpha, beta, rc)
#
# Usage:
#   ./scripts/version.sh <version-type> [package1,package2,...]
#   ./scripts/version.sh minor agents,core    # Update specific packages
#   ./scripts/version.sh patch               # Update all packages
#   ./scripts/version.sh alpha               # Prerelease all packages
#   ./scripts/version.sh beta agents         # Prerelease specific package
#
# Examples:
#   ./scripts/version.sh minor agents        # Bump only @agenteract/agents
#   ./scripts/version.sh patch core,react    # Bump @agenteract/core and @agenteract/react
#   ./scripts/version.sh major               # Bump all @agenteract/* packages
#   ./scripts/version.sh alpha               # Create alpha prerelease for all packages
#   ./scripts/version.sh beta agents,core    # Create beta prerelease for specific packages
#   ./scripts/version.sh rc                  # Create release candidate for all packages

set -e

VERSION_TYPE="${1:-patch}"
PACKAGES_ARG="${2}"

# Detect if this is a prerelease
IS_PRERELEASE=false
PRERELEASE_ID=""
if [[ "$VERSION_TYPE" =~ ^(alpha|beta|rc)$ ]]; then
  IS_PRERELEASE=true
  PRERELEASE_ID="$VERSION_TYPE.$(git rev-parse --short HEAD)"
  PRERELEASE_TYPE="$VERSION_TYPE"
  VERSION_TYPE="prerelease"
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏷️  Agenteract Version Manager${NC}"
echo ""

# Ensure we're on a clean working tree
if [[ -n $(git status -s) ]]; then
  echo -e "${RED}❌ Error: Working directory is not clean${NC}"
  echo "Please commit or stash your changes first"
  exit 1
fi

# Pull latest changes
echo -e "${BLUE}📥 Pulling latest changes...${NC}"
git pull --rebase
echo ""

# Get list of all packages
ALL_PACKAGES=()
for pkg in packages/*/package.json; do
  if [ -f "$pkg" ]; then
    PKG_SHORT_NAME=$(basename $(dirname "$pkg"))
    ALL_PACKAGES+=("$PKG_SHORT_NAME")
  fi
done

# Determine which packages to update
TARGET_PACKAGES=()
if [ -z "$PACKAGES_ARG" ]; then
  # No packages specified = all packages
  TARGET_PACKAGES=("${ALL_PACKAGES[@]}")
  echo -e "${YELLOW}📦 Mode: Update ALL packages${NC}"
else
  # Comma-separated list of packages
  IFS=',' read -ra TARGET_PACKAGES <<< "$PACKAGES_ARG"
  echo -e "${YELLOW}📦 Mode: Update SPECIFIC packages${NC}"
fi

echo ""
if [ "$IS_PRERELEASE" = true ]; then
  echo -e "${BLUE}Release Type: Prerelease ($PRERELEASE_TYPE)${NC}"
  echo -e "${BLUE}Identifier: $PRERELEASE_ID${NC}"
else
  echo -e "${BLUE}Version Type: $VERSION_TYPE${NC}"
fi
echo ""

# Validate packages exist and collect version info
# Using parallel arrays for portability (no associative arrays needed)
VALID_PACKAGES=()
CURRENT_VERSIONS=()
NEW_VERSIONS=()

echo -e "${BLUE}📋 Analyzing packages...${NC}"
echo ""

for pkg_name in "${TARGET_PACKAGES[@]}"; do
  pkg_name=$(echo "$pkg_name" | xargs) # trim whitespace
  PACKAGE_DIR="packages/$pkg_name"
  PACKAGE_JSON="$PACKAGE_DIR/package.json"

  if [ ! -f "$PACKAGE_JSON" ]; then
    echo -e "${RED}❌ Error: Package '$pkg_name' not found${NC}"
    echo ""
    echo "Available packages:"
    for p in "${ALL_PACKAGES[@]}"; do
      echo "  - $p"
    done
    exit 1
  fi

  FULL_NAME=$(node -p "require('./$PACKAGE_JSON').name")
  CURRENT_VERSION=$(node -p "require('./$PACKAGE_JSON').version")

  # Calculate new version
  cd "$PACKAGE_DIR"
  if [ "$IS_PRERELEASE" = true ]; then
    NEW_VERSION=$(npm version "$VERSION_TYPE" --preid="$PRERELEASE_ID" --no-git-tag-version 2>/dev/null)
  else
    NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version 2>/dev/null)
  fi
  NEW_VERSION=${NEW_VERSION#v} # Remove 'v' prefix

  # Revert the change (we'll apply it later if confirmed)
  git checkout package.json 2>/dev/null || true
  cd - > /dev/null

  # Store in parallel arrays (same index for each array)
  VALID_PACKAGES+=("$pkg_name")
  CURRENT_VERSIONS+=("$CURRENT_VERSION")
  NEW_VERSIONS+=("$NEW_VERSION")

  echo -e "  ${GREEN}✓${NC} $FULL_NAME"
  echo -e "    $CURRENT_VERSION ${YELLOW}→${NC} $NEW_VERSION"
done

echo ""
echo -e "${BLUE}──────────────────────────────────────${NC}"
echo -e "${BLUE}📊 Summary${NC}"
echo -e "${BLUE}──────────────────────────────────────${NC}"
echo -e "  Packages to update: ${#VALID_PACKAGES[@]}"
if [ "$IS_PRERELEASE" = true ]; then
  echo -e "  Release type: Prerelease ($PRERELEASE_TYPE)"
else
  echo -e "  Version bump: $VERSION_TYPE"
fi
echo ""

# Helper function to find index of package in VALID_PACKAGES array
get_package_index() {
  local pkg_name="$1"
  local i=0
  for p in "${VALID_PACKAGES[@]}"; do
    if [ "$p" = "$pkg_name" ]; then
      echo "$i"
      return 0
    fi
    i=$((i + 1))
  done
  echo "-1"
  return 1
}

# Determine root package version (highest version among all packages)
echo -e "${BLUE}🔍 Calculating root package version...${NC}"

# Get all package versions (current)
ALL_VERSIONS=()
for pkg in packages/*/package.json; do
  if [ -f "$pkg" ]; then
    PKG_SHORT_NAME=$(basename $(dirname "$pkg"))
    if [[ " ${VALID_PACKAGES[@]} " =~ " ${PKG_SHORT_NAME} " ]]; then
      # Package will be updated - get new version from parallel array
      idx=$(get_package_index "$PKG_SHORT_NAME")
      ALL_VERSIONS+=("${NEW_VERSIONS[$idx]}")
    else
      # Package stays the same
      CURRENT_VER=$(node -p "require('./$pkg').version")
      ALL_VERSIONS+=("$CURRENT_VER")
    fi
  fi
done

# Find highest version using semver comparison
HIGHEST_VERSION="0.0.0"
for ver in "${ALL_VERSIONS[@]}"; do
  # Simple semver comparison (assumes format X.Y.Z)
  if [ "$(printf '%s\n' "$ver" "$HIGHEST_VERSION" | sort -V | tail -n1)" = "$ver" ]; then
    HIGHEST_VERSION="$ver"
  fi
done

CURRENT_ROOT_VERSION=$(node -p "require('./package.json').version")
echo -e "  Current root version: $CURRENT_ROOT_VERSION"
echo -e "  New root version: ${YELLOW}$HIGHEST_VERSION${NC}"
echo ""

# Confirmation prompt
echo -e "${YELLOW}──────────────────────────────────────${NC}"
read -p "$(echo -e ${YELLOW}Proceed with version bump? [y/N]:${NC} )" -n 1 -r
echo ""
echo -e "${YELLOW}──────────────────────────────────────${NC}"

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}❌ Version bump cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${GREEN}✅ Confirmed! Applying version changes...${NC}"
echo ""

# Apply version changes
idx=0
for pkg_name in "${VALID_PACKAGES[@]}"; do
  PACKAGE_DIR="packages/$pkg_name"
  cd "$PACKAGE_DIR"
  if [ "$IS_PRERELEASE" = true ]; then
    npm version "$VERSION_TYPE" --preid="$PRERELEASE_ID" --no-git-tag-version > /dev/null
  else
    npm version "$VERSION_TYPE" --no-git-tag-version > /dev/null
  fi
  cd - > /dev/null
  echo -e "  ${GREEN}✓${NC} Updated $pkg_name to ${NEW_VERSIONS[$idx]}"
  idx=$((idx + 1))
done

# Update root package version
echo ""
echo -e "${BLUE}🔄 Updating root package.json...${NC}"
npm version "$HIGHEST_VERSION" --no-git-tag-version --allow-same-version > /dev/null
echo -e "  ${GREEN}✓${NC} Root version set to $HIGHEST_VERSION"

# Commit changes
echo ""
echo -e "${BLUE}📝 Committing version changes...${NC}"
git add .

# Create commit message
if [ "$IS_PRERELEASE" = true ]; then
  if [ ${#VALID_PACKAGES[@]} -eq 1 ]; then
    FULL_NAME=$(node -p "require('./packages/${VALID_PACKAGES[0]}/package.json').name")
    COMMIT_MSG="chore: prerelease $FULL_NAME v${NEW_VERSIONS[0]}"
  elif [ ${#VALID_PACKAGES[@]} -eq ${#ALL_PACKAGES[@]} ]; then
    COMMIT_MSG="chore: prerelease v$HIGHEST_VERSION"
  else
    COMMIT_MSG="chore: prerelease ${#VALID_PACKAGES[@]} packages v$HIGHEST_VERSION"
  fi
else
  if [ ${#VALID_PACKAGES[@]} -eq 1 ]; then
    FULL_NAME=$(node -p "require('./packages/${VALID_PACKAGES[0]}/package.json').name")
    COMMIT_MSG="chore: bump $FULL_NAME to v${NEW_VERSIONS[0]}"
  elif [ ${#VALID_PACKAGES[@]} -eq ${#ALL_PACKAGES[@]} ]; then
    COMMIT_MSG="chore: release v$HIGHEST_VERSION"
  else
    COMMIT_MSG="chore: bump ${#VALID_PACKAGES[@]} packages to v$HIGHEST_VERSION"
  fi
fi

git commit -m "$COMMIT_MSG"
echo -e "  ${GREEN}✓${NC} Committed: $COMMIT_MSG"

# Create git tag
echo ""
echo -e "${BLUE}🏷️  Creating git tag: v$HIGHEST_VERSION${NC}"
git tag -a "v$HIGHEST_VERSION" -m "Release v$HIGHEST_VERSION" 2>/dev/null || {
  echo -e "${YELLOW}⚠️  Tag v$HIGHEST_VERSION already exists, skipping tag creation${NC}"
}

echo ""
echo -e "${GREEN}──────────────────────────────────────${NC}"
echo -e "${GREEN}✅ Version bump complete!${NC}"
echo -e "${GREEN}──────────────────────────────────────${NC}"
echo ""
echo "Root version: $CURRENT_ROOT_VERSION → $HIGHEST_VERSION"
echo ""
echo "Updated packages:"
idx=0
for pkg_name in "${VALID_PACKAGES[@]}"; do
  FULL_NAME=$(node -p "require('./packages/$pkg_name/package.json').name")
  echo "  • $FULL_NAME: ${CURRENT_VERSIONS[$idx]} → ${NEW_VERSIONS[$idx]}"
  idx=$((idx + 1))
done
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Review changes: git show"
echo "  2. Push to remote: git push && git push --tags"
if [ "$IS_PRERELEASE" = true ]; then
  echo "  3. GitHub Actions will publish with '@next' tag on NPM"
  echo ""
  echo -e "${BLUE}Installation:${NC}"
  echo "  npm install @agenteract/core@next"
  echo "  npm install @agenteract/core@$HIGHEST_VERSION"
else
  echo "  3. GitHub Actions will publish only updated packages to NPM"
fi
echo ""
echo -e "${YELLOW}To undo:${NC}"
echo "  git reset --hard HEAD~1"
echo "  git tag -d v$HIGHEST_VERSION"
