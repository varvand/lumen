#!/bin/sh
# Tauri merges only the main binary for universal builds; merge the MCP companion as well.
set -eu
target="src-tauri/target"
mkdir -p "$target/universal-apple-darwin/release"
lipo -create \
  "$target/aarch64-apple-darwin/release/lumen-mcp" \
  "$target/x86_64-apple-darwin/release/lumen-mcp" \
  -output "$target/universal-apple-darwin/release/lumen-mcp"
