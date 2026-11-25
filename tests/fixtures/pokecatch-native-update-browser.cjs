'use strict';
const assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');

// Model the reviewed game's native Update.reload and title-screen behaviour on a real document reload.
// Only the native modal handler saves the simulated game and sets the marker that skips the title.
module.exports=async function verifyNativeUpdate({start,evaluate,checks,lifecycleSetup,lifecycleSource}){
    const setup=`
        const isReload=performance.getEntriesByType('navigation')[0]?.type==='reload';
        if(!isReload){${lifecycleSetup}}
        const key='pokecatch-helper:v1:startup-lifecycle',gameKey='gachamon-save-v1';
        window.nativeUpdate={
            title:!!(isReload&&!(sessionStorage.getItem('pokecatch.updated')==='1'&&JSON.parse(localStorage.getItem(gameKey)).team.length)),
            show(modalClass='up-modal'){
                const root=document.querySelector('#modal-root')||document.createElement('div');
                root.id='modal-root';root.className='open';document.body.append(root);
                root.innerHTML='<div class="modal dexcard-modal '+modalClass+'"><div class="modal-body"><div class="dc-head"><h2>发现新版本</h2></div><div class="sup-banner"></div><p class="cl-note">重新加载以更新</p></div><div class="modal-actions"><button class="btn primary">重新加载</button></div></div>';
                root.querySelector('button').onclick=()=>{
                    const persisted=JSON.parse(localStorage.getItem(key));
                    sessionStorage.setItem('fixture-update-receipt',JSON.stringify(persisted.resume));
                    sessionStorage.setItem('fixture-update-clicks',String(Number(sessionStorage.getItem('fixture-update-clicks'))+1));
                    sessionStorage.setItem('pokecatch.updated','1');
                    const game=JSON.parse(localStorage.getItem(gameKey));game.lastTick=Date.now();localStorage.setItem(gameKey,JSON.stringify(game));
                    location.reload();
                };
            }
        };
        if(!isReload){sessionStorage.removeItem('fixture-update-clicks');sessionStorage.removeItem('fixture-update-receipt');}
        if(nativeUpdate.title){const title=document.createElement('div');title.className='title-fx';document.body.append(title);}
        sessionStorage.removeItem('pokecatch.updated');
    `;
    await start('native-update',setup,true,lifecycleSource);
    const visit=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
    const origin=await visit(async()=>{
        const e=__pcStartupTest.engine;e.schedule=()=>{};
        nativeUpdate.show();
        await e.step();
        return performance.timeOrigin;
    });
    assert.equal(await evaluate('sessionStorage.getItem("fixture-update-clicks")'),null,'An idle helper leaves the native update prompt to the player');
    const initial=await visit(async()=>{
        const e=__pcStartupTest.engine;
        document.querySelector('#modal-root').remove();
        const settings={...e.settings,autoRecover:false,resumeOnReload:true,autoTeam:false,autoPrepare:false};
        e.updateQueue([{id:'previous',title:'已完成',status:'done',settings},{id:'current',title:'本轮刷钱',status:'pending',settings}]);
        e.startQueue();
        if(!e.running)throw Error(e.status);
        e.settings.resumeOnReload=false;
        nativeUpdate.show();await e.step();
        if(sessionStorage.getItem('fixture-update-clicks'))throw Error('Update clicked with resume disabled');
        e.settings.resumeOnReload=true;
        nativeUpdate.show('sup-modal');await e.step();
        if(sessionStorage.getItem('fixture-update-clicks'))throw Error('Unrelated dialog clicked');
        e.budget.spent=123;e.budget.used=2;
        nativeUpdate.show();return e.started;
    });
    // The helper handles the genuine update button; the fixture itself never asks CDP to navigate.
    await evaluate('setTimeout(()=>__pcStartupTest.engine.step(),0);true');
    let restored=false;
    for(let attempt=0;attempt<90&&!restored;attempt++){
        await delay(75);
        try{restored=await evaluate('performance.timeOrigin!=='+origin+'&&!!window.__pcStartupTest?.engine.running');}
        catch(error){if(!/context.*destroy|context.*not found/i.test(error.message))throw error;}
    }
    assert.ok(restored,'The native update reloads the page and resumes the saved task');
    const result=await visit(()=>{
        const e=__pcStartupTest.engine,receipt=JSON.parse(sessionStorage.getItem('fixture-update-receipt'));
        return{title:nativeUpdate.title,savedGame:JSON.parse(localStorage.getItem('gachamon-save-v1')).lastTick>0,
            clicks:Number(sessionStorage.getItem('fixture-update-clicks')),saved:[receipt.wanted,receipt.queueJobId,receipt.budget.spent,receipt.budget.used],
            resumed:[e.started,e.queueRunning,e.queueIndex,e.queue[e.queueIndex].id,e.budget.spent,e.budget.used]};
    });
    assert.deepEqual(result,{title:false,savedGame:true,clicks:1,saved:[true,'current',123,2],resumed:[initial,true,1,'current',123,2]});
    checks.push('the reviewed game-update prompt saves the queue and budget before its native button reloads; the restored game skips the title and continues the same job');
    await visit(async()=>{
        const e=__pcStartupTest.engine;nativeUpdate.show();await e.step();await e.step();
    });
    assert.equal(await evaluate('Number(sessionStorage.getItem("fixture-update-clicks"))'),1,'A repeated prompt cannot loop through successive page reloads');
    await evaluate('__pcStartupTest.engine.stop()');
    checks.push('idle, disabled resume, unrelated dialogs and a repeated native update do not trigger a reload');
};
