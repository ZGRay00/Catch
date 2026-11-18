const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const previous=global.document,now=Date.UTC(2026,10,17,12);
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s={trainer:{id:'under-background-ui'},money:1000,mons:[6,9,3,65,68,149,19,16,10,13].map((id,i)=>({uid:'m'+i,id,level:i<6?100:30,reg:'sinnoh'})),
        team:Array.from({length:6},(_,i)=>'m'+i),road:Array.from({length:6},(_,i)=>'m'+i),dex:{},items:{},stats:{},travel:{to:['johto','hoenn','sinnoh']},
        under:{day:H.parisDay(now),sent:0,used:{},slots:[],geodes:[0,0,0,0]},
        adv:{layout:H.DATA.layout,chapter:48,unlocked:60,node:0,runs:0,speed:4,loops:[],badges:['Forêt'],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','ui-tab']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:false,autoEggs:false,autoEvolve:false,raids:false,moneyBuff:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=now;e.tabToken='ui-tab';e.schedule=()=>{};
    const row=()=>H.taskExecutionState(s,e,now).services.find(service=>service.id==='underground');
    const job=(end=now+60000)=>({id:'run',bay:0,start:now-1000,end,mons:[{uid:'u0',id:74,level:40},{uid:'u1',id:95,level:40},{uid:'u2',id:112,level:40}],team:['u0','u1','u2']});
    return{s,e,now,row,job};
}

test('automatic idle underground dispatch is enabled by default while an explicit opt-out persists',()=>{
    assert.equal(H.DEFAULTS.autoUnderDispatch,true);assert.equal(H.normalizeSettings({}).autoUnderDispatch,true);
    assert.equal(H.normalizeSettings({autoUnderDispatch:false}).autoUnderDispatch,false);
});

test('the underground card explains its Sinnoh unlock gate instead of inventing a running expedition',t=>{
    const f=fixture(t);f.s.adv.chapter=0;f.s.adv.unlocked=8;f.s.travel.to=[];
    const row=f.row();assert.equal(row.state,'waiting');assert.equal(row.stateLabel,'待神奥');assert.match(row.detail,/进入神奥后自动派遣/);assert.equal(row.nextAt,null);
});

test('Sinnoh idle members are shown as dispatch work when there is a free native slot',t=>{
    const f=fixture(t),before=JSON.stringify(f.s),row=f.row();
    assert.equal(row.state,'ready');assert.equal(row.stateLabel,'待派遣');assert.match(row.detail,/自动派遣开.*领取开.*空闲可派遣/);
    assert.equal(JSON.stringify(f.s),before,'rendering never mutates the game save');
});

test('switching off collection does not mark enabled automatic dispatch as disabled',t=>{
    const f=fixture(t,{autoUnderCollect:false}),row=f.row();assert.notEqual(row.state,'disabled');assert.equal(row.state,'ready');assert.match(row.detail,/自动派遣开.*领取关/);
});

test('existing passive travel timers remain visible when automatic dispatch is disabled',t=>{
    const f=fixture(t,{autoUnderDispatch:false});f.s.under.slots=[f.job()];const row=f.row();
    assert.equal(row.state,'timing');assert.equal(row.nextAt,f.now+60000);assert.match(row.detail,/自动派遣关.*领取开/);
});

test('switching off both underground services has an explicit disabled state without stopping native timers',t=>{
    const f=fixture(t,{autoUnderDispatch:false,autoUnderCollect:false});f.s.under.slots=[f.job()];const row=f.row();
    assert.equal(row.state,'disabled');assert.match(row.detail,/均已关闭.*原生计时保留/);assert.equal(row.nextAt,f.now+60000);
});

test('absence of spare members is described as waiting for idle members rather than an empty setup',t=>{
    const f=fixture(t);f.s.mons=f.s.mons.slice(0,6);const row=f.row();assert.equal(row.state,'waiting');assert.equal(row.stateLabel,'等空闲队员');assert.match(row.detail,/空闲|不足/);
});

test('native capacity and daily dispatch quotas show distinct waiting reasons',t=>{
    const f=fixture(t);f.s.under.slots=[f.job()];let row=f.row();assert.equal(row.state,'timing');assert.equal(row.stateLabel,'探险中');assert.match(row.detail,/派遣位已占用/);
    f.s.under.slots=[];f.s.under.sent=99;row=f.row();assert.equal(row.stateLabel,'等待次日');assert.match(row.detail,/今日派遣额度已用完/);assert.ok(row.nextAt>f.now);
});

test('dispatch and collection transactions identify their own page owner and preserve counters',t=>{
    const f=fixture(t);f.e.services.underDispatched=2;f.e.services.underClaimed=1;f.e.services.underground={action:'dispatch',started:f.now,returnScreen:'adventure'};
    let view=H.taskExecutionState(f.s,f.e,f.now),row=view.services.find(service=>service.id==='underground');
    assert.equal(row.state,'running');assert.equal(row.stateLabel,'派遣中');assert.match(row.detail,/已派 2.*已领 1/);assert.match(view.uiOwner,/自动派遣/);
    f.e.services.underground={started:f.now,returnScreen:'adventure'};view=H.taskExecutionState(f.s,f.e,f.now);row=view.services.find(service=>service.id==='underground');assert.equal(row.stateLabel,'领取中');assert.match(view.uiOwner,/归队领取/);
});

test('the standalone underground workflow keeps its own expedition controls',t=>{
    const f=fixture(t,{mode:'underground'}),row=f.row();assert.equal(row.stateLabel,'主任务管理');assert.match(row.detail,/由地下主任务管理配队、派遣和领取/);
});
