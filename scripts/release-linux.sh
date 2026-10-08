#!/bin/sh
# Build the Linux AppImage and .deb for the current architecture.
# With the updater signing key (CI), also sign them for over-the-air updates.
set -eu
cd "$(dirname "$0")/.."
version=$(sh scripts/build-version.sh)
updater=
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  updater='{"bundle":{"createUpdaterArtifacts":true}}'
fi
# linuxdeploy is itself an AppImage; extracting it avoids needing FUSE on the build machine.
export APPIMAGE_EXTRACT_AND_RUN=1
npx tauri build --bundles appimage,deb \
  --config "{\"version\":\"$version\"}" ${updater:+--config "$updater"}

bundle="src-tauri/target/release/bundle"
ls "$bundle"/appimage/*_"$version"_*.AppImage "$bundle"/deb/*_"$version"_*.deb
