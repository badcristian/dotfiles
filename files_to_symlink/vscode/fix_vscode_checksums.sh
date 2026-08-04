#!/bin/bash
# Rewrites the checksums in VS Code's product.json so they match the files on disk.
#
# VS Code verifies a short list of workbench files at startup and shows "Your Code installation
# appears to be corrupt" when one of them changed. The Custom CSS and JS Loader patches
# workbench.html on purpose, which trips that check.
#
# Run this after enabling or reloading the custom CSS and JS, and after a VS Code update, then
# restart VS Code. Because it trusts whatever is on disk, run it only when the modification is one
# you made deliberately.
set -euo pipefail

APP_PATH="${1:-/Applications/Visual Studio Code.app}"
PRODUCT_JSON="$APP_PATH/Contents/Resources/app/product.json"

if [ ! -f "$PRODUCT_JSON" ]; then
  echo "Error: product.json not found at $PRODUCT_JSON"
  echo "Pass the application path as the first argument if VS Code lives elsewhere."
  exit 1
fi

if [ ! -w "$PRODUCT_JSON" ]; then
  echo "Error: $PRODUCT_JSON is not writable."
  echo "Take ownership once with:"
  echo "  sudo chown -R \"\$(whoami)\" \"$APP_PATH\""
  exit 1
fi

node -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  const productPath = process.argv[1];
  const outDir = path.join(path.dirname(productPath), "out");
  const source = fs.readFileSync(productPath, "utf8");
  const product = JSON.parse(source);
  const checksums = product.checksums || {};
  const updated = [];
  let next = source;

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const [relativePath, expected] of Object.entries(checksums)) {
    const file = path.join(outDir, relativePath);

    if (!fs.existsSync(file)) {
      console.log(`skipped (missing): ${relativePath}`);
      continue;
    }

    const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("base64").replace(/=+$/, "");

    if (actual === expected) {
      continue;
    }

    // Replace only this entry so the rest of product.json keeps its exact formatting.
    const pattern = new RegExp(`("${escapeRegExp(relativePath)}"\\s*:\\s*")${escapeRegExp(expected)}(")`);

    if (!pattern.test(next)) {
      console.error(`Error: could not locate the checksum entry for ${relativePath}`);
      process.exit(1);
    }

    next = next.replace(pattern, `$1${actual}$2`);
    updated.push(relativePath);
  }

  if (!updated.length) {
    console.log("All checksums already match. Nothing to do.");
    process.exit(0);
  }

  JSON.parse(next);
  fs.writeFileSync(productPath, next);

  for (const relativePath of updated) {
    console.log(`updated: ${relativePath}`);
  }

  console.log(`\nRestart VS Code for the corruption warning to clear.`);
' "$PRODUCT_JSON"
