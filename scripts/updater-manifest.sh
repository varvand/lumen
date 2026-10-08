#!/bin/sh
# Write latest.json, the manifest the in-app updater reads, for the main-latest release.
# Usage: sh scripts/updater-manifest.sh <build-number> <commit-sha> > latest.json
# The announced version is read from the built app, so it always equals the version the
# updater signature records (see scripts/release-macos.sh).
set -eu
cd "$(dirname "$0")/.."
build=$1
sha=$2
bundle="src-tauri/target/universal-apple-darwin/release/bundle/macos"
url="https://github.com/varvand/lumen/releases/download/main-latest/Lumen.app.tar.gz"
version=$(plutil -extract CFBundleShortVersionString raw "$bundle/Lumen.app/Contents/Info.plist")
VERSION="$version" BUILD="$build" SHA="$sha" URL="$url" SIG="$(cat "$bundle/Lumen.app.tar.gz.sig")" node -e '
  const platform = { signature: process.env.SIG, url: process.env.URL };
  const manifest = {
    version: process.env.VERSION,
    notes: `Build ${process.env.BUILD} of main (${process.env.SHA.slice(0, 7)}).`,
    pub_date: new Date().toISOString(),
    platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform },
  };
  console.log(JSON.stringify(manifest, null, 2));
'
