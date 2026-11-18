'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../pokecatch-helper/src/models/nursery-ledger.js'),'utf8'),moduleObject={exports:{}};
// Test the ledger's evidence accounting independently of the separately native-verified hash model.
const outcome=(s,egg,options={})=>Object.hasOwn(egg,'shiny')?{known:true,shiny:!!egg.shiny,key:egg.uid,source:'saved'}:options.nativeBuild!=='unsupported'&&Number.isInteger(egg.k)?{known:true,shiny:egg.k%2===0,key:egg.uid,source:'counter'}:{known:false,shiny:null,key:egg.uid||null,source:'unknown'};
vm.runInNewContext(source+'\nmodule.exports={NurseryLedger,NURSERY_LEDGER_LIMITS};',{module:moduleObject,eggOutcome:outcome,Date});
const {NurseryLedger,NURSERY_LEDGER_LIMITS:L}=moduleObject.exports,plain=value=>JSON.parse(JSON.stringify(value));
const egg=(uid,shiny=false)=>({uid,id:1,shiny}),save=(eggs=[],hatched=500,since=100)=>({trainer:{id:'trainer',since},pension:{eggs},stats:{hatched},mons:[],dex:{}});
function ready(s=save(),now=1000){const ledger=new NurseryLedger();ledger.observe(s,now);ledger.markClean();return ledger;}
test('first sample establishes a baseline and separates current shiny eggs from historical counts',()=>{
 const ledger=ready(save([egg('existing',true)],900));const s=ledger.snapshot();assert.equal(s.nativeHatched,900);assert.equal(s.current.shiny,1);assert.equal(s.stats.eggsObserved,0);assert.equal(s.stats.hatched,0);assert.equal(s.stats.shinyHatched,0);assert.equal(s.segment.ordinal,1);assert.equal(ledger.dirty,false);
});
test('new egg observations have independent shiny, ordinary and unknown counts',()=>{
 const ledger=ready();const s=ledger.observe(save([egg('shiny',true),egg('plain'),{uid:'unknown',id:1}],500),2000);
 assert.equal(s.stats.eggsObserved,3);assert.equal(s.stats.shinyObserved,1);assert.equal(s.stats.plainObserved,1);assert.equal(s.stats.unknownObserved,1);assert.equal(s.current.shiny,1);assert.equal(s.current.unknown,1);
 ledger.markClean();ledger.observe(save([egg('shiny',true),egg('plain'),{uid:'unknown',id:1}],500),3000);assert.equal(ledger.dirty,false);assert.equal(ledger.snapshot().stats.eggsObserved,3);
});

test('an observed unknown outcome is refined once, including across reloads and a later hatch',()=>{
 const waiting={nativeBuild:'unsupported'},verified={nativeBuild:'supported'};
 const preexisting={uid:'baseline',id:1,k:2},fresh={uid:'new',id:1,k:4};
 let ledger=new NurseryLedger();ledger.observe(save([preexisting]),1000,waiting);
 ledger.observe(save([preexisting,fresh]),2000,waiting);
 ledger=new NurseryLedger(plain(ledger.serialize()));
 for(const now of [3000,4000])ledger.observe(save([preexisting,fresh]),now,verified);
 assert.equal(ledger.stats.eggsObserved,1);assert.equal(ledger.stats.unknownObserved,0);assert.equal(ledger.stats.shinyObserved,1);
 ledger.observe(save([preexisting],501),5000,verified);
 assert.equal(ledger.stats.shinyHatched,1);assert.equal(ledger.stats.shinyObserved,1);
});
test('an unverified observation can gain explicit save evidence or be resolved while waiting for the hatch counter',()=>{
 const waiting={nativeBuild:'unsupported'},verified={nativeBuild:'supported'},ledger=ready();
 const unknown={uid:'first',id:1,k:3},second={uid:'second',id:1,k:2};
 ledger.observe(save([unknown,second]),1500,waiting);
 ledger.observe(save([{...unknown,shiny:false}]),2000,waiting);
 assert.equal(ledger.stats.plainObserved,1);assert.equal(ledger.stats.unknownObserved,1);
 ledger.observe(save([{...unknown,shiny:false}],501),3000,verified);
 assert.equal(ledger.stats.shinyObserved,1);assert.equal(ledger.stats.unknownObserved,0);assert.equal(ledger.stats.shinyHatched,1);
});
test('egg disappearance alone never proves an ordinary or shiny hatch',()=>{
 const ledger=ready(save([egg('shiny',true)]));const s=ledger.observe(save([],500),2000);assert.equal(s.current.pendingDisappearances,1);assert.equal(s.stats.hatched,0);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.plainHatched,0);
});
test('one disappearing known shiny egg plus one native hatch increment confirms one shiny hatch',()=>{
 const ledger=ready(save([egg('shiny',true)])),s=ledger.observe(save([],501),2000);assert.equal(s.stats.hatched,1);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.unknownHatched,0);assert.equal(s.current.pendingDisappearances,0);assert.equal(s.recent[0].status,'hatched');
 ledger.observe(save([],501),3000);assert.equal(ledger.snapshot().stats.shinyHatched,1);
});
test('a same-species shiny and ordinary batch is attributed by egg identity, without new PC members',()=>{
 const ledger=ready(save([egg('s',true),egg('p')])),s=ledger.observe(save([],502),2000);assert.equal(s.stats.hatched,2);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.plainHatched,1);assert.equal(s.stats.unknownHatched,0);assert.equal(s.recent.length,2);
});
test('native hatch delta beyond observable disappearances stays unknown and never becomes ordinary',()=>{
 const ledger=ready(save([egg('s',true),egg('p')])),s=ledger.observe(save([],503),2000);assert.equal(s.stats.hatched,3);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.plainHatched,0);assert.equal(s.stats.unknownHatched,3);assert.equal(s.current.pendingDisappearances,2);
});
test('a hatch with an unknown egg outcome remains unknown after identity confirmation',()=>{
 const ledger=ready(save([{uid:'u',id:1}])),s=ledger.observe(save([],501),2000);assert.equal(s.stats.hatched,1);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.plainHatched,0);assert.equal(s.stats.unknownHatched,1);assert.equal(s.current.pendingDisappearances,0);
});
test('egg deletion followed by a later native counter write survives refresh in the gap',()=>{
 let ledger=ready(save([egg('s',true)]));ledger.observe(save([],500),2000);ledger=new NurseryLedger(plain(ledger.snapshot()));const s=ledger.observe(save([],501),3000);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.hatched,1);assert.equal(s.current.pendingDisappearances,0);
});
test('native counter written before egg deletion survives refresh and refines unknown to confirmed',()=>{
 const active=save([egg('s',true)]);let ledger=ready(active);let s=ledger.observe(save([egg('s',true)],501),2000);assert.equal(s.stats.unknownHatched,1);
 ledger=new NurseryLedger(plain(s));s=ledger.observe(save([],501),3000);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.unknownHatched,0);assert.equal(s.stats.hatched,1);
});
test('a partially observed same-species batch stays ambiguous until both native increments arrive',()=>{
 const ledger=ready(save([egg('s',true),egg('p')]));let s=ledger.observe(save([],501),2000);assert.equal(s.stats.unknownHatched,1);assert.equal(s.stats.shinyHatched,0);
 s=ledger.observe(save([],502),3000);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.plainHatched,1);assert.equal(s.stats.hatched,2);
});
test('a counter credit predating the first observation of an egg cannot be assigned to it',()=>{
 const ledger=ready();ledger.observe(save([],501),2000);ledger.observe(save([egg('later',true)],501),3000);const s=ledger.observe(save([],501),4000);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.unknownHatched,1);assert.equal(s.current.pendingDisappearances,1);
});
test('reappearing pending eggs cancel disappearance without being counted as newly produced twice',()=>{
 const ledger=ready();ledger.observe(save([egg('s',true)],500),2000);ledger.observe(save([],500),3000);let s=ledger.observe(save([egg('s',true)],500),4000);assert.equal(s.current.pendingDisappearances,0);assert.equal(s.stats.eggsObserved,1);
 s=ledger.observe(save([],501),5000);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.eggsObserved,1);
});
test('unconfirmed disappearance expiry preserves uncertainty instead of inventing a hatch',()=>{
 const ledger=ready(save([egg('s',true)]));ledger.observe(save([],500),2000);let s=ledger.observe(save([],500),2001+L.windowMs);assert.equal(s.current.pendingDisappearances,0);assert.equal(s.stats.unconfirmedDisappearances,1);assert.equal(s.stats.hatched,0);
 s=ledger.observe(save([],501),3000+L.windowMs);assert.equal(s.stats.unknownHatched,1);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.plainHatched,0);
});
test('native counter rollback starts a fresh local segment and never keeps previous shiny totals',()=>{
 const ledger=ready(save([egg('s',true)]));ledger.observe(save([],501),2000);const s=ledger.observe(save([egg('rollback',true)],20),3000);assert.equal(s.segment.reason,'counter-rollback');assert.equal(s.segment.ordinal,2);assert.equal(s.nativeHatched,20);assert.equal(s.stats.hatched,0);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.eggsObserved,0);assert.equal(s.current.shiny,1);
 ledger.observe(save([egg('rollback',true)],20),4000);assert.equal(ledger.snapshot().stats.hatched,0);
});
test('same trainer id with a new trainer.since starts a new segment without importing history',()=>{
 const ledger=ready(save([egg('s',true)]));ledger.observe(save([],501),2000);const s=ledger.observe(save([egg('new-save',true)],900,101),3000);assert.equal(s.segment.reason,'trainer-changed');assert.equal(s.stats.hatched,0);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.eggsObserved,0);assert.equal(s.nativeHatched,900);assert.ok(s.events.some(event=>event.type==='segment-reset'));
});
test('PC, dex, evolution, trade and raid changes never imply a shiny egg hatch',()=>{
 const ledger=ready(),s=save([],500);s.dex={1:{shiny:true},2:{shiny:true}};s.mons=[{uid:'different-mon-uid',id:1,shiny:true}];s.pension.mons=[{mon:{id:1,shiny:true}}];s.adv={event:{raid:true}};const state=ledger.observe(s,2000);assert.equal(state.stats.shinyHatched,0);assert.equal(state.stats.hatched,0);assert.equal(state.stats.shinyObserved,0);
});
test('duplicate egg identities are not treated as independently known shiny results',()=>{
 const ledger=ready(save([egg('duplicate',true),egg('duplicate',true)])),s=ledger.observe(save([],501),2000);assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.unknownHatched,1);
});
test('manual reset clears only local statistics, rebaselines existing eggs and retains reset explanation',()=>{
 const ledger=ready(),s=save([egg('s',true)],700);ledger.observe(s,2000);const before=JSON.stringify(s),result=ledger.reset(s,3000);assert.equal(JSON.stringify(s),before);assert.equal(result.stats.eggsObserved,0);assert.equal(result.stats.hatched,0);assert.equal(result.current.shiny,1);assert.equal(result.nativeHatched,700);assert.equal(result.segment.reason,'manual');assert.equal(ledger.dirty,true);
});
test('snapshots are detached, serialized observation resumes, and records remain bounded',()=>{
 const ledger=ready(save([],0));for(let i=0;i<350;i++){ledger.observe(save([egg('e'+i,i%2===0)],i),2000+i*20);ledger.observe(save([],i+1),2010+i*20);}
 const s=ledger.snapshot();assert.equal(s.stats.hatched,350);assert.equal(s.stats.shinyHatched,175);assert.equal(s.stats.plainHatched,175);assert.ok(s.events.length<=L.events);assert.ok(s.recent.length<=L.recent);assert.ok(s.seen.length<=L.seen);assert.ok(s.resolved.length<=L.seen);assert.ok(s.pending.length<=L.pending);assert.ok(s.credits.length<=L.credits);
 const restored=new NurseryLedger(plain(ledger.serialize()));restored.observe(save([],350),12000);assert.equal(restored.snapshot().stats.hatched,350);s.stats.hatched=1;assert.equal(ledger.snapshot().stats.hatched,350);
});
test('missing native counters establish their own baseline before recording later increases',()=>{
 const initial=save([egg('s',true)]);delete initial.stats.hatched;const ledger=ready(initial);let s=ledger.observe(save([egg('s',true)],700),2000);assert.equal(s.stats.hatched,0);s=ledger.observe(save([],701),3000);assert.equal(s.stats.shinyHatched,1);assert.equal(s.stats.hatched,1);
});
test('model build options flow through observe/reset and downgrade pending computed outcomes safely',()=>{
 const computed={uid:'counter',id:1,k:2},ledger=new NurseryLedger();ledger.observe(save([computed]),1000,{nativeBuild:'supported'});assert.equal(ledger.snapshot().current.shiny,1);
 ledger.observe(save([]),2000,{nativeBuild:'supported'});const restored=new NurseryLedger(plain(ledger.snapshot()));const s=restored.observe(save([],501),3000,{nativeBuild:'unsupported'});assert.equal(s.stats.shinyHatched,0);assert.equal(s.stats.unknownHatched,1);
 const reset=restored.reset(save([computed,egg('saved-shiny',true)]),4000,{nativeBuild:'unsupported'});assert.equal(reset.current.shiny,1);assert.equal(reset.current.unknown,1);
});
