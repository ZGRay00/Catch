const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');

function sinnoh(){
    return {mons:[{uid:'shay',id:492,level:100},{uid:'other',id:25,level:100}],team:['shay'],road:['other'],
        dex:{},stats:{hatched:123},items:{},pension:{eggs:[],open:{eggs:1}},travel:{to:['sinnoh']},
        adv:{chapter:49,unlocked:65,badges:['Maître Sinnoh'],gifts:{},questFrom:{'egg:490':104}}};
}

test('Gracidea needs Land Shaymin on the active road, daylight, and an unclaimed gift',()=>{
    const s=sinnoh(),source=H.ITEMS.get('gracidea').sources[0];
    const available=hour=>H.sourceAvailable(s,source,'gracidea',new Date(2026,10,21,hour).getTime());
    assert.equal(available(12),false);
    s.road=['shay'];assert.equal(available(8),true);assert.equal(available(20),false);
    s.road=[];assert.equal(available(12),true);
    s.mons[0].id=49201;assert.equal(available(12),false);
    s.mons[0].id=492;s.adv.gifts.gracidea=true;assert.equal(available(12),false);
});

test('Manaphy routes open on the twentieth quest hatch and disappear after the shared gift',()=>{
    const s=sinnoh(),settings=H.normalizeSettings({mode:'dex',dexSpecies:[490],region:'current'});
    const locations=()=>H.dexRanking(s,settings).filter(row=>row.targets.some(t=>t.id===490&&t.kind==='egg')).map(row=>row.id).sort((a,b)=>a-b);
    assert.deepEqual(locations(),[]);
    s.stats.hatched++;assert.deepEqual(locations(),[58,59,65]);
    s.adv.badges=[];assert.deepEqual(locations(),[]);
    s.adv.badges=['Maître Sinnoh'];delete s.adv.questFrom['egg:490'];assert.deepEqual(locations(),[]);
    assert.deepEqual(s.adv.questFrom,{});
    s.adv.questFrom['egg:490']=104;s.pension.eggs=[{id:25}];assert.deepEqual(locations(),[]);
    s.pension.eggs=[];s.adv.gifts['egg:490']=true;assert.deepEqual(locations(),[]);
});

test('saved elite reward targets resolve to a tier without planning a regular map',()=>{
    const s=sinnoh();
    for(const [itemId,zone,tier] of [['griseous-orb',487,1],['burn-drive',649,1],['douse-drive',649,2],['shock-drive',649,3],['chill-drive',649,4]]){
        const cfg=H.normalizeSettings({mode:'item',itemId,region:'all'});
        assert.equal(cfg.itemId,itemId);
        assert.deepEqual(H.itemRanking(s,cfg),[]);
        const e=new H.Engine({},cfg);let reason;e.stop=message=>{reason=message;};
        e.farm(s,Date.now(),'item');
        assert.ok(reason.includes(H.MONS.get(zone).name)&&reason.includes(tier+' 阶'));
    }
});
