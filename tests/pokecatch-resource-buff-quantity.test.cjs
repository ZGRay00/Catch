const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(t,settings={},confirm=true){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};let clock=Date.UTC(2026,10,16,12);
    Date.now=()=>clock;t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const s={trainer:{id:'resource-buff-quantity'},money:1000,mons:[{uid:'a',id:6,level:40}],team:['a'],road:['a'],dex:{},items:{'lansat-berry':10,'pinap-berry':10,'razz-berry':10},buffs:{},stats:{itemOut:{}},travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const buttons=new Map(Object.keys(H.DATA.automation.buffs).map(id=>[id,{id,isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]}]));
    global.document={hidden:false,querySelector:selector=>buttons.get(/data-k="([^"]+)"/.exec(selector)?.[1])||null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const e=new H.Engine(storage,{mode:'resource',resourceItem:'lansat-berry',resourceAction:'use',resourceQuantity:3,useBudget:10,...settings});e.loadAccount(s);e.running=true;e.started=clock;e.schedule=()=>{};e.automation.begin(s);
    const clicked=[];e.driver.nav=()=>true;e.driver.lastClick=0;e.driver.click=button=>{
        clicked.push(button.id);e.driver.lastClick=clock;
        if(confirm){const info=H.DATA.automation.buffs[button.id],active=H.activeYieldBuff(s,info.family,clock)?s.buffs[info.family]:null;
            s.items[button.id]--;s.stats.itemOut[button.id]=(s.stats.itemOut[button.id]||0)+1;s.buffs[info.family]={key:button.id,until:(active?.key===button.id?active.until:clock)+(Number(H.DATA.automation.buffMinutes)||60)*60000,side:s.link?.side};storage.setItem('gachamon-save-v1',JSON.stringify(s));}
        return true;
    };
    return{s,e,clicked,now:()=>clock,advance:ms=>{clock+=ms;},tick:()=>{e.driver.lastClick=0;e.automation.resource(s,clock);}};
}
test('an explicit three-berry resource task stacks exactly three owned servings and then completes',t=>{
    const {s,e,clicked,tick,advance,now}=fixture(t),start=now();tick();advance(1200);tick();advance(1200);tick();advance(1200);tick();
    assert.equal(e.running,false);assert.match(e.status,/道具使用目标已完成/);assert.deepEqual(clicked,['lansat-berry','lansat-berry','lansat-berry']);assert.equal(e.budget.used,3);assert.equal(e.budget.spent,0);
    assert.equal(s.buffs.money.until,start+3*3600000);assert.equal(s.items['lansat-berry'],7);
});
test('resource stacking stops at the explicit usage budget without charging an unclicked serving',t=>{
    const {e,clicked,tick,advance}=fixture(t,{useBudget:2});tick();advance(1200);tick();advance(1200);tick();
    assert.equal(clicked.length,2);assert.equal(e.budget.used,2);assert.equal(e.running,false);assert.match(e.status,/道具使用上限/);assert.equal(e.automation.state.resourceBuffTx,undefined);
});
test('a full native eight-hour stack waits for room without opening the native cap dialog or charging',t=>{
    const {s,e,clicked,tick,advance,now}=fixture(t,{resourceQuantity:1});s.buffs.money={key:'lansat-berry',until:now()+8*3600000};const next=now()+3600000;
    tick();assert.equal(clicked.length,0);assert.equal(e.budget.used,0);assert.equal(e.running,true);assert.match(e.status,/续时上限/);assert.equal(e.nextWake,next);
    advance(3600001);tick();assert.equal(clicked.length,1);assert.equal(e.budget.used,1);
});
test('a different effective berry is preserved until expiry instead of invoking replacement confirmation',t=>{
    const {s,e,clicked,tick,advance,now}=fixture(t,{resourceItem:'razz-berry',resourceQuantity:1});const end=now()+3600000;s.buffs.capture={key:'golden-razz-berry',until:end};
    tick();assert.equal(clicked.length,0);assert.equal(e.budget.used,0);assert.equal(e.running,true);assert.equal(e.nextWake,end);assert.match(e.status,/保留并等待/);
    advance(3600001);tick();assert.deepEqual(clicked,['razz-berry']);assert.equal(e.budget.used,1);
});
test('an origin-side effect does not occupy the destination resource stack',t=>{
    const {s,e,clicked,tick,now}=fixture(t,{resourceQuantity:1});s.link={from:'kanto',to:'johto',side:'to'};s.buffs.money={key:'lansat-berry',until:now()+8*3600000,side:'from'};
    tick();assert.equal(clicked.length,1);assert.equal(e.budget.used,1);assert.equal(s.buffs.money.side,'to');
});
test('automatic farming still refuses to stack an active buff even though resource use supports explicit quantities',t=>{
    const {s,e,clicked,now}=fixture(t,{mode:'money'});s.buffs.money={key:'lansat-berry',until:now()+3600000};
    assert.equal(e.automation.autoBuff(s,now(),'money'),false);assert.equal(clicked.length,0);assert.equal(e.budget.used,0);e.stop();
});
test('an unconfirmed resource serving is not clicked again and fails conservatively after its deadline',t=>{
    const {e,clicked,tick,advance}=fixture(t,{},false);tick();advance(1200);tick();assert.equal(clicked.length,1);assert.equal(e.budget.used,1);assert.equal(e.running,true);
    advance(10001);tick();assert.equal(clicked.length,1);assert.equal(e.budget.used,1);assert.equal(e.running,false);assert.match(e.status,/树果使用未确认/);
});
test('resource stack checks use exported duration and capacity metadata rather than hardcoded limits',t=>{
    const duration=H.DATA.automation.buffMinutes,stack=H.DATA.automation.buffStack;t.after(()=>{if(duration===undefined)delete H.DATA.automation.buffMinutes;else H.DATA.automation.buffMinutes=duration;if(stack===undefined)delete H.DATA.automation.buffStack;else H.DATA.automation.buffStack=stack;});
    H.DATA.automation.buffMinutes=1;H.DATA.automation.buffStack=2;
    const {s,e,clicked,tick,now}=fixture(t,{resourceQuantity:1});s.buffs.money={key:'lansat-berry',until:now()+120000};tick();assert.equal(clicked.length,0);assert.equal(e.nextWake,now()+60000);assert.equal(e.budget.used,0);e.stop();
});
