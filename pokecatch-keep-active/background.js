'use strict';

const GAME_ORIGINS = ['https://pokecatch-online.app', 'https://pokecatch-online.netlify.app'];
const GAME_PATTERNS = GAME_ORIGINS.map(origin => `${origin}/*`);
const FOCUS_COMMAND = 'Emulation.setFocusEmulationEnabled';
let state = { enabled: false, tabId: null, attached: false, error: '' };
let queue = Promise.resolve();

const ready = Promise.all([
  chrome.storage.local.get('enabled'),
  chrome.storage.session.get('keeperState'),
]).then(([preferences, session]) => {
  state = { ...state, ...session.keeperState, enabled: preferences.enabled === true };
});

function isGame(url) {
  try { return GAME_ORIGINS.includes(new URL(url).origin); } catch { return false; }
}

function enqueue(work) {
  const result = queue.then(() => ready).then(work);
  queue = result.catch(error => console.warn('PokéCatch 保持激活:', error));
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
  state.enabled = enabled;
  await chrome.storage.local.set({ enabled });
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
  const tab = await chrome.tabs.get(tabId);
  if (!isGame(tab.url)) throw new Error('请先切换到 PokéCatch 游戏标签页。');
  if (state.tabId !== tabId) await detachCurrent();
  state.tabId = tabId;
  state.attached = false;
  try {
    // First reuse a session that survived a service worker restart.
    try {
      await chrome.debugger.sendCommand({ tabId }, FOCUS_COMMAND, { enabled: true });
    } catch {
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, FOCUS_COMMAND, { enabled: true });
    }
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
  await setPreference(false);
  await detachCurrent();
  state.error = '';
  await saveState();
  return { ...state };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only the extension's own popup may control the session.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  if (!['status', 'enable', 'disable'].includes(message?.type)) return false;
  enqueue(async () => {
    if (message.type === 'enable') return enableForTab(message.tabId);
    if (message.type === 'disable') return disable();
    return { ...state };
  }).then(value => respond({ ok: true, state: value }), error => respond({ ok: false, error: error.message }));
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
  enqueue(async () => {
    if (source.tabId !== state.tabId) return;
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
