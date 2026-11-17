const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={},confirm=false){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};let clock=Date.UTC(2026,10,16,12);
    Date.now=()=>clock;t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const id='exp-candy-s',s={trainer:{id:'resource-transactions'},money:10000,mons:[{uid:'a',id:6,level:40,xp:0}],team:['a'],road:['a'],dex:{},items:{[id]:10},stats:{itemIn:{[id]:10},itemOut:{}},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const node=(kind,extra={})=>({kind,isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],classList:{contains:()=>false},...extra});
    const buy=node('buy'),use=node('use',{querySelectorAll:()=>[{getAttribute:()=>`assets/items/${id}.png`}]}),close=node('close');
    const item=node('item',{dataset:{id},querySelector:selector=>selector==='.buy'?buy:selector==='.total'?{textContent:'200 ₽'}:null});
    const card={querySelector:()=>close,querySelectorAll:()=>[use]};
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:selector=>selector==='#shop-grid .sh-item[data-id]'?[item]:[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const e=new H.Engine(storage,{mode:'resource',resourceItem:id,resourceAction:'buy',resourceQuantity:3,spendBudget:10000,moneyReserve:0,useBudget:10,...settings});e.loadAccount(s);e.running=true;e.started=clock;e.schedule=()=>{};e.automation.begin(s);e.automation.page=()=>true;
    const clicks=[],reserved=[];
    function driver(engine){engine.driver.lastClick=0;engine.driver.click=button=>{
        clicks.push(button.kind);engine.driver.lastClick=clock;
        reserved.push(JSON.parse(storage.getItem('pokecatch-helper:v1:'+engine.account)||'{}').resume);
        if(confirm&&button.kind==='buy'){s.money-=200;s.items[id]++;s.stats.itemIn[id]++;}
        if(confirm&&button.kind==='use'){s.items[id]--;s.stats.itemOut[id]=(s.stats.itemOut[id]||0)+1;s.mons[0].xp+=100;}
        if(confirm)storage.setItem('gachamon-save-v1',JSON.stringify(s));return true;
    };}
    driver(e);
    return{s,e,id,card,clicks,reserved,storage,driver,now:()=>clock,advance:ms=>{clock+=ms;},buy:()=>e.automation.buy(s,id),use:()=>e.automation.useFromCard(s,card)};
}

test('a purchase with an unchanged game save is not repeated after the former two-second delay',t=>{
    const {e,buy,advance,clicks}=fixture(t);buy();advance(2400);buy();assert.deepEqual(clicks,['buy']);assert.equal(e.budget.spent,200);assert.match(e.status,/到账确认/);
    advance(10001);buy();assert.equal(e.running,false);assert.deepEqual(clicks,['buy']);assert.match(e.status,/避免重复采购/);assert.equal(e.budget.spent,200);
});
test('an unconfirmed ordinary candy serving reserves one use and pauses without spending another',t=>{
    const {e,use,advance,clicks}=fixture(t,{resourceAction:'use'});use();advance(1200);use();assert.deepEqual(clicks,['use']);assert.equal(e.budget.used,1);
    advance(10001);use();assert.equal(e.running,false);assert.deepEqual(clicks,['use']);assert.match(e.status,/避免重复消耗/);assert.equal(e.budget.used,1);
});
test('confirmed purchases advance exactly to the resource goal with one reservation each',t=>{
    const {s,e,id,advance,clicks}=fixture(t,{},true);for(let i=0;i<4;i++){e.automation.resource(s,Date.now());advance(1200);}
    assert.deepEqual(clicks,['buy','buy','buy']);assert.equal(s.items[id],13);assert.equal(e.budget.spent,600);assert.equal(e.running,false);assert.match(e.status,/采购目标已完成/);assert.equal(e.automation.state.resourceTx,undefined);
});
test('confirmed ordinary servings stop at the explicit quantity and preserve the remaining stock',t=>{
    const {s,e,id,use,advance,clicks}=fixture(t,{resourceAction:'use'},true);for(let i=0;i<4;i++){use();advance(1200);}
    assert.deepEqual(clicks,['use','use','use','close']);assert.equal(s.items[id],7);assert.equal(s.stats.itemOut[id],3);assert.equal(e.budget.used,3);assert.equal(e.automation.state.resourceTx,undefined);e.stop();
});
test('the transaction and budget reservation are checkpointed before the native purchase',t=>{
    const {buy,reserved}=fixture(t);buy();assert.equal(reserved.length,1);assert.equal(reserved[0].flow.resourceTx.kind,'buy');assert.equal(reserved[0].budget.spent,200);
});
test('refresh continuation waits for a pending purchase instead of buying it again',t=>{
    const {s,e,buy,storage,driver,advance,clicks}=fixture(t);buy();e.release();
    const resumed=new H.Engine(storage);resumed.loadAccount(s);resumed.schedule=()=>{};driver(resumed);resumed.tryResume();resumed.automation.page=()=>true;
    assert.equal(resumed.running,true);assert.equal(resumed.budget.spent,200);advance(2400);resumed.automation.resource(s,Date.now());assert.deepEqual(clicks,['buy']);assert.match(resumed.status,/到账确认/);resumed.stop();
});
test('background UI time is excluded from the resource confirmation deadline',t=>{
    const {s,e,buy,advance,now,clicks}=fixture(t);buy();e.hiddenAt=now();advance(60000);e.resumeUIClock(now());e.automation.resource(s,now());assert.equal(e.running,true);assert.deepEqual(clicks,['buy']);
    advance(10001);e.automation.resource(s,now());assert.equal(e.running,false);assert.match(e.status,/避免重复采购/);
});
test('an exhausted budget never creates a transaction or a native purchase',t=>{
    const {e,buy,clicks}=fixture(t,{spendBudget:0});buy();assert.equal(e.running,false);assert.deepEqual(clicks,[]);assert.equal(e.budget.spent,0);assert.equal(e.automation.state.resourceTx,undefined);
});
