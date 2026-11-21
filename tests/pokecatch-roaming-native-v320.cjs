// Native roaming differential audit. A fresh browser profile loads only a local,
// downloaded public bundle; all HTTP(S) requests are blocked before navigation.
// node tests/pokecatch-roaming-native-v320.cjs PATH_TO_PUBLIC_APP_JS
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),H=require('../Pokecatch自动助手.user.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
    assert.ok(process.argv[2],'Pass the downloaded public bundle');const source=fs.readFileSync(process.argv[2],'utf8');
    const module=/([A-Za-z_$][\w$]*)\.Roaming=function\(\)/.exec(source),alias=module?.[1],end=alias?source.indexOf(`,${alias}.Sfx=`,module.index):-1;assert.ok(end>0,'Native roaming module boundary changed');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-roaming-native-v320-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-roaming-audit";'+source.slice(0,end)+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);assert.ok(chrome);
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}assert.ok(pages?.length);
        socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let seq=0;const pending=new Map();
        socket.onmessage=event=>{const message=JSON.parse(event.data),call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcResearch');n++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true);
        const result=await evaluate(`(()=>{const N=__pcResearch,G=N.Game,A=N.Adventure,R=N.Roaming,now=Date.now();N.Clock={now:()=>now};G.load();G.stopSaving();A.ensure();
            const S=G.S,adv=structuredClone(S.adv),random=Math.random;Math.random=()=>0;
            const prepare=(master=0)=>{Object.assign(S,G.freshState());Object.assign(S,{trainer:{feats:{}},money:0,travel:{to:['johto','hoenn','sinnoh','unova']},mons:[{uid:'carrier',id:389,level:100,xp:0,reg:'johto',shiny:false}],team:['carrier'],road:['carrier'],items:{'master-ball':master},roam:{at:{},caught:[]}});S.adv={...structuredClone(adv),layout:6,chapter:14,unlocked:83,node:0,nodes:[{type:'heal'}],battle:null,pending:null,zone:null,event:null,tower:null,league:null,badges:['Maître Johto','Maître Hoenn','Maître Sinnoh','Maître Unys'],gifts:{},loops:[]};for(const region of N.STORY.REGIONS)region.open=true;};
            try{
                prepare();const positions=R.update(now),before=structuredClone(S.roam),states=positions.map(position=>{const all=R.free(position.id),same=position.id;A.buildChapter(position.ch);return{id:same,ch:position.ch,free:all,markers:S.adv.nodes.filter(node=>node.roamer===same).length};});
                S.items['rowap-berry']=1;G.useBuffBerry('rowap-berry');const boosted=structuredClone(S.roam);
                const captures=[];for(const master of [0,1]){prepare(master);R.update(now);const target=S.roam.at[243];A.buildChapter(target.ch);S.adv.node=S.adv.nodes.findIndex(node=>node.roamer===243);const start=A.step();const enemy=S.adv.battle?.enemies?.[0];if(!enemy)throw Error('Native roaming encounter missing');enemy.hp=0;const events=A.step(),capture=events.find(event=>event.type==='capture');captures.push({master,start:start.map(event=>event.type),enemy:{id:enemy.id,shiny:enemy.shiny},capture:capture&&{success:capture.success,prob:capture.prob,roam:capture.roam},remaining:S.items['master-ball'],caught:[...S.roam.caught],dex:S.dex[243]});}
                prepare();R.update(now);const ch=S.roam.at[243].ch;
                A.setChapter(ch);const index=S.adv.nodes.findIndex(n=>n.roamer===243);S.adv.node=index;
                A.step();S.adv.battle.enemies[0].hp=0;Math.random=()=>.99;
                const failure=A.step().find(event=>event.type==='capture');
                const retry={ch,index,node:S.adv.node,passedMarker:S.adv.nodes[index]?.roamer,success:failure?.success,caught:[...S.roam.caught],at:S.roam.at[243]?.ch,tries:S.legTries?.[243]};
                Math.random=()=>0;A.setChapter(ch);retry.fresh=S.adv.nodes.some(n=>n.roamer===243);retry.cursor=S.adv.node;
                let seed=17;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
                const later=now+16*60000;N.Clock.now=()=>later;R.update(later);
                retry.moved=S.roam.at[243].ch;A.setChapter(retry.moved);retry.followed=S.adv.nodes.some(n=>n.roamer===243);
                return{now,config:N.CONFIG.ROAMING,positions,before,boosted,states,captures,retry};
            }finally{Math.random=random;}})()`);
        assert.deepEqual(result.config.GROUPS.map(group=>({reg:group.regions[0],badge:group.unlock,ids:group.ids})),H.ROAMING_DATA.groups);
        assert.equal(result.config.CATCH,H.ROAMING_DATA.catchRate);assert.equal(result.config.MIN_LEVEL,H.ROAMING_DATA.level);assert.equal(result.config.STAY_MIN,H.ROAMING_DATA.stayMinutes);
        assert.equal(result.positions.length,8);for(const item of result.states){assert.equal(item.free,true);assert.equal(item.markers,1);}
        for(const item of result.positions){assert.equal(item.until-result.now,15*60000);assert.equal(result.boosted.at[item.id].until-result.now,30*60000);}
        for(const item of result.captures){assert.equal(item.enemy.id,243);assert.equal(item.enemy.shiny,false);assert.equal(item.capture.success,true);assert.equal(item.capture.roam,true);assert.deepEqual(item.caught,[243]);assert.equal(item.remaining,0);assert.equal(item.capture.prob,item.master?1:.04);}
        const retry=result.retry;
        assert.equal(retry.success,false);assert.deepEqual(retry.caught,[]);assert.equal(retry.at,retry.ch);
        assert.ok(retry.node>retry.index);assert.equal(retry.passedMarker,243);assert.equal(retry.tries,1);assert.equal(retry.fresh,true);assert.equal(retry.cursor,0);
        assert.notEqual(retry.moved,retry.ch);assert.equal(retry.followed,true);
        fs.writeFileSync(path.join(dir,'roaming-results.json'),JSON.stringify(result,null,2)+'\n');
        console.log('PASS: native groups, 8 locations, captures with and without a Master Ball, failed capture, chapter restart and relocated encounter. Artifacts: '+dir);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
