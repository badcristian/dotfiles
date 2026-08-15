#!/bin/bash
set -euo pipefail

VSCODE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_CSS="$VSCODE_DIR/User/custom-workbench.css"
APP_RESOURCES="${VSCODE_APP_RESOURCES:-/Applications/Visual Studio Code.app/Contents/Resources/app}"
BUNDLED_CSS="$APP_RESOURCES/out/vs/workbench/workbench.desktop.main.css"
BUNDLED_JS="$APP_RESOURCES/out/vs/workbench/workbench.desktop.main.js"
WORKBENCH_HTML="$APP_RESOURCES/out/vs/code/electron-browser/workbench/workbench.html"
SOURCE_ONLY=false

if [ "${1:-}" = "--source-only" ]; then
	SOURCE_ONLY=true
elif [ "$#" -ne 0 ]; then
	echo "Usage: $0 [--source-only]" >&2
	exit 2
fi

node - "$SOURCE_CSS" <<'NODE'
const fs = require("fs");
const cssPath = process.argv[2];
const css = fs.readFileSync(cssPath, "utf8");
const checks = [
	[/\.editor-group-watermark \.letterpress\s*\{[^}]*background-image:\s*none\s*!important/s, "the custom empty-editor letterpress surface"],
	[/\.editor-group-watermark \.letterpress::before\s*\{[^}]*content:\s*"⌘"/s, "the compact empty-editor glyph"],
	[/height:\s*26px\s*!important/, "the shared 26px outer-tab height"],
	[/\.tab\.has-icon\s*>\s*\.tab-label::before\s*\{[^}]*background-position-y:\s*calc\(50%\s*\+\s*2px\)\s*!important/s, "the 2px tab file-icon optical alignment"],
	[/\.tab\.close-action-off:not\(\.sticky-compact\)\s*\{[^}]*padding-left:\s*var\(--vscode-spacing-size80\)\s*!important/s, "the symmetric padding for actionless modern tabs"],
];

for (const [pattern, description] of checks) {
	if (!pattern.test(css)) {
		console.error(`FAIL: custom-workbench.css is missing ${description}`);
		process.exit(1);
	}
}

const opens = (css.match(/\{/g) || []).length;
const closes = (css.match(/\}/g) || []).length;
if (opens !== closes) {
	console.error(`FAIL: custom-workbench.css has ${opens} opening and ${closes} closing braces`);
	process.exit(1);
}

console.log(`PASS: source CSS contract (${opens} balanced rule blocks)`);
NODE

if [ "$SOURCE_ONLY" = true ]; then
	exit 0
fi

if [ ! -f "$BUNDLED_CSS" ] || [ ! -f "$BUNDLED_JS" ] || [ ! -f "$WORKBENCH_HTML" ]; then
	echo "FAIL: VS Code workbench files were not found under $APP_RESOURCES" >&2
	exit 1
fi

node - "$BUNDLED_CSS" "$BUNDLED_JS" "$WORKBENCH_HTML" "$SOURCE_CSS" <<'NODE'
const fs = require("fs");
const [bundledPath, bundledJsPath, htmlPath, sourcePath] = process.argv.slice(2);
const bundled = fs.readFileSync(bundledPath, "utf8");
const bundledJs = fs.readFileSync(bundledJsPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");
const source = fs.readFileSync(sourcePath, "utf8");
const nativeChecks = [
	[/\.editor-group-watermark[^{}]*\.letterpress/, "empty-editor .letterpress"],
	[/\.monaco-icon-label:before\{[^}]*background-position:left center[^}]*height:22px/, "file-icon pseudo-element"],
	[/\.tabs-container\s*>\s*\.tab \.tab-label\{[^}]*line-height:var\(--editor-group-tab-height\)/, "tab-label line box"],
	[/modern-ui-tabs \.part\.editor \.tabs-container>\.tab\{[^}]*padding:0 var\(--vscode-spacing-size80\) 0 var\(--vscode-spacing-size40\)!important/, "modern tab padding variables"],
];

for (const [pattern, description] of nativeChecks) {
	if (!pattern.test(bundled)) {
		console.error(`FAIL: this VS Code build no longer exposes the expected ${description} contract`);
		console.error("Inspect the new workbench DOM/CSS before re-enabling the customization.");
		process.exit(1);
	}
}

if (!/classList\.toggle\("has-icon",/.test(bundledJs)) {
	console.error("FAIL: this VS Code build no longer marks icon-bearing tabs with .has-icon");
	console.error("Inspect the new workbench DOM before re-enabling the customization.");
	process.exit(1);
}

if (!/classList\.toggle\("close-action-off",/.test(bundledJs)) {
	console.error("FAIL: this VS Code build no longer marks actionless tabs with .close-action-off");
	console.error("Inspect the new workbench DOM before re-enabling the customization.");
	process.exit(1);
}

const injectionMarkers = [
	'.editor-group-watermark .letterpress::before',
	"background-position-y: calc(50% + 2px) !important;",
	"padding-left: var(--vscode-spacing-size80) !important;",
];

for (const marker of injectionMarkers) {
	if (!source.includes(marker) || !html.includes(marker)) {
		console.error(`FAIL: the installed workbench does not contain the current custom CSS marker: ${marker}`);
		console.error('Run "Reload Custom CSS and JS", restart VS Code, then run this check again.');
		process.exit(1);
	}
}

console.log("PASS: installed VS Code still exposes the expected tab and watermark DOM contracts");
console.log("PASS: workbench.html contains the current repository CSS injection");
NODE
