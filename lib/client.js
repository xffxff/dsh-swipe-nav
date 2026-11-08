window.__ModuleLoader__.load({
	id: "dsh-plugin-swipe-nav",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		/**
		 * Swipe navigation for the Web GUI on narrow screens.
		 *
		 * Swipe right from the left edge: open the left navigation drawer.
		 * Swipe right elsewhere: open the right sidebar (the tools column, which
		 * shows its "开始" guide when no tab is open). Below 768px it covers the
		 * viewport, so it reads as a page.
		 * Swipe left: close the right sidebar, falling back to closing the left
		 * navigation drawer when that is what is open.
		 *
		 * The gesture is deliberately conservative: it only reacts to a mostly
		 * horizontal, short, one-finger swipe that does not start in a text field
		 * or a horizontally scrolling block, and it never calls preventDefault, so
		 * vertical scrolling and native browser gestures keep working.
		 */

		/** Below this viewport width the layout switches to drawer/fullscreen. */
		const NARROW_MAX_WIDTH = 1024;
		/** Horizontal travel (px) required to count as a swipe. */
		const MIN_HORIZONTAL = 60;
		/** Start within this many px of the left edge to target the navigation drawer. */
		const EDGE_START_MAX = 44;
		/** Vertical drift (px) above which the gesture is treated as a scroll. */
		const MAX_VERTICAL = 50;
		/** Longer touches are treated as presses, not swipes. */
		const MAX_DURATION_MS = 700;

		/** Required browser services. */
		const inject = ["layout", "sidebarRight"];

		/**
		 * Whether a node sits inside a control that owns touch input.
		 * @param el - the event target.
		 * @returns true for text fields and editable content.
		 */
		function insideEditable(el) {
			if (!el || typeof el.closest !== "function") return false;
			return (
				el.closest(
					"input, textarea, select, [contenteditable=''], [contenteditable='true']",
				) !== null
			);
		}

		/**
		 * Whether a node sits inside a horizontally scrollable block (code, table,
		 * carousel). Swiping there should scroll that block, not change the page.
		 * @param el - the event target.
		 * @returns true when an ancestor scrolls horizontally.
		 */
		function insideHorizontalScroller(el) {
			if (typeof window.getComputedStyle !== "function") return false;
			let node = el;
			for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
				if (node.nodeType !== 1) continue;
				if (node.scrollWidth <= node.clientWidth) continue;
				const style = window.getComputedStyle(node);
				if (style && (style.overflowX === "auto" || style.overflowX === "scroll")) return true;
			}
			return false;
		}

		/**
		 * Whether the right sidebar column is expanded.
		 * @param ctx - client Cordis context.
		 * @returns true while the tools column is showing.
		 */
		function rightSidebarExpanded(ctx) {
			try {
				return ctx.sidebarRight.isExpanded();
			} catch {
				return false;
			}
		}

		/**
		 * Toggle the right sidebar, ignoring the case with no Session on screen.
		 * @param ctx - client Cordis context.
		 */
		function toggleRightSidebar(ctx) {
			try {
				ctx.sidebarRight.toggleExpanded();
			} catch {
				// No on-screen Session: the column has nothing to open.
			}
		}

		/**
		 * Whether the left navigation drawer is showing.
		 *
		 * The layout service does not publish sidebar state, but its frame element
		 * marks itself: `data-sidebar-drawer` in drawer mode, `data-sidebar-collapsed`
		 * while closed, and a `data-sidebar-mask` child in drawer mode.
		 * @returns true while the navigation drawer is open.
		 */
		function navDrawerOpen() {
			const mask = document.querySelector("[data-sidebar-mask]");
			if (mask) {
				const frame = mask.parentElement;
				return !(frame && frame.hasAttribute("data-sidebar-collapsed"));
			}
			return document.querySelector("[data-sidebar-collapsed]") === null;
		}

		/**
		 * Install the touch listeners for the page lifetime.
		 * @param ctx - client Cordis context with the layout and sidebarRight services.
		 */
		function apply(ctx) {
			if (typeof window === "undefined" || typeof document === "undefined") return;
			let startX = 0;
			let startY = 0;
			let startedAt = 0;
			let tracking = false;

			/** @param event - touchstart */
			function onTouchStart(event) {
				tracking = false;
				if (window.innerWidth >= NARROW_MAX_WIDTH) return;
				if (!event.touches || event.touches.length !== 1) return;
				if (insideEditable(event.target)) return;
				if (
					event.target &&
					typeof event.target.closest === "function" &&
					event.target.closest("[data-sidebar-mask]")
				) {
					return;
				}
				if (insideHorizontalScroller(event.target)) return;
				const touch = event.touches[0];
				startX = touch.clientX;
				startY = touch.clientY;
				startedAt = Date.now();
				tracking = true;
			}

			/** @param event - touchend */
			function onTouchEnd(event) {
				if (!tracking) return;
				tracking = false;
				const touch = event.changedTouches && event.changedTouches[0];
				if (!touch) return;
				if (Date.now() - startedAt > MAX_DURATION_MS) return;
				const dx = touch.clientX - startX;
				const dy = touch.clientY - startY;
				if (Math.abs(dy) > MAX_VERTICAL) return;
				if (Math.abs(dx) < MIN_HORIZONTAL) return;
				if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
				const toolsOpen = rightSidebarExpanded(ctx);
				const navOpen = navDrawerOpen();
				if (dx > 0) {
					if (startX <= EDGE_START_MAX) {
						if (!navOpen && !toolsOpen) ctx.layout.toggleSidebar();
					} else if (!toolsOpen) {
						toggleRightSidebar(ctx);
					}
				} else if (toolsOpen) {
					toggleRightSidebar(ctx);
				} else if (navOpen) {
					ctx.layout.toggleSidebar();
				}
			}

			function onTouchCancel() {
				tracking = false;
			}

			const options = { passive: true };
			document.addEventListener("touchstart", onTouchStart, options);
			document.addEventListener("touchend", onTouchEnd, options);
			document.addEventListener("touchcancel", onTouchCancel, options);
			ctx.on("dispose", () => {
				document.removeEventListener("touchstart", onTouchStart, options);
				document.removeEventListener("touchend", onTouchEnd, options);
				document.removeEventListener("touchcancel", onTouchCancel, options);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
