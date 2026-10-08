#!/bin/sh
# Write latest.json, the manifest the in-app updater reads, for the main-latest release.
# Usage: sh scripts/updater-manifest.sh <build-number> <commit-sha> > latest.json
# The build number travels as semver build metadata (0.1.0+42) and must match the
# LUMEN_BUILD the app was compiled with; see src-tauri/src/updates.rs.
set -eu
cd "$(dirname "$0")/.."
build=$1
sha=$2
bundle="src-tauri/target/universal-apple-darwin/release/bundle/macos"
url="https://github.com/varvand/lumen/releases/download/main-latest/Lumen.app.tar.gz"
BUILD="$build" SHA="$sha" URL="$url" SIG="$(cat "$bundle/Lumen.app.tar.gz.sig")" node -e '
  const { version } = require("./src-tauri/tauri.conf.json");
  const platform = { signature: process.env.SIG, url: process.env.URL };
  const manifest = {
    version: `${version}+${process.env.BUILD}`,
    notes: `Build ${process.env.BUILD} of main (${process.env.SHA.slice(0, 7)}).`,
    pub_date: new Date().toISOString(),
    platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform },
  };
  console.log(JSON.stringify(manifest, null, 2));
'
