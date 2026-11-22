const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

// The current native Johto/Sinnoh coin shop has two layouts: a quantity selector
// with a total for candy and a single price on the button for evolution items.
function fixture(t, {id = 'exp-candy-s', quantity = '1', action = 'buy', uses = 20} = {}) {
    const s = {money:10300, items:{}, stats:{spent:{}}, mons:[{uid:'a',id:6,level:2}], team:['a'], adv:{chapter:0,unlocked:H.DATA.automation.candies[id]?.badges||0}};
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
    const cards=[item];
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:sel=>loaded&&sel==='#shop-grid .sh-item[data-id]'?cards:[]};
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
    return {e,s,id,calls,cards,advance:()=>time+=1200,step:()=>{time+=1200;e.automation.resource(s,time);},
        noOne:()=>{singleVisible=false;},mismatch:()=>{inconsistent=true;},setLoaded:value=>{loaded=value;}};
}
function otherTier(id,locked=false){
    // Reading a price or a button on a skipped tier is itself an error.
    return {dataset:{id},classList:{contains:key=>locked&&key==='locked'},querySelector(){throw Error('Skipped tier was inspected');}};
}
function coaching(t,quantity='1'){
    const f=fixture(t,{id:'exp-candy-m',quantity});
    f.e.driver.nav=()=>true;
    f.cards.unshift(otherTier('exp-candy-s'),otherTier('exp-candy-xl',true));
    const p={targets:[{uid:'a',goal:3}]},run=()=>f.e.coach.candy(f.s,p,f.advance());
    return {...f,p,run};
}
test('coaching buys exactly one of the highest unlocked tier even with a small interim XP goal',t=>{
    const f=coaching(t,'100');f.run();assert.deepEqual(f.calls,['one']);f.run();
    assert.deepEqual(f.calls,['one','buy']);assert.equal(f.p.candyTx.id,'exp-candy-m');assert.equal(f.e.budget.spent,200);
    f.run();assert.deepEqual(f.calls,['one','buy'],'pending receipt prevents a second purchase');
});
test('a stale low-tier page cannot sell S after the third badge, and the live M offer can follow',t=>{
    const f=coaching(t),high=f.cards.pop();
    assert.equal(f.run(),true);assert.match(f.e.status,/同步/);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.spent,0);
    f.cards.push(high);f.run();assert.deepEqual(f.calls,['buy']);assert.equal(f.p.candyTx.id,'exp-candy-m');
});
test('coaching waits for the highest-tier budget even when a lower-tier card is available',t=>{
    const f=coaching(t);f.s.money=10100;f.run();
    assert.deepEqual(f.calls,[]);assert.equal(f.p.candyRetry.cost,200);assert.equal(f.e.budget.spent,0);
    f.s.money=10200;f.run();assert.equal(f.p.candyTx.id,'exp-candy-m');assert.deepEqual(f.calls,['buy']);
});
test('training continues while the shop button is unavailable and rechecks the live offer once eligible',t=>{
    const f=coaching(t),item=f.cards.at(-1),read=item.querySelector.bind(item);
    let unavailable=true,shopVisits=0;
    f.e.driver.nav=screen=>{if(screen==='shop')shopVisits++;return true;};
    item.querySelector=sel=>{const el=read(sel);if(sel==='.buy'&&unavailable)el.disabled=true;return el;};
    assert.equal(f.run(),false);
    const after=f.p.candyRetry.after;
    unavailable=false;
    assert.equal(f.e.coach.candy(f.s,f.p,after-1),false);
    f.s.money=10199;
    assert.equal(f.e.coach.candy(f.s,f.p,after),false);
    assert.equal(shopVisits,1);assert.deepEqual(f.calls,[]);
    f.s.money=10200;f.e.coach.candy(f.s,f.p,after+1);
    assert.equal(shopVisits,2);assert.deepEqual(f.calls,['buy']);assert.equal(f.e.budget.spent,200);
    assert.equal(f.p.candyReason,undefined);
});
test('a late candy receipt takes priority over the shop navigation timeout',t=>{
    const f=coaching(t);f.run();const at=f.p.candyTx.at;
    f.s.items[f.id]=1;f.s.stats.spent.candy=200;f.s.money-=200;f.s.mons[0].level=3;
    f.e.coach.candy(f.s,f.p,at+95000);
    assert.equal(f.p.candyTx,undefined);assert.equal(f.p.candyDisabled,undefined);
    assert.deepEqual(f.calls,['buy']);assert.equal(f.e.budget.spent,200);
});
test('an uncertain candy payment stays reserved and is never retried by the shop cooldown',t=>{
    const f=coaching(t);f.run();const at=f.p.candyTx.at;
    f.e.coach.candy(f.s,f.p,at+95000);f.e.coach.candy(f.s,f.p,at+190000);
    assert.match(f.p.candyReason,/未确认/);assert.equal(f.p.candyRetry,undefined);
    assert.deepEqual(f.calls,['buy']);assert.equal(f.e.budget.spent,200);
});
test('quote shortfalls distinguish task budget, regional reserve and daily ceiling',t=>{
    const f=fixture(t),b=f.e.budget,cfg=f.e.settings;
    cfg.spendBudget=199;assert.match(b.check(f.s,200),/任务.*本笔 200 ₽，还差 1 ₽/);
    cfg.spendBudget=200;f.s.money=9900;assert.match(b.check(f.s,200),/保留额.*还差 300 ₽/);
    f.s.money=10200;cfg.dailySpendBudget=100;assert.match(b.check(f.s,200),/每日.*还差 100 ₽/);
    cfg.dailySpendBudget=200;assert.equal(b.check(f.s,200),null);
    assert.equal(b.spent,0);assert.deepEqual(f.calls,[]);
});
for(const blocked of ['price','disabled','overflow']){
    test('coaching skips paid candy without downgrading on '+blocked,t=>{
        const f=coaching(t);
        if(blocked==='price')f.mismatch();
        if(blocked==='disabled'){const item=f.cards.at(-1),read=item.querySelector.bind(item);item.querySelector=sel=>{const el=read(sel);if(sel==='.buy')el.disabled=true;return el;};}
        if(blocked==='overflow'){
            const mon=f.s.mons[0],cap=H.trainingCap(f.s,mon);mon.level=cap-1;
            mon.xp=H.candyXpGap(f.s,mon,cap)-1;f.p.targets[0].goal=cap;
        }
        f.run();assert.deepEqual(f.calls,[]);assert.ok(f.p.candyDisabled);assert.equal(f.e.budget.spent,0);
    });
}
for(const action of ['buy','buyUse']){
    test(action+' stops an explicit low-tier order when another unlocked tier is higher',t=>{
        const f=fixture(t,{action});f.s.adv.unlocked=6;
        f.step();assert.deepEqual(f.calls,[]);assert.match(f.e.status,/最高档/);assert.equal(f.e.budget.spent,0);
    });
}
test('paid candy goes to another training target that can absorb it before the regional cap',t=>{
    const f=coaching(t),mon=f.s.mons[0],cap=H.trainingCap(f.s,mon);
    mon.level=cap-1;mon.xp=H.candyXpGap(f.s,mon,cap)-1;
    const other={...mon,uid:'b',xp:0};f.s.mons.push(other);
    f.p.targets=[{uid:'a',goal:cap},{uid:'b',goal:cap}];
    f.run();assert.equal(f.p.candyTx.uid,'b');assert.deepEqual(f.calls,['buy']);
    f.p.candyTx=null;f.s.items[f.id]=1;f.e.driver.nav=()=>false;
    f.run();assert.equal(f.p.candy.uid,'b');assert.deepEqual(f.calls,['buy']);
});
test('buy-and-use skips XP overflow even before the target reaches its cap',t=>{
    const f=fixture(t,{action:'buyUse'}),mon=f.s.mons[0],cap=H.trainingCap(f.s,mon);
    mon.level=cap-1;mon.xp=H.candyXpGap(f.s,mon,cap)-1;f.step();
    assert.match(f.e.status,/经验会超出/);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.spent,0);
});
test('stocked candy is rechecked at the target card before it can overflow the regional cap',t=>{
    const f=fixture(t,{action:'use'}),mon=f.s.mons[0],cap=H.trainingCap(f.s,mon);
    mon.level=cap-1;mon.xp=H.candyXpGap(f.s,mon,cap)-1;f.s.items[f.id]=1;
    assert.equal(f.e.automation.useFromCard(f.s,{}),true);
    assert.match(f.e.status,/经验会超出/);assert.deepEqual(f.calls,[]);assert.equal(f.e.budget.used,0);assert.equal(f.s.items[f.id],1);
});
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
