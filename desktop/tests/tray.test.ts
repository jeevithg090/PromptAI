import { buildTrayMenu } from '../src/main/tray';
import { writeSettings } from '../src/main/settings';

/** F1.4 — tray menu template reflects settings (checked states). */
type Item = { label?: string; type?: string; checked?: boolean; accelerator?: string };

describe('tray menu (F1.4)', () => {
  it('lists the expected actions with the New Draft accelerator', () => {
    const menu = buildTrayMenu({ isQuitting: false }) as unknown as Item[];
    const labels = menu.map((i) => i.label).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining([
      'Open PromptForge', 'New Draft', 'Enhance Clipboard', 'Toggle Widget', 'Start at Login', 'Quit PromptForge',
    ]));
    const newDraft = menu.find((i) => i.label === 'New Draft');
    expect(newDraft?.accelerator).toBe('CmdOrCtrl+Shift+P');
  });

  it('reflects widgetEnabled / openAtLogin as checkbox states', () => {
    writeSettings({ widgetEnabled: true, openAtLogin: false });
    const menu = buildTrayMenu({ isQuitting: false }) as unknown as Item[];
    expect(menu.find((i) => i.label === 'Toggle Widget')?.checked).toBe(true);
    expect(menu.find((i) => i.label === 'Start at Login')?.checked).toBe(false);
  });
});
