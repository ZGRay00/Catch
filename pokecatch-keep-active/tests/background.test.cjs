'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const GAME = 'https://pokecatch-online.app/';
const LEGACY_GAME = 'https://pokecatch-online.netlify.app/';
const PAGES_GAME = 'https://pokecatch-online.pages.dev/';
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const noNetwork = () => { throw new Error('Network disabled in offline tests'); };

function event() {
  const listeners = [];
  return { addListener: f => listeners.push(f), fire: (...args) => listeners.map(f => f(...args)) };
}

async function fixture({ enabled = false, saved = null, existing = [], failInit = false } = {}) {
  const local = { enabled }, session = saved ? { keeperState: saved } : {};
  const tabs = new Map([[1, { id: 1, url: GAME, active: true }], [2, { id: 2, url: LEGACY_GAME }], [3, { id: 3, url: 'https://pokecatch-online.app.example.com/' }]]);
  const attached = new Set(existing), focus = new Set(), calls = [];
  let refuseAttach = false;
  const area = object => ({ get: async key => {
    if (failInit) { failInit = false; throw new Error('Storage temporarily unavailable'); }
    return { [key]: structuredClone(object[key]) };
  }, set: async update => Object.assign(object, structuredClone(update)) });
  const chrome = {
    storage: { local: area(local), session: area(session) },
    action: { setBadgeText: async value => calls.push(['badge', value.text]), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    tabs: {
      get: async id => { if (!tabs.has(id)) throw new Error('No tab'); return tabs.get(id); },
      query: async ({ url }) => {
        assert.deepEqual(Array.from(url), [GAME + '*', LEGACY_GAME + '*', PAGES_GAME + '*']);
        return [...tabs.values()].filter(tab => url.some(pattern => tab.url.startsWith(pattern.slice(0, -1))));
      },
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
    runtime: { getManifest: () => structuredClone(manifest), id: 'test-extension', getURL: name => `chrome-extension://test-extension/${name}`, onMessage: event(), onStartup: event(), onInstalled: event() },
  };
  const context = vm.createContext({ chrome, URL, fetch: noNetwork, WebSocket: noNetwork, XMLHttpRequest: noNetwork, console: { warn() {} } }, { codeGeneration: { strings: false, wasm: false } });
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

test('pages.dev 支持，manifest 保持权限类型及版本', async () => {
  assert.equal(manifest.version, '1.0.1');
  assert.deepEqual(manifest.permissions, ['debugger', 'storage']);
  assert.deepEqual(manifest.host_permissions, [GAME + '*', LEGACY_GAME + '*', PAGES_GAME + '*']);
  const f = await fixture(); f.tabs.set(4, { id: 4, url: PAGES_GAME });
  assert.equal((await f.request('enable', 4)).ok, true);
  assert.deepEqual([...f.focus], [4]);
});

test('拒绝仿冒域名、HTTP、子域名、非标准端口', async () => {
  const f = await fixture();
  for (const url of ['https://pokecatch-online.pages.dev.evil.test/', 'https://evil.test/?https://pokecatch-online.pages.dev/', 'http://pokecatch-online.pages.dev/', 'https://x.pokecatch-online.pages.dev/', 'https://pokecatch-online.pages.dev:444/', 'blob:https://pokecatch-online.pages.dev/id']) {
    f.tabs.set(4, { id: 4, url });
    assert.equal((await f.request('enable', 4)).ok, false, url);
  }
  assert.equal(f.attached.size, 0);
});

test('初始化读取失败不永久毒化队列，下次请求可恢复', async () => {
  const f = await fixture({ failInit: true });
  assert.match(f.state().error, /Storage/);
  assert.equal((await f.request('enable')).ok, true);
  assert.equal(f.state().error, '');
});

test('初始化失败不会覆盖尚未读取的存活会话', async () => {
  const saved = { enabled: true, tabId: 2, attached: true, error: '' };
  const f = await fixture({ enabled: true, saved, existing: [2], failInit: true });
  assert.deepEqual(f.session.keeperState, saved);
  assert.equal((await f.request('disable')).ok, true);
  assert.equal(f.attached.size, 0);
});

test('原生聚焦请求进行中取消，不在 catch 分支重新 attach', async () => {
  const f = await fixture(); await f.request('enable');
  const send = f.chrome.debugger.sendCommand;
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  f.chrome.debugger.sendCommand = async (target, method, parameters) => {
    if (parameters.enabled) {
      started(); await new Promise(resolve => { release = resolve; });
      throw new Error('Canceled during command');
    }
    return send(target, method, parameters);
  };
  f.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, f.tabs.get(1));
  await entered;
  f.attached.delete(1); f.focus.delete(1);
  f.chrome.debugger.onDetach.fire({ tabId: 1 }, 'canceled_by_user');
  release(); await f.settle();
  assert.equal(f.calls.filter(c => c[0] === 'attach').length, 1);
  assert.equal(f.local.enabled, false);
  assert.equal(f.state().attached, false);
});

test('重复开启请求串行处理，不重复 attach', async () => {
  const f = await fixture();
  const responses = await Promise.all([f.request('enable'), f.request('enable')]);
  assert.ok(responses.every(r => r.ok));
  assert.equal(f.calls.filter(c => c[0] === 'attach').length, 1);
});

test('刷新事件先入队、取消随后发生时不重连', async () => {
  const f = await fixture(); await f.request('enable');
  f.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, f.tabs.get(1));
  f.attached.delete(1); f.focus.delete(1);
  f.chrome.debugger.onDetach.fire({ tabId: 1 }, 'canceled_by_user');
  await f.settle();
  assert.equal(f.calls.filter(c => c[0] === 'attach').length, 1);
  assert.equal(f.state().enabled, false);
  assert.equal((await f.request('enable')).ok, true); // Explicit new action only.
});

test('用户取消拒绝已排队的旧开启请求', async () => {
  const f = await fixture(); await f.request('enable');
  const pending = f.request('enable');
  f.attached.delete(1); f.focus.delete(1);
  f.chrome.debugger.onDetach.fire({ tabId: 1 }, 'canceled_by_user');
  assert.equal((await pending).ok, false);
  await f.settle();
  assert.equal(f.state().enabled, false);
  assert.equal(f.attached.size, 0);
});

test('验证后标签页消失不会留下启用偏好', async () => {
  const f = await fixture(); const get = f.chrome.tabs.get; let count = 0;
  f.chrome.tabs.get = async id => { if (++count === 2) throw new Error('No tab'); return get(id); };
  assert.equal((await f.request('enable')).ok, false);
  assert.equal(f.state().enabled, false);
  assert.equal(f.local.enabled, false);
  assert.equal(f.attached.size, 0);
});

test('后台事件 API 异常被记录且后续可恢复', async () => {
  const f = await fixture(); const query = f.chrome.tabs.query;
  f.local.enabled = true;
  await f.request('enable'); await f.request('disable');
  f.chrome.action.setBadgeText = async () => { throw new Error('Badge unavailable'); };
  f.chrome.runtime.onStartup.fire(); await f.settle();
  assert.match(f.state().error, /Badge/);
  f.chrome.action.setBadgeText = async () => {};
  f.chrome.tabs.query = query;
  assert.equal((await f.request('enable')).ok, true);
});

test('关闭时偏好写入失败仍解除聚焦，不自动恢复', async () => {
  const f = await fixture(); await f.request('enable');
  f.chrome.storage.local.set = async () => { throw new Error('Write failed'); };
  assert.equal((await f.request('disable')).ok, false);
  assert.equal(f.state().enabled, false);
  assert.equal(f.attached.size, 0);
  f.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, f.tabs.get(1)); await f.settle();
  assert.equal(f.attached.size, 0);
});

test('弹窗响应通道关闭不会产生未处理拒绝', async () => {
  const f = await fixture();
  f.chrome.runtime.onMessage.fire({ type: 'status' }, { id: f.chrome.runtime.id, url: f.chrome.runtime.getURL('popup.html') }, () => { throw new Error('Port closed'); });
  await f.settle(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.request('enable')).ok, true);
});

test('VM 网络入口禁用，扩展没有页面注入或刷新 API', () => {
  assert.throws(noNetwork, /Network disabled/);
  assert.doesNotMatch(source, /\b(fetch|WebSocket|XMLHttpRequest|importScripts)\s*\(/);
  assert.doesNotMatch(source, /scripting\.|tabs\.reload|Runtime\.evaluate/);
});
