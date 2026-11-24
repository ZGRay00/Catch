'use strict';

const GAME_ORIGINS = chrome.runtime.getManifest().host_permissions.map(pattern => new URL(pattern).origin);
const status = document.getElementById('status');
const enable = document.getElementById('enable');
const disable = document.getElementById('disable');
const retry = document.getElementById('retry');
const support = document.getElementById('support');
let tabId;
let currentIsGame = false;
let busy = false;
let reason = '';

support.textContent = `支持域名（仅 HTTPS）：\n${GAME_ORIGINS.map(origin => new URL(origin).hostname).join('\n')}`;

async function request(type) {
  const result = await chrome.runtime.sendMessage({ type, tabId });
  if (!result?.ok || !result.state) throw new Error(result?.error || '扩展未响应，请重试。');
  return result.state;
}

async function readTab() {
  tabId = undefined;
  currentIsGame = false;
  reason = '尚未读到当前标签页。';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (!tab || !Number.isInteger(tabId)) reason = '未找到当前标签页，请切回游戏窗口后重新打开弹窗。';
  else if (!tab.url) reason = '无法读取当前页地址：可能未授予该站点访问权限，或当前不是支持页面。';
  else {
    try {
      const url = new URL(tab.url);
      currentIsGame = url.protocol === 'https:' && GAME_ORIGINS.includes(url.origin);
      reason = currentIsGame ? '' : `未识别当前页面（${url.origin === 'null' ? url.protocol : url.origin}）：不在支持的 HTTPS 域名列表中。`;
    } catch { reason = '当前页地址无法识别，请切到受支持的游戏页面。'; }
  }
  if (!currentIsGame) reason += '\n若刚更新扩展，请在 chrome://extensions 手动重新加载扩展，确认站点访问权限，再重新打开弹窗；不会自动刷新游戏。';
}

function render(state) {
  status.textContent = state.error || (state.attached
    ? state.tabId === tabId ? '当前游戏页已保持激活。' : '另一个游戏页正在保持激活。'
    : state.enabled ? '已记住启用偏好，等待打开游戏。' : '保持激活已关闭。');
  if (reason) status.textContent += `\n${reason}`;
  enable.disabled = !currentIsGame || (state.attached && state.tabId === tabId);
  enable.textContent = state.attached && state.tabId !== tabId ? '改为保持当前游戏页' : '在当前游戏页开启';
  disable.disabled = !state.enabled && !state.attached && !state.error;
}

async function run(type) {
  if (busy) return;
  busy = true;
  enable.disabled = disable.disabled = retry.disabled = true;
  status.textContent = type === 'status' ? '正在读取状态…' : '正在处理，请稍候…';
  try {
    if (type !== 'disable') await readTab();
    if (type === 'enable' && !currentIsGame) throw new Error(reason);
    render(await request(type));
  } catch (error) {
    status.textContent = `${error?.message || String(error)}\n可点击“重新检查”；若仍失败，请手动重新加载扩展后再打开弹窗。不会自动刷新游戏。`;
    enable.disabled = !currentIsGame;
    disable.disabled = false; // Allow cleanup even when status/initialization failed.
  } finally {
    busy = false;
    retry.disabled = false;
  }
}

enable.addEventListener('click', () => run('enable'));
disable.addEventListener('click', () => run('disable'));
retry.addEventListener('click', () => run('status'));
void run('status');
