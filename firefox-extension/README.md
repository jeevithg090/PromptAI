# PromptForge Firefox Extension (Phase 8.5)

Firefox Manifest V3 port of the Chrome extension.

## Build

```bash
cd firefox-extension
npm install
npm run build
```

Output goes to `dist/`.

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `firefox-extension/dist/manifest.json`.

The extension uses the `browser.*` namespace (Firefox MV3 native) instead of
`chrome.*`. The overlay is triggered via <kbd>Alt+/</kbd>.

## Differences from Chrome extension

| Area | Chrome | Firefox |
|------|--------|---------|
| API namespace | `chrome.runtime.*` | `browser.runtime.*` |
| Background | `service_worker` + `type: module` | `scripts` + `type: module` |
| Permissions | `scripting` permission | Omitted (not needed in Firefox MV3) |
| Add-on ID | Not needed | `browser_specific_settings.gecko.id` |

Both extensions share the same React components (Shadow DOM overlay,
`insertText` helper) from the `extension/` directory.
