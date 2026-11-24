(function () {
  'use strict';
  const origins = ['https://pokecatch-online.app', 'https://pokecatch-online.netlify.app', 'https://pokecatch-online.pages.dev'];
  if (!origins.includes(location.origin)) return;
  const attribute = 'data-pc-helper-background-at';
  const nativeVisibility = 'data-pc-helper-native-visibility';
  let enabled = false, suspended = false, revision = 0;
  function heartbeat() {
    const root = document.documentElement;
    if (!root) return;
    const previous = root.getAttribute(attribute);
    if (enabled && !suspended) {
      // This isolated world retains the browser's visibility getter.
      root.setAttribute(nativeVisibility, document.hidden ? 'hidden' : 'visible');
      root.setAttribute(attribute, String(Date.now()));
    } else {
      root.removeAttribute(attribute);
      root.removeAttribute(nativeVisibility);
    }
    if ((enabled && !suspended) || previous) document.dispatchEvent(new Event('pokecatch-support-change'));
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
  document.addEventListener('visibilitychange', heartbeat);
  window.addEventListener('pageshow', () => { suspended = false; heartbeat(); });
  window.addEventListener('pagehide', () => { suspended = true; heartbeat(); });
  setInterval(heartbeat, 20000);
})();
