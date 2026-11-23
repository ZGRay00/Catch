'use strict';

// Run: node benchmark-box-browser.cjs [userscript] [size]
// Only the temporary fixture and loopback Chrome DevTools are loaded.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {setTimeout:delay}=require('node:timers/promises');
const {defaultFile,fixture,loadModel,quantiles,clock}=require('./benchmark-box.cjs');

const remote=url=>/^(https?|wss?|ftp):/i.test(url||'');
const inline=source=>source.replace(/<\/script/gi,'<\\/script');
const markup=body=>`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"><title>Offline Box benchmark</title><body>${body}</body></html>`;

function fixtureHtml(source,wire,size){
    const marker='    mount();';
    assert.ok(source.includes(marker));
    const script=source.replace(marker,'    window.__benchModel={engine,DATA,VERSION,normalizeSettings,rosterFingerprint,partyMons,decodeSave,adventureTeamSearch,chapterCombatFoes,moneyRanking,xpRanking,clearTeamCache,boxSnapshot}; mount();');
    return markup(`<main id="synthetic-game"><p>Offline synthetic fixture</p><nav id="tabs">
        <button data-screen="adventure">Adventure</button><button data-screen="map">Map</button><button data-screen="team">Team</button>
        </nav><section class="screen active" id="screen-adventure"><div id="speed-btns"><button data-speed="4">Speed</button></div></section>
        <section class="screen" id="screen-map" hidden><div id="map-root"><button class="mp-go" data-go="83">Go</button></div></section>
        <section class="screen" id="screen-team" hidden><div id="team-slots"><button data-uid="synthetic-0">Member</button></div></section>
        </main><script>
        window.__benchmark={attempts:{},gameActions:0,wire:${JSON.stringify(wire)},size:${size},clock:${clock}};
        const data=window.__benchmark;
        function deny(name){return function(){data.attempts[name]=(data.attempts[name]||0)+1;throw Error('Blocked '+name);};}
        window.addEventListener('securitypolicyviolation',event=>{
            if(/^(https?|wss?|ftp):/i.test(event.blockedURI))data.attempts.CSP=(data.attempts.CSP||0)+1;
        });
        for(const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','GM_xmlhttpRequest','GM_openInTab','open','Worker','SharedWorker'])window[name]=deny(name);
        navigator.sendBeacon=deny('sendBeacon');
        if('serviceWorker' in navigator)navigator.serviceWorker.register=deny('serviceWorker');
        window.Game=window.game=Object.fromEntries(['save','sync','cloudSave','login'].map(name=>[name,deny('Game.'+name)]));
        window.cloudSync=deny('cloudSync');
        const gameFixture=document.querySelector('#synthetic-game');
        for(const type of ['click','pointerdown','dragstart','drop','change'])gameFixture.addEventListener(type,()=>data.gameActions++,true);
        localStorage.setItem('gachamon-save-v1',JSON.stringify(data.wire));
        localStorage.setItem('pokecatch-tab','offline-benchmark');
        window.BUILD=${JSON.stringify(wire.fixtureBuild)};
    </script><script>${inline(script)}</script>`);
}

async function endpoint(){
    const server=net.createServer();
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const {port}=server.address();
    await new Promise(resolve=>server.close(resolve));
    return port;
}

async function connect(port,observe){
    let pages;
    for(let i=0;i<100&&!pages;i++)try{
        const value=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        pages=value.find(page=>page.type==='page');
    }catch{await delay(60);}
    assert.ok(pages,'Chrome CDP page started');
    const socket=new WebSocket(pages.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const pending=new Map();let id=0;
    socket.onmessage=event=>{
        const message=JSON.parse(event.data);
        if(!message.id){observe(message);return;}
        const handler=pending.get(message.id);
        if(!handler)return;
        pending.delete(message.id);clearTimeout(handler.timer);
        if(message.error)handler.reject(Error(message.error.message));else handler.resolve(message.result);
    };
    return {send(method,params={}){return new Promise((resolve,reject)=>{
        const seq=++id,timer=setTimeout(()=>{pending.delete(seq);reject(Error('CDP timed out: '+method));},60000);
        pending.set(seq,{resolve,reject,timer});socket.send(JSON.stringify({id:seq,method,params}));
    });},close:()=>socket.close()};
}

async function pageWorkload(compute,verifyAll,rounds,productionQueue){
    const data=window.__benchmark,H=window.__benchModel,root=document.querySelector('#pokecatch-auto-helper').shadowRoot;
    const stats={longTasks:[],inputs:[],frames:[],read:[],search:[],scroll:[],verification:[],gameActions:0,naturalWrites:0};
    const observer=new PerformanceObserver(list=>stats.longTasks.push(...list.getEntries().map(entry=>entry.duration)));
    observer.observe({entryTypes:['longtask']});
    const now=data.clock,settings=H.normalizeSettings({mode:'money',region:'current',autoTeam:true});
    const clock=performance.now.bind(performance);
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    // Use user-facing buttons only in the helper's own shadow root.
    const visit=name=>root.querySelector(`[data-workspace="${name}"]`)?.click();
    const content=root.querySelector('.content');
    visit('settings');visit('tasks');visit('activity');
    root.querySelector('#fold')?.click();root.querySelector('.mini')?.click();
    const start=clock();let previous=start,active=true;
    const churn=setInterval(()=>{
        data.wire.stats.scheduledNonce=(data.wire.stats.scheduledNonce||0)+1;
        localStorage.setItem('gachamon-save-v1',JSON.stringify(data.wire));stats.naturalWrites++;
    },1000);
    const frame=()=>{const at=clock();stats.frames.push(at-previous);previous=at;if(active)requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
    for(let i=0;i<rounds;i++){
        // Simulates normal local game save writes. Does not call original game APIs.
        data.wire.stats.logNonce=i+1;data.wire.money+=53;const raw=JSON.stringify(data.wire);
        localStorage.setItem('gachamon-save-v1',raw);
        const fired=clock();setTimeout(()=>{stats.inputs.push(clock()-fired);visit(i%2?'settings':'activity');},0);
        const at=clock(),state=H.engine.read();stats.read.push(clock()-at);
        if(compute){
            H.rosterFingerprint(state);H.partyMons(state,state.team);H.boxSnapshot(state,settings,now);
            const chapter=H.DATA.chapters.find(ch=>ch.id===state.adv.chapter),row={...chapter,key:String(chapter.loop),members:[chapter.id]};
            const search=H.adventureTeamSearch(state,settings,[],{row,foes:H.chapterCombatFoes(state,chapter),now:now+i*60000,progressive:true,verifyAll},true);
            const searchStarted=clock();let finished=false;
            if(productionQueue){
                const engine=H.engine,signature='offline-benchmark:'+i;engine.running=true;
                try{
                    engine.evaluateTeamSearch(signature,search,'teamSearch',verifyAll);
                    while(engine.teamSearch&&!engine.teamSearch.result&&!engine.teamSearch.error){
                        if(clock()-searchStarted>50000)throw Error('Production compute benchmark timed out');
                        await sleep(15);
                    }
                    if(!engine.teamSearch)throw Error('Production compute interrupted');
                    const result=engine.evaluateTeamSearch(signature,undefined,'teamSearch',verifyAll);
                    stats.verification.push((result?.verification||result?.suggestion?.verification)?.status??null);
                }finally{engine.cancelTeamSearch();engine.running=false;}
                finished=true;
            }
            while(!finished){
                const deadline=clock()+4;
                do{
                    const next=search.next();
                    if(next.done){stats.verification.push((next.value?.verification||next.value?.suggestion?.verification)?.status??null);finished=true;break;}
                }while(clock()<deadline);
                if(!finished)await sleep(0);
            }
            stats.search.push(clock()-searchStarted);
        }
        await sleep(28);
        const scrollStarted=clock();content?.scrollBy(0,24);content?.dispatchEvent(new Event('scroll'));
        stats.scroll.push(clock()-scrollStarted);
    }
    if(compute){
        // Expose analysis-only refresh, time rollover, cache rebuild and bad-data recovery.
        const state=H.engine.read();H.clearTeamCache();
        const reportSettings={...settings,autoTeam:false};
        const before=H.moneyRanking(state,reportSettings,{},{},now).length;
        const after=H.xpRanking(state,{...reportSettings,mode:'train'},{},{},now+2*3600000).length;
        if(!before||!after)throw Error('No ranked routes in synthetic game');
        localStorage.setItem('gachamon-save-v1','{"invalid');
        try{H.engine.read();}catch{}
        localStorage.setItem('gachamon-save-v1',JSON.stringify(data.wire));H.engine.read();
    }
    await sleep(70);active=false;clearInterval(churn);observer.disconnect();
    return {...stats,version:H.VERSION,size:data.size,elapsed:clock()-start,gameActions:data.gameActions,attempts:data.attempts};
}

async function run(file,size,verifyAll=false,rounds=4,productionQueue=false){
    const source=fs.readFileSync(file,'utf8'),{model:H,sha256}=loadModel(file);
    const chrome=process.env.CHROME_PATH||[
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/chromium',
    ].find(filename=>fs.existsSync(filename));
    assert.ok(chrome,'Install Chrome or set CHROME_PATH');
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-box-browser-'));
    const port=await endpoint(),args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-sync',
        '--disable-component-update','--disable-extensions','--disable-quic','--no-pings','--proxy-server=http://127.0.0.1:9',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(temp,'profile')}`,'about:blank'];
    const browser=spawn(chrome,args,{windowsHide:true,stdio:'ignore'});
    const remoteAttempts=[],exceptions=[];
    let cdp;
    try{
        cdp=await connect(port,msg=>{
            if(msg.method==='Network.requestWillBeSent'&&remote(msg.params.request.url))remoteAttempts.push({method:msg.method,url:msg.params.request.url});
            if(msg.method==='Network.webSocketCreated'&&remote(msg.params.url))remoteAttempts.push({method:msg.method,url:msg.params.url});
            if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text);
        });
        const send=cdp.send;
        await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Performance.enable');
        await send('Network.setBypassServiceWorker',{bypass:true});
        await send('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*','ftp://*']});
        const browserInfo=await send('Browser.getVersion');
        const evaluate=async expression=>{
            const out=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
            if(out.exceptionDetails)throw Error(out.exceptionDetails.exception.description||out.exceptionDetails.text);
            return out.result.value;
        };
        const wire={...fixture(H,size),fixtureBuild:H.DATA.build};
        const cases=[];
        for(const compute of [false,true]){
            const filename=path.join(temp,compute?'analysis-on.html':'analysis-off.html');
            fs.writeFileSync(filename,fixtureHtml(source,wire,size));
            await send('Page.navigate',{url:pathToFileURL(filename).href});
            for(let i=0;i<100&&!await evaluate('!!document.querySelector("#pokecatch-auto-helper")?.shadowRoot');i++)await delay(30);
            const startupMs=await evaluate('performance.now()');
            const before=Object.fromEntries((await send('Performance.getMetrics')).metrics.map(entry=>[entry.name,entry.value]));
            const result=await evaluate(`(${pageWorkload})(${compute},${verifyAll},${rounds},${productionQueue})`);
            const after=Object.fromEntries((await send('Performance.getMetrics')).metrics.map(entry=>[entry.name,entry.value]));
            const timings=Object.fromEntries(['inputs','frames','read','search','scroll'].map(name=>[name,quantiles(result[name])]));
            cases.push({...result,compute,startupMs,timings,taskMs:1000*(after.TaskDuration-before.TaskDuration),heapBytes:after.JSHeapUsedSize});
        }
        assert.deepEqual(remoteAttempts,[],'CDP observed blocked as well as successful remote attempts');
        assert.deepEqual(exceptions,[],'no unhandled page exceptions');
        for(const row of cases){assert.deepEqual(row.attempts,{},'in-page network and sync probe attempts');assert.equal(row.gameActions,0,'no synthetic game actions');}
        return {runtime:browserInfo.product,machine:os.cpus()[0]?.model,sha256,verifyAll,rounds,productionQueue,scope:'foreground local file with fresh temporary headless browser, extra calculation off/on',
            remoteAttempts:remoteAttempts.length,exceptions:exceptions.length,cases};
    }finally{
        cdp?.close();browser.kill();
    }
}

if(require.main===module){
    const size=Number(process.argv[3]||1000);
    const rounds=Number(process.env.POKECATCH_BROWSER_ROUNDS||4);
    assert.ok(Number.isInteger(size)&&size>=45&&Number.isInteger(rounds)&&rounds>0);
    run(path.resolve(process.argv[2]||defaultFile),size,process.env.POKECATCH_BENCH_VERIFY==='1',rounds,process.env.POKECATCH_BROWSER_QUEUE==='engine').then(report=>console.log(JSON.stringify(report))).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={run};
