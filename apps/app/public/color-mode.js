// Runs before the app mounts so the panel never flashes the wrong colour mode.
// A file, not an inline script, so the CSP can stay script-src 'self'.
try {
  var m = localStorage.getItem('promptai.mode');
  if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
} catch (e) {}
