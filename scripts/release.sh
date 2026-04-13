#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/release.sh <patch|minor|major|x.y.z|vX.Y.Z> [commit-message]
# Example:
#   ./scripts/release.sh patch "feat: improve updater fallback"
#   ./scripts/release.sh 4.2.1 "chore: prepare 4.2.1"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <patch|minor|major|x.y.z|vX.Y.Z> [commit-message]"
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "Error: run this script from the project root (package.json missing)."
  exit 1
fi

RELEASE_INPUT="$1"
COMMIT_MSG="${2:-chore: prepare release}"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: release must be cut from main (current: $CURRENT_BRANCH)."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Staging and committing current changes..."
  git add -A
  git commit -m "$COMMIT_MSG"
else
echo "No local code changes to commit."
fi

echo "Building renderer bundle..."
npm run build:renderer

echo "Running tests..."
npm test

NORMALIZED_RELEASE="${RELEASE_INPUT#v}"
CURRENT_VERSION="$(node -p "require('./package.json').version")"
TARGET_TAG="v${NORMALIZED_RELEASE}"

if [ "$NORMALIZED_RELEASE" = "$CURRENT_VERSION" ]; then
  echo "Requested release equals current package version (${CURRENT_VERSION})."
  if git rev-parse "$TARGET_TAG" >/dev/null 2>&1; then
    echo "Tag ${TARGET_TAG} already exists; skipping tag creation."
  else
    echo "Creating tag ${TARGET_TAG} on current commit..."
    git tag -a "$TARGET_TAG" -m "release: ${TARGET_TAG}"
  fi
else
  echo "Bumping/tagging release with npm version: $NORMALIZED_RELEASE"
  npm version "$NORMALIZED_RELEASE" -m "chore(release): %s"
fi

echo "Pushing commit(s) to origin/main..."
git push origin main --follow-tags

if git rev-parse "$TARGET_TAG" >/dev/null 2>&1; then
  echo "Pushing tag ${TARGET_TAG} to origin..."
  git push origin "$TARGET_TAG"
fi

echo "Release push complete. GitHub Actions should now build and publish artifacts for this tag."
