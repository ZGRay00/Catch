'use strict';

const GAME_ORIGINS = ['https://pokecatch-online.app', 'https://pokecatch-online.netlify.app'];
const status = document.getElementById('status');
const enable = document.getElementById('enable');
const disable = document.getElementById('disable');
let tabId;
let currentIsGame = false;

async function request(type) {
  const result = await chrome.runtime.sendMessage({ type, tabId });
  if (!result?.ok) throw new Error(result?.error || '扩展未响应，请重试。');
  return result.state;
}

function render(state) {
  status.textContent = state.error || (state.attached
    ? state.tabId === tabId ? '当前游戏页已保持激活。' : '另一个游戏页正在保持激活。'
    : state.enabled ? '已记住启用偏好，等待打开游戏。' : '保持激活已关闭。');
  enable.disabled = !currentIsGame || (state.attached && state.tabId === tabId);
  enable.textContent = state.attached && state.tabId !== tabId ? '改为保持当前游戏页' : '在当前游戏页开启';
  disable.disabled = !state.enabled && !state.attached && !state.error;
  if (!currentIsGame && !state.error) status.textContent += '\n请切到 PokéCatch 游戏页后开启。';
}

async function run(type) {
  enable.disabled = disable.disabled = true;
  try { render(await request(type)); }
  catch (error) {
    status.textContent = error.message;
    enable.disabled = !currentIsGame;
    disable.disabled = false;
  }
}

enable.addEventListener('click', () => run('enable'));
disable.addEventListener('click', () => run('disable'));
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try { currentIsGame = GAME_ORIGINS.includes(new URL(tab?.url).origin); } catch { /* Other page. */ }
  await run('status');
})().catch(error => { status.textContent = error.message; });
