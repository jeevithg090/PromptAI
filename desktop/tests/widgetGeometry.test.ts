import { snapToEdge, clampToWork, isClick, panelPosition, DRAG_THRESHOLD } from '../src/main/widgetGeometry';

const work = { x: 0, y: 0, width: 1440, height: 900 };

describe('widget geometry (F1.5)', () => {
  it('snaps a left-ish widget to the left edge', () => {
    const { x } = snapToEdge(100, 300, 76, work);
    expect(x).toBe(12); // SNAP_MARGIN
  });

  it('snaps a right-ish widget to the right edge', () => {
    const { x } = snapToEdge(1300, 300, 76, work);
    expect(x).toBe(1440 - 76 - 12);
  });

  it('clamps y within the work area on snap', () => {
    const { y } = snapToEdge(100, 5000, 76, work);
    expect(y).toBeLessThanOrEqual(work.height - 76 - 12);
    expect(y).toBeGreaterThanOrEqual(12);
  });

  it('clamps a stale off-screen saved position back into the work area', () => {
    const { x, y } = clampToWork(9999, -500, 76, work);
    expect(x).toBeLessThanOrEqual(work.width - 76);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('defaults a null saved position to the right edge', () => {
    const { x } = clampToWork(null, null, 76, work);
    expect(x).toBe(work.width - 76 - 12);
  });

  it('treats sub-threshold movement as a click', () => {
    expect(isClick(3, 3)).toBe(true);
    expect(isClick(DRAG_THRESHOLD + 5, 0)).toBe(false);
  });

  it('flips the panel left of a right-docked widget and keeps it on-screen', () => {
    const widget = { x: 1440 - 76 - 12, y: 300, width: 76, height: 76 };
    const p = panelPosition(widget, 340, 440, work);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + 340).toBeLessThanOrEqual(work.width);
    expect(p.y + 440).toBeLessThanOrEqual(work.height);
  });
});
