#!/bin/sh
# Verify the universal macOS release: valid ad-hoc signature, both architectures, a DMG.
set -eu
bundle="src-tauri/target/universal-apple-darwin/release/bundle"
app="$bundle/macos/Lumen.app"

codesign --verify --deep --strict "$app"
signature=$(codesign -dv "$app" 2>&1)
echo "$signature" | grep -q "Signature=adhoc" || {
  echo "Expected an ad-hoc signature, found:" >&2
  echo "$signature" >&2
  exit 1
}
archs=$(lipo -archs "$app/Contents/MacOS/lumen")
case "$archs" in *x86_64*arm64* | *arm64*x86_64*) ;; *)
  echo "Expected a universal binary, found: $archs" >&2
  exit 1
  ;;
esac

echo "Signed (ad-hoc) universal app: $app ($archs)"
for dmg in "$bundle"/dmg/*.dmg; do
  [ -e "$dmg" ] || { echo "No DMG found in $bundle/dmg" >&2; exit 1; }
  hdiutil verify -quiet "$dmg"
  echo "Share this file: $dmg ($(du -h "$dmg" | cut -f1))"
done
