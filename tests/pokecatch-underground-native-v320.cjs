// Optional read-only differential against the downloaded public bundle.
// Only a fresh local browser profile and synthetic states are used; HTTP(S) is blocked.
// Usage: node tests/pokecatch-underground-native-v320.cjs PATH_TO_PUBLIC_APP_JS
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),H=require('../Pokecatch自动助手.user.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
    assert.ok(process.argv[2],'Pass a downloaded public bundle');const source=fs.readFileSync(process.argv[2],'utf8');
    const namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=namespace?.[1],boundary=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;
    assert.ok(boundary>0,'Review changed native module boundaries');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-underground-native-v320-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="isolated-under-audit";'+source.slice(0,boundary)+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);assert.ok(chrome);
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}assert.ok(pages?.length);
        socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data),call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcResearch');n++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true);
        const now=Date.UTC(2026,10,17,12),states=[];
        for(const extra of [0,1,2,3,9])for(const sent of [0,1,7,8,9,12,20])for(const sameDay of [true,false])states.push({under:{extra,sent,day:sameDay?H.parisDay(now):'2026-11-16',used:{},slots:[]}});
        const native=await evaluate(`(()=>{const N=__pcResearch,G=N.Game,U=N.Underground;G.load();N.Adventure.ensure();G.stopSaving();N.Clock={now:()=>${now}};
            const base=structuredClone(G.S),limits=${JSON.stringify(states)}.map(state=>G.sandbox({...structuredClone(base),under:state.under},()=>({perDay:U.perDay(),left:U.left(),capacity:U.slotsMax(),day:U.today().day,reset:U.dayEnds()})));
            const roster=[6,9,3,65,68,149].map((id,i)=>({id,uid:'m'+i,reg:'kanto',level:100,xp:0})),cases=[];
            for(const kind of ['available','used','old-day','candy','region-side']){
                const s={...structuredClone(base),mons:structuredClone(roster),team:['m0','m1'],road:['m0','m1'],travel:{to:['johto','hoenn','sinnoh']},under:{day:${JSON.stringify(H.parisDay(now))},sent:0,used:{},slots:[]}};
                s.adv={...s.adv,chapter:48,unlocked:65,badges:['Forêt']};if(kind==='used'||kind==='old-day')s.under.used.m0=1;if(kind==='old-day')s.under.day='2026-11-16';if(kind==='candy')s.candy={run:{mons:[{src:'m1'}]}};if(kind==='region-side'){s.link={from:'kanto',to:'sinnoh',side:'to'};s.mons[2].reg='sinnoh';}
                cases.push({kind,state:s,uids:G.sandbox(s,()=>s.mons.filter(mon=>!U.why(mon)).map(mon=>mon.uid))});
            }
            return{limits,cases,config:{team:N.CONFIG.UNDERGROUND.TEAM,perDay:N.CONFIG.UNDERGROUND.PER_DAY,perBought:N.CONFIG.UNDERGROUND.PER_BOUGHT,slots:N.CONFIG.UNDERGROUND.SLOTS,startFloors:N.CONFIG.UNDERGROUND.START_FLOORS}};})()`);
        for(const[state,i]of states.map((state,i)=>[state,i])){const helper=H.undergroundStatus(state,now),actual=native.limits[i];for(const field of ['perDay','left','capacity'])assert.equal(helper[field],actual[field],`${field} ${JSON.stringify(state.under)}`);assert.equal(helper.day,actual.day);assert.ok(helper.nextReset>=actual.reset&&helper.nextReset<=actual.reset+1000,'reset keeps the shared one-second boundary guard');}
        for(const c of native.cases)assert.deepEqual(H.undergroundMembers(c.state,now).map(mon=>mon.uid),c.uids,c.kind);
        fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(native,null,2));console.log(`PASS: ${states.length} native daily/slot/reset cases and ${native.cases.length} native member eligibility cases. Artifacts: ${dir}`);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
