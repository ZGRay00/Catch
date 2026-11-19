const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

const prefix = 'pokecatch-helper:v1:';
function account(id = 'buyer', values = new Map()) {
    const state = {trainer:{id}, money:500, team:[], mons:[], dex:{}, adv:{chapter:0, layout:H.DATA.layout}};
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    storage.setItem('gachamon-save-v1', JSON.stringify(state));
    const engine = new H.Engine(storage, {spendBudget:300, dailySpendBudget:200, moneyReserve:50});
    engine.loadAccount(state);
    return {engine, state, values};
}

test('an idle purchase toggle survives refresh without erasing a resumable 5.1.2 checkpoint', () => {
    const snapshot = JSON.stringify({settings:{mode:'resource', spendBudget:100}, resume:{wanted:true, settings:{mode:'resource'}}});
    const values = new Map([[prefix+'buyer', snapshot]]);
    const {engine} = account('buyer', values);
    assert.equal(engine.settings.autoPurchase, true);
    engine.setAutoPurchase(false);
    assert.equal(values.get(prefix+'buyer'), snapshot);
    const reloaded = account('buyer', values).engine;
    assert.equal(reloaded.settings.autoPurchase, false);
    assert.equal(reloaded.taskSettings(reloaded.checkpoint.settings).autoPurchase, false);
    assert.equal(reloaded.settings.spendBudget, 100);
    assert.equal(account('second', values).engine.settings.autoPurchase, true);
});

test('loading, saving and advancing old jobs cannot override the account decision', () => {
    const {engine, state} = account();
    engine.setAutoPurchase(false);
    const profile = H.configurationProfile({
        settings:{mode:'money', autoPurchase:true, spendBudget:200},
        queue:[{settings:{mode:'resource', spendBudget:80, autoPurchase:true}}, {settings:{mode:'breed', spendBudget:90}}]
    });
    delete profile.queue[1].settings.autoPurchase;
    H.importConfigurationProfile(engine, profile);
    assert.equal(engine.settings.autoPurchase, false);
    engine.start = () => {};
    engine.startQueue();
    assert.equal(engine.settings.spendBudget, 80);
    assert.equal(engine.settings.autoPurchase, false);
    engine.read = () => state;
    engine.beginTask = () => {};
    engine.adoptManualPreparation = () => true;
    engine.completeTask('测试队列切换');
    assert.equal(engine.settings.spendBudget, 90);
    assert.equal(engine.settings.autoPurchase, false);
});

test('another tab observes a changed preference before planning or reserving a paid action', () => {
    const {engine:owner, values} = account();
    const observer = account('buyer', values).engine;
    assert.equal(observer.budget.check({money:500}, 50), null);
    owner.setAutoPurchase(false);
    assert.match(observer.budget.check({money:500}, 50), /已关闭/);
    assert.throws(() => observer.budget.charge(50), /已关闭/);
    assert.equal(observer.budget.spent, 0);
    owner.setAutoPurchase(true);
    assert.equal(observer.budget.check({money:500}, 50), null);
    values.set(prefix+'purchase:buyer', 'malformed');
    assert.throws(() => observer.budget.charge(50), /已关闭/);
});

test('only the owning stopped account can re-enable purchasing', () => {
    const {engine, values, state} = account();
    engine.running = true;
    engine.setAutoPurchase(false);
    assert.throws(() => engine.setAutoPurchase(true), /先停止/);
    engine.running = false;
    engine.suspended = {at:100};
    assert.throws(() => engine.setAutoPurchase(true), /先停止/);
    engine.suspended = null;
    values.set(prefix+'lease:buyer', JSON.stringify({token:'other', expires:Date.now()+30000}));
    assert.throws(() => engine.setAutoPurchase(true), /标签页/);
    values.delete(prefix+'lease:buyer');
    values.set('gachamon-save-v1', JSON.stringify({...state, trainer:{id:'other'}}));
    assert.throws(() => engine.setAutoPurchase(true), /账号/);
    assert.equal(values.get(prefix+'purchase:buyer'), '0');
});

test('a failed write of a running disable command stops the local automation', () => {
    const {engine} = account();
    engine.running = true;
    engine.storage.setItem = () => { throw Error('quota'); };
    assert.throws(() => engine.setAutoPurchase(false), /保存失败/);
    assert.equal(engine.running, false);
    assert.match(engine.status, /保存失败/);
});

test('storage pressure during disable cannot leave a writable account checkpoint set to resume purchases', () => {
    for (const canRetry of [false, true]) {
        const {engine, values} = account();
        engine.running = true;
        engine.persist();
        const accountKey = prefix+'buyer', permissionKey = prefix+'purchase:buyer';
        assert.equal(JSON.parse(values.get(accountKey)).resume.wanted, true);
        const write = engine.storage.setItem;
        engine.storage.setItem = (key, val) => {
            if (key === permissionKey && (!canRetry || JSON.parse(values.get(accountKey)).resume)) throw Error('quota');
            write(key, val);
        };
        if (canRetry) assert.equal(engine.setAutoPurchase(false), true);
        else assert.throws(() => engine.setAutoPurchase(false), /保存失败/);
        assert.equal(engine.running, false);
        assert.equal(JSON.parse(values.get(accountKey)).resume, null);
        assert.equal(account('buyer', values).engine.settings.autoPurchase, false);
    }
});

test('live availability equals the largest permitted payment, including exact budget and wallet limits', () => {
    const {engine, state} = account();
    const b = engine.budget;
    engine.running = true;
    b.charge(70);
    for (const [money, dailySpendBudget, spendBudget, expected] of [
        [500,200,300,130], [100,200,300,50], [240,0,100,30], [50,200,100,0], [240,70,300,0]
    ]) {
        state.money = money;
        Object.assign(engine.settings, {dailySpendBudget, spendBudget});
        const info = b.purchaseSummary(state);
        assert.equal(info.available, expected);
        assert.equal(info.sessionLeft, Math.max(0, spendBudget-70));
        assert.equal(info.dailyLeft, dailySpendBudget ? dailySpendBudget-70 : null);
        if (expected) assert.equal(b.check(state, expected), null);
        assert.ok(b.check(state, expected+1));
    }
    engine.settings.dailySpendBudget = 0;
    engine.settings.spendBudget = 100;
    engine.running = false;
    assert.equal(b.purchaseSummary(state).available, 100);
    engine.suspended = {at:1};
    assert.equal(b.purchaseSummary(state).available, 30);
});

test('an unknown wallet or damaged daily ledger never displays positive spendable funds', () => {
    const {engine, state, values} = account();
    const b = engine.budget;
    assert.equal(b.purchaseSummary({...state, money:null}).available, null);
    assert.equal(b.purchaseSummary({...state, trainer:{id:'unknown'}}).available, null);
    values.set(b.dayKey(), '{}');
    assert.match(b.purchaseSummary(state).reason, /每日消费记录/);
    assert.equal(b.purchaseSummary(state).available, null);
    engine.setAutoPurchase(false);
    assert.equal(b.purchaseSummary(state).available, 0);
});

function purchasingTabs(t) {
    const doc=global.document;
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(doc===undefined)delete global.document;else global.document=doc;});
    const {engine:owner,state,values}=account();
    owner.storage.setItem('pokecatch-tab','native-test-tab');
    owner.tabToken='native-test-tab';
    owner.settings.mode='resource';
    owner.settings.resourceAction='buy';
    owner.automation.begin(state);
    owner.running=true;
    owner.started=Date.now();
    assert.equal(owner.acquire(Date.now()),true);
    owner.persist();
    const waiting=new H.Engine(owner.storage);
    waiting.loadAccount(state);
    waiting.schedule=owner.schedule=()=>{};
    return {owner,waiting,values};
}

test('a waiting tab cannot buy again after the owner completes and stops the purchase task', t=>{
    const {owner,waiting,values}=purchasingTabs(t);
    waiting.tryResume();
    assert.equal(waiting.running,false);
    assert.ok(waiting.checkpoint);
    owner.automation.state.resourcePurchased=1;
    owner.stop('采购已完成');
    const finished=values.get(prefix+'buyer');
    waiting.tryResume();
    assert.equal(waiting.running,false);
    assert.equal(waiting.checkpoint,null);
    assert.equal(values.get(prefix+'buyer'),finished);
});

test('lease handover restores the latest pending order and its charged budget before another purchase', t=>{
    const {owner,waiting}=purchasingTabs(t);
    waiting.tryResume();
    const tx={kind:'buy',id:'exp-candy-s',cost:50,stock:0,at:Date.now()};
    owner.automation.state.resourceTx=tx;
    owner.budget.charge(50);
    owner.queue=H.normalizeJobs([{settings:owner.settings,title:'采购',status:'running'}]);
    owner.queueRunning=true;
    owner.suspend();
    assert.equal(waiting.checkpoint.flow.resourceTx,undefined);
    waiting.tryResume();
    assert.equal(waiting.running,true,waiting.status);
    assert.deepEqual(waiting.automation.state.resourceTx,tx);
    assert.equal(waiting.budget.spent,50);
    assert.equal(waiting.queueRunning,true);
    assert.equal(waiting.queue[0].title,'采购');
    waiting.stop();
});

test('a cached purchase tab stays stopped when the same native tab token belongs to a completed task', t=>{
    const {owner,waiting,values}=purchasingTabs(t);
    owner.suspend();
    waiting.tryResume();
    assert.equal(waiting.running,true,waiting.status);
    waiting.automation.state.resourcePurchased=1;
    waiting.stop('采购已完成');
    const finished=values.get(prefix+'buyer');
    assert.equal(owner.resumeSuspended(),false);
    assert.equal(owner.suspended,null);
    assert.equal(owner.checkpoint,null);
    assert.equal(values.get(prefix+'buyer'),finished);
});

test('the stopped order is visible to a waiting tab at the instant its owner releases the lease', t=>{
    const {owner,waiting}=purchasingTabs(t);
    const release=owner.release.bind(owner);
    owner.release=()=>{
        release();
        waiting.tryResume();
    };
    owner.stop('停止采购');
    assert.equal(waiting.running,false);
    assert.equal(waiting.checkpoint,null);
});
