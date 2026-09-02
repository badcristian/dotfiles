'use strict';

// Vue <script setup> leaves module imports and executable declarations at the same document-symbol
// level. Imports/exports are useful navigation boundaries; an initializer such as
// `const { closeTimeLog } = useTimeLog()` is a use and belongs with ordinary usages.
function isTopLevelReference(symbolName, sourceLine) {
	return symbolName === 'top level' && /^\s*(?:import|export)\b/.test(String(sourceLine || ''));
}

module.exports = { isTopLevelReference };
