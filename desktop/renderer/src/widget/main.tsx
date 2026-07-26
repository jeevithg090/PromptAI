import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SKINS, type SkinId } from './skins';
import './widget.css';

const DRAG_THRESHOLD = 6;

function Widget() {
  const [state, setState] = useState<WidgetState>({ skin: 'pill', size: 'M', opacity: 0.85, hotkey: 'CommandOrControl+Shift+P' });
  const [expanded, setExpanded] = useState(false);
  const [idle, setIdle] = useState(false);
  const [idea, setIdea] = useState('');
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.pfWidget?.getState().then(setState).catch(() => {});
    window.pfWidget?.onExpand(() => setExpanded(true));
    window.pfWidget?.onCollapse(() => { setExpanded(false); setIdea(''); });
  }, []);

  // Idle-fade to 40% after 6s without hover/expand (reduced-motion → instant, still fades).
  const resetIdle = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 6000);
  }, []);
  useEffect(() => { resetIdle(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; }, [resetIdle]);

  // Pointer drag with click-vs-drag threshold. Drag moves the OS window via IPC.
  const dragging = useRef(false);
  const moved = useRef(0);
  const last = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    if (expanded) return;
    dragging.current = true;
    moved.current = 0;
    last.current = { x: e.screenX, y: e.screenY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.screenX - last.current.x;
    const dy = e.screenY - last.current.y;
    moved.current += Math.hypot(dx, dy);
    last.current = { x: e.screenX, y: e.screenY };
    window.pfWidget?.dragMove(dx, dy);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (moved.current <= DRAG_THRESHOLD) {
      // A click, not a drag → expand the quick panel.
      window.pfWidget?.expand();
    } else {
      window.pfWidget?.dragEnd();
    }
  };

  const Skin = SKINS[state.skin as SkinId];

  if (expanded) {
    return (
      <div className="panel" onMouseEnter={resetIdle} onKeyDown={(e) => { if (e.key === 'Escape') window.pfWidget?.collapse(); }}>
        <div className="panel-head">
          <strong>⚡ PromptForge</strong>
          <button className="x" onClick={() => window.pfWidget?.collapse()} aria-label="Close">×</button>
        </div>
        <textarea
          autoFocus
          rows={3}
          value={idea}
          placeholder="Describe an idea…"
          onChange={(e) => setIdea(e.target.value)}
        />
        <div className="panel-actions">
          <button className="primary" disabled={!idea.trim()} onClick={() => window.pfWidget?.action({ kind: 'draft', idea })}>Draft</button>
          <button onClick={() => window.pfWidget?.action({ kind: 'dictate' })}>🎤 Dictate</button>
          <button onClick={() => window.pfWidget?.action({ kind: 'enhance-clipboard' })}>Enhance clipboard</button>
          <button onClick={() => window.pfWidget?.action({ kind: 'open-app' })}>Open app</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`widget-wrap${idle ? ' idle' : ''}`}
      style={{ opacity: idle ? 0.4 : state.opacity }}
      onMouseEnter={resetIdle}
      onMouseMove={resetIdle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="button"
      tabIndex={0}
      aria-label="Open PromptForge"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.pfWidget?.expand(); }}
    >
      <Skin active={false} />
    </div>
  );
}

createRoot(document.getElementById('widget-root')!).render(
  <StrictMode>
    <Widget />
  </StrictMode>
);
