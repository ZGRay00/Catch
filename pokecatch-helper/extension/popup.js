'use strict';
const enabled = document.querySelector('#enabled'), power = document.querySelector('#power'), status = document.querySelector('#status');
async function render() {
  const state = await chrome.storage.local.get({ enabled: false, keepSystemAwake: false });
  enabled.checked = state.enabled === true; power.checked = state.keepSystemAwake === true;
  const result = await chrome.runtime.sendMessage({ type: 'pokecatch-support-status' });
  status.textContent = result?.error || (state.enabled === true ? `已启用 · ${result?.tabs || 0} 个游戏标签页${result?.systemAwake ? ' · 系统保持唤醒' : ''}` : '已关闭 · 使用浏览器原生后台行为');
}
enabled.addEventListener('change', async () => {
  enabled.disabled = true;
  try { await chrome.storage.local.set({ enabled: enabled.checked }); await render(); }
  catch (error) { status.textContent = error.message; }
  finally { enabled.disabled = false; }
});
power.addEventListener('change', async () => {
  power.disabled = true;
  try {
    // This optional permission is requested only in direct response to the user's checkbox gesture.
    const granted = !power.checked || await chrome.permissions.request({ permissions: ['power'] });
    await chrome.storage.local.set({ keepSystemAwake: power.checked && granted }); await render();
    if (!granted) status.textContent = '未授予防止系统休眠权限；后台支持仍可单独使用。';
  } catch (error) { status.textContent = error.message; }
  finally { power.disabled = false; }
});
render().catch(error => { status.textContent = error.message; });
