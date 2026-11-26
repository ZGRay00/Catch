// Optional differential audit. Pass a downloaded public game bundle. All saves are synthetic.
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');
const vm = require('../tools/pokecatch-native-vm.cjs')(process.argv[2]);
vm.run('let N=__pcResearch,G=N.Game,L=N.LegendZones;G.load();G.stopSaving();N.Adventure.ensure();N.UI={fmt:String}');
const read = expr => JSON.parse(vm.run('JSON.stringify('+expr+')'));
const zones = read('L.ZONES');
assert.deepEqual(zones.map(z=>z.id).sort(), H.DATA.zones.filter(z=>!z.eliteOnly).map(z=>z.id).sort());
assert.deepEqual(read('L.ROAM_ZONES.map(z=>z.id)').sort(), H.DATA.zones.filter(z=>z.eliteOnly).map(z=>z.id).sort());
const riddles = read('L.RIDDLES');
const chapters = read('N.STORY.CHAPTERS');
assert.equal(chapters.length,H.DATA.chapters.length);
let events=0, gifts=0, lootEggs=0;
for(const [i,c] of chapters.entries()){
    const map=H.DATA.chapters[i];
    for(const step of c.steps){
        if(step.gift){
            const gift=map.gifts.find(g=>g.key===step.gift.key);
            const choices=step.gift.choices||step.gift.items;
            assert.ok(choices.every(id=>gift.ids.includes(id)));
            assert.equal(gift.badge,step.badge);
            for(const [starter,variant] of Object.entries(step.byStarter||{})){
                if(variant.gift)assert.deepEqual(gift.byStarter.choices[starter],variant.gift.choices);
            }
            gifts++;
        }
        if(['static','trade','egg'].includes(step.kind)){
            const spec=map.special.find(s=>s.kind===step.kind&&JSON.stringify(s.id)===JSON.stringify(step.id)&&s.once===step.once);
            assert.ok(spec, 'Missing event in chapter '+i);
            for(const key of ['after','needs','needN','caught','night','day','skies','chance','badge','offers','spirit']){
                assert.deepEqual(spec[key],step[key],i+' '+key);
            }
            assert.equal(spec.catchRate,step.rate);
            if(step.reward)assert.deepEqual(spec.reward,{key:step.reward.key,ids:step.reward.choices});
            events++;
        }
        for(const [key,rule] of Object.entries(step.loot||{})){
            if(!key.startsWith('egg:'))continue;
            lootEggs++;
            if(key==='egg:636')continue; // Covered by pokecatch-unova-native.cjs (phenomena and Larvesta).
            const spec=map.special.find(spec=>spec.once===key);
            assert.equal(spec?.hatched,rule.eggs);assert.equal(spec?.badge,rule.badge);
        }
    }
}
for(const z of zones){
    const gate=H.DATA.zones.find(zone=>zone.id===z.id).gate;
    assert.equal(gate.kind,z.cond.kind);
    const check=(rule,native)=>{
        for(const key of ['kind','field','tier','key','item','region','zone'])assert.equal(rule[key],native[key],z.id+' '+key);
        if(native.kind==='door'){
            assert.equal(rule.badge,z.badge);
            for(const k of ['team','type','wait'])assert.deepEqual(rule[k],riddles[rule.key][k]);
        }
        if(native.list)native.list.forEach((sub,i)=>check(rule.list[i],sub));
    };
    check(gate,z.cond);
}
for(const stage of [0,1,2]){
    const ids=H.DATA.mons.map(m=>m.id).filter(id=>stage===2||stage===1&&id%3===0);
    const s={dex:Object.fromEntries(ids.map(id=>[id,{caught:1}])),mons:ids.filter(id=>stage===2||id%2===0).map(id=>({id,uid:'u'+id,level:100})),team:[],
        stats:{byReg:{sinnoh:{trainers:stage*600}}},pension:{mons:[]},items:{},elite:{},under:{slots:[]},zoneDoors:{},
        travel:{to:H.DATA.regions.map(r=>r.key)},adv:{chapter:0,unlocked:stage===2?83:stage*27,badges:[],gifts:{}}};
    if(stage===2){
        s.adv.badges=H.DATA.chapters.flatMap(c=>c.badges);
        for(const z of zones)for(const cond of z.cond.list||[z.cond]){
            if(cond.item)s.items[cond.item]=1;
            if(cond.key)s.zoneDoors[cond.key]=1;
            if(cond.zone)s.elite[cond.zone]={t:5};
        }
    }
    vm.run('Object.assign(G.S,'+JSON.stringify(s)+')');
    const rows=read('L.ZONES.map(z=>L.progress(z))');
    for(const [i,z] of zones.entries()){
        const native=rows[i],plan=H.legendRequirements(s,[z.id]);
        assert.equal(plan.zones.has(z.id),native.have>=native.need,stage+' '+z.id+' readiness');
        const lines=plan.lines.filter(l=>l.id===z.id),rules=H.DATA.zones.find(zone=>zone.id===z.id).gate;
        (native.lines||[native]).forEach((n,j)=>{
            const r=rules.list?.[j]||rules;
            if(n.ids)assert.deepEqual(r.ids,n.ids,z.id+' native species set');
            const l=lines[j];
            assert.equal(l.have>=l.need,n.have>=n.need,stage+' '+z.id+' '+r.kind);
            if(r.kind!=='elite'){assert.equal(l.have,n.have);assert.equal(l.need,n.need);}
        });
    }
}
const timed=zones.filter(z=>z.when||z.moon),hours=16*24,start=Date.UTC(2026,9,20);
const windows=read(`(()=>{let time=${start};G.now=()=>time;G.time=()=>time;N.Clock={now:()=>time,sure:true};
    G.S.adv.chapter=75;G.S.adv.unlocked=83;
    return Array.from({length:${hours}},(_,i)=>{time=${start}+i*3600000;return ${JSON.stringify(timed.map(z=>z.id))}.map(id=>L.shut(id));});})()`);
for(let i=0;i<hours;i++)for(const [j,z] of timed.entries()){
    const zone=H.DATA.zones.find(row=>row.id===z.id);
    assert.equal(!!H.legendWindowReason({adv:{chapter:75,unlocked:83}},zone,0,start+i*3600000),windows[i][j],z.id+' hour '+i);
}
console.log('Verified '+zones.length+' legend gates in 3 save states, '+hours*timed.length+' timed entrances, '+Object.keys(riddles).length+' riddles, '+chapters.length+' chapters, '+events+' fixed/egg/trade events, '+gifts+' gifts and '+lootEggs+' egg loot entries.');
