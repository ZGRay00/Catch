const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const now=hour=>new Date(2026,10,16,hour,0,0).getTime();
const state=()=>({mons:[],team:[],dex:Object.fromEntries(H.DATA.mons.map(m=>[m.id,{caught:1}])),items:{},travel:{to:['johto','hoenn','sinnoh','unova']},
    adv:{chapter:51,unlocked:83,gifts:{},badges:[]}});

test('Spiritomb requires all 108 souls and night before becoming a dex route target',()=>{
    const s=state(),cfg={...H.DEFAULTS,region:'all'};delete s.dex[442];s.items.soul=1;
    const targets=hour=>H.dexRanking(s,cfg,{},now(hour)).flatMap(r=>r.targets.map(x=>x.id));
    assert.ok(!targets(12).includes(442));assert.ok(!targets(22).includes(442));
    s.items.soul=108;assert.ok(!targets(12).includes(442));assert.ok(targets(22).includes(442));
});
test('static route requirements use the active bag rather than items in the other wallet',()=>{
    const s=state(),special=H.DATA.chapters[72].special.find(x=>x.id===610);assert.equal(special.needN,5);
    s.items['axew-fang']=1;s.link={stash:{items:{'axew-fang':100}}};assert.equal(H.specialAvailable(s,special,now(12)),false);
    s.items['axew-fang']=5;assert.equal(H.specialAvailable(s,special,now(12)),true);
});
test('night-only Rotom is not planned in daylight and claimed static gifts stay excluded',()=>{
    const s=state(),special=H.DATA.chapters[49].special.find(x=>x.id===479);
    assert.equal(H.specialAvailable(s,special,now(8)),false);assert.equal(H.specialAvailable(s,special,now(20)),true);
    s.adv.gifts[special.once]=true;assert.equal(H.specialAvailable(s,special,now(20)),false);
});
test('native daytime flags allow morning while ghost registration and prerequisite gates remain enforced',()=>{
    const s=state(),special={day:true,needs:'soul',needN:2,caught:[92],after:'scope'};s.items.soul=2;
    assert.equal(H.specialAvailable(s,special,now(8)),false);s.adv.gifts.scope=true;assert.equal(H.specialAvailable(s,special,now(8)),true);
    assert.equal(H.specialAvailable(s,special,now(22)),false);delete s.dex[92];assert.equal(H.specialAvailable(s,special,now(12)),false);
});
