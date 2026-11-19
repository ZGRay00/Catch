const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

// The current native Johto/Sinnoh coin shop has two layouts: a quantity selector
// with a total for candy and a single price on the button for evolution items.
function fixture(t, {id = 'exp-candy-s', quantity = '1', action = 'buy', uses = 20} = {}) {
    const s = {money:10300, items:{}, stats:{spent:{}}, mons:[{uid:'a',id:6,level:2}], team:['a'], adv:{chapter:0,unlocked:0}};
    const data = new Map();
    const storage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
    const e = new H.Engine(storage, {mode:'resource',resourceItem:id,resourceQuantity:1,resourceAction:action,
        spendBudget:10000000,moneyReserve:10000,dailySpendBudget:0,useBudget:uses});
    e.account='simulated-shop';e.running=true;e.automation.begin(s);e.automation.page=()=>true;
    e.persist=()=>{};e.completeTask=text=>{e.status=text;e.running=false;};e.failTask=e.completeTask;
    let time=Date.UTC(2026,10,19,4), selected=quantity, unit=200, singleVisible=true, inconsistent=false, loaded=true;
    const frame=()=>({isConnected:true,hidden:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]});
    const node=(extra={})=>({...frame(),classList:{contains:()=>false},...extra});
    const buttons = {buy:node(),one:node({dataset:{n:'1'},classList:{contains:key=>key==='on'&&selected==='1'}})};
    const actualQuantity=()=>selected==='max'?Math.max(1,Math.floor(s.money/unit)):Number(selected)||1;
    const item=node({dataset:{id},querySelector(selector) {
        if(selector==='.buy'){
            buttons.buy.disabled=s.money<unit*actualQuantity();buttons.buy.textContent=quantity==null?unit+' ₽':'购买';return buttons.buy;
        }
        if(quantity==null)return null;
        if(selector==='[data-n="1"]')return singleVisible?buttons.one:null;
        if(selector==='[data-n].on')return selected==null?null:{dataset:{n:selected}};
        if(selector==='.total')return {textContent:unit*actualQuantity()+' ₽'};
        if(selector==='.unit')return {textContent:(selected==='max'?'×'+actualQuantity()+' · ':'')+(inconsistent?unit+1:unit)+' ₽ /份'};
        return null;
    }});
    const previousDoc=global.document, previousStyle=global.getComputedStyle;
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:sel=>loaded&&sel==='#shop-grid .sh-item[data-id]'?[item]:[]};
    global.getComputedStyle=()=>({display:'block',opacity:'1',visibility:'visible'});
    t.after(()=>{if(previousDoc===undefined)delete global.document;else global.document=previousDoc;
        if(previousStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=previousStyle;});
    t.mock.method(Date,'now',()=>time);
    const calls=[];
    e.driver.click=button=>{
        e.driver.lastClick=time;
        if(button===buttons.one){selected='1';calls.push('one');return true;}
        assert.equal(button,buttons.buy);calls.push('buy');return true;
    };
    return {e,s,id,calls,step:()=>{time+=1200;e.automation.resource(s,time);},
        noOne:()=>{singleVisible=false;},mismatch:()=>{inconsistent=true;},setLoaded:value=>{loaded=value;}};
}
for (const quantity of ['100','max']) {
    test('coin order switches native '+quantity+' to one before reserving and verifying payment',t=>{
        const {e,s,id,calls,step}=fixture(t,{quantity});
        step();assert.deepEqual(calls,['one']);assert.equal(e.budget.spent,0);
        step();assert.deepEqual(calls,['one','buy']);assert.equal(e.budget.spent,200);
        s.stats.spent.candy=200;s.money+=500;step(); // adventure earned cash while waiting for the item
        assert.equal(e.running,true);assert.equal(e.automation.state.resourcePurchased,0);
        s.items[id]=1;step();
        assert.deepEqual(calls,['one','buy']);assert.equal(e.automation.state.resourcePurchased,1);
        assert.equal(e.running,false);assert.equal(e.budget.used,0);
    });
}
test('fixed-price evolution item confirms through the shop ledger and only the purchased item',t=>{
    const {e,s,id,calls,step}=fixture(t,{id:'fire-stone',quantity:null});
    step();s.stats.spent.shop=200;s.items['water-stone']=1;step();
    assert.equal(e.automation.state.resourcePurchased,0);s.items[id]=1;step();
    assert.deepEqual(calls,['buy']);assert.equal(e.running,false);assert.equal(e.automation.state.resourcePurchased,1);
});
test('a shop navigation whose cards mount later can still perform the single authorized order',t=>{
    const f=fixture(t);f.setLoaded(false);f.step();f.step();
    assert.equal(f.e.running,true);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.spent,0);
    f.setLoaded(true);f.step();
    assert.deepEqual(f.calls,['buy']);assert.equal(f.e.budget.spent,200);
});
test('a shop that stays empty stops without reserving money',t=>{
    const f=fixture(t);f.setLoaded(false);
    for(let i=0;i<12;i++)f.step();
    assert.equal(f.e.running,false);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.spent,0);
});
test('missing single selector blocks the order without a reservation',t=>{
    const f=fixture(t,{quantity:'1'});f.noOne();f.step();
    assert.equal(f.e.running,false);assert.equal(f.e.budget.spent,0);assert.deepEqual(f.calls,[]);
});
test('contradictory native unit and total leave both wallet and budget intact',t=>{
    const f=fixture(t);f.mismatch();f.step();
    assert.equal(f.e.running,false);assert.equal(f.e.budget.spent,0);assert.deepEqual(f.calls,[]);
});
test('a disabled native shop button surfaces the limiting balance and never reserves the quoted price',t=>{
    const f=fixture(t);f.s.money=150;f.step();
    assert.equal(f.e.running,false);assert.match(f.e.status,/保留额/);
    assert.equal(f.e.budget.spent,0);assert.deepEqual(f.calls,[]);
});
test('buy-and-use with no stock and no remaining uses cannot purchase',t=>{
    const f=fixture(t,{action:'buyUse',uses:0});f.step();
    assert.equal(f.e.running,false);assert.equal(f.e.budget.spent,0);assert.deepEqual(f.calls,[]);
});
test('buy-and-use cannot pay for a missing target or a candy for a capped member',t=>{
    const f=fixture(t,{action:'buyUse'});f.e.settings.useUid='gone';f.step();
    assert.equal(f.e.running,false);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.spent,0);
    f.e.running=true;f.e.settings.useUid='a';f.s.mons[0].level=H.trainingCap(f.s,f.s.mons[0]);f.step();
    assert.equal(f.e.running,false);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.spent,0);
});
test('a purchase-only order can buy candy without an eligible recipient',t=>{
    const f=fixture(t,{action:'buy'});f.s.mons=[];f.s.team=[];f.step();
    assert.deepEqual(f.calls,['buy']);assert.equal(f.e.budget.spent,200);
});
test('a confirmed stock-only serving ends buy-and-use even without native usage statistics',t=>{
    const f=fixture(t,{action:'buyUse'});
    f.s.items[f.id]=1;
    f.e.automation.state.resourceTx={kind:'use',id:f.id,stock:1,out:0,at:Date.now()};
    f.s.items[f.id]=0;f.step();
    assert.equal(f.e.automation.state.resourceUsed,1);assert.equal(f.e.running,false);assert.deepEqual(f.calls,[]);
});
test('unrelated usage before the first target action does not advance a new resource job',t=>{
    const f=fixture(t,{action:'buyUse'});f.s.stats.itemOut={[f.id]:9};f.step();
    assert.equal(f.e.automation.state.resourceUsed,0);assert.deepEqual(f.calls,['buy']);
});

for (const action of ['buy', 'buyUse']) {
    test(action + ' with no stock and automatic purchasing off stops before entering the shop', t => {
        const f = fixture(t, {action});
        f.e.settings.autoPurchase = false;
        f.e.automation.page = screen => assert.fail('unexpected page ' + screen);
        f.step();
        assert.equal(f.e.running, false);
        assert.match(f.e.status, /自动购买已关闭/);
        assert.equal(f.e.budget.spent, 0);
        assert.deepEqual(f.calls, []);
    });
}

test('buy-and-use still uses stock, then stops at the first missing unit when purchasing is off', t => {
    const f = fixture(t, {action:'buyUse'}), pages = [];
    f.e.settings.autoPurchase = false;
    f.e.settings.resourceQuantity = 2;
    f.s.items[f.id] = 1;
    f.e.automation.page = screen => {pages.push(screen);return false;};
    f.step();
    assert.deepEqual(pages, ['team']);
    f.e.automation.state.resourceTx = {kind:'use', id:f.id, stock:1, out:0, at:Date.now()};
    f.s.items[f.id] = 0;
    f.step();
    assert.equal(f.e.automation.state.resourceUsed, 1);
    assert.match(f.e.status, /自动购买已关闭/);
    assert.deepEqual(pages, ['team']);
    assert.deepEqual(f.calls, []);
});

test('turning off purchasing after dispatch still confirms the receipt, then blocks the next unit', t => {
    const f = fixture(t);
    f.e.settings.resourceQuantity = 2;
    f.step();
    f.e.settings.autoPurchase = false;
    f.step();
    assert.equal(f.e.running, true);
    f.s.items[f.id] = 1;
    f.s.stats.spent.candy = 200;
    f.step();
    assert.equal(f.e.automation.state.resourcePurchased, 1);
    assert.equal(f.e.budget.spent, 200);
    assert.match(f.e.status, /自动购买已关闭/);
    assert.deepEqual(f.calls, ['buy']);
});
