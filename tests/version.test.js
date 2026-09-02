const test = require('node:test');
const assert = require('node:assert/strict');

const pkg = require('../package.json');

// The release scheme these tests pin down:
//   - stable releases are X.Y.Z
//   - prereleases are X.Y.Z-beta.N and nothing else, because electron-builder
//     names the update manifest after the prerelease identifier and `beta` is
//     the only one the in-app channel selector reads
//   - the git tag is v<version>, checked again by the release workflow
//
// A past release shipped as 5.0.1-a, which produced an `a.yml` manifest no
// channel ever looked at. These assertions exist so that cannot recur.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-(beta)\.(\d+))?$/;

test('package version follows the release scheme', () => {
  const match = SEMVER.exec(pkg.version);

  assert.ok(
    match,
    `package.json version "${pkg.version}" must be X.Y.Z or X.Y.Z-beta.N`
  );
});

test('a prerelease version uses the beta identifier', () => {
  if (!pkg.version.includes('-')) return;

  assert.match(
    pkg.version,
    /-beta\.\d+$/,
    `prerelease "${pkg.version}" would publish a manifest no update channel reads`
  );
});

test('the GitHub publisher targets the coretrace-gui repo and publishes directly', () => {
  const publish = Array.isArray(pkg.build.publish) ? pkg.build.publish[0] : pkg.build.publish;

  assert.equal(publish.provider, 'github');
  assert.equal(publish.owner, 'CoreTrace');
  assert.equal(publish.repo, 'coretrace-gui');
  // Left unset, electron-builder creates a draft that someone has to publish by
  // hand — which is how v5.0.1 sat unreleased for months.
  assert.equal(publish.releaseType, 'release');
});

test('macOS builds ship the zip electron-updater needs alongside the dmg', () => {
  const targets = pkg.build.mac.target;

  assert.ok(Array.isArray(targets), 'mac.target must list every artifact');
  assert.ok(targets.includes('dmg'), 'mac.target must include dmg');
  assert.ok(targets.includes('zip'), 'electron-updater cannot update from a dmg alone');
});
