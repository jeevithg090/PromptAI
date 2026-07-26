/**
 * Pure geometry helpers for the floating widget (F1.5) — no Electron imports, so
 * they're unit-testable. Handle edge-snapping, clamping to a visible display,
 * and the click-vs-drag threshold.
 */
export interface Rect { x: number; y: number; width: number; height: number; }

export const SNAP_MARGIN = 12;
export const DRAG_THRESHOLD = 6;
export const WIDGET_SIZE: Record<'S' | 'M' | 'L', number> = { S: 60, M: 76, L: 96 };

/** Snap a widget position to the nearest LEFT or RIGHT screen edge (with margin). */
export function snapToEdge(x: number, y: number, size: number, work: Rect): { x: number; y: number } {
  const leftDist = x - work.x;
  const rightDist = work.x + work.width - (x + size);
  const snappedX = leftDist <= rightDist
    ? work.x + SNAP_MARGIN
    : work.x + work.width - size - SNAP_MARGIN;
  const clampedY = Math.max(work.y + SNAP_MARGIN, Math.min(y, work.y + work.height - size - SNAP_MARGIN));
  return { x: Math.round(snappedX), y: Math.round(clampedY) };
}

/** Clamp a saved position back into a visible display's work area (e.g. after unplug). */
export function clampToWork(x: number | null, y: number | null, size: number, work: Rect): { x: number; y: number } {
  const safeX = x ?? work.x + work.width - size - SNAP_MARGIN; // default: right edge
  const safeY = y ?? work.y + Math.round(work.height / 3);
  return {
    x: Math.max(work.x, Math.min(safeX, work.x + work.width - size)),
    y: Math.max(work.y, Math.min(safeY, work.y + work.height - size)),
  };
}

/** A pointer movement under the threshold counts as a click, not a drag. */
export function isClick(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= DRAG_THRESHOLD;
}

/** Where to place the quick panel so it stays on-screen (flips to the left if needed). */
export function panelPosition(widget: Rect, panelW: number, panelH: number, work: Rect): { x: number; y: number } {
  // Prefer to the left of a right-docked widget; flip if there isn't room.
  let px = widget.x - panelW - 8;
  if (px < work.x) px = widget.x + widget.width + 8;
  if (px + panelW > work.x + work.width) px = work.x + work.width - panelW - SNAP_MARGIN;
  let py = widget.y;
  if (py + panelH > work.y + work.height) py = work.y + work.height - panelH - SNAP_MARGIN;
  py = Math.max(work.y + SNAP_MARGIN, py);
  return { x: Math.round(px), y: Math.round(py) };
}
