/* PromptForge options page. Stores the backend URL (chrome.storage.sync) and
   the session token (chrome.storage.local — device-local, not synced). */
const originInput = document.getElementById('apiOrigin');
const webOriginInput = document.getElementById('webOrigin');
const tokenInput = document.getElementById('authToken');
const statusEl = document.getElementById('status');

function flash(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ''; }, 2500);
}

async function load() {
  const sync = await chrome.storage.sync.get(['apiOrigin', 'webOrigin']);
  const local = await chrome.storage.local.get('authToken');
  originInput.value = sync.apiOrigin || '';
  webOriginInput.value = sync.webOrigin || '';
  tokenInput.value = local.authToken || '';
}

document.getElementById('save').addEventListener('click', async () => {
  const apiOrigin = originInput.value.trim();
  const webOrigin = webOriginInput.value.trim();
  const authToken = tokenInput.value.trim();
  await chrome.storage.sync.set({ apiOrigin, webOrigin });
  await chrome.storage.local.set({ authToken });
  flash('Saved.');
});

document.getElementById('clear').addEventListener('click', async () => {
  tokenInput.value = '';
  await chrome.storage.local.remove('authToken');
  flash('Token cleared.');
});

load();
