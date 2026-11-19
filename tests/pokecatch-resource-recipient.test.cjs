const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function fixture(t, {id='fire-stone', species=133, action='buyUse', quantity=1, stock=0}={}) {
    const mon={uid:'slot1', id:species, reg:'kanto', level:10}, s={
        money:10000, items:{[id]:stock}, stats:{spent:{},itemOut:{}}, team:[mon.uid], mons:[mon],
        adv:{chapter:0,unlocked:8,badges:[]}, travel:{to:[]}
    };
    const store=new Map(), engine=new H.Engine({
        getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))
    }, {mode:'resource',resourceAction:action,resourceItem:id,resourceQuantity:quantity,spendBudget:1000,moneyReserve:0});
    engine.account='local-recipient';engine.running=true;engine.persist=()=>true;
    engine.automation.begin(s);
    engine.failTask=engine.completeTask=msg=>{engine.status=msg;engine.running=false;};
    let time=Date.now();
    const button=(kind,props={})=>({kind,isConnected:true,disabled:false,closest:()=>null,getAttribute:()=>null,
        getClientRects:()=>[{}],querySelectorAll:()=>[{getAttribute:()=>'/items/'+id+'.png'}],...props});
    const slot=button('member',{dataset:{uid:mon.uid}}),close=button('close'),buy=button('buy',{textContent:'100 ₽'});
    const blocked=button('duplicate',{disabled:true,title:'已经拥有此形态'});
    const eligible=button('evolve',{disabled:!stock,title:'火之石 → 火伊布 (x0)'});
    const buttons=[blocked,eligible];
    const card={querySelector:()=>close,querySelectorAll:()=>buttons};
    const shop={dataset:{id},classList:{contains:()=>false},querySelector:q=>q==='.buy'?buy:null};
    const beforeDoc=global.document, beforeStyle=global.getComputedStyle;
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:sel=>{
        if(sel.startsWith('#team-slots'))return [slot];
        return sel==='#shop-grid .sh-item[data-id]'?[shop]:[];
    }};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{if(beforeDoc===undefined)delete global.document;else global.document=beforeDoc;
        if(beforeStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=beforeStyle;});
    t.mock.method(Date,'now',()=>time);
    const pages=[],clicks=[];
    engine.automation.page=page=>{pages.push(page);return true;};
    engine.driver.click=btn=>{clicks.push(btn.kind);engine.driver.lastClick=time;return true;};
    const tick=(modal=false)=>{time+=1200;return modal?engine.automation.useFromCard(s,card):engine.automation.resource(s,time);};
    return {engine,s,mon,buttons,eligible,clicks,pages,tick};
}

test('an incompatible or ranked recipient never triggers a buy-and-use evolution order',t=>{
    for(const [species,rank] of [[6,0],[133,1]]) {
        const f=fixture(t,{species});f.mon.rank=rank;
        f.tick();
        assert.match(f.engine.status,/形态无法使用|已升阶/);
        assert.deepEqual(f.pages,[]);assert.equal(f.engine.budget.spent,0);
    }
});

test('buy-only still purchases a requested item regardless of the current species',t=>{
    const f=fixture(t,{species:6,action:'buy'});f.tick();
    assert.deepEqual(f.clicks,['buy']);assert.equal(f.engine.budget.spent,100);
});

test('native target eligibility precedes spending and every additional unit checks the new species',t=>{
    const f=fixture(t,{quantity:2});f.tick();f.tick(true);
    assert.deepEqual(f.clicks,['member','close']);assert.equal(f.engine.budget.spent,0);
    f.tick();assert.deepEqual(f.clicks,['member','close','buy']);
    f.s.items['fire-stone']=1;f.s.stats.spent.shop=100;f.s.money-=100;f.eligible.disabled=false;
    f.tick();f.tick(true);
    assert.equal(f.clicks.at(-1),'evolve');
    f.mon.id=136;f.s.items['fire-stone']=0;f.s.stats.itemOut['fire-stone']=1;
    f.tick();
    assert.match(f.engine.status,/当前形态无法使用/);
    assert.equal(f.engine.budget.spent,100);assert.equal(f.engine.budget.used,1);
    assert.equal(f.clicks.filter(kind=>kind==='buy').length,1);
});

test('absent, disallowed and ambiguous native options block buying without a reservation',t=>{
    const f=fixture(t);f.buttons.pop();
    f.tick();f.tick(true);
    assert.equal(f.engine.running,false);assert.match(f.engine.status,/进化/);
    assert.deepEqual(f.clicks,['member']);assert.equal(f.engine.budget.spent,0);
    f.engine.running=true;f.buttons.splice(0,1,f.eligible,f.eligible);f.tick();f.tick(true);
    assert.equal(f.engine.running,false);assert.equal(f.engine.budget.spent,0);
});

test('stocked evolutions only use the one enabled matching button',t=>{
    const f=fixture(t,{stock:1});f.tick();f.tick(true);
    assert.deepEqual(f.clicks,['member','evolve']);assert.equal(f.engine.budget.spent,0);
    assert.equal(f.engine.budget.used,1);
});

test('an old queued use task cannot consume an incompatible evolution stone already in stock',t=>{
    const f=fixture(t,{action:'use',species:136,stock:2});
    f.tick();
    assert.equal(f.engine.running,false);assert.match(f.engine.status,/形态无法使用/);
    assert.deepEqual(f.clicks,[]);assert.equal(f.s.items['fire-stone'],2);
    assert.equal(f.engine.budget.used,0);assert.equal(f.engine.budget.spent,0);
});

test('a changed default recipient invalidates a preview before paying',t=>{
    const f=fixture(t);f.tick();f.tick(true);
    f.s.mons.push({...f.mon,uid:'slot2',id:6});f.s.team=['slot2'];
    f.tick();
    assert.equal(f.engine.running,false);assert.match(f.engine.status,/形态无法使用/);
    assert.deepEqual(f.clicks,['member','close']);assert.equal(f.engine.budget.spent,0);
});

test('a split regional bag cannot buy candy for a member blocked by the native bag',t=>{
    const f=fixture(t,{id:'exp-candy-s'});
    f.s.link={side:'from',to:'johto'};f.mon.reg='johto';f.tick();
    assert.deepEqual(f.clicks,[]);assert.match(f.engine.status,/背包/);
    assert.equal(f.engine.budget.spent,0);
});
