'use strict';

// Run with Node 22+ and --expose-gc. This harness uses synthetic saves only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');

const defaultFile=path.resolve(__dirname,'../../Pokecatch自动助手.user.js');
const clock=Date.UTC(2026,10,23,4),sizeOptions=[100,1000,5000];
const probeNames=['fetch','XMLHttpRequest','WebSocket','EventSource','GM_xmlhttpRequest','navigator.sendBeacon','GM_openInTab','window.open','Image','Worker','SharedWorker','ServiceWorker','Game.save','Game.sync','Game.cloudSave','Game.login','lowerGame.sync','lowerGame.cloudSave','lowerGame.login','cloudSync'];

function probes(counts){
    const deny=name=>function(){counts[name]=(counts[name]||0)+1;throw Error('Offline probe intercepted '+name);};
    return {
        fetch:deny('fetch'),XMLHttpRequest:deny('XMLHttpRequest'),WebSocket:deny('WebSocket'),EventSource:deny('EventSource'),
        GM_xmlhttpRequest:deny('GM_xmlhttpRequest'),GM_openInTab:deny('GM_openInTab'),Image:deny('Image'),Worker:deny('Worker'),SharedWorker:deny('SharedWorker'),ServiceWorker:deny('ServiceWorker'),
        navigator:{sendBeacon:deny('navigator.sendBeacon'),serviceWorker:{register:deny('ServiceWorker')}},window:{open:deny('window.open')},
        Game:{save:deny('Game.save'),sync:deny('Game.sync'),cloudSave:deny('Game.cloudSave'),login:deny('Game.login')},
        game:{sync:deny('lowerGame.sync'),cloudSave:deny('lowerGame.cloudSave'),login:deny('lowerGame.login')},cloudSync:deny('cloudSync'),
    };
}

function loadModel(file){
    const source=fs.readFileSync(file,'utf8'),sha256=createHash('sha256').update(source).digest('hex');
    const hook='        module.exports = { DATA';
    assert.ok(source.includes(hook),'generated userscript has Node export marker');
    const counts=Object.fromEntries(probeNames.map(name=>[name,0]));
    const counters={decodes:0,matchups:0,stats:0};
    const instrument=(code,name,counter)=>{
        const re=new RegExp('function '+name+'\\([^\\n]*\\)\\s*\\{');
        assert.match(code,re,`benchmark hook for ${name}`);
        return code.replace(re,match=>match+`__benchCounters.${counter}++;`);
    };
    let code=source.replace(hook,'        module.exports = { adventureTeamSearch, combatShortlist, '+hook.split('{ ')[1]);
    code=instrument(code,'decodeSave','decodes');
    code=instrument(code,'matchupDetails','matchups');
    code=instrument(code,'effectiveStats','stats');
    const context=vm.createContext({module:{exports:{}},console,performance,setTimeout,clearTimeout,structuredClone,
        __benchCounters:counters,...probes(counts)}, {name:'offline PokéCatch model'});
    new vm.Script(code,{filename:file}).runInContext(context);
    return {model:context.module.exports,counters,counts,sha256};
}

function fixture(model,size){
    const legal=model.DATA.mons.filter(mon=>mon.id>0&&mon.id<650).map(mon=>mon.id);
    assert.ok(legal.length>100);
    const regions=['unova','sinnoh','kanto'],first=[609,534,567,503,625,525];
    const forms=[48701,64601,64602].filter(id=>model.MONS.has(id)),formsAt=new Map(forms.map((id,i)=>[8+i*3,id]));
    let seed=0x73bd46e1;
    function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
    const mons=Array.from({length:size},(_,i)=>({uid:'synthetic-'+i,id:first[i]??formsAt.get(i)??legal[random(legal.length)],
        level:i===1?50:i<6?72:20+random(81),reg:i<6||i%5!==4?'unova':regions[1+random(2)],xp:random(20000),
        ...(i%16===0?{rank:1,statMult:1.05}:{}),...(i%11===0?{shiny:true}:{}),
        ...(i%13===0?{ban:['protect','close-combat']}:{}),...(i%17===0?{taste:{up:{atk:2},h:'spd'}}:{}),
        ...(i%23===0?{damageMult:1.12}:{}),...(i%29===0?{hpMult:1.04}:{}),
    }));
    const team=mons.slice(0,6).map(mon=>mon.uid);
    const pension=mons.splice(20,1).map(mon=>({mon})),away=mons.splice(37,3);
    const dex=Object.fromEntries(mons.slice(0,97).map(mon=>[mon.id,{caught:1}]));
    // Use the native wire representation to measure both JSON.parse and decode.
    return {trainer:{id:'synthetic-fixture'},fmt:2,mz:{r:regions,m:mons.map(({uid,id,level,xp,reg,...rest})=>[uid,id,level,xp,regions.indexOf(reg),null,null,rest])},
        team,road:team.slice(),buddy:{uid:team[1]},pension:{mons:pension},under:{day:'2026-11-23',extra:1,next:['flooded','ancient'],
            used:Object.fromEntries(away.map(mon=>[mon.uid,true])),slots:[{bay:0,team:away.map(mon=>mon.uid),mons:away,from:25,theme:'crystal',end:clock+300000}]},
        link:{side:'to',to:'unova',from:'sinnoh',stash:{team:mons.filter(mon=>mon.reg==='sinnoh').slice(0,6).map(mon=>mon.uid),money:10000}},
        dex,money:20000,stats:{logNonce:0},adv:{layout:model.DATA.layout,chapter:83,unlocked:83,speed:4,badges:['Maître Unys'],gifts:{},deaths:{}},travel:{to:regions}};
}

function take(generator,sliceBudget=4,maxMs=Infinity){
    const started=performance.now(),chunks=[];
    let first=null,firstScored=null,final,checkpoint,progress,finished=false;
    while(!finished){
        const from=performance.now();
        do{
            const next=generator.next();
            if(next.done){finished=true;final=next.value;break;}
            if(next.value?.uids?.length){
                if(!first)first=performance.now()-started;
                if(Number.isFinite(next.value.checkpointScore)&&!firstScored)firstScored=performance.now()-started;
                checkpoint=next.value;
            }
            if(next.value?.verification)progress=next.value.verification;
        }while(performance.now()-from<sliceBudget);
        chunks.push(performance.now()-from);
        if(!finished&&performance.now()-started>=maxMs)break;
    }
    if(!finished)generator.return?.();
    return {result:final??checkpoint,total:performance.now()-started,first,firstScored,chunks,finished,progress};
}

function quantiles(samples){
    if(!samples.length)return null;
    const sorted=[...samples].sort((a,b)=>a-b),word=n=>Math.round(n*1000)/1000;
    return {p50:word(sorted[Math.ceil(sorted.length*.5)-1]),p95:word(sorted[Math.ceil(sorted.length*.95)-1]),max:word(sorted.at(-1))};
}

function bench(file,repeats=7,sizes=sizeOptions,modes=['money','train'],verifyAll=false,maxSearchMs=Infinity){
    const {model:H,counters,counts,sha256}=loadModel(file),rows=[];
    const measure=fn=>{const at=performance.now(),value=fn();return{value,ms:performance.now()-at};};
    for(const size of sizes){
        const wire=fixture(H,size),raw=JSON.stringify(wire),nextWire={...wire,stats:{logNonce:1},money:wire.money+100};
        const rawUnrelated=JSON.stringify(nextWire);
        for(const mode of modes){
            const timings={},summary={size,mode,saveBytes:Buffer.byteLength(raw),repeats};
            let finalPlan,peakHeap=0,heldHeap=[],row,record;
            const sample=(key,fn)=>{const {value,ms}=measure(fn);(timings[key]??=[]).push(ms);return value;};
            const append=(key,values)=>(timings[key]??=[]).push(...values);
            const settings=H.normalizeSettings({mode,region:'all',trainLevel:100,trainUid:'selected',trainUids:[wire.team[1]],autoTeam:true});
            const pinned=mode==='train'?[wire.team[1]]:[];
            // One full warmup per model and size; each recorded cold search resets matchup rows.
            for(let repeat=-1;repeat<repeats;repeat++){
                const n=timings;
                if(repeat===0)for(const key of Object.keys(n))delete n[key];
                let local=raw,engine=new H.Engine({getItem:key=>key==='gachamon-save-v1'?local:null},settings);
                engine.nurseryMonitor.observe=()=>{};
                H.clearTeamCache();if(global.gc)global.gc();
                const baselineHeap=process.memoryUsage().heapUsed;
                const before={...counters};
                const fresh=sample('parseDecode',()=>H.decodeSave(JSON.parse(raw)));
                row=H.DATA.chapters.find(c=>c.id===wire.adv.chapter);
                const route={...row,members:[row.id],key:String(row.loop)};
                const foes=H.chapterCombatFoes(fresh,row);
                assert.ok(foes.length,'benchmark uses stage opponent data');
                const context={row:route,foes,objective:mode,now:clock,progressive:true,lowBudget:true,verifyAll};
                const state=sample('firstRead',()=>engine.read());
                const firstSnapshot=engine.getSnapshot?.();
                const decodes=counters.decodes;
                for(let i=0;i<6;i++)assert.equal(sample('stableRead',()=>engine.read()),state);
                assert.equal(counters.decodes,decodes,'stable raw does not parse or decode again');
                sample('partyIndex',()=>H.partyMons(state,state.team));
                sample('firstFingerprint',()=>H.rosterFingerprint(state));
                for(let i=0;i<5;i++)sample('repeatedFingerprint',()=>H.rosterFingerprint(state));
                const legal=sample('eligible',()=>state.mons.filter(mon=>H.teamEligible(state,mon,row.reg)));
                const identity=mon=>H.DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`;
                sample('shortlist',()=>take(H.combatShortlist(legal,H.partyMons(state),foes,identity,true,true)));
                const cold=take(H.adventureTeamSearch(state,settings,pinned,context,true),4,maxSearchMs);
                append('coldSearch',[cold.total]);append('coldFirst',[cold.first??cold.total]);append('coldSlice',cold.chunks);
                append('coldFirstScored',[cold.firstScored??cold.total]);
                const coldCache=H.teamCacheStats(),coldCalls=counters.matchups-before.matchups,coldStats=counters.stats-before.stats;
                local=rawUnrelated;
                const changed=sample('unrelatedRead',()=>engine.read());
                const changedSnapshot=engine.getSnapshot?.();
                sample('unrelatedFingerprint',()=>H.rosterFingerprint(changed));
                const hotBefore=counters.matchups;
                const hot=take(H.adventureTeamSearch(changed,settings,pinned,context,true),4,maxSearchMs);
                append('warmSearch',[hot.total]);append('warmSlice',hot.chunks);
                if(cold.finished&&hot.finished)assert.equal(JSON.stringify(hot.result?.uids),JSON.stringify(cold.result?.uids),'wallet/log changes preserve formation');
                const hotCache=H.teamCacheStats();
                finalPlan=cold.result;
                assert.ok(finalPlan?.uids?.length&&finalPlan.uids.every(uid=>legal.some(mon=>mon.uid===uid)),'all selected members are legal');
                assert.ok(pinned.every(uid=>finalPlan.uids.includes(uid)),'fixed trainees must remain selected');
                const heap=process.memoryUsage().heapUsed-baselineHeap;
                if(repeat>=0){peakHeap=Math.max(peakHeap,heap);if(global.gc)global.gc();heldHeap.push(process.memoryUsage().heapUsed-baselineHeap);}
                const verification=finalPlan.verification||finalPlan.suggestion?.verification||cold.progress;
                if(verifyAll&&Number(H.VERSION.split('.')[0])>=7&&cold.finished){
                    assert.ok(['verified','exhaustive'].includes(verification?.status),'complete strict search returns a certificate');
                    assert.equal(verification.checked,verification.total,'certificate covers every eligible instance');
                }
                record={cold:{cache:coldCache,matchups:coldCalls,statsCalls:coldStats},
                    extraWarm:{hits:hotCache.hits-coldCache.hits,misses:hotCache.misses-coldCache.misses,matchups:counters.matchups-hotBefore},
                    profilesBuiltAtFirstRead:firstSnapshot?.rebuiltProfiles??null,
                    profilesBuiltAfterUnrelatedWrite:changedSnapshot?.rebuiltProfiles??null,
                    combatRevisionStable:firstSnapshot&&changedSnapshot?firstSnapshot.combatRevision===changedSnapshot.combatRevision:null,
                    completedCold:cold.finished,completedWarm:hot.finished,
                    verification:verification?Object.fromEntries(['status','checked','total','passes','attempts','pruned','orderPruned','reused'].map(name=>[name,verification[name]])):null};
            }
            const state=H.decodeSave(wire),route={...row,members:[row.id],key:String(row.loop)};
            const deployed={...state,team:finalPlan.uids,road:finalPlan.uids};
            const fit=H.battleRouteFit(deployed,route,finalPlan.uids,clock,settings);
            const rate=(mode==='money'?H.moneyRanking:H.xpRanking)(deployed,{...settings,autoTeam:false},{},{},clock).find(route=>route.id===row.id)?.rate;
            // Compare the same learner-only projection for legacy and new plans.
            // The old ranking output mixes XP of every growing party member.
            const targetXp=mode==='train'?pinned.reduce((sum,uid)=>{
                const mon=state.mons.find(entry=>entry.uid===uid);
                const remaining=H.candyXpGap(state,mon,Math.min(settings.trainLevel,H.trainingCap(state,mon)));
                const award=(row.xpEstimate||0)*(uid===state.buddy?.uid?1.3:1);
                return sum+Math.min(remaining??award,award);
            },0)*60/Math.max(20,row.units*2.8/(settings.speed===4?2.5:1))*fit.factor:null;
            Object.assign(summary,{timings:Object.fromEntries(Object.entries(timings).map(([name,values])=>[name,quantiles(values)])),
                longSlices:timings.coldSlice.concat(timings.warmSlice).filter(ms=>ms>50).length,peakObservedHeapMiB:Math.round(peakHeap/1048576*100)/100,
                retainedHeapDeltaMiB:quantiles(heldHeap.map(n=>n/1048576)),counts:record,quality:{party:finalPlan.uids.map(uid=>state.mons.find(mon=>mon.uid===uid).id),
                    score:finalPlan.score??finalPlan.checkpointScore??null,turns:fit.turns,deaths:fit.deaths,coverage:fit.coverage,worstTurns:fit.worstTurns,
                    estimatedRate:rate??null,selectedTraineeXpPerMinute:targetXp,provisional:!record.completedCold}});
            rows.push(summary);
        }
    }
    assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),0,'offline calculation attempted a network or sync entry point');
    return {runtime:'node',node:process.version,os:`${process.platform} ${os.release()}`,cpu:os.cpus()[0]?.model,sha256,version:H.VERSION,
        warmups:1,verifyAll,maxSearchMs:Number.isFinite(maxSearchMs)?maxSearchMs:null,scope:'synthetic packed saves; in-process 4 ms iterator slices; no DOM',networkAttempts:counts,rows};
}

module.exports={defaultFile,fixture,loadModel,take,quantiles,bench,clock,probeNames};
if(require.main===module){
    const sizes=process.env.POKECATCH_BENCH_SIZES?.split(',').map(Number)||sizeOptions;
    const modes=process.env.POKECATCH_BENCH_MODES?.split(',')||['money','train'];
    const repeats=Number(process.argv[3]||7);
    assert.ok(Number.isInteger(repeats)&&repeats>0&&sizes.every(n=>Number.isInteger(n)&&n>=45));
    const maxSearchMs=Number(process.env.POKECATCH_BENCH_MAX_SEARCH_MS||Infinity);
    assert.ok(maxSearchMs>0);
    const report=bench(path.resolve(process.argv[2]||defaultFile),repeats,sizes,modes,process.env.POKECATCH_BENCH_VERIFY==='1',maxSearchMs);
    console.log(JSON.stringify(report));
}
