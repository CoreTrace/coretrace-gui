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

echo "Running tests..."
npm test

NORMALIZED_RELEASE="${RELEASE_INPUT#v}"

echo "Bumping/tagging release with npm version: $NORMALIZED_RELEASE"
npm version "$NORMALIZED_RELEASE" -m "chore(release): %s"

echo "Pushing commit(s) and tag(s) to origin/main..."
git push origin main --follow-tags

echo "Release push complete. GitHub Actions should now build and publish artifacts for this tag."
