'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const GAME = 'https://pokecatch-online.netlify.app/';

function event() {
  const listeners = [];
  return { addListener: f => listeners.push(f), fire: (...args) => listeners.map(f => f(...args)) };
}

async function fixture({ enabled = false, saved = null, existing = [] } = {}) {
  const local = { enabled }, session = saved ? { keeperState: saved } : {};
  const tabs = new Map([[1, { id: 1, url: GAME, active: true }], [2, { id: 2, url: GAME }], [3, { id: 3, url: 'https://example.com/' }]]);
  const attached = new Set(existing), focus = new Set(), calls = [];
  let refuseAttach = false;
  const area = object => ({ get: async key => ({ [key]: structuredClone(object[key]) }), set: async update => Object.assign(object, structuredClone(update)) });
  const chrome = {
    storage: { local: area(local), session: area(session) },
    action: { setBadgeText: async value => calls.push(['badge', value.text]), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    tabs: {
      get: async id => { if (!tabs.has(id)) throw new Error('No tab'); return tabs.get(id); },
      query: async () => [...tabs.values()].filter(tab => tab.url.startsWith(GAME)),
      onUpdated: event(), onRemoved: event(),
    },
    debugger: {
      async attach({ tabId }) { calls.push(['attach', tabId]); if (refuseAttach || attached.has(tabId)) throw new Error('Another debugger is already attached'); attached.add(tabId); },
      async sendCommand({ tabId }, method, parameters) {
        calls.push(['command', tabId, method, parameters.enabled]);
        if (!attached.has(tabId)) throw new Error('Debugger is not attached');
        parameters.enabled ? focus.add(tabId) : focus.delete(tabId);
      },
      async detach({ tabId }) { attached.delete(tabId); focus.delete(tabId); calls.push(['detach', tabId]); },
      onDetach: event(),
    },
    runtime: { id: 'test-extension', getURL: name => `chrome-extension://test-extension/${name}`, onMessage: event(), onStartup: event(), onInstalled: event() },
  };
  const context = vm.createContext({ chrome, URL, console: { warn() {} } });
  vm.runInContext(source, context);
  const settle = async () => { await vm.runInContext('queue', context); };
  const state = () => JSON.parse(vm.runInContext('JSON.stringify(state)', context));
  const request = (type, tabId = 1) => new Promise(resolve => chrome.runtime.onMessage.fire({ type, tabId }, { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') }, resolve));
  await settle();
  return { chrome, local, session, tabs, calls, focus, attached, state, request, settle, refuse() { refuseAttach = true; } };
}

test('默认不开启；拒绝其他网站和非弹窗控制消息', async () => {
  const f = await fixture();
  assert.equal(f.state().enabled, false);
  assert.equal(f.calls.some(c => c[0] === 'attach'), false);
  assert.equal((await f.request('enable', 3)).ok, false);
  assert.equal(f.local.enabled, false);
  assert.deepEqual(f.chrome.runtime.onMessage.fire({ type: 'enable', tabId: 1 }, { id: 'other', url: GAME }, () => assert.fail()), [false]);
});

test('开启、刷新、停止使用原生聚焦命令，并保存开关', async () => {
  const f = await fixture();
  assert.equal((await f.request('enable')).ok, true);
  assert.equal(f.local.enabled, true);
  assert.deepEqual([...f.focus], [1]);
  f.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, f.tabs.get(1));
  await f.settle();
  assert.equal(f.calls.filter(c => c[0] === 'attach').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'command' && c[3] === true).length, 3);
  assert.equal((await f.request('disable')).ok, true);
  assert.equal(f.local.enabled, false);
  assert.equal(f.focus.size, 0);
  assert.equal(f.attached.size, 0);
  assert.ok(f.calls.filter(c => c[0] === 'command').every(c => c[2] === 'Emulation.setFocusEmulationEnabled'));
});

test('自动恢复偏好时只选一个游戏页；可手动切换到另一个', async () => {
  const f = await fixture({ enabled: true });
  assert.deepEqual([...f.focus], [1]);
  f.chrome.tabs.onUpdated.fire(2, { status: 'complete' }, f.tabs.get(2));
  await f.settle();
  assert.deepEqual([...f.focus], [1]);
  await f.request('enable', 2);
  assert.deepEqual([...f.focus], [2]);
  assert.deepEqual([...f.attached], [2]);
});

test('服务工作线程重建时复用连接', async () => {
  const f = await fixture({ enabled: true, saved: { enabled: true, tabId: 2, attached: true, error: '' }, existing: [2] });
  assert.deepEqual([...f.focus], [2]);
  assert.equal(f.calls.some(c => c[0] === 'attach'), false);
});

test('用户取消或打开 F12 后停止，不强行重连', async () => {
  const f = await fixture();
  await f.request('enable');
  f.attached.delete(1); f.focus.delete(1);
  f.chrome.debugger.onDetach.fire({ tabId: 1 }, 'canceled_by_user');
  await f.settle();
  f.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, f.tabs.get(1));
  await f.settle();
  assert.equal(f.local.enabled, false);
  assert.equal(f.state().attached, false);
  assert.match(f.state().error, /F12/);
  assert.equal(f.calls.filter(c => c[0] === 'attach').length, 1);
});

test('离开游戏域名时解除聚焦', async () => {
  const f = await fixture();
  await f.request('enable');
  f.tabs.set(1, { id: 1, url: 'https://example.com/' });
  f.chrome.tabs.onUpdated.fire(1, { url: 'https://example.com/' }, f.tabs.get(1));
  await f.settle();
  assert.equal(f.attached.size, 0);
  assert.equal(f.state().tabId, null);
});

test('关闭游戏页后保留偏好，下一游戏页打开后恢复', async () => {
  const f = await fixture();
  await f.request('enable');
  f.tabs.delete(1); f.attached.delete(1); f.focus.delete(1);
  f.chrome.debugger.onDetach.fire({ tabId: 1 }, 'target_closed');
  f.chrome.tabs.onRemoved.fire(1);
  await f.settle();
  assert.equal(f.local.enabled, true);
  assert.equal(f.state().attached, false);
  f.chrome.tabs.onUpdated.fire(2, { status: 'complete' }, f.tabs.get(2));
  await f.settle();
  assert.deepEqual([...f.focus], [2]);
});

test('连接被 F12 占用时报告失败并清理启用偏好', async () => {
  const f = await fixture(); f.refuse();
  const result = await f.request('enable');
  assert.equal(result.ok, false);
  assert.match(result.error, /F12/);
  assert.equal(f.local.enabled, false);
  assert.equal(f.state().attached, false);
  assert.equal(f.state().tabId, null);
});
