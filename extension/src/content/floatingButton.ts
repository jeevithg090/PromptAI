/**
 * Optional per-origin floating button (F1.5 extension parity). Default OFF.
 * When enabled for an origin (chrome.storage.local key `widget:<origin>`), a
 * small draggable button is injected; clicking it opens the existing overlay.
 * Position persists per-origin. Shares the pill/orb skins conceptually; kept
 * minimal (a pill) to avoid bloating the content bundle. Shadow-DOM isolated.
 */
const DRAG_THRESHOLD = 6;
const KEY = (origin: string) => `pfwidget:${origin}`;

interface WidgetPref { enabled: boolean; x: number; y: number; skin: 'pill' | 'orb'; }

let host: HTMLElement | null = null;

async function readPref(): Promise<WidgetPref> {
  const key = KEY(location.origin);
  const got = await chrome.storage.local.get(key);
  return (got[key] as WidgetPref) ?? { enabled: false, x: window.innerWidth - 72, y: Math.round(window.innerHeight / 3), skin: 'pill' };
}

async function writePref(p: Partial<WidgetPref>): Promise<void> {
  const cur = await readPref();
  await chrome.storage.local.set({ [KEY(location.origin)]: { ...cur, ...p } });
}

export async function initFloatingButton(onClick: () => void): Promise<void> {
  const pref = await readPref();
  if (!pref.enabled) return;
  render(pref, onClick);
}

/** Toggle the button on/off for this origin (called from overlay settings). */
export async function setFloatingButtonEnabled(enabled: boolean, onClick: () => void): Promise<void> {
  await writePref({ enabled });
  if (enabled) render(await readPref(), onClick);
  else if (host) { host.remove(); host = null; }
}

function render(pref: WidgetPref, onClick: () => void): void {
  if (host) return;
  host = document.createElement('div');
  host.id = 'promptforge-widget-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .btn { position: fixed; width: 48px; height: 48px; border-radius: 16px; z-index: 2147483646;
      background: #d9480f; color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: 22px; box-shadow: 0 6px 18px rgba(217,72,15,0.45); cursor: grab; user-select: none;
      transition: transform 120ms ease; }
    .btn:hover { transform: scale(1.06); }
    @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }`;
  shadow.appendChild(style);

  const btn = document.createElement('div');
  btn.className = 'btn';
  btn.textContent = '⚡';
  btn.style.left = `${pref.x}px`;
  btn.style.top = `${pref.y}px`;
  shadow.appendChild(btn);
  document.body.appendChild(host);

  let dragging = false, moved = 0, sx = 0, sy = 0, ox = pref.x, oy = pref.y;
  btn.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; sx = e.clientX; sy = e.clientY; ox = pref.x; oy = pref.y; btn.setPointerCapture(e.pointerId); });
  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    moved += Math.hypot(dx, dy);
    pref.x = Math.max(4, Math.min(ox + dx, window.innerWidth - 52));
    pref.y = Math.max(4, Math.min(oy + dy, window.innerHeight - 52));
    btn.style.left = `${pref.x}px`; btn.style.top = `${pref.y}px`;
  });
  btn.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (moved <= DRAG_THRESHOLD) onClick();
    else void writePref({ x: pref.x, y: pref.y });
  });
}
