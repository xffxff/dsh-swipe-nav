window.__ModuleLoader__.load({
	id: "dsh-plugin-swipe-nav",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		/**
		 * Swipe navigation for the Web GUI on narrow screens.
		 *
		 * Swipe right on a page: open the navigation drawer (or expand the
		 * collapsed sidebar between 768px and 1024px).
		 * Swipe left: close it again.
		 *
		 * The gesture is deliberately conservative: it only reacts to a mostly
		 * horizontal, short, one-finger swipe that does not start in a text field
		 * or a horizontally scrolling block, and it never calls preventDefault, so
		 * vertical scrolling and native browser gestures keep working.
		 */

		/** Below this viewport width the sidebar is a drawer or a collapsed rail. */
		const NARROW_MAX_WIDTH = 1024;
		/** Horizontal travel (px) required to count as a swipe. */
		const MIN_HORIZONTAL = 60;
		/** Vertical drift (px) above which the gesture is treated as a scroll. */
		const MAX_VERTICAL = 50;
		/** Longer touches are treated as presses, not swipes. */
		const MAX_DURATION_MS = 700;

		/** Required browser services. */
		const inject = ["layout"];

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
		 * carousel). Swiping there should scroll that block, not open navigation.
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
		 * Read the live sidebar state from the frame the layout plugin renders.
		 *
		 * The layout service does not publish the sidebar's open state, but its
		 * frame element marks itself: `data-sidebar-drawer` in drawer mode,
		 * `data-sidebar-collapsed` while closed, and a `data-sidebar-mask` child
		 * in drawer mode.
		 * @returns true while the navigation is visible.
		 */
		function sidebarOpen() {
			const mask = document.querySelector("[data-sidebar-mask]");
			if (mask) {
				const frame = mask.parentElement;
				return !(frame && frame.hasAttribute("data-sidebar-collapsed"));
			}
			return document.querySelector("[data-sidebar-collapsed]") === null;
		}

		/**
		 * Install the touch listeners for the page lifetime.
		 * @param ctx - client Cordis context with the layout service.
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
				if (event.target && typeof event.target.closest === "function" && event.target.closest("[data-sidebar-mask]")) return;
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
				const open = sidebarOpen();
				if (dx > 0 && !open) ctx.layout.toggleSidebar();
				else if (dx < 0 && open) ctx.layout.toggleSidebar();
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
