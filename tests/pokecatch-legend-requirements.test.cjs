const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

// Synthetic fixtures. No connection to the game or player storage.
const now = new Date(2026, 10, 21, 12).getTime();
const mon = (id, level = 100) => ({ id, level, uid: 'm' + id });
function save() {
    return { mons: [mon(6)], team: ['m6'], dex: {}, items: {}, stats: {},
        travel: { to: ['johto', 'hoenn', 'sinnoh', 'unova'] },
        adv: { chapter: 50, unlocked: 83, badges: ['Maître', 'Forêt', 'Maître Sinnoh'], gifts: {}, loops: [], node: 0 } };
}
const settings = id => H.normalizeSettings({ mode: 'dex', dexSpecies: [id], region: 'current' });

test('Therian forms follow the mirror through Landorus, its two roamers, the seal and Route 14', () => {
    const s=save(),cfg=settings(64101);
    s.adv.badges.push('Maître Unys');
    s.mons.push(mon(641));s.roam={caught:[641]};
    s.link={to:'hoenn',side:'from',stash:{mons:[mon(645)],items:{}}};
    let plan=H.legendRequirements(s,[64101,64201]);
    assert.deepEqual([...plan.roam],[642]);
    assert.equal(H.itemRanking(s,{...cfg,mode:'item',region:'all',itemId:'reveal-glass'}, {}, {}, now).length,0);
    s.mons.push(mon(642));s.roam.caught.push(642);
    assert.deepEqual(H.legendRequirements(s,[64101]).doors.get(645).team,[641,642]);
    s.zoneDoors={landorus:true};
    assert.deepEqual([...H.legendRequirements(s,[64101]).zones],[645]);
    s.mons.push(mon(645));
    plan=H.legendRequirements(s,[64101]);
    assert.deepEqual(H.prerequisiteRoutes(s,cfg,plan,now).map(r=>r.id),[83]);
    s.items['reveal-glass']=1;
    assert.deepEqual([...H.legendRequirements(s,[64101,64201,64501]).zones],[64101,64201,64501]);
});

test('multi-form Genesect uses the highest outstanding tier in either goal order', () => {
    const s=save();s.mons.push(mon(649));
    for(const ids of [[64902,64904,64903,64901],[64904,64901,64903,64902]]){
        const p=H.legendRequirements(s,ids);
        assert.equal(p.elites.get(649),4);
    }
    s.items['chill-drive']=1;
    assert.equal(H.legendRequirements(s,[64904,64902]).elites.get(649),3);
    s.elite={649:{t:3}};
    const p=H.legendRequirements(s,[64902]);
    assert.equal(p.elites.size,0);assert.match(p.notes.join(' '),/一次性/);
});

test('Gracidea uses the daytime active road party and respects manual team selection', () => {
    const s=save(),cfg=settings(49201),e=new H.Engine({},cfg);
    s.adv.chapter=49;s.mons.push(mon(492));s.road=['m6'];e.teamRetryAt=0;
    let p=H.legendRequirements(s,[49201]);
    assert.equal(H.prerequisiteRoutes(s,cfg,p,now).length,0);
    e.waitForFarm=msg=>{e.status=msg;};
    e.advanceRequirements(s,{...cfg,autoTeam:false},p,[],now);
    assert.match(e.status,/谢米.*可出战队伍/);assert.ok(!e.driver.teamTask);
    e.advanceRequirements(s,{...cfg,autoTeam:true},H.legendRequirements(s,[49201]),[],now);
    assert.ok(e.driver.teamTask.uids.includes('m492'));
    s.team=s.road=e.driver.teamTask.uids;
    const rows=H.prerequisiteRoutes(s,cfg,H.legendRequirements(s,[49201]),now);
    assert.deepEqual(rows.map(r=>[r.id,r.requiredParty]),[[49,[492]]]);
    s.items.gracidea=1;assert.deepEqual([...H.legendRequirements(s,[49201]).zones],[49201]);
});

test('nested Sinnoh dex can gather souls for Spiritomb and resume with the original goal', () => {
    const s=save(),cfg=settings(492);
    for(let id=1;id<=493;id++)s.dex[id]={caught:1};
    delete s.dex[442];delete s.dex[492];
    const p=H.legendRequirements(s,[492]);
    const rows=H.prerequisiteRoutes(s,cfg,p,now);
    assert.ok(rows.length&&rows.every(r=>r.reg==='sinnoh'&&r.gateRoute&&r.prepNote.includes('灵魂')));
    s.dex[442]={caught:1};
    assert.deepEqual([...H.legendRequirements(s,[492]).zones],[492]);
});

test('Kanto tower spirit grants Cubone once and is never a catchable static Marowak', () => {
    const s=save();s.adv.gifts['silph-scope']=true;
    assert.ok(!H.acquisitionSources(s,105,now).some(r=>r.kind==='static'&&r.chapter===4));
    const gift=()=>H.acquisitionSources(s,104,now).find(r=>r.chapter===4&&r.kind==='gift');
    assert.ok(gift().available);
    s.adv.gifts['cubone-fuji']=true;assert.ok(!gift().available);
    assert.match(H.legendRequirements(s,[386]).notes.join(''),/40 层.*1,000 BP/);
});

test('nested gates also expand for the other regions and independent forms', () => {
    const s=save();
    const ray=H.legendRequirements(s,[384]);
    assert.ok(ray.lines.some(l=>l.id===382&&l.kind==='types')&&ray.lines.some(l=>l.id===383&&l.kind==='types'));
    const giants=H.legendRequirements(s,[486]);
    assert.deepEqual(new Set(giants.lines.filter(l=>l.kind==='door').map(l=>l.id)),new Set([486,377,378,379]));
    const kyurem=H.legendRequirements(s,[64601,64602]);
    assert.deepEqual([...kyurem.items].sort(),['dark-stone','light-stone']);
    assert.deepEqual([...kyurem.elites.keys()].sort(),[643,644]);
    const melody=H.legendRequirements(s,[64801]);
    for(const id of [648,494,647,638,639,640])assert.ok(melody.lines.some(l=>l.id===id),'missing '+id);
    s.mons.push(mon(648));assert.deepEqual([...H.legendRequirements(s,[64801]).zones],[64801]);
});

test('Mew counts 150 exact Kanto entries including evolved species and other legendaries', () => {
    const s = save();
    for (let id = 1; id <= 150; id++) s.dex[id] = { caught: 1 };
    delete s.dex[3];
    assert.deepEqual(H.legendRequirements(s, [151]).lines[0].missing, [3]);
    assert.equal(H.legendRequirements(s, [151]).lines[0].have, 149);
    delete s.dex[150];
    const p = H.legendRequirements(s, [151, 151]);
    assert.deepEqual([...p.zones], [150]);
    assert.deepEqual([...p.wild], [3]);
    assert.deepEqual(p.goals, [151]);
    s.dex[3] = s.dex[150] = { caught: 1 };
    assert.deepEqual([...H.legendRequirements(s, [151]).zones], [151]);
});

test('Giratina plans the lake trio, local wins, the shared orb maps and then both bosses', () => {
    const s = save(), cfg = settings(487);
    let p = H.legendRequirements(s, [487]);
    assert.ok(p.trainers.has('sinnoh') && p.roam.has(481) && p.wild.size > 75);
    assert.equal(p.items.size, 0);
    const count = H.DATA.zones.find(z => z.id === 480).gate;
    for (const id of count.ids.slice(0, 75)) s.dex[id] = { caught: 1 };
    s.stats.byReg = { sinnoh: { trainers: 999 } };
    p = H.legendRequirements(s, [487]);
    assert.ok(p.zones.has(480) && !p.zones.has(482));
    assert.ok(H.prerequisiteRoutes(s, cfg, p, now).every(r => r.reg === 'sinnoh'));
    s.stats.byReg.sinnoh.trainers++;
    assert.ok(H.legendRequirements(s, [487]).zones.has(482));
    s.mons.push(mon(481));
    s.pension = { mons: [{ mon: mon(480) }] };
    s.under = { slots: [{ mons: [mon(482)] }] };
    const maps = H.dexRanking(s, cfg, {}, now);
    assert.deepEqual(maps.map(r => r.id).sort(), [50, 57]);
    assert.ok(maps.every(r => r.gateRoute && /金刚宝珠、白玉宝珠/.test(r.prepNote)));
    s.items['adamant-orb'] = 1;
    s.link = { to: 'unova', side: 'from', stash: { items: { 'lustrous-orb': 1 } } };
    assert.deepEqual([...H.legendRequirements(s, [487]).zones], [483, 484]);
    s.mons.push(mon(483));
    s.dex[484] = { caught: 1 };
    p = H.legendRequirements(s, [487]);
    assert.deepEqual(p.lines[0].missing, [484]);
    assert.deepEqual([...p.zones], [484]);
    s.mons.push(mon(484));
    assert.deepEqual([...H.legendRequirements(s, [487]).zones], [487]);
});

// Capture and inventory changes below represent successive native saves, including a traded bird.
test('Celebi follows both Johto branches across regions and re-acquires a registered Kanto bird for Lugia', () => {
    const s=save(),e=new H.Engine({}, {mode:'legend',legendId:251});
    s.adv.badges.push('Maître Johto');
    for(let id=1;id<=250;id++)s.dex[id]={caught:1};
    for(const id of [244,249,250])delete s.dex[id];
    s.mons.push(...[144,146,243,245].map(id=>mon(id)));
    s.roam={at:{244:{ch:17,until:now+60000}},caught:[243,245]};
    let action;
    e.roaming=(state,at,cfg,sub)=>{assert.ok(sub);action=['roam',cfg.roamId];};
    e.findLegend=(state,status)=>{action=['zones',...status.ids];return true;};
    e.travel=(row,at,opt)=>{action=[opt?.zone?'zone':'route',row.id];};
    const dexPlan=()=>H.legendRequirements(s,[251]);
    assert.equal(dexPlan().lines[0].need,99);
    assert.deepEqual(dexPlan().lines[0].missing,[244,249,250]);
    assert.ok(dexPlan().zones.has(145)&&!dexPlan().zones.has(249));
    e.legend(s,now);assert.deepEqual(action,['roam',244]);
    s.mons.push(mon(244));s.dex[244]={caught:1};s.roam.caught.push(244);
    e.legend(s,now);assert.deepEqual(action,['zones',145,250]);
    s.mons.push(mon(145));e.legend(s,now);assert.deepEqual(action,['zones',249,250]);
    s.dex[250]={caught:1};e.legend(s,now);assert.deepEqual(action,['zones',249]);
    s.dex[249]={caught:1};e.legend(s,now);assert.deepEqual(action,['zone',251]);
    assert.equal(e.settings.legendId,251);assert.deepEqual([...dexPlan().zones],[251]);
});

test('Mew goes straight to a missing electric dex entry, then Zapdos, then its own island', () => {
    const s=save(),e=new H.Engine({}, {mode:'legend',legendId:151});
    for(let id=1;id<=150;id++)s.dex[id]={caught:1};
    delete s.dex[25];delete s.dex[145];
    let action;
    e.findLegend=(state,status)=>{action=['zones',...status.ids];return true;};
    e.travel=(row,at,opt)=>{action=opt?.zone?['zone',row.id]:['targets',...row.targets.map(hit=>hit.id)];};
    const plan=H.legendRequirements(s,[151]);
    assert.equal(plan.lines[0].need,150);assert.ok(plan.wild.has(25));assert.ok(!plan.zones.has(145));
    e.legend(s,now);assert.deepEqual(action,['targets',25]);
    s.dex[25]={caught:1};e.legend(s,now);assert.deepEqual(action,['zones',145]);
    s.dex[145]={caught:1};e.legend(s,now);assert.deepEqual(action,['zone',151]);
    assert.equal(e.settings.legendId,151);
});

test('origin form tracks the elite reward and returns to the requested form when acquired', () => {
    const s = save(); s.mons.push(mon(487));
    const p = H.legendRequirements(s, [48701]);
    assert.equal(p.elites.get(487), 1);
    const e = new H.Engine({}, settings(48701));
    let trip;
    e.travel = (row, at, opts) => { trip = [row.id, opts.tier]; };
    assert.equal(e.advanceRequirements(s, e.settings, p, [], now), true);
    assert.deepEqual(trip, [487, 1]);
    s.items['griseous-orb'] = 1;
    assert.deepEqual([...H.legendRequirements(s, [48701]).zones], [48701]);
});

test('the selected Giratina task advances through Mesprit, each orb and each live parent independently', () => {
    const s=save(),e=new H.Engine({}, {mode:'legend',legendId:487,legendTier:0,legends:true});
    s.roam={caught:[],at:{481:{ch:50,until:now+60000}}};
    let action;
    e.roaming=(state,at,cfg,sub)=>action=['roam',cfg.roamId,sub];
    e.findLegend=(state,status)=>{action=['zones',...status.ids];return true;};
    e.travel=(row,at,opt)=>action=[opt?.zone?'zone':'route',row.id];
    e.legend(s,now);assert.deepEqual(action,['roam',481,true]);
    s.mons.push(mon(480),mon(481),mon(482));s.roam.caught.push(481);
    s.items['lustrous-orb']=1;e.legend(s,now);assert.deepEqual(action,['zones',484]);
    s.mons.push(mon(484));e.legend(s,now);assert.equal(action[0],'route');
    assert.ok([50,57].includes(action[1]));assert.equal(e.settings.legendId,487);
    s.items['adamant-orb']=1;e.legend(s,now);assert.deepEqual(action,['zones',483]);
    s.mons.push(mon(483));e.legend(s,now);assert.deepEqual(action,['zone',487]);
});

test('subgoals obey the master-ball permission and return to the outer task', () => {
    const s = save(), cfg = settings(487); s.items['master-ball'] = 1;
    s.roam = { at: { 481: { ch: 50, until: now + 10000 } } };
    const p = H.legendRequirements(s, [487]);
    const e = new H.Engine({}, cfg);
    let pursued;
    e.roaming = (state, at, sub, prerequisite) => { pursued = [sub.roamId, prerequisite]; };
    assert.equal(e.advanceRequirements(s, cfg, p, [{ key: '50' }], now), false);
    assert.equal(pursued, undefined);
    assert.equal(e.advanceRequirements(s, { ...cfg, roamAllowMasterBall: true }, p, [], now), true);
    assert.deepEqual(pursued, [481, true]);
    assert.deepEqual(e.settings.dexSpecies, [487]);
});

test('sealed temples require their badge and party, then return to the normal boss after opening', () => {
    const s = save(), cfg = settings(378), e = new H.Engine({}, cfg);
    let trip;
    e.travel = (row, at, opts) => { trip = [row.id, opts.riddle]; };
    assert.ok(!H.legendRequirements(s,[378]).doors.size);
    s.adv.badges.push('Poing');
    e.advanceRequirements(s,cfg,H.legendRequirements(s,[378]),[],now);
    assert.deepEqual(trip,[378,true]);
    s.zoneDoors = {regice:1};
    assert.deepEqual([...H.legendRequirements(s,[378]).zones],[378]);
    s.adv.badges.push('Balance');
    assert.ok(H.legendRequirements(s,[377]).wild.has(66));
    s.mons.push(mon(66)); e.teamRetryAt=0;
    e.advanceRequirements(s,{...cfg,autoTeam:true},H.legendRequirements(s,[377]),[],now);
    assert.ok(e.driver.teamTask.uids.includes('m66'));
    assert.deepEqual(H.legendRequirements(s,[486]).lines.find(r=>r.id===486).missing,[377,378,379]);
});

test('Mew can train an owned pre-evolution, preserving manual party and evolution settings', () => {
    const s = save(), cfg = settings(151);
    for (let id = 1; id <= 150; id++) s.dex[id] = { caught: 1 };
    delete s.dex[3]; s.mons.push(mon(2, 24));
    const p = H.legendRequirements(s, [151]);
    const e = new H.Engine({}, cfg);
    e.driver.nav = () => true; e.teamRetryAt = 0;
    e.advanceRequirements(s, { ...cfg, autoTeam: false }, p, [], now);
    assert.ok(!e.driver.teamTask);
    e.advanceRequirements(s, { ...cfg, autoEvolve: false }, p, [], now);
    assert.ok(!e.driver.teamTask);
    e.advanceRequirements(s, { ...cfg, autoTeam: true, autoEvolve: true }, p, [], now);
    assert.ok(e.driver.teamTask.uids.includes('m2'));
    assert.match(e.status, /妙蛙草.*妙蛙花/);
});
