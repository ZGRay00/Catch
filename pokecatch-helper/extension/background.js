'use strict';
const GAME_URLS = ['https://pokecatch-online.netlify.app/*', 'https://pokecatch-online.pages.dev/*'];
const ALARM = 'pokecatch-background-support';
let sequence = Promise.resolve(), status = { enabled: false, tabs: 0, systemAwake: false, error: '' };
const closedTabIds = new Set();
async function synchronize() {
  const state = await chrome.storage.local.get({ enabled: false, keepSystemAwake: false, managedTabs: [], managedTabIds: [] });
  const enabled = state.enabled === true;
  const tabs = await chrome.tabs.query({ url: GAME_URLS }), ids = tabs.filter(tab => Number.isInteger(tab.id)).map(tab => tab.id);
  const records = new Map();
  for (const record of Array.isArray(state.managedTabs) ? state.managedTabs : []) {
    if (record && Number.isInteger(record.id) && !closedTabIds.has(record.id)) records.set(record.id, { id: record.id, autoDiscardable: record.autoDiscardable !== false });
  }
  // Compatibility with the initial IDs-only development format, which restored true.
  for (const id of Array.isArray(state.managedTabIds) ? state.managedTabIds : []) {
    if (Number.isInteger(id) && !records.has(id) && !closedTabIds.has(id)) records.set(id, { id, autoDiscardable: true });
  }
  if (enabled) for (const tab of tabs) if (Number.isInteger(tab.id) && !records.has(tab.id)) records.set(tab.id, { id: tab.id, autoDiscardable: tab.autoDiscardable !== false });
  const journal = [...records.values()];
  // Persist the original policy before changing a tab, so a worker restart cannot lose it.
  if (JSON.stringify(journal) !== JSON.stringify(state.managedTabs) || state.managedTabIds?.length) await chrome.storage.local.set({ managedTabs: journal, managedTabIds: [] });
  const operations = [...records.values()].map(record => ({ ...record, restore: !enabled || !ids.includes(record.id) }));
  const results = await Promise.allSettled(operations.map(operation => chrome.tabs.update(operation.id, { autoDiscardable: operation.restore ? operation.autoDiscardable : false })));
  for (let i = 0; i < operations.length; i++) if (operations[i].restore && results[i].status === 'fulfilled') records.delete(operations[i].id);
  // A tab may have closed while this worker was asleep, without an onRemoved event.
  const failedRestores = operations.filter((operation, i) => operation.restore && results[i].status === 'rejected');
  await Promise.all(failedRestores.map(async operation => {
    try { await chrome.tabs.get(operation.id); }
    catch { records.delete(operation.id); }
  }));
  for (const id of closedTabIds) records.delete(id);
  closedTabIds.clear();
  // Failed restores remain persisted and are retried even after support is switched off.
  const managed = [...records.values()];
  if (JSON.stringify(managed) !== JSON.stringify(journal)) await chrome.storage.local.set({ managedTabs: managed, managedTabIds: [] });
  if (enabled || managed.length) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  else await chrome.alarms.clear(ALARM);
  const permission = await chrome.permissions.contains({ permissions: ['power'] });
  const systemAwake = !!(enabled && state.keepSystemAwake === true && permission && chrome.power);
  if (systemAwake) chrome.power.requestKeepAwake('system');
  else if (permission && chrome.power) chrome.power.releaseKeepAwake();
  const failed = results.filter((result, i) => result.status === 'rejected' && records.has(operations[i].id)).length;
  status = { enabled, tabs: ids.length, systemAwake, error: failed ? `${failed} 个标签页设置等待重试` : '' };
  return status;
}
function sync() {
  sequence = sequence.then(synchronize).catch(error => { status = { ...status, error: String(error.message || error) }; return status; });
  return sequence;
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.enabled || changes.keepSystemAwake)) sync(); });
chrome.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'complete') sync(); });
chrome.tabs.onRemoved.addListener(id => { closedTabIds.add(id); sync(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) sync(); });
chrome.runtime.onInstalled.addListener(() => sync());
chrome.runtime.onStartup.addListener(() => sync());
chrome.permissions.onRemoved.addListener(() => sync());
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'pokecatch-support-status') return false;
  sync().then(reply); return true;
});
sync();
