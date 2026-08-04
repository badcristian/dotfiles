(() => {
	const restoreDelays = [0, 8, 16, 32, 64, 120, 240, 400];
	const editorSelector = '.monaco-editor';
	const scrollableSelector = '.monaco-scrollable-element > .scrollable-element';
	let pendingRestore = null;

	function getTargetElement(event) {
		return event.target instanceof Element ? event.target : null;
	}

	function getEditorNodeFromEvent(event) {
		return getTargetElement(event)?.closest(editorSelector) || null;
	}

	function getDomScrollTargets(editorNode) {
		return Array.from(editorNode.querySelectorAll(scrollableSelector))
			.filter((element) => element.scrollLeft > 0)
			.map((element) => ({
				element,
				scrollLeft: element.scrollLeft,
			}));
	}

	function getMonacoEditor(editorNode) {
		const editors = window.monaco?.editor?.getEditors?.() || [];

		return editors.find((editor) => editor.getDomNode?.() === editorNode) || null;
	}

	function rememberHorizontalScroll(event) {
		const editorNode = getEditorNodeFromEvent(event);

		if (!editorNode) {
			pendingRestore = null;
			return;
		}

		const monacoEditor = getMonacoEditor(editorNode);
		const monacoScrollLeft = monacoEditor?.getScrollLeft?.() || 0;
		const domTargets = getDomScrollTargets(editorNode);
		const hasScroll = monacoScrollLeft > 0 || domTargets.length > 0;

		pendingRestore = hasScroll
			? {
				editorNode,
				monacoEditor,
				monacoScrollLeft,
				domTargets,
				startedAt: Date.now(),
			}
			: null;
	}

	function applyRestore(snapshot) {
		if (snapshot.monacoEditor && snapshot.monacoScrollLeft > 0) {
			const current = snapshot.monacoEditor.getScrollLeft?.() || 0;

			if (current < snapshot.monacoScrollLeft) {
				snapshot.monacoEditor.setScrollLeft?.(snapshot.monacoScrollLeft);
			}
		}

		for (const target of snapshot.domTargets) {
			if (!target.element.isConnected) {
				continue;
			}

			if (target.element.scrollLeft < target.scrollLeft) {
				target.element.scrollLeft = target.scrollLeft;
			}
		}
	}

	function restoreHorizontalScroll(event) {
		if (!pendingRestore || Date.now() - pendingRestore.startedAt > 1500) {
			pendingRestore = null;
			return;
		}

		const editorNode = getEditorNodeFromEvent(event);

		if (editorNode && editorNode !== pendingRestore.editorNode) {
			pendingRestore = null;
			return;
		}

		const snapshot = pendingRestore;

		for (const delay of restoreDelays) {
			window.setTimeout(() => {
				if (pendingRestore !== snapshot) {
					return;
				}

				applyRestore(snapshot);
			}, delay);
		}
	}

	window.__preserveEditorHorizontalScroll = {
		version: 2,
	};

	window.addEventListener('pointerdown', rememberHorizontalScroll, true);
	window.addEventListener('mousedown', rememberHorizontalScroll, true);
	window.addEventListener('mouseup', restoreHorizontalScroll, true);
	window.addEventListener('click', restoreHorizontalScroll, true);
	window.addEventListener('selectionchange', restoreHorizontalScroll, true);
})();
