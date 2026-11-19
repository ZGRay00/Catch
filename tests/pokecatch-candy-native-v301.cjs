// Read-only extraction from a downloaded public game bundle in a network-blocked profile.
// Usage: node tests/pokecatch-candy-native-v301.cjs PATH_TO_PUBLIC_APP_JS [OUTPUT_JSON]
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
    assert.ok(process.argv[2],'Pass the downloaded public app bundle');
    let source=fs.readFileSync(process.argv[2],'utf8');
    const namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=namespace?.[1];
    const boundary=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;
    assert.ok(boundary>0,'Inspect changed native module boundaries before extraction');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-candy-native-v301-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-candy-test";'+source.slice(0,boundary)+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    assert.ok(chrome,'Chrome or Edge is required');
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}
        assert.ok(pages?.length,'Isolated browser started');socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error((result.exceptionDetails.exception?.description||result.exceptionDetails.text).slice(0,1000));return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcResearch');n++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true,'Native prefix mounted');
        const result=await evaluate(`(()=>{
            const t=__pcResearch,G=t.Game,C=t.CandyRun;if(!G.S)G.load();t.Adventure.ensure();
            const caps=[151,251,386,493,649],floors=[...new Set([1,5,10,25,50,56,60,65,80,100].flatMap(floor=>floor%5===0?[floor-1,floor]:[floor]))].sort((a,b)=>a-b);
            return{config:t.CONFIG.CANDY_RUN,rankMax:t.CONFIG.UNDERGROUND.RANK_MAX,
                pools:Object.fromEntries(caps.map(cap=>[cap,Object.fromEntries(C.TYPES.map(type=>[type,C.poolOf(type,cap).map(mon=>mon.id)]))])),
                levels:floors.map(floor=>({floor,level:C.levelOf(floor),rank:C.rankOf(floor),statMult:C.statMultOf(floor),rare:C.isSB(floor)})),
                examples:['normal','water','steel'].map(type=>({type,one:C.floorOf(1,{day:'2026-11-17',type}),fifty:C.floorOf(50,{day:'2026-11-17',type})})),
                identities:[{id:25},{id:25,shiny:true},{id:150},{id:150,shiny:true}].map(mon=>({mon,being:G.beingOf(mon)}))};
        })()`);
        assert.equal(result.config.TEAM,6);assert.equal(result.config.SB_DAY,25);assert.equal(result.levels.find(row=>row.floor===60).rank,1);
        assert.equal(result.levels.find(row=>row.floor===50).level,97);
        assert.notEqual(result.identities[0].being,result.identities[1].being,'Normal and shiny species use different default being identities');
        const target=path.join(dir,'results.json');
        const build=require('node:crypto').createHash('sha256').update(source).digest('hex').slice(0,10);
        fs.writeFileSync(target,JSON.stringify({build,checked:new Date().toISOString().slice(0,10),...result},null,2)+'\n');
        const baseline=require('./fixtures/pokecatch-candy-native-v301.json');
        for(const key of Object.keys(result))assert.deepEqual(result[key],baseline[key],`Native candy ${key} differs from the reference model; inspect ${target}`);
        if(process.argv[3])fs.copyFileSync(target,process.argv[3]);
        console.log('PASS: native candy configuration, 90 theme pools, floor progression and default being identities. '+(process.argv[3]||target));
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
