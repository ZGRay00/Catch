const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const now=new Date(2026,10,18,12,5).getTime();
function state(){
    return {mons:[{id:6,uid:'lead',level:40}],team:['lead'],travel:{to:[]},dex:{},items:{},
        adv:{chapter:0,unlocked:8,layout:6,gifts:{},badges:[],node:0,nodes:[]}};
}

for(const [mode,rank] of [['money',H.moneyRanking],['train',H.xpRanking]]){
    test(mode+' shares ranking work across autosaves and observes an in-place sample or level change',()=>{
        const s=state(),cfg=H.normalizeSettings({mode}),metrics={};
        const first=rank(s,cfg,metrics,{},now)[0];
        const saved=structuredClone(s);
        saved.money=123;saved.mons[0].xp=200;
        assert.equal(rank(saved,cfg,metrics,{},now+50)[0],first);
        const metric=metrics[H.metricsKey(saved,first,cfg,now)]={net:900,xp:900,seconds:60,xpSeconds:60,runs:2,xpRuns:2};
        const read=()=>rank(saved,cfg,metrics,{},now).find(row=>row.key===first.key);
        assert.equal(read().rate,900);
        metric.net=metric.xp=1400;assert.equal(read().rate,1400);
        const before=read();saved.mons[0].level++;
        assert.notEqual(read(),before);
        const cooldown={[first.key]:now+75};
        assert.ok(!rank(saved,cfg,metrics,cooldown,now).some(row=>row.key===first.key));
        assert.ok(rank(saved,cfg,metrics,cooldown,now+75).some(row=>row.key===first.key));
    });
}

for(const [mode,rank] of [['dex',H.dexRanking],['shiny',H.shinyRanking]]){
    test(mode+' reuses a route through unrelated battles and drops newly caught targets',()=>{
        const s=state(),cfg=H.normalizeSettings({mode,[mode+'Species']:[19]});
        const first=rank(s,cfg,{},now)[0];
        assert.ok(first);
        const saved=structuredClone(s);saved.adv.node++;saved.stats={wins:100};
        assert.equal(rank(saved,cfg,{},now+100)[0],first);
        const cooldown={[first.key]:now+200};
        assert.ok(!rank(saved,cfg,cooldown,now).some(row=>row.key===first.key));
        assert.equal(rank(saved,cfg,cooldown,now+200)[0],first);
        saved.dex[19]={caught:1,shiny:1};
        assert.deepEqual(rank(saved,cfg,{},now),[]);
    });
}
