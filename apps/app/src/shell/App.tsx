/**
 * The SPA (blueprint §15): first run, then the four places (Capture, Draft
 * sheet, Library, You) and the ⌘K palette. The same app runs in the PWA and
 * in the Electron panel; `bridge` is the only thing that differs.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import type { ForgeResponse, Profile } from '@promptai/contract';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import type { ApiClient } from '../api/client.ts';
import { clearGuest, loadGuest, startGuest, type GuestSession } from '../auth/guest.ts';
import type { AuthPort, AuthSession } from '../auth/port.ts';
import type { PanelState, PromptAIBridge } from '../bridge.ts';
import { DraftSheet } from '../DraftSheet.tsx';
import { ConsentStep, DobStep, PROVIDER_CONSENT_VERSION, RefusedStep } from '../firstrun/FirstRun.tsx';
import { Capture } from '../places/Capture.tsx';
import { latestConsent } from '../consent.ts';
import { PLACES, placeLabels, type Place } from './places.ts';
import { AppServicesContext, titleOf, type AppServices } from './services.ts';

// Library, You, sign-in and the palette load on first use; the offline shell precaches them all.
const Library = lazy(() => import('../places/Library.tsx').then((m) => ({ default: m.Library })));
const You = lazy(() => import('../places/You.tsx').then((m) => ({ default: m.You })));
const SignInDialog = lazy(() => import('./SignInDialog.tsx').then((m) => ({ default: m.SignInDialog })));
const Palette = lazy(() => import('./Palette.tsx').then((m) => ({ default: m.Palette })));


function placeFromHash(): Place {
  const p = location.hash.replace(/^#\/?/, '');
  return (PLACES as string[]).includes(p) ? (p as Place) : 'capture';
}

/** Hash routes, so the offline shell and Electron's file:// both resolve every place to index.html. */
function usePlace(): [Place, (p: Place) => void] {
  const [place, setPlace] = useState(placeFromHash);
  useEffect(() => {
    const on = () => setPlace(placeFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((p: Place) => {
    if (location.hash !== `#/${p}`) location.hash = `#/${p}`;
    setPlace(p);
  }, []);
  return [place, go];
}

type Gate = 'dob' | 'consent' | 'refused' | 'ready';
const GATE_KEY = 'promptai.firstRun';

function storedGate(): Gate {
  try {
    const v = localStorage.getItem(GATE_KEY);
    if (v === 'done') return 'ready';
    if (v === 'refused') return 'refused';
  } catch {}
  return 'dob';
}
function storeGate(v: 'done' | 'refused' | null) {
  try {
    if (v) localStorage.setItem(GATE_KEY, v);
    else localStorage.removeItem(GATE_KEY);
  } catch {}
}

export interface AppProps {
  bridge: PromptAIBridge;
  api: ApiClient;
  auth: AuthPort | null;
  /** The api's token getter reads this: the account session, else the guest token. */
  tokens: { current: string | null };
}

export function App({ bridge, api, auth, tokens }: AppProps) {
  const toast = useToast();
  const [place, go] = usePlace();
  const [gate, setGate] = useState<Gate>(storedGate);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => auth?.session() ?? null);
  const [guest, setGuest] = useState<GuestSession | null>(() => loadGuest());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [signIn, setSignIn] = useState<{ keep?: ForgeResponse } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const openPalette = useCallback(() => {
    setPaletteUsed(true);
    setPaletteOpen(true);
  }, []);
  const [panel, setPanel] = useState<PanelState>({ phase: 'idle' });
  const guestStart = useRef<Promise<GuestSession> | null>(null);

  const token = authSession?.accessToken ?? guest?.token ?? null;
  tokens.current = token;
  const kind: 'guest' | 'account' = authSession ? 'account' : 'guest';

  useEffect(() => auth?.onChange(setAuthSession), [auth]);

  /** A token for the next call: the session we have, else a new guest session (ALTCHA solved here). */
  const ensureToken = useCallback(async () => {
    if (tokens.current) return;
    guestStart.current ??= startGuest(api).finally(() => {
      guestStart.current = null;
    });
    const s = await guestStart.current;
    tokens.current = s.token;
    setGuest(s);
  }, [api, tokens]);

  const reloadProfile = useCallback(async () => {
    setProfile(await api.me());
  }, [api]);

  // First run starts the guest proof of work at once, so it is usually done before the date is.
  useEffect(() => {
    if (gate === 'dob' && !tokens.current) ensureToken().catch(() => {});
  }, [gate, ensureToken, tokens]);

  // Whenever the identity changes, the server's profile decides whether first run still applies.
  useEffect(() => {
    if (!token || gate === 'refused') return;
    let live = true;
    api.me().then(
      (p) => {
        if (!live) return;
        setProfile(p);
        if (gate !== 'ready') return;
        if (!p.ageConfirmed) setGate('dob');
        else if (latestConsent(p.consents, 'llm_processing') === null) setGate('consent');
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // `gate` is read, not watched: this runs per identity.
  }, [api, token]);

  // Main sends /v1/forge and /v1/events itself on desktop, and holds dictation until first run is done.
  useEffect(() => {
    void bridge.setSession?.({ token, ready: gate === 'ready' });
  }, [bridge, token, gate]);

  useEffect(
    () =>
      bridge.onState((s) => {
        setPanel(s);
        if (s.phase === 'listening' || s.phase === 'drafting') go('draft');
      }),
    [bridge, go],
  );

  const saveBrief = useCallback(
    async (draft: ForgeResponse) => {
      await api.saveBrief({ kind: 'brief', toolId: draft.toolId, title: titleOf(draft), body: draft.brief });
    },
    [api],
  );

  // A brief kept as a guest is saved once the account exists.
  useEffect(() => {
    if (!authSession || !signIn) return;
    const keep = signIn.keep;
    setSignIn(null);
    if (keep && !incognito) {
      saveBrief(keep).then(
        () => toast({ body: t`Saved to your Library.` }),
        () => toast({ type: 'error', body: t`Signed in, but the brief wasn’t saved. Save it from Library later.` }),
      );
    }
  }, [authSession]);

  const services: AppServices = useMemo(
    () => ({ api, kind, incognito, canSignIn: auth !== null, openSignIn: (keep) => setSignIn({ keep }), saveBrief }),
    [api, kind, incognito, auth, saveBrief],
  );

  const signOut = async () => {
    await auth?.signOut();
    setProfile(null);
  };

  const afterDelete = async () => {
    if (authSession) await auth?.signOut().catch(() => {});
    clearGuest();
    setGuest(null);
    tokens.current = null;
    setProfile(null);
    storeGate(null);
    setGate('dob');
    go('capture');
  };

  // ⌘K anywhere opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && gate === 'ready') {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gate, openPalette]);

  if (gate === 'refused') return <RefusedStep />;
  if (gate === 'dob') {
    return (
      <DobStep
        onSubmit={async (dob) => {
          await ensureToken();
          if (await api.confirmAge(dob)) setGate('consent');
          else {
            storeGate('refused');
            setGate('refused');
          }
        }}
      />
    );
  }
  if (gate === 'consent') {
    return (
      <ConsentStep
        onAnswer={async (granted) => {
          await ensureToken();
          await api.setConsent([{ purpose: 'llm_processing', granted, version: PROVIDER_CONSENT_VERSION }]);
          storeGate('done');
          setGate('ready');
          go('capture');
        }}
      />
    );
  }

  const labels = placeLabels();
  return (
    <AppServicesContext.Provider value={services}>
      <div className="pa-shell">
        <header className="pa-shell-head">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text weight="semibold">PromptAI</Text>
            {incognito && <Badge variant="neutral" label={t`Incognito`} />}
            <div className="pa-grow pa-shell-nav">
              <TabList value={place} onChange={(v) => go(v as Place)} size="sm" aria-label={t`Places`}>
                {PLACES.map((p) => (
                  <Tab key={p} value={p} label={labels[p]} href={`#/${p}`} />
                ))}
              </TabList>
            </div>
            <Button label={t`Commands`} variant="ghost" size="sm" icon={<Icon icon="search" />} tooltip={t`Commands (⌘K)`} isIconOnly onClick={openPalette} />
          </HStack>
        </header>
        <main className="pa-shell-main">
          <Suspense fallback={<Spinner size="md" aria-label={t`Loading`} />}>
            {place === 'capture' && <Capture bridge={bridge} />}
            {place === 'draft' &&
              (panel.phase === 'idle' ? (
                <div className="pa-place">
                  <EmptyState
                    title={t`Nothing drafted yet`}
                    description={t`Start in Capture.`}
                    headingLevel={1}
                    actions={<Button label={t`Go to Capture`} variant="primary" onClick={() => go('capture')} />}
                  />
                </div>
              ) : (
                <DraftSheet bridge={bridge} onClose={() => go('capture')} />
              ))}
            {place === 'library' && <Library />}
            {place === 'you' && (
              <You
                profile={profile}
                email={authSession?.email ?? null}
                reloadProfile={reloadProfile}
                incognito={incognito}
                setIncognito={setIncognito}
                onSignOut={signOut}
                onDeleted={afterDelete}
              />
            )}
          </Suspense>
        </main>
      </div>
      <Suspense>
        {paletteUsed && (
          <Palette
            isOpen={paletteOpen}
            onOpenChange={setPaletteOpen}
            place={place}
            go={go}
            bridge={bridge}
            panel={panel}
            incognito={incognito}
            setIncognito={setIncognito}
            signIn={auth && kind === 'guest' ? () => setSignIn({}) : null}
          />
        )}
        {signIn && auth && <SignInDialog auth={auth} onClose={() => setSignIn(null)} />}
      </Suspense>
    </AppServicesContext.Provider>
  );
}
