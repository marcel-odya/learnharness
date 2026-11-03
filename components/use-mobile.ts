"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The mobile shell's three seams — one small file, so the JS is only where
 * CSS genuinely cannot do the job.
 *
 *  - `useMediaQuery`: the sidebar drawer needs a STATE (open/closed), not a
 *    style, and the state means something different below md (overlay
 *    drawer) than above it (inline column). CSS still does every visual.
 *  - `useKeyboardInset`: the soft keyboard shrinks the VISUAL viewport
 *    without shrinking `100dvh`, so the dock would sit under it. The number
 *    is how far the visual viewport's bottom is above the layout viewport's
 *    bottom; 0 everywhere else (desktop, Android, no keyboard).
 *  - `usePinchZoom`: the plan/mermaid/diagram overlays set `touch-action:
 *    none` (they own pan), so the browser's own pinch is off and two-finger
 *    zoom must be wired here. One-finger pan stays with each overlay.
 */

export function useMediaQuery(query: string): boolean {
	const [match, setMatch] = useState(false);
	useEffect(() => {
		// Static-render tests (and any non-browser host) have no matchMedia:
		// the desktop layout is the honest default there.
		if (typeof window.matchMedia !== "function") return;
		const mq = window.matchMedia(query);
		setMatch(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setMatch(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [query]);
	return match;
}

export function useKeyboardInset(): number {
	const [inset, setInset] = useState(0);
	useEffect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () =>
			setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
		update();
		vv.addEventListener("resize", update);
		vv.addEventListener("scroll", update);
		return () => {
			vv.removeEventListener("resize", update);
			vv.removeEventListener("scroll", update);
		};
	}, []);
	return inset;
}

/** Two-finger zoom on an element that owns its own pointer gestures.
 *  `suppress` is flipped true while a pinch is live so the overlay's
 *  one-finger drag handler can stand down; `onStart` lets it drop its
 *  captured drag state. */
export function usePinchZoom(
	targetRef: RefObject<HTMLElement | null>,
	onPinch: (factor: number, focus: { x: number; y: number }) => void,
	suppress: RefObject<boolean>,
	onStart?: () => void,
) {
	const pinch = useRef(onPinch);
	pinch.current = onPinch;
	const start = useRef(onStart);
	start.current = onStart;

	useEffect(() => {
		const el = targetRef.current;
		if (!el) return;
		const pts = new Map<number, { x: number; y: number }>();
		let dist = 0;
		const metric = () => {
			const [a, b] = [...pts.values()];
			if (!a || !b) return { d: 0, x: 0, y: 0 };
			return {
				d: Math.hypot(a.x - b.x, a.y - b.y),
				x: (a.x + b.x) / 2,
				y: (a.y + b.y) / 2,
			};
		};
		const onDown = (e: PointerEvent) => {
			if (e.pointerType !== "touch") return;
			pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pts.size === 2) {
				suppress.current = true;
				start.current?.();
				dist = metric().d;
			}
		};
		const onMove = (e: PointerEvent) => {
			if (!pts.has(e.pointerId)) return;
			pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pts.size !== 2) return;
			const m = metric();
			if (dist > 0 && m.d > 0) {
				e.preventDefault();
				const r = el.getBoundingClientRect();
				pinch.current(m.d / dist, { x: m.x - r.left, y: m.y - r.top });
			}
			dist = m.d;
		};
		const onEnd = (e: PointerEvent) => {
			if (!pts.delete(e.pointerId)) return;
			if (pts.size < 2) {
				suppress.current = false;
				dist = 0;
			}
		};
		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointermove", onMove, { passive: false });
		el.addEventListener("pointerup", onEnd);
		el.addEventListener("pointercancel", onEnd);
		return () => {
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerup", onEnd);
			el.removeEventListener("pointercancel", onEnd);
		};
	}, [targetRef, suppress]);
}
