(function () {
  'use strict';
  const origins = ['https://pokecatch-online.app', 'https://pokecatch-online.netlify.app', 'https://pokecatch-online.pages.dev'];
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
  const socketSignal = 'data-pc-helper-realtime', tracked = new Map();
  let wrapped = null, original = null, failures = [], expires;
  function report(state) {
    const at = Date.now();
    failures = failures.filter(stamp => at - stamp <= 180000);
    if ([...tracked.keys()].some(socket => socket.readyState === 1)) state = 'open';
    else if (state === 'closed-abnormal') {failures.push(at);if(failures.length>32)failures.shift();}
    document.documentElement?.setAttribute(socketSignal, JSON.stringify({ state, at, failures: state === 'closed-abnormal' ? failures.length : 0 }));
  }
  function observe(socket) {
    if (tracked.has(socket) || !active() || !/^wss:\/\/[a-z0-9-]+\.supabase\.co\/realtime\/v1\/websocket(?:[?#]|$)/i.test(socket.url)) return;
    let clientClose = false;
    const nativeClose = socket.close, ownClose = Object.getOwnPropertyDescriptor(socket, 'close');
    function close(...args) {
      // Forward exactly the browser call. Only its successful closing transition is retained.
      const result = Reflect.apply(nativeClose, this, args);
      if (this === socket && this.readyState >= 2) clientClose = true;
      return result;
    }
    function onOpen() { if (active()) report('open'); }
    function onClose(event) {
      cleanup();
      if (active()) report(clientClose ? 'closed-client' : event.wasClean && [1000,1001,1005].includes(event.code) ? 'closed-clean' : 'closed-abnormal');
    }
    function cleanup() {
      tracked.delete(socket);
      socket.removeEventListener('open', onOpen);socket.removeEventListener('close', onClose);
      if (socket.close === close) {
        if (ownClose) Object.defineProperty(socket, 'close', ownClose);
        else delete socket.close;
      }
    }
    try { Object.defineProperty(socket, 'close', { configurable:true, writable:true, value:close }); } catch {}
    socket.addEventListener('open', onOpen);socket.addEventListener('close', onClose);
    tracked.set(socket, cleanup);report('connecting');
  }
  function disableObservation() {
    if (wrapped && window.WebSocket === wrapped) window.WebSocket = original;
    wrapped = original = null;
    for (const cleanup of tracked.values()) cleanup();
    failures = [];document.documentElement?.removeAttribute(socketSignal);
    if (expires !== undefined) {clearTimeout(expires);expires = undefined;}
  }
  function syncObservation() {
    if (!active()) {disableObservation();return;}
    if (!wrapped && typeof window.WebSocket === 'function') {
      original = window.WebSocket;
      wrapped = new Proxy(original, { construct(target,args,newTarget) {
        const socket = Reflect.construct(target,args,newTarget);
        try {observe(socket);} catch {}
        return socket;
      } });
      window.WebSocket = wrapped;
    }
    if (wrapped && typeof setTimeout === 'function') {
      clearTimeout(expires);
      const stamp = Number(document.documentElement.getAttribute(attribute));
      expires = setTimeout(syncObservation, Math.max(1, stamp + ttl - Date.now()));
    }
  }
  document.addEventListener('pokecatch-support-change',syncObservation);
  window.addEventListener('pagehide',disableObservation);
  syncObservation();
})();
