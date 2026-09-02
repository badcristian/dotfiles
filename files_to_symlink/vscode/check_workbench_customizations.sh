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
	[/--modern-ui-editor-tab-action-active-background:\s*var\(--vscode-tab-activeBackground\)\s*!important/, "the theme-backed modern active fill"],
	[/\.tab\s*>\s*\.tab-fill\s*\{[^}]*inset-block:\s*1px\s*!important/s, "the centred 24px tab fill"],
	[/\.tab\s*>\s*\.tab-actions\s*\{[^}]*inset-block:\s*1px\s*!important/s, "the centred 24px tab action layer"],
	[/\.tab\.sticky\s*>\s*\.tab-actions\s*\{[^}]*background-color:\s*transparent\s*!important/s, "the transparent pinned-action surface"],
	[/\.monaco-editor \.margin-view-overlays \.line-numbers\s*\{[^}]*transform:\s*translateX\(4px\)\s*!important/s, "the fixed 4px line-number inset"],
	[/\.monaco-editor \.margin-view-overlays \.cldr\s*\{[^}]*transform:\s*translateX\(4px\)\s*!important[^}]*width:\s*2px\s*!important/s, "the 4px change-marker gap and 2px marker width"],
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
	// 1.134.0 moved this rule twice over: the selector grew a second, comma-separated arm
	// (`.modern-ui-editor-tab`), and the left padding went from `size40` to `size60`. Neither is a
	// contract change — what the injected CSS depends on is that modern tabs are still padded from
	// the `--vscode-spacing-*` scale — so the selector tail and the left value are left open.
	[/modern-ui-tabs \.part\.editor \.tabs-container>\.tab[^{}]*\{[^}]*padding:0 var\(--vscode-spacing-size80\) 0 var\(--vscode-spacing-size\d+\)!important/, "modern tab padding variables"],
	[/modern-ui-tabs[^{}]*\.tabs-container\s*>\s*\.tab\s*>\s*\.tab-fill/, "modern .tab-fill"],
	[/modern-ui-tabs[^{}]*\.tabs-container[^{}]*\.tab\s*>\s*\.tab-actions/, "modern .tab-actions"],
	[/--modern-ui-editor-tab-action-active-background/, "modern active-action color variable"],
	[/\.monaco-editor \.margin-view-overlays \.line-numbers\{[^}]*text-align:right[^}]*box-sizing:border-box/, "line-number overlay"],
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
	"--modern-ui-editor-tab-action-active-background: var(--vscode-tab-activeBackground) !important;",
	".tab > .tab-actions",
	"transform: translateX(4px) !important;",
	".margin-view-overlays .cldr",
];

for (const marker of injectionMarkers) {
	if (!source.includes(marker) || !html.includes(marker)) {
		console.error(`FAIL: the installed workbench does not contain the current custom CSS marker: ${marker}`);
		console.error('Run "Reload Custom CSS and JS", restart VS Code, then run this check again.');
		process.exit(1);
	}
}

console.log("PASS: installed VS Code still exposes the expected workbench DOM contracts");
console.log("PASS: workbench.html contains the current repository CSS injection");
NODE
