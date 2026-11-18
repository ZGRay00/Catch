const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function sinnoh(chapter) {
    return {mons:[], dex:{}, items:{}, travel:{to:['johto','hoenn','sinnoh']},
        adv:{chapter, unlocked:chapter, node:0, nodes:[], gifts:{}, badges:[]}};
}

test('weather, seasonal and daily encounter species are selectable shiny targets', () => {
    for(const table of H.WEATHER_DATA.tables)for(const [id] of table)assert.ok(H.WILD_SHINY_IDS.has(id));
    for(const id of [413,41201,41301,41202,41302,424,594])assert.ok(H.WILD_SHINY_IDS.has(id));
    assert.equal(H.WILD_SHINY_IDS.has(636),false);
});

test('daily Honey Tree sources remain discoverable between rotations and become routable on the active day', () => {
    const s = sinnoh(52), settings = {...H.DEFAULTS, mode:'shiny', shinyId:424};
    const off = Date.UTC(2026,10,11,12), on = Date.UTC(2026,10,18,12);
    const habitat = now => H.acquisitionSources(s,424,now).find(row=>row.kind==='wild' && row.chapter===52);
    assert.ok(H.hasWildSource(s,settings,424));
    assert.equal(habitat(off).available,false);
    assert.match(habitat(off).detail,/涂蜜树/);
    assert.equal(H.shinyRanking(s,settings,{},off).length,0);
    assert.equal(habitat(on).available,true);
    assert.equal(H.shinyRanking(s,settings,{},on)[0].id,52);
    assert.equal(H.hasWildSource(sinnoh(48),settings,424),false);
});

test('a chapter lists its daily Feebas site before today’s rotation reaches it', () => {
    const s = sinnoh(35);
    const at = Date.UTC(2026,10,18,12);
    const known = H.acquisitionSources(s,349,at).filter(row=>row.kind==='wild'&&[34,35].includes(row.chapter));
    assert.deepEqual(new Set(known.map(row=>row.chapter)),new Set([34,35]));
    for(const row of known)assert.match(row.detail,/每日轮换/);
});

test('dex verifies a chosen item or branch without enabling automatic item use or branching', () => {
    const s = sinnoh(52), now = new Date(2026,10,18,12).getTime();
    const eevee = {uid:'eevee',id:133,reg:'sinnoh',level:30};
    s.mons.push(eevee);
    const source = (id,at=now)=>H.acquisitionSources(s,id,at).find(row=>row.kind==='evolution');
    assert.match(source(134).detail,/缺少水之石/);
    s.items['water-stone']=1;
    assert.equal(source(134).available,true);
    assert.match(source(134).detail,/可手动/);
    assert.equal(H.levelEvolution(s,eevee,{now}),null);
    s.items['soothe-bell']=1;
    assert.equal(source(196).available,true);
    assert.equal(source(197).available,false);
    assert.match(source(197).detail,/需要夜间/);
    assert.equal(source(197,new Date(2026,10,18,23).getTime()).available,true);
    s.mons.push({uid:'burmy',id:412,reg:'sinnoh',level:20});
    assert.equal(source(413).available,true);
    assert.equal(source(414).available,false);
    assert.equal(H.levelEvolution(s,s.mons[1],{now}),null);
});

test('trade evolution is described as an exchange even with a link cable in the bag', () => {
    const s=sinnoh(52);
    s.mons.push({uid:'haunter',id:93,level:42,reg:'sinnoh'});
    s.items['link-cable']=1;
    const row=H.acquisitionSources(s,94).find(r=>r.kind==='evolution');
    assert.equal(row.available,false);
    assert.match(row.detail,/交换进化/);
    assert.ok(!row.detail.includes('link-cable'));
});
