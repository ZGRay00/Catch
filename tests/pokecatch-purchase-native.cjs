// Optional: node tests/pokecatch-purchase-native.cjs CACHED_PUBLIC_APP_JS
// Both the native orders and the assistant run exclusively against synthetic in-memory state.
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');
const game = require('../tools/pokecatch-native-vm.cjs')(process.argv[2]);
const cases = JSON.parse(game.run(`JSON.stringify((()=>{
    const N=__pcResearch,G=N.Game;G.load();N.Adventure.ensure();G.stopSaving();
    const result=[];
    for(const [id,tracked,expect,hasMoney] of [
        ['exp-candy-s',true,true,true],['fire-stone',true,true,true],['exp-candy-s',false,true,true],
        ['exp-candy-m',true,false,true],['exp-candy-s',true,false,false]
    ]){
        const row=N.CONFIG.SHOP.find(x=>x.id===id),cost=G.shopPrice(row),s=G.S;
        s.money=hasMoney?cost+10000:cost-1;s.stats.spent={};s.stats.itemIn={};s.items={[id]:2};s.itemSince=tracked?1:0;
        const snap=()=>structuredClone({money:s.money,stats:s.stats,items:s.items,adv:s.adv});
        const before=snap(),accepted=G.buy(row,1),after=snap();
        result.push({id,tracked,expect,accepted,cost,before,after});
    }
    return result;
})())`));
global.document={hidden:false};
global.getComputedStyle=()=>({display:'block',opacity:'1',visibility:'visible'});
const fakeButton={isConnected:true,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]};
for(const {id,tracked,expect,accepted,cost,before,after} of cases){
    assert.equal(accepted,expect);
    assert.equal(after.money,before.money-(accepted?cost:0));
    assert.equal(after.items[id]-before.items[id],accepted?1:0);
    assert.equal(after.stats.itemIn[id]||0,accepted&&tracked?1:0);
    if(!accepted)continue;
    const db=new Map(),storage={getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,v)};
    const e=new H.Engine(storage,{mode:'resource',resourceItem:id,spendBudget:1000000,moneyReserve:10000});
    e.account='isolated-native';e.running=true;e.persist=()=>{};e.automation.begin(before);
    e.driver.click=()=>true;
    assert.equal(e.automation.resourceSpend(fakeButton,before,id,'buy',cost,0,'模拟订单'),true);
    assert.equal(e.budget.spent,cost);
    assert.equal(e.automation.resourcePending({...after,items:before.items,stats:{...after.stats,itemIn:{}}}),true);
    assert.equal(e.automation.resourcePending({...after,stats:{...after.stats,spent:{}}}),true);
    assert.equal(e.automation.resourcePending({...after,money:before.money+1000}),false);
    assert.equal(e.automation.state.resourcePurchased,1);
}
console.log('PASS: 5 synthetic native shop cases cover candy, single-price stone, untracked inventory, badge locks and insufficient funds.');
