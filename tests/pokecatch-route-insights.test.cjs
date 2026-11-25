const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const now=new Date(2026,10,25,11,15).getTime();
const cfg={...H.DEFAULTS,mode:'item',speed:4};
function save(){
    return {trainer:{id:'insights'},money:100,stats:{itemIn:{}},items:{},mons:[{id:6,uid:'a',level:90,hp:99}],team:['a'],road:['a'],
        adv:{chapter:0,unlocked:5,node:0,runs:0,speed:4,gifts:{},badges:[],deaths:{}}};
}
test('casino batches, zero wins and account changes preserve settlement boundaries',()=>{
    const s=save();let r=H.observeCasino(s);
    s.casino={n:{spins:1,spent:100,won:0,balls:5,paid:30,money:150,items:{a:2,b:1}},targets:[3,5],tsize:[0,1],free:2};
    r=H.observeCasino(s,r);
    assert.deepEqual(r.last,{rounds:1,cost:100,tokens:0});
    s.casino.n={...s.casino.n,spins:4,spent:400,won:30};r=H.observeCasino(s,r);
    const text=H.casinoSummary(s,r).join(' ');
    for(const word of ['最近 3 局合计','还需命中 9 次','每购买百球已入账 3,000 ₽ · 60 件'])assert.ok(text.includes(word),text);
    assert.equal(H.observeCasino({...s,trainer:{id:'different'}},r).last,null);
    assert.equal(H.observeCasino(save(),r).last,null);
});
test('party performance counts complete dry runs and isolates conditions, parties and expenses',()=>{
    const s=save(),row=H.candidates(s,cfg,true)[0],t=new H.Telemetry();
    t.begin(s,row,cfg,now);
    function cross(at){s.adv.node++;s.adv.runs++;s.money+=100;return t.observe(s,row,cfg,now+at);}
    assert.equal(cross(20000).valid,false);
    s.mons[0].hp=0;t.observe(s,row,cfg,now+30000);s.adv.deaths[0]=1;
    assert.equal(cross(40000).valid,true);
    const condition=H.partyRunCondition(s,row,cfg,now);
    const [first]=H.partyHistory(t.metrics,condition);
    assert.deepEqual([first.runs,first.seconds,first.net,first.losses,first.down],[1,20,100,1,1]);
    assert.equal(H.partyHistory(t.metrics,H.partyRunCondition(s,row,{...cfg,speed:1},now)).length,0);
    s.mons=[{...s.mons[0],uid:'b',hp:99}];s.team=s.road=['b'];assert.equal(t.observe(s,row,cfg,now+41000),null);
    t.begin(s,row,cfg,now+42000);cross(62000);cross(82000);
    assert.deepEqual(H.partyHistory(t.metrics,condition).map(r=>r.uids),[['b'],['a']]);
    s.casino={n:{money:40}};assert.equal(cross(102000),null);
});
test('box review streams every replay and caches finished maps independently of task selection',()=>{
    const s=save(),before=JSON.stringify(s),cache=new Map(),q=H.boxMoneyRequest(s,cfg,now,cache);
    const expected=H.candidates(s,{...cfg,region:'all',mode:'money'},true).length;
    const gen=q.search(true),initial=gen.next().value;assert.equal(initial.length,expected);
    assert.ok(initial.every(r=>r.review==='等待'));
    let part;do{part=gen.next();}while(!part.done);
    const rows=part.value;assert.equal(rows.length,expected);
    assert.ok(rows.every((r,i)=>r.review==='已复核'&&r.uids[0]==='a'&&r.rate<=r.upper&&(!i||rows[i-1].rate>=r.rate)));
    assert.equal(JSON.stringify(s),before);
    s.adv.deaths[rows[0].id]=1;
    const resumed=H.boxMoneyRequest(s,cfg,now,cache).search(true).next().value;
    assert.equal(resumed.filter(r=>r.review==='等待').length,1);
    s.mons[0].ban=['ember'];
    assert.ok(H.boxMoneyRequest(s,cfg,now,cache).search(true).next().value.every(r=>r.review==='等待'));
});
test('destination review reuses the same verified team only after arrival',()=>{
    const s=save(),e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},cfg);
    s.mons.push({uid:'b',id:9,level:90,hp:100});
    e.running=e.strictPlanning=true;
    const work=[];e.queueCompute=(_,run)=>work.push(run);
    const row=H.candidates(s,cfg,true).at(-1);
    e.previewDestination(s,row,now);
    while(work.length)work.shift()();
    const proof=e.teamSearch?.result;assert.ok(proof?.verification);
    assert.equal(e.driver.teamTask,null);assert.equal(e.teamCheck,null);
    s.adv.chapter=row.id;e.target=row;e.fitTeam(s,now+1000);
    assert.equal(work.length,0);
    assert.deepEqual(e.driver.teamTask?.uids||s.team,proof.uids);
});
test('item review retains a near-identical incumbent and route cooldown names its cause',()=>{
    const s=save();
    s.mons.push({...s.mons[0],uid:'tiny-improvement',damageMult:1.00015});
    const plan=H.planAdventureTeam(s,cfg,[],{row:H.candidates(s,cfg,true)[0],objective:'route',reg:'kanto',verifyAll:true});
    assert.deepEqual(plan.uids,['a']);
    s.adv.unlocked=83;s.adv.chapter=76;s.travel={to:['johto','hoenn','sinnoh','unova']};
    const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},{...cfg,itemId:'belue-berry',region:'all'});
    const maps=H.itemRanking(s,e.settings,{}, {},now);assert.ok(maps.length>=2);
    const first=maps[0];e.cooldowns[first.key]=now+60000;e.routeLosses={[first.key]:{until:now+60000,count:3}};
    e.travel=()=>{};e.canStartRoute=()=>true;e.farm(s,now,'item');
    assert.ok(e.itemRouteDecision.text.includes(first.name));
    assert.match(e.itemRouteDecision.text,/累计失败 3 次，避开至/);
    assert.ok(e.itemRouteDecision.text.includes(maps[1].name));
});
