const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(){
    const wire={trainer:{id:'fixture'},dex:{},adv:{layout:H.DATA.layout,chapter:55,unlocked:55},team:['a','b'],road:['a','b'],
        mons:[{uid:'a',id:395,level:50,reg:'sinnoh'},{uid:'b',id:25,level:50,reg:'kanto'}]};
    let raw,reads=0,error;
    const e=new H.Engine({getItem:key=>{assert.equal(key,'gachamon-save-v1');reads++;if(error)throw error;return raw;}});
    const save=()=>{raw=JSON.stringify(wire);return e.read();};
    return{wire,e,save,reads:()=>reads,raw:(value)=>{raw=value;},blocked:value=>{error=value;}};
}

test('local readers publish once and reuse combat profiles across unrelated writes',()=>{
    const f=fixture(),{e,wire}=f,first=f.save(),base=e.getSnapshot();
    assert.equal(base.rebuiltProfiles,2);
    assert.equal(e.readForView(base.checkedAt),first);assert.equal(f.reads(),1);
    assert.equal(e.read(),first);assert.equal(e.getSnapshot().revision,1);
    const key=H.rosterFingerprint(first);
    wire.money=110;wire.mons[0].xp=230;wire.mons[0].hp=1;wire.mons[0].status='poison';
    const next=f.save(),meta=e.getSnapshot();
    assert.notEqual(next,first);assert.equal(meta.rebuiltProfiles,0);assert.equal(meta.combatRevision,base.combatRevision);
    assert.equal(H.rosterFingerprint(next),key);
    assert.equal(H.pokemonByUid(next).get('a').hp,1);assert.equal(H.pokemonByUid(first).get('a').hp,undefined);
    assert.equal(H.partyMons(next)[0].status,'poison');
    for(const change of [mon=>mon.level++,mon=>mon.id=394,mon=>mon.ban=['surf'],mon=>mon.damageMult=2,mon=>mon.taste={h:'atk',up:{spa:10}}]){
        const previous=e.getSnapshot();change(wire.mons[0]);f.save();
        assert.equal(e.getSnapshot().combatRevision,previous.combatRevision+1);assert.equal(e.getSnapshot().rebuiltProfiles,1);
    }
    wire.mons.reverse();f.save();assert.equal(e.getSnapshot().rebuiltProfiles,0);
    wire.mons[0].uid='c';assert.equal(H.pokemonByUid(f.save()).get('b'),undefined);
});

test('indices separate ownership, location, region and ambiguous instance identifiers',()=>{
    const {wire,e,save}=fixture();
    wire.link={to:'sinnoh',side:'to',stash:{mons:[{uid:'d',id:6,level:80,reg:'kanto'}]}};
    wire.pension={mons:[{mon:{uid:'n',id:6,level:50}}]};
    wire.under={slots:[{mons:[{uid:'u',id:25,level:50,shiny:true}]}]};
    wire.mons.push({uid:'a',id:1,level:4,reg:'sinnoh'},{uid:7,id:7,level:50,reg:'sinnoh'},
        {uid:'7',id:7,level:50,reg:'kanto'},{uid:'c:temp',id:150,level:100,reg:'sinnoh'});
    const s=save();
    assert.equal(H.pokemonByUid(s).has('a'),false);
    assert.equal(H.pokemonByUid(s).get(7).reg,'sinnoh');assert.equal(H.pokemonByUid(s).get('7').reg,'kanto');
    assert.deepEqual(H.eligibleRoster(s,'sinnoh').map(mon=>mon.uid),[7]);
    assert.deepEqual(H.rosterLocations(s).bySpecies(6).map(entry=>entry.position),['daycare','linked']);
    assert.equal(H.rosterLocations(s).byUid('u')[0].position,'expedition');assert.ok(H.shinyOwned(s,25));
    const first=e.getSnapshot();wire.under.slots=[];save();
    assert.equal(e.getSnapshot().availabilityRevision,first.availabilityRevision+1);
    assert.equal(e.getSnapshot().combatRevision,first.combatRevision);
});

test('unavailable local data invalidates pending actions without publishing a mixed snapshot',()=>{
    const f=fixture(),{e,wire}=f,s=f.save(),before=e.getSnapshot();
    e.driver.teamTask={uids:['a']};
    f.raw('{');assert.throws(()=>e.read());assert.equal(e.getSnapshot().status,'error');
    assert.equal(e.driver.teamTask,null);assert.equal(e.state,s);assert.equal(e.getSnapshot().revision,before.revision);
    f.raw(null);assert.equal(e.read(),null);assert.equal(e.getSnapshot().status,'missing');
    assert.equal(f.save(),s);
    f.blocked(new Error('blocked storage'));assert.throws(()=>e.read(),/blocked storage/);assert.equal(e.getSnapshot().status,'error');
    f.blocked(null);wire.trainer.id='another';const next=f.save();
    assert.equal(e.getSnapshot().sourceEpoch,before.sourceEpoch+1);assert.equal(e.getSnapshot().rebuiltProfiles,2);
    assert.equal(H.pokemonByUid(next).get('a').id,395);
    e.markLocalDirty();const reads=f.reads();e.readForView(e.getSnapshot().checkedAt);assert.equal(f.reads(),reads+1);
});
