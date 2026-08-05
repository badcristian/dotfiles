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
// permanently outrank its own layout writes.
//
// The correction is applied synchronously from a MutationObserver and a ResizeObserver, both of
// which run before the browser paints, and on every layout VS Code performs rather than only when
// the picker is shown. Anything deferred — a frame callback, a timeout — paints VS Code's position
// first and then jumps to this one, and correcting only on show leaves later layouts, such as the
// one after typing into Quick Search, sitting wherever VS Code moved them.
(() => {
	const WORKBENCH_SELECTOR = '.monaco-workbench';
	const WIDGET_SELECTOR = '.quick-input-widget';
	const COMMAND_CENTER_SELECTOR = '.part.titlebar .command-center .action-item.command-center-center';
	const OVERLAY_CLASS = 'quick-input-widget-overlay';
	const CLOSING_CLASS = 'quick-input-widget-closing';
	const MIN_WIDTH = 420;
	const VIEWPORT_MARGIN = 8;
	const TITLE_BAR_GAP = 4;

	let widget = null;

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

		const nextWidth = `${width}px`;
		const nextLeft = `${left}px`;
		const nextTop = `${top}px`;

		// Writing only on a real change is what stops the observer below from re-entering: our own
		// writes are mutations too, and the second pass computes the same three values and returns.
		if (widget.style.width === nextWidth && widget.style.left === nextLeft && widget.style.top === nextTop) {
			return;
		}

		widget.style.width = nextWidth;
		widget.style.left = nextLeft;
		widget.style.top = nextTop;
	}

	// Anchoring runs synchronously inside the observers, never from a frame callback or a timeout.
	// A MutationObserver callback is a microtask, so it runs after VS Code's layout writes but
	// before the browser paints, and the widget is never rendered at the position VS Code chose.
	// Deferring by even one frame is what made the picker appear off to one side and jump back.
	//
	// Every mutation re-anchors, not just the hidden-to-visible transition. VS Code lays the widget
	// out again whenever its content changes — typing into Quick Search is enough — and correcting
	// only on show left those later layouts in place, which is the same jump in reverse. The cost
	// is that the widget can no longer be dragged elsewhere: a drag is layout too, and it is undone
	// on the next microtask.
	function observeWidget(element) {
		widget = element;

		new MutationObserver(anchorWidget).observe(element, {
			attributes: true,
			attributeFilter: ['style', 'class'],
		});

		// A size change that VS Code makes without touching the inline style would move the pill
		// relationship without a mutation record. ResizeObserver delivers before paint as well.
		new ResizeObserver(anchorWidget).observe(element);

		anchorWidget();
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

	window.addEventListener('resize', anchorWidget);

	window.__anchorQuickInputToCommandCenter = {
		version: 2,
		anchor: () => anchorWidget(),
	};

	watchForWidget();
})();
