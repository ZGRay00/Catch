const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const now=Date.UTC(2026,10,25,3);
function fixture(itemId='light-stone',chapter=69){
    const row={...H.DATA.chapters[chapter],key:String(chapter),members:[chapter]};
    const s={trainer:{id:'pickup'},mons:[{uid:'a',id:645,level:100,reg:'unova'}],team:['a'],road:['a'],items:{},travel:{to:['unova']},
        adv:{chapter,unlocked:83,badges:['Maître Unys'],loops:[chapter],gifts:{},deaths:{},runs:10,node:1,
            nodes:[{type:'item',loot:{[itemId]:.01}},{type:'wild',loot:{[itemId]:.01}},{type:'gym'}]}};
    const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},{mode:'item',itemId,autoTeam:false});
    e.running=true;e.target=row;e.visit={started:now,deaths:0};e.startItems=0;e.driver.nav=()=>true;
    let count=0;e.driver.map=(r,state,options)=>{assert.equal(r.key,row.key);assert.equal(state,s);assert.deepEqual(options,{restart:true,pickup:true});count++;return true;};
    return {s,e,row,count:()=>count};
}
test('farm restarts after the last genuine pickup, including an empty roll, and never counts a shortened loop',()=>{
    const {s,e,count}=fixture();
    s.adv.node=0;e.farm(s,now,'item');assert.equal(count(),0);
    s.adv.node=1;s.adv.battle={kind:'trainer'};e.farm(s,now+50,'item');assert.equal(count(),0);
    delete s.adv.battle;s.adv.pending={type:'item'};e.farm(s,now+100,'item');assert.equal(count(),0);
    delete s.adv.pending;e.telemetry.sample={full:true};e.farm(s,now+200,'item');assert.equal(count(),1);assert.equal(e.telemetry.sample,null);
    e.farm(s,now+300,'item');assert.equal(count(),1);
    s.adv.node=0;s.adv.nodes=[{type:'trainer'},{type:'gym'}];e.farm(s,now+400,'item');assert.equal(count(),2);
    e.farm(s,now+9000,'item');assert.equal(count(),2);assert.deepEqual(e.metrics,{});
});
test('all prerequisite items, converted phenomenon pickups and the currently selected cell survive',()=>{
    const {s,e,row}=fixture();const ids=['light-stone','dark-stone'];
    s.adv.nodes[1]={type:'item',phenom:'dust',loot:{'dark-stone':{p:.01}}};
    assert.equal(e.restartForPickups(s,row,ids,now),false);
    s.adv.node=2;assert.equal(e.restartForPickups(s,row,ids,now),true);
});
test('targeted quest finds, owned species and alternate sources keep their native conditions',()=>{
    const {s,e,row}=fixture('axew-fang',72);
    s.adv.nodes[1]={type:'item',find:{item:'axew-fang',upTo:10}};
    assert.equal(e.restartForPickups(s,row,['axew-fang'],now),false);
    s.adv.node=2;s.adv.gifts['axew-nest']=true;assert.equal(e.restartForPickups(s,row,['axew-fang'],now),false);
    const mirror=fixture('reveal-glass',83);mirror.s.mons=[];
    assert.equal(mirror.e.restartForPickups(mirror.s,mirror.row,['reveal-glass'],now),false);
    const berry=fixture('belue-berry',83);assert.equal(berry.e.restartForPickups(berry.s,berry.row,['belue-berry'],now),false);
});
test('a pickup appearing while the map is opening cancels the click; missing controls let the loop continue',()=>{
    const {s,e,row}=fixture();let calls=0;e.driver.map=()=>{calls++;return false;};
    assert.equal(e.restartForPickups(s,row,['light-stone'],now),true);
    s.adv.nodes[1]={type:'item',loot:{'light-stone':.01}};
    assert.equal(e.restartForPickups(s,row,['light-stone'],now+1000),false);assert.equal(calls,1);
    s.adv.nodes[1]={type:'wild',loot:{'light-stone':.01}};
    assert.equal(e.restartForPickups(s,row,['light-stone'],now+9000),false);assert.equal(calls,1);
    assert.equal(e.running,true);assert.deepEqual(e.cooldowns,{});
});
test('known live navigation permits the verified item route without certifying all combat models',t=>{
    t.mock.method(globalThis,'setTimeout',()=>0);
    const prior=global.window;t.after(()=>{if(prior)global.window=prior;else delete global.window;});
    global.window={BUILD:'824f567ed3'};
    const {s,e,row}=fixture();e.strictPlanning=true;
    assert.equal(e.routeRequestValid(s,{row},now),true);
    global.window.BUILD='unreviewed';assert.equal(e.routeRequestValid(s,{row},now),false);
    assert.equal(e.restartForPickups(s,row,['light-stone'],now),false);
});
