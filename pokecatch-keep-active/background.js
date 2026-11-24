'use strict';

// Share the manifest's exact allowlist with the popup; no wildcard subdomains.
const GAME_ORIGINS = chrome.runtime.getManifest().host_permissions.map(pattern => new URL(pattern).origin);
const GAME_PATTERNS = GAME_ORIGINS.map(origin => `${origin}/*`);
const FOCUS_COMMAND = 'Emulation.setFocusEmulationEnabled';
let state = { enabled: false, tabId: null, attached: false, error: '' };
let queue = Promise.resolve();

let initialized = false;
let canceled = false;
let cancelVersion = 0;
async function initialize() {
  if (initialized) return;
  // Retry on the next request/event if storage was temporarily unavailable.
  const [preferences, session] = await Promise.all([
    chrome.storage.local.get('enabled'), chrome.storage.session.get('keeperState'),
  ]);
  state = { ...state, error: '', ...session.keeperState, enabled: !canceled && preferences.enabled === true };
  initialized = true;
}

function isGame(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && GAME_ORIGINS.includes(parsed.origin);
  } catch { return false; }
}

function enqueue(work) {
  const result = queue.then(initialize).then(work);
  // Observe failures from fire-and-forget Chrome events, and keep the queue usable.
  queue = result.catch(async error => {
    state.error = error?.message || String(error);
    console.warn('PokéCatch 保持激活:', error);
    // Do not overwrite an unread session with defaults after initialization fails.
    if (initialized) {
      try { await saveState(); } catch (saveError) { console.warn('状态保存失败:', saveError); }
    }
  });
  return result;
}

async function saveState() {
  await chrome.storage.session.set({ keeperState: state });
  await chrome.action.setBadgeText({ text: state.attached ? 'ON' : state.error ? '!' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: state.attached ? '#147d56' : '#a24625' });
  await chrome.action.setTitle({ title: state.attached
    ? 'PokéCatch 保持激活：已开启'
    : state.error ? 'PokéCatch 保持激活：连接已中断，点击查看'
      : state.enabled ? 'PokéCatch 保持激活：等待游戏标签页'
        : 'PokéCatch 保持激活：已关闭' });
}

async function setPreference(enabled) {
  if (!enabled) state.enabled = false; // Stop immediately even if persistence fails.
  await chrome.storage.local.set({ enabled });
  state.enabled = enabled && !canceled;
}

async function detachCurrent() {
  const tabId = state.tabId;
  state.tabId = null;
  state.attached = false;
  if (tabId == null) return;
  try {
    await chrome.debugger.sendCommand({ tabId }, FOCUS_COMMAND, { enabled: false });
  } catch { /* The tab or debugging session may already be closed. */ }
  try { await chrome.debugger.detach({ tabId }); } catch { /* Already detached. */ }
}

async function attachTo(tabId) {
  const checkCanceled = () => { if (canceled) throw new Error('连接已取消，请手动重新开启。'); };
  try {
    checkCanceled();
    const tab = await chrome.tabs.get(tabId);
    checkCanceled();
    if (!isGame(tab.url)) throw new Error('请先切换到受支持的 PokéCatch 游戏标签页。');
    if (state.tabId !== tabId) await detachCurrent();
    checkCanceled();
    state.tabId = tabId;
    state.attached = false;
    // First reuse a session that survived a service worker restart.
    try {
      await chrome.debugger.sendCommand({ tabId }, FOCUS_COMMAND, { enabled: true });
    } catch {
      checkCanceled();
      await chrome.debugger.attach({ tabId }, '1.3');
      checkCanceled();
      await chrome.debugger.sendCommand({ tabId }, FOCUS_COMMAND, { enabled: true });
    }
    checkCanceled();
    state.attached = true;
    state.error = '';
    await saveState();
  } catch (error) {
    await detachCurrent();
    await setPreference(false);
    state.error = `无法保持连接。请关闭该游戏页的 F12，然后重新开启。${error.message ? `（${error.message}）` : ''}`;
    await saveState();
    throw new Error(state.error);
  }
}

async function restore() {
  if (!state.enabled) {
    await detachCurrent();
    await saveState();
    return;
  }
  if (state.tabId != null) {
    const tab = await chrome.tabs.get(state.tabId).catch(() => null);
    if (tab && isGame(tab.url)) return attachTo(tab.id);
    await detachCurrent();
  }
  const tabs = await chrome.tabs.query({ url: GAME_PATTERNS });
  tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (tabs[0]) return attachTo(tabs[0].id);
  await saveState();
}

async function enableForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isGame(tab.url)) throw new Error('请先切换到 PokéCatch 游戏标签页。');
  await setPreference(true);
  await attachTo(tabId);
  return { ...state };
}

async function disable() {
  try { await setPreference(false); }
  finally { await detachCurrent(); }
  state.error = '';
  await saveState();
  return { ...state };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only the extension's own popup may control the session.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  if (!['status', 'enable', 'disable'].includes(message?.type)) return false;
  const version = cancelVersion;
  enqueue(async () => {
    if (message.type === 'enable') {
      if (version !== cancelVersion) throw new Error('连接已取消，请手动重新开启。');
      canceled = false;
      return enableForTab(message.tabId);
    }
    if (message.type === 'disable') return disable();
    return { ...state };
  }).then(value => respond({ ok: true, state: value }), error => respond({ ok: false, error: error?.message || String(error) }))
    .catch(error => console.warn('弹窗响应通道已关闭:', error));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url && change.status !== 'complete') return;
  enqueue(async () => {
    if (tabId === state.tabId && !isGame(tab.url)) {
      await detachCurrent();
      await saveState();
      return;
    }
    if (state.enabled && isGame(tab.url) && (state.tabId == null || state.tabId === tabId)) {
      await attachTo(tabId);
    }
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  enqueue(async () => {
    if (state.tabId !== tabId) return;
    state.tabId = null;
    state.attached = false;
    state.error = '';
    await saveState();
  });
});

chrome.debugger.onDetach.addListener((source, reason) => {
  // Latch cancellation immediately, before already-queued navigation work can reconnect.
  const userCanceled = reason === 'canceled_by_user' && source.tabId === state.tabId;
  if (userCanceled) { canceled = true; cancelVersion++; state.enabled = false; }
  enqueue(async () => {
    if (!userCanceled && source.tabId !== state.tabId) return;
    state.tabId = null;
    state.attached = false;
    if (reason === 'canceled_by_user') {
      await setPreference(false);
      state.error = '调试连接已中断。可能打开了 F12 或点击了浏览器的“取消”。关闭 F12 后，可手动重新开启。';
    }
    await saveState();
  });
});

chrome.runtime.onStartup.addListener(() => enqueue(restore));
chrome.runtime.onInstalled.addListener(() => enqueue(restore));
enqueue(restore);
