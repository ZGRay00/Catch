'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../extension'),source=name=>fs.readFileSync(path.join(root,name),'utf8');
const ATTR='data-pc-helper-background-at',ORIGIN='https://pokecatch-online.app';
const MATCHES=[ORIGIN+'/*','https://pokecatch-online.netlify.app/*','https://pokecatch-online.pages.dev/*'];
const drain=()=>new Promise(resolve=>setImmediate(resolve));
function page(origin=ORIGIN){
  const attributes=new Map(),events=[],documentListeners={},windowListeners={},intervals=[];let now=1000000;
  class Document{
    get hidden(){return true;}
    get visibilityState(){return 'hidden';}
    dispatchEvent(event){events.push(event.type);return true;}
    addEventListener(name,fn){documentListeners[name]=fn;}
  }
  const document=new Document();document.documentElement={getAttribute:key=>attributes.get(key)??null,setAttribute:(key,value)=>attributes.set(key,String(value)),removeAttribute:key=>attributes.delete(key)};
  class Clock extends Date{static now(){return now;}}
  const context=vm.createContext({Document,document,location:{origin},Date:Clock,Event:class{constructor(type){this.type=type;}},window:{addEventListener:(name,fn)=>{windowListeners[name]=fn;}},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;}});
  return{context,document,Document,attributes,events,intervals,documentListeners,windowListeners,setNow:value=>{now=value;},now:()=>now};
}
test('manifest is MV3, targets all three game origins, and keeps power optional',()=>{
  const manifest=JSON.parse(source('manifest.json'));assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage','tabs','alarms']);assert.deepEqual(manifest.optional_permissions,['power']);
  assert.deepEqual(manifest.host_permissions,MATCHES);assert.equal(manifest.content_scripts.length,2);
  for(const item of manifest.content_scripts){assert.deepEqual(item.matches,manifest.host_permissions);assert.equal(item.run_at,'document_start');assert.ok(!item.all_frames);}
  assert.deepEqual(manifest.content_scripts.map(item=>item.world),['MAIN','ISOLATED']);
});
test('MAIN getter wrapper preserves original behavior unless a fresh same-document heartbeat exists',()=>{
  const p=page(),originalDate=p.context.Date,originalTimer=p.context.setInterval;vm.runInContext(source('visibility-main.js'),p.context);
  assert.equal(p.document.hidden,true);assert.equal(p.document.visibilityState,'hidden');
  p.attributes.set(ATTR,String(p.now()));assert.equal(p.document.hidden,false);assert.equal(p.document.visibilityState,'visible');assert.equal(new p.Document().hidden,true);
  p.setNow(p.now()+89999);assert.equal(p.document.hidden,false);p.setNow(p.now()+1);assert.equal(p.document.hidden,true);
  p.attributes.set(ATTR,String(p.now()+1));assert.equal(p.document.hidden,true);p.attributes.set(ATTR,'not-a-time');assert.equal(p.document.hidden,true);
  p.attributes.delete(ATTR);assert.equal(p.document.visibilityState,'hidden');assert.equal(p.context.Date,originalDate);assert.equal(p.context.setInterval,originalTimer);assert.equal(p.intervals.length,0);
});
test('MAIN wrapper does nothing on an unrelated origin',()=>{
  const p=page('https://example.com'),before=Object.getOwnPropertyDescriptor(p.Document.prototype,'hidden').get;vm.runInContext(source('visibility-main.js'),p.context);
  assert.equal(Object.getOwnPropertyDescriptor(p.Document.prototype,'hidden').get,before);p.attributes.set(ATTR,String(p.now()));assert.equal(p.document.hidden,true);
});
test('isolated heartbeat is off by default, updates when enabled, and removes state on disable/pagehide',async()=>{
  const p=page();let listener;
  p.context.chrome={storage:{local:{get:async defaults=>defaults},onChanged:{addListener:fn=>{listener=fn;}}}};vm.runInContext(source('heartbeat.js'),p.context);await drain();
  assert.equal(p.attributes.has(ATTR),false);assert.equal(p.intervals.length,1);assert.equal(p.intervals[0].ms,20000);
  listener({enabled:{newValue:true}},'local');assert.equal(p.attributes.get(ATTR),String(p.now()));assert.equal(p.events.at(-1),'visibilitychange');
  p.setNow(p.now()+20000);p.intervals[0].fn();assert.equal(p.attributes.get(ATTR),String(p.now()));
  listener({enabled:{newValue:false}},'sync');assert.equal(p.attributes.has(ATTR),true);listener({enabled:{newValue:false}},'local');assert.equal(p.attributes.has(ATTR),false);assert.equal(p.events.at(-1),'visibilitychange');
  listener({enabled:{newValue:true}},'local');p.windowListeners.pagehide();assert.equal(p.attributes.has(ATTR),false);p.intervals[0].fn();assert.equal(p.attributes.has(ATTR),false);p.windowListeners.pageshow();assert.equal(p.attributes.has(ATTR),true);
});
test('heartbeat rejects truthy settings and an old initial storage read cannot override a newer toggle',async()=>{
  const p=page();let listener,resolveInitial;p.context.chrome={storage:{local:{get:()=>new Promise(resolve=>{resolveInitial=resolve;})},onChanged:{addListener:fn=>{listener=fn;}}}};
  vm.runInContext(source('heartbeat.js'),p.context);listener({enabled:{newValue:true}},'local');resolveInitial({enabled:false});await drain();assert.equal(p.attributes.has(ATTR),true);
  listener({enabled:{newValue:'true'}},'local');assert.equal(p.attributes.has(ATTR),false);
});
function extensionHarness(initial={}){
  const state={...initial},updates=[],power=[],alarms=[],listeners={},tabs=[{id:7,url:ORIGIN+'/'}],failures=new Set(),missing=new Set();let granted=false;
  const event=name=>({addListener:fn=>{listeners[name]=fn;}});
  const chrome={storage:{local:{get:async defaults=>({...defaults,...state}),set:async values=>{Object.assign(state,values);}},onChanged:event('storage')},tabs:{query:async query=>{assert.deepEqual(Array.from(query.url),MATCHES);return [...tabs];},get:async id=>{if(missing.has(id))throw Error('tab no longer exists');return{id};},update:async(id,values)=>{updates.push({id,...values});if(failures.has(id))throw Error('temporary update failure');},onUpdated:event('updated'),onRemoved:event('removed')},alarms:{create:async(name,values)=>{alarms.push({name,...values});},clear:async name=>{alarms.push({clear:name});},onAlarm:event('alarm')},permissions:{contains:async()=>granted,onRemoved:event('permissionRemoved')},power:{requestKeepAwake:value=>power.push(value),releaseKeepAwake:()=>power.push('release')},runtime:{onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')}};
  vm.runInNewContext(source('background.js'),{chrome});
  const sync=()=>new Promise(resolve=>listeners.message({type:'pokecatch-support-status'}, {}, resolve));
  return{state,updates,power,alarms,listeners,tabs,failures,missing,sync,grant:value=>{granted=value;}};
}
test('background defaults off, confines tab management, restores navigation and releases wake lock',async()=>{
  const h=extensionHarness();let status=await h.sync();assert.equal(status.enabled,false);assert.equal(status.systemAwake,false);assert.equal(h.updates.length,0);assert.equal(h.power.length,0);
  h.state.enabled=true;status=await h.sync();assert.equal(status.enabled,true);assert.equal(h.updates.at(-1).autoDiscardable,false);assert.deepEqual(Array.from(h.state.managedTabs,record=>record.id),[7]);assert.equal(h.power.length,0);
  h.state.keepSystemAwake=true;status=await h.sync();assert.equal(status.systemAwake,false);h.grant(true);status=await h.sync();assert.equal(status.systemAwake,true);assert.equal(h.power.at(-1),'system');
  h.tabs.length=0;await h.sync();assert.deepEqual(h.updates.at(-1),{id:7,autoDiscardable:true});assert.deepEqual(Array.from(h.state.managedTabs),[]);
  h.state.enabled=false;status=await h.sync();assert.equal(status.systemAwake,false);assert.equal(h.power.at(-1),'release');
});
test('only explicit true enables support; switching off restores only managed tabs',async()=>{
  const h=extensionHarness({enabled:'true',keepSystemAwake:true});assert.equal((await h.sync()).enabled,false);assert.equal(h.updates.length,0);
  h.state.enabled=true;await h.sync();h.tabs.push({id:8,url:ORIGIN+'/'});h.state.enabled=false;await h.sync();
  assert.deepEqual(h.updates.at(-1),{id:7,autoDiscardable:true});assert.equal(h.updates.some(update=>update.id===8),false);
});
test('original false tab policy survives repeated sync, navigation and failed restore retry',async()=>{
  const h=extensionHarness();await h.sync();h.tabs[0].autoDiscardable=false;h.state.enabled=true;await h.sync();await h.sync();assert.equal(h.state.managedTabs[0].autoDiscardable,false);
  h.state.enabled=false;h.failures.add(7);assert.match((await h.sync()).error,/等待重试/);assert.equal(h.state.managedTabs.length,1);assert.equal(h.alarms.at(-1).periodInMinutes,1);
  h.failures.delete(7);await h.sync();assert.deepEqual(h.updates.at(-1),{id:7,autoDiscardable:false});assert.equal(h.state.managedTabs.length,0);
  h.state.enabled=true;await h.sync();h.tabs.length=0;await h.sync();assert.deepEqual(h.updates.at(-1),{id:7,autoDiscardable:false});
});
test('legacy IDs restore true and a known closed tab clears pending restoration',async()=>{
  const legacy=extensionHarness({managedTabIds:[9]});await legacy.sync();assert.deepEqual(legacy.updates.at(-1),{id:9,autoDiscardable:true});assert.equal(legacy.state.managedTabs.length,0);
  const h=extensionHarness({managedTabs:[{id:8,autoDiscardable:false}]});h.failures.add(8);await h.sync();assert.equal(h.state.managedTabs.length,1);h.listeners.removed(8);await h.sync();assert.equal(h.state.managedTabs.length,0);
  const sleeping=extensionHarness({managedTabs:[{id:9,autoDiscardable:false}]});sleeping.failures.add(9);sleeping.missing.add(9);assert.equal((await sleeping.sync()).error,'');assert.equal(sleeping.state.managedTabs.length,0);
});
test('power permission request exists only in the user-facing popup handler',()=>{
  assert.doesNotMatch(source('background.js'),/permissions\.request/);assert.doesNotMatch(source('heartbeat.js'),/permissions\.request/);assert.match(source('popup.js'),/power\.addEventListener\('change',[\s\S]*permissions\.request/);
  for(const file of ['background.js','heartbeat.js','visibility-main.js'])assert.doesNotMatch(source(file),/location\.reload|tabs\.reload|tabs\.create|tabs\.highlight|windows\.update|Math\.random\s*=|Date\s*=|setInterval\s*=/);
});
