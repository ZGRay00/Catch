(function () {
  'use strict';
  const origins = ['https://pokecatch-online.netlify.app', 'https://pokecatch-online.pages.dev'];
  if (!origins.includes(location.origin)) return;
  const attribute = 'data-pc-helper-background-at', ttl = 90000;
  function active() {
    const raw = document.documentElement?.getAttribute(attribute);
    if (!raw) return false;
    const at = Number(raw), age = Date.now() - at;
    return Number.isFinite(at) && age >= 0 && age < ttl;
  }
  // Preserve the browser getter and use it whenever the isolated heartbeat is absent/expired.
  for (const [name, value] of [['hidden', false], ['visibilityState', 'visible']]) {
    let owner = Document.prototype, descriptor;
    while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, name))) owner = Object.getPrototypeOf(owner);
    if (!owner || !descriptor?.get || !descriptor.configurable) continue;
    const original = descriptor.get;
    Object.defineProperty(owner, name, {
      ...descriptor,
      get: function () { return this === document && active() ? value : Reflect.apply(original, this, []); }
    });
  }
})();
