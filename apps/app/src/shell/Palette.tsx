import { useMemo } from 'react';
import { t } from '@lingui/core/macro';
import { CommandPalette } from '@astryxdesign/core/CommandPalette';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import type { PanelState, PromptAIBridge } from '../bridge.ts';
import { blockingIssues, unresolvedPicks } from '../chips.ts';
import { PLACES, placeLabels, type Place } from './places.ts';

interface PaletteProps {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  place: Place;
  go(p: Place): void;
  bridge: PromptAIBridge;
  panel: PanelState;
  incognito: boolean;
  setIncognito(on: boolean): void;
  signIn: (() => void) | null;
}

/** The ⌘K palette: each action's one name, shared with its button label (blueprint §15 Command Registry). */
export function Palette({ isOpen, onOpenChange, place, go, bridge, panel, incognito, setIncognito, signIn }: PaletteProps) {
  const commands = useMemo(() => {
    const labels = placeLabels();
    const nav = t`Go to`;
    const drafted = panel.phase === 'ready' || panel.phase === 'done' ? panel : null;
    const canInsert = bridge.caps.insertAtCursor && panel.phase === 'ready' && unresolvedPicks(panel.draft, panel.answers).length === 0 && blockingIssues(panel.draft).length === 0;
    const list: { id: string; label: string; run(): void; auxiliaryData: { group: string } }[] = PLACES.filter((p) => p !== place).map((p) => ({
      id: `go.${p}`,
      label: labels[p],
      run: () => go(p),
      auxiliaryData: { group: nav },
    }));
    const draftGroup = t`Draft`;
    if (canInsert) list.push({ id: 'draft.insert', label: t`Insert`, run: () => void bridge.insert(), auxiliaryData: { group: draftGroup } });
    if (drafted) {
      list.push({ id: 'draft.copy', label: t`Copy`, run: () => void bridge.copy(), auxiliaryData: { group: draftGroup } });
      list.push({ id: 'draft.dismiss', label: t`Dismiss the draft`, run: () => void bridge.dismiss().then(() => go('capture')), auxiliaryData: { group: draftGroup } });
    }
    const privacy = t`Privacy`;
    list.push({ id: 'privacy.incognito', label: incognito ? t`Turn incognito off` : t`Turn incognito on`, run: () => setIncognito(!incognito), auxiliaryData: { group: privacy } });
    if (signIn) list.push({ id: 'account.signin', label: t`Sign in or sign up`, run: signIn, auxiliaryData: { group: t`Account` } });
    return list;
  }, [place, go, bridge, panel, incognito, setIncognito, signIn]);
  const source = useMemo(() => createStaticSource(commands), [commands]);

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      searchSource={source}
      label={t`Commands`}
      emptySearchText={t`No matching command`}
      onValueChange={(id) => commands.find((c) => c.id === id)?.run()}
    />
  );
}
