// Optional native differential check. Pass a downloaded public app bundle as argv[2].
// Runs its data/game prefix in a fresh local Chrome profile; never opens the live game.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
    assert.ok(process.argv[2],'Usage: node tests/pokecatch-native-mechanisms.cjs PATH_TO_PUBLIC_APP_JS');
    const source=fs.readFileSync(process.argv[2],'utf8'),namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source);
    const alias=namespace?.[1],end=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;
    assert.ok(end>0,'Public module boundary changed; review the extractor before running it');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-native-mechanisms-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-mechanism-test";'+source.slice(0,end)+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    assert.ok(chrome,'Chrome/Edge required');const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let i=0;i<80;i++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}
        assert.ok(pages?.length,'Isolated Chrome did not start');socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const m=JSON.parse(event.data);if(!m.id)return;const call=pending.get(m.id);if(!call)return;pending.delete(m.id);clearTimeout(call.timer);m.error?call.reject(Error(m.error.message)):call.resolve(m.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error((r.exceptionDetails.exception?.description||r.exceptionDetails.text).slice(0,600));return r.result.value;};
        await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let i=0;i<80&&!await evaluate('!!window.__pcResearch');i++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true,'Native prefix mounted');
        const cases=[
            {name:'Kanto',unlocked:8,to:[],chapter:0},
            {name:'Johto replay in Kanto',unlocked:23,to:['johto'],chapter:0},
            {name:'Hoenn replay in Kanto',unlocked:42,to:['johto','hoenn'],chapter:0},
            {name:'Sinnoh replay in Kanto',unlocked:65,to:['johto','hoenn','sinnoh'],chapter:0},
            {name:'Closed future region',unlocked:65,to:['johto'],chapter:0},
            {name:'Departure old wallet',unlocked:65,to:['johto','hoenn','sinnoh'],chapter:48,link:{from:'kanto',to:'sinnoh',side:'from'}},
            {name:'Departure new wallet',unlocked:65,to:['johto','hoenn','sinnoh'],chapter:48,link:{from:'kanto',to:'sinnoh',side:'to'}},
            {name:'Unova replay in Kanto',unlocked:83,to:['johto','hoenn','sinnoh','unova'],chapter:0},
            {name:'Unova origin wallet',unlocked:83,to:['johto','hoenn','sinnoh','unova'],chapter:66,link:{from:'sinnoh',to:'unova',side:'from'}},
            {name:'Unova new wallet',unlocked:83,to:['johto','hoenn','sinnoh','unova'],chapter:66,link:{from:'sinnoh',to:'unova',side:'to'}},
        ];let checks=0;
        const chapterIds=H.DATA.regions.map(r=>r.start);
        for(const c of cases){
            const s={travel:{to:c.to},link:c.link,mons:[],team:[],dex:{},adv:{chapter:c.chapter,unlocked:c.unlocked,badges:['Maître','Maître Johto','Maître Hoenn','Maître Sinnoh']}};
            const native=await evaluate(`(()=>{const t=__pcResearch,G=t.Game;G.load();t.Adventure.ensure();Object.assign(G.S,${JSON.stringify(s)});G.S.link=${JSON.stringify(c.link||null)};for(const r of t.STORY.REGIONS)r.open=r.key==='kanto'||${JSON.stringify(c.to)}.includes(r.key);return{region:G.currentRegion().key,money:${JSON.stringify(chapterIds)}.map(ch=>G.behindMoney(ch)),xp:[0,3].map(rank=>[1,20,40,99].map(lv=>G.xpForNext(lv,{rank}))),candy:G.expCandyXp('exp-candy-m')};})()`);
            assert.equal(H.economicRegion(s),native.region,c.name);checks++;
            for(let i=0;i<chapterIds.length;i++){assert.equal(H.moneyFactor(s,H.DATA.chapters[chapterIds[i]]),native.money[i],c.name+' money');checks++;}
            for(const [i,rank]of [0,3].entries())for(const [j,lv]of [1,20,40,99].entries()){assert.equal(H.DATA.xpThresholds[H.economicRegion(s)][rank][lv],native.xp[i][j],c.name+' XP');checks++;}
            assert.equal(H.DATA.automation.candies['exp-candy-m'].xp[H.economicRegion(s)],native.candy,c.name+' candy');checks++;
        }
        console.log(`PASS: ${checks} native comparisons across ${cases.length} region/wallet states (money, ranked XP thresholds, candy).`);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
