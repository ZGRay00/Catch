'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const now=Date.now();
    const s={trainer:{id:'purchase-receipts'},money:30000,items:{},stats:{spent:{},itemIn:{},itemOut:{}},
        mons:[{uid:'a',id:6,level:10,xp:0},{uid:'d',id:132,level:12},{uid:'p',id:1,level:10}],team:['a'],road:['a'],
        dex:{},pension:{open:{slots:1},mons:[],eggs:[]},travel:{to:[]},
        adv:{layout:H.DATA.layout,unlocked:3,chapter:0,node:0,badges:[],gifts:{},loops:[]}};
    const values=new Map();
    const store={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const e=new H.Engine(store,{mode:'breed',pensionExpand:true,breedId:1,spendBudget:10000000,moneyReserve:10000});
    e.loadAccount(s);e.running=true;e.started=now;e.automation.begin(s);
    const button={isConnected:true,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],textContent:'解锁 · 20,000 ₽'};
    const documentBefore=global.document,styleBefore=global.getComputedStyle;
    global.document={hidden:false,querySelector:q=>q==='#pen-res .buy button'?button:null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{
        if(documentBefore===undefined)delete global.document;else global.document=documentBefore;
        if(styleBefore===undefined)delete global.getComputedStyle;else global.getComputedStyle=styleBefore;
    });
    let clicks=0;e.driver.click=el=>{assert.equal(el,button);clicks++;return true;};
    e.automation.page=()=>true;
    return {e,s,now,clicks:()=>clicks};
}

test('breeding reserves the authorized expansion once and waits for both a new slot and its debit',t=>{
    const {e,s,now,clicks}=fixture(t);
    e.automation.breed(s,now);
    assert.equal(clicks(),1);assert.equal(e.budget.spent,20000);
    assert.equal(e.automation.state.pensionPurchase.slots,1);
    e.settings.autoPurchase=false; // A dispatched order still needs both native receipts.
    e.automation.breed(s,now+1200);assert.equal(clicks(),1);
    s.pension.open.slots=2;s.stats.spent.shop=20000;
    e.automation.breed(s,now+2400);assert.ok(e.automation.state.pensionPurchase);
    s.stats.spent.pension=20000;s.money=10000;e.automation.page=()=>false;
    e.automation.breed(s,now+3500);assert.equal(e.automation.state.pensionPurchase,undefined);
    assert.equal(clicks(),1);assert.equal(e.budget.spent,20000);
});

test('a missing expansion receipt pauses without a second charge and respects the opt-in',t=>{
    const {e,s,now,clicks}=fixture(t);
    e.settings.pensionExpand=false;e.automation.breed(s,now);
    assert.equal(clicks(),0);assert.equal(e.budget.spent,0);
    e.running=true;e.settings.pensionExpand=true;e.automation.breed(s,now+2000);
    e.automation.breed(s,now+14000);
    assert.equal(e.running,false);assert.match(e.status,/扩容未确认/);
    assert.equal(clicks(),1);assert.equal(e.budget.spent,20000);
});

test('resuming manual control waits for the same expansion without submitting another order',t=>{
    const {e,s,now,clicks}=fixture(t);
    e.automation.breed(s,now);
    const tx=e.automation.state.pensionPurchase;
    e.manual={since:now+1200,until:now+15000};
    e.manualWaitState=()=>({reason:'ready'});
    assert.equal(e.manualStep(s,now+30000),false);
    e.automation.breed(s,now+30500);
    assert.equal(e.running,true);assert.equal(e.automation.state.pensionPurchase,tx);
    assert.equal(clicks(),1);assert.equal(e.budget.spent,20000);
});

test('mainline candy purchase ignores loot and unrelated spending until its own debit arrives',t=>{
    const {e,s,now}=fixture(t),id='exp-candy-m';
    const prep={candyTx:{id,uid:'a',kind:'buy',cost:50,category:'candy',spendBefore:0,walletBefore:s.money,in:0,stock:0,at:now}};
    s.items[id]=1;s.stats.spent.shop=50;s.money-=50;
    assert.equal(e.coach.candyPending(s,prep,now+1000),true);
    s.money+=90;s.stats.spent.candy=50;
    assert.equal(e.coach.candyPending(s,prep,now+2000),false);assert.equal(prep.candyTx,undefined);
});

test('ordinary battle XP cannot acknowledge a pending candy serving without a consumption receipt',t=>{
    const {e,s,now}=fixture(t),id='exp-candy-m';
    s.items[id]=1;
    const prep={candyTx:{kind:'use',id,uid:'a',stock:1,counter:0,xp:H.experienceTotal(s,['a']),at:now}};
    s.mons[0].xp=10;
    assert.equal(e.coach.candyPending(s,prep,now+1000),true);
    s.items[id]=0;
    assert.equal(e.coach.candyPending(s,prep,now+2000),false);assert.equal(prep.candyDisabled,undefined);
});

test('breeding with paid expansion enabled cannot buy slots when the master switch is off', t => {
    const {e,s,now,clicks} = fixture(t);
    e.settings.autoPurchase = false;
    e.automation.breed(s,now);
    assert.match(e.status, /自动购买已关闭/);
    assert.equal(clicks(), 0);
    assert.equal(e.budget.spent, 0);
});

test('mainline without candy falls back without opening the shop, then uses newly available stock', t => {
    const {e,s,now} = fixture(t), prep = {targets:[{uid:'a',goal:15}]}, pages = [];
    e.settings.autoPurchase = false;
    e.driver.nav = screen => {pages.push(screen);return false;};
    assert.equal(e.coach.candy(s,prep,now), false);
    assert.equal(e.coach.candy(s,prep,now+1200), false);
    assert.deepEqual(pages, []);
    s.items['exp-candy-m'] = 1;
    assert.equal(e.coach.candy(s,prep,now+2400), true);
    assert.deepEqual(pages, ['team']);
    assert.equal(e.budget.spent, 0);
});
