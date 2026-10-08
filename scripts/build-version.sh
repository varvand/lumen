#!/bin/sh
# Print the version to build. CI builds of main are <major>.<minor>.<run number> (LUMEN_BUILD),
# so each build is a distinct, ordered release. The updater requires the version recorded in
# an update signature to equal the one latest.json announces, so this is the app's real version.
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./src-tauri/tauri.conf.json').version")
if [ -n "${LUMEN_BUILD:-}" ]; then
  case "$LUMEN_BUILD" in *[!0-9]*) echo "LUMEN_BUILD must be a number" >&2 && exit 1 ;; esac
  version="${version%.*}.$LUMEN_BUILD"
fi
echo "$version"
