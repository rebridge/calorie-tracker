import { swipeStep } from "@calorie-tracker/shared";
import { useRef, type TouchEvent } from "react";

/** Touches that start on these are for typing, picking or scrolling inside them, never for paging. */
const IGNORE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [data-no-swipe]';

/**
 * Touch handlers that report a horizontal swipe as -1 (finger moved right: previous) or 1 (finger moved left: next).
 * Spread them on the element that should respond. Vertical scrolls, short drags, multi-touch, touches that start in
 * a form field and anything rendered through a portal (drawers, menus, popovers, their overlays) are ignored.
 */
export function useSwipe(onSwipe: (step: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(e: TouchEvent<HTMLElement>) {
      const touch = e.touches[0];
      const target = e.target as Element;
      // React bubbles events out of portals; a target outside this element's DOM subtree came from one.
      const ignored = !e.currentTarget.contains(target) || target.closest(IGNORE_SELECTOR) !== null;
      start.current = touch && e.touches.length === 1 && !ignored ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchMove(e: TouchEvent<HTMLElement>) {
      // A second finger (pinch) cancels the gesture.
      if (e.touches.length > 1) start.current = null;
    },
    onTouchEnd(e: TouchEvent<HTMLElement>) {
      const from = start.current;
      const touch = e.changedTouches[0];
      start.current = null;
      if (!from || !touch) return;
      const step = swipeStep(touch.clientX - from.x, touch.clientY - from.y);
      if (step !== 0) onSwipe(step);
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
