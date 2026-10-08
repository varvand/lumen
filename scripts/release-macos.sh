#!/bin/sh
# Build a universal (Apple silicon + Intel), ad-hoc signed Lumen.app and a DMG to share.
# Ad-hoc signing needs no Apple Developer account; the app is not notarized.
set -eu
cd "$(dirname "$0")/.."
# Signing env vars override tauri.conf.json. Clear them so no keychain identity is picked up.
unset APPLE_SIGNING_IDENTITY APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD
bundle="src-tauri/target/universal-apple-darwin/release/bundle"
npx tauri build --target universal-apple-darwin --config src-tauri/tauri.universal.conf.json --bundles app

# Tauri's DMG step drives Finder through AppleScript, which opens windows and can hang.
# A plain image with an Applications link needs no Finder automation.
version=$(node -p "require('./src-tauri/tauri.conf.json').version")
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
ditto "$bundle/macos/Lumen.app" "$staging/Lumen.app"
ln -s /Applications "$staging/Applications"
mkdir -p "$bundle/dmg"
dmg="$bundle/dmg/Lumen_${version}_universal.dmg"
hdiutil create -quiet -volname Lumen -srcfolder "$staging" -fs HFS+ -format UDZO -ov "$dmg"

sh scripts/check-macos-release.sh
