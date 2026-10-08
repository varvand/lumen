#!/bin/sh
# Build a universal (Apple silicon + Intel), ad-hoc signed Lumen.app and a DMG to share.
# Ad-hoc signing needs no Apple Developer account; the app is not notarized.
set -eu
cd "$(dirname "$0")/.."
# Signing env vars override tauri.conf.json. Clear them so no keychain identity is picked up.
unset APPLE_SIGNING_IDENTITY APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD
bundle="src-tauri/target/universal-apple-darwin/release/bundle"
# CI builds of main are versioned <major>.<minor>.<run number> (LUMEN_BUILD), so each build
# is a distinct, ordered release. The updater requires the version recorded in the update
# signature to equal the one latest.json announces, so it must be the app's real version.
version=$(node -p "require('./src-tauri/tauri.conf.json').version")
if [ -n "${LUMEN_BUILD:-}" ]; then
  case "$LUMEN_BUILD" in *[!0-9]*) echo "LUMEN_BUILD must be a number" >&2 && exit 1 ;; esac
  version="${version%.*}.$LUMEN_BUILD"
fi
# With the updater signing key (CI), also build Lumen.app.tar.gz and its signature for
# over-the-air updates. Without it, the build stays as before.
updater=
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  updater='{"bundle":{"createUpdaterArtifacts":true}}'
fi
npx tauri build --target universal-apple-darwin --config src-tauri/tauri.universal.conf.json \
  --config "{\"version\":\"$version\"}" ${updater:+--config "$updater"} --bundles app

# Tauri's DMG step drives Finder through AppleScript, which opens windows and can hang.
# A plain image with an Applications link needs no Finder automation.
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
ditto "$bundle/macos/Lumen.app" "$staging/Lumen.app"
ln -s /Applications "$staging/Applications"
mkdir -p "$bundle/dmg"
rm -f "$bundle"/dmg/*.dmg
dmg="$bundle/dmg/Lumen_${version}_universal.dmg"
hdiutil create -quiet -volname Lumen -srcfolder "$staging" -fs HFS+ -format UDZO -ov "$dmg"

sh scripts/check-macos-release.sh
