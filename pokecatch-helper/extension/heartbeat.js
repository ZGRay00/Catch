(function () {
  'use strict';
  const origins = ['https://pokecatch-online.netlify.app', 'https://pokecatch-online.pages.dev'];
  if (!origins.includes(location.origin)) return;
  const attribute = 'data-pc-helper-background-at';
  let enabled = false, suspended = false, revision = 0;
  function heartbeat() {
    const root = document.documentElement;
    if (!root) return;
    if (enabled && !suspended) root.setAttribute(attribute, String(Date.now()));
    else root.removeAttribute(attribute);
  }
  function apply(value) {
    const changed = enabled !== (value === true);
    enabled = value === true; heartbeat();
    if (changed) document.dispatchEvent(new Event('visibilitychange'));
  }
  const initialRevision = revision;
  chrome.storage.local.get({ enabled: false }).then(state => {
    if (revision === initialRevision) apply(state.enabled);
  }).catch(() => { if (revision === initialRevision) apply(false); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) { revision++; apply(changes.enabled.newValue); }
  });
  document.addEventListener('DOMContentLoaded', heartbeat, { once: true });
  window.addEventListener('pageshow', () => { suspended = false; heartbeat(); });
  window.addEventListener('pagehide', () => { suspended = true; document.documentElement?.removeAttribute(attribute); });
  setInterval(heartbeat, 20000);
})();
