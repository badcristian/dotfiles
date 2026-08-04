// Anchors the quick input widget under the command center pill so every picker appears to come
// out of the rounded rectangle in the title bar.
//
// VS Code centers the widget on `dimension.width * (viewState.left ?? 0.5)` and stores a dragged
// position in `workbench.quickInput.viewState`, so a single drag moves every future picker off
// the pill. The pill itself is not window-centered either: `.titlebar-center` is centered between
// title bar areas of different widths, so the offset cannot be expressed as a static stylesheet
// rule and has to be measured.
//
// Positions are written as ordinary inline styles rather than `!important` declarations. VS Code
// keeps one widget element for the lifetime of the window, and an important inline value would
// permanently outrank its own layout writes, including dragging.
(() => {
	const WORKBENCH_SELECTOR = '.monaco-workbench';
	const WIDGET_SELECTOR = '.quick-input-widget';
	const COMMAND_CENTER_SELECTOR = '.part.titlebar .command-center .action-item.command-center-center';
	const OVERLAY_CLASS = 'quick-input-widget-overlay';
	const CLOSING_CLASS = 'quick-input-widget-closing';
	const MIN_WIDTH = 420;
	const VIEWPORT_MARGIN = 8;
	const TITLE_BAR_GAP = 4;
	const SETTLE_DELAY = 60;

	let widget = null;
	let wasVisible = false;
	let scheduled = false;

	function getCommandCenterRect() {
		const element = document.querySelector(COMMAND_CENTER_SELECTOR);

		if (!element) {
			return null;
		}

		const rect = element.getBoundingClientRect();

		return rect.width > 0 && rect.height > 0 ? rect : null;
	}

	function isAnchorable(element) {
		return element.isConnected
			&& element.style.display !== 'none'
			&& !element.classList.contains(OVERLAY_CLASS)
			&& !element.classList.contains(CLOSING_CLASS);
	}

	function getOffsetOrigin(element) {
		const parent = element.offsetParent;

		if (!(parent instanceof Element)) {
			return { left: 0, top: 0 };
		}

		const rect = parent.getBoundingClientRect();

		return { left: rect.left, top: rect.top };
	}

	function anchorWidget() {
		if (!widget || !isAnchorable(widget)) {
			return;
		}

		const pill = getCommandCenterRect();

		if (!pill) {
			return;
		}

		const viewportWidth = document.documentElement.clientWidth;
		const origin = getOffsetOrigin(widget);
		const width = Math.round(Math.min(Math.max(pill.width, MIN_WIDTH), viewportWidth - VIEWPORT_MARGIN * 2));
		const centeredLeft = pill.left + pill.width / 2 - width / 2;
		const maxLeft = viewportWidth - VIEWPORT_MARGIN - width;
		const left = Math.round(Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft) - origin.left);
		const top = Math.round(pill.bottom + TITLE_BAR_GAP - origin.top);

		widget.style.width = `${width}px`;
		widget.style.left = `${left}px`;
		widget.style.top = `${top}px`;
	}

	// VS Code lays the widget out synchronously while showing it, and again once its list has
	// rendered. Re-applying across two frames and one short timeout keeps the anchored position
	// without polling.
	function scheduleAnchor() {
		if (scheduled) {
			return;
		}

		scheduled = true;
		window.requestAnimationFrame(() => {
			scheduled = false;
			anchorWidget();
			window.requestAnimationFrame(anchorWidget);
			window.setTimeout(anchorWidget, SETTLE_DELAY);
		});
	}

	// Only the hidden-to-visible transition re-anchors, so a picker dragged elsewhere stays where
	// it was put until it is closed and opened again.
	function handleWidgetMutation() {
		if (!widget) {
			return;
		}

		const visible = isAnchorable(widget);

		if (visible && !wasVisible) {
			scheduleAnchor();
		}

		wasVisible = visible;
	}

	function observeWidget(element) {
		widget = element;
		wasVisible = false;

		new MutationObserver(handleWidgetMutation).observe(element, {
			attributes: true,
			attributeFilter: ['style', 'class'],
		});

		handleWidgetMutation();
	}

	function findWidget() {
		const element = document.querySelector(WIDGET_SELECTOR);

		if (element && element !== widget) {
			observeWidget(element);
		}

		return Boolean(widget);
	}

	function watchForWidget() {
		const workbench = document.querySelector(WORKBENCH_SELECTOR);

		if (!workbench) {
			window.setTimeout(watchForWidget, 500);
			return;
		}

		if (findWidget()) {
			return;
		}

		// The widget is created lazily as a direct child of the workbench container.
		new MutationObserver(() => findWidget()).observe(workbench, { childList: true });
	}

	window.addEventListener('resize', () => {
		if (widget && isAnchorable(widget)) {
			scheduleAnchor();
		}
	});

	window.__anchorQuickInputToCommandCenter = {
		version: 1,
		anchor: () => scheduleAnchor(),
	};

	watchForWidget();
})();
