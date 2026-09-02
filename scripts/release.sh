#!/usr/bin/env bash
set -euo pipefail

# Cut a release: bump package.json, tag, push. CI does the rest — the tag is the
# only thing that triggers a build and publish (see .github/workflows/release.yml).
#
# Usage:
#   ./scripts/release.sh <patch|minor|major|prerelease|x.y.z|vX.Y.Z>
# Examples:
#   ./scripts/release.sh minor            # 5.1.0 -> 5.2.0
#   ./scripts/release.sh 5.2.0-beta.1     # cut a beta on the beta channel
#   ./scripts/release.sh prerelease       # 5.2.0-beta.1 -> 5.2.0-beta.2
#
# Versioning rules, enforced below and again in CI:
#   - stable releases are X.Y.Z
#   - prereleases are X.Y.Z-beta.N, and nothing else: electron-builder names the
#     update manifest after the prerelease identifier, and `beta` is the only one
#     the in-app channel selector reads (src/main/ipc/updaterHandlers.js)
#   - the git tag is always v<package.json version>

if [ $# -lt 1 ]; then
  echo "Usage: $0 <patch|minor|major|prerelease|x.y.z|vX.Y.Z>"
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "Error: run this script from the project root (package.json missing)."
  exit 1
fi

RELEASE_INPUT="${1#v}"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "master" ]; then
  echo "Error: release must be cut from master (current: $CURRENT_BRANCH)."
  exit 1
fi

# Refuse to release a dirty tree. Committing stray changes on the user's behalf
# is how a release ends up containing something nobody reviewed.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes. Commit or stash them first."
  git status --short
  exit 1
fi

echo "Fetching tags from origin..."
git fetch --tags --quiet origin

echo "Building renderer bundle..."
npm run build:renderer

echo "Running tests..."
npm test

# `npm version` prints the new version and writes package.json + a tag for us.
npm version "$RELEASE_INPUT" --message "chore(release): %s" > /dev/null

NEW_VERSION="$(node -p "require('./package.json').version")"
TARGET_TAG="v${NEW_VERSION}"

# Validate what npm actually produced, before anything reaches origin.
if [[ "$NEW_VERSION" == *-* ]] && [[ ! "$NEW_VERSION" =~ -beta\.[0-9]+$ ]]; then
  echo "Error: prerelease versions must end in -beta.N (got ${NEW_VERSION})."
  echo "Rolling back the version commit and tag."
  git tag -d "$TARGET_TAG" >/dev/null 2>&1 || true
  git reset --hard HEAD~1
  exit 1
fi

if git ls-remote --exit-code --tags origin "$TARGET_TAG" >/dev/null 2>&1; then
  echo "Error: tag ${TARGET_TAG} already exists on origin."
  echo "Rolling back the version commit and tag."
  git tag -d "$TARGET_TAG" >/dev/null 2>&1 || true
  git reset --hard HEAD~1
  exit 1
fi

if [[ "$NEW_VERSION" == *-beta.* ]]; then
  echo "Cutting ${TARGET_TAG} on the beta channel."
else
  echo "Cutting ${TARGET_TAG} on the stable channel."
fi

echo "Pushing master and ${TARGET_TAG} to origin..."
git push origin master
git push origin "$TARGET_TAG"

echo
echo "Done. GitHub Actions builds and publishes ${TARGET_TAG} for Windows, Linux and macOS."
echo "Watch it at: https://github.com/CoreTrace/coretrace-gui/actions"
