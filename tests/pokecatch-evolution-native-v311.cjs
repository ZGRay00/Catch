// Offline native differential: no account, live game page or network writes.
// node tests/pokecatch-evolution-native-v311.cjs PATH_TO_PUBLIC_APP_JS
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),gold=require('./fixtures/pokecatch-evolution-native-v311.json');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=new Date(2026,10,17,12).getTime();
function state(id,level,extra={}){
    const mon={uid:'native-evo-'+id,id,level,xp:0,reg:'kanto',shiny:false},rule=gold.evolutions[id]?.find(rule=>rule.level),mons=[mon];
    if(rule?.party)mons.push({uid:'ally',id:rule.party,level:40,xp:0,reg:'kanto'});
    return{mons,team:mons.map(mon=>mon.uid),road:mons.map(mon=>mon.uid),dex:{},keepDup:{},stats:{evolutions:0},items:{},pension:{mons:[],eggs:[]},under:{slots:[]},
        tradeOut:null,tradeIn:null,mktOut:[],link:null,travel:{to:['johto','hoenn','sinnoh','unova']},adv:{layout:6,chapter:49,unlocked:83,badges:[]},...extra};
}
async function main(){
    assert.ok(process.argv[2],'Pass the downloaded public app bundle');
    assert.equal(typeof H.levelEvolution,'function','Root must export the completed evolution model');
    const source=fs.readFileSync(process.argv[2],'utf8'),namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=namespace?.[1];
    const boundary=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;assert.ok(boundary>0,'Review changed native extraction boundary');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-evolution-native-v311-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-evolution-test";'+source.slice(0,boundary)+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);assert.ok(chrome);
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}assert.ok(pages?.length);
        socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error((result.exceptionDetails.exception?.description||result.exceptionDetails.text).slice(0,1000));return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcResearch');n++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true);
        const cases=[];
        for(const[id,rules]of Object.entries(gold.evolutions))if(new Set(rules.map(rule=>rule.to)).size===1&&rules.some(rule=>rule.level)&&H.MONS.has(+id)&&H.MONS.has(rules[0].to)){
            const rule=rules.find(rule=>rule.level);for(const level of [...new Set([Math.max(1,rule.level-1),rule.level,100])])cases.push({id:+id,level,rule,s:state(+id,level),open:['kanto','johto','hoenn','sinnoh','unova']});
        }
        const conditions=[];
        for(const kind of ['ranked','unopened','missing-party','pending-party-change','target-copy','opposite-shiny','opposite-group','manual-branch']){
            let s=state(kind==='unopened'?190:kind==='missing-party'?458:kind==='manual-branch'?281:396,100),open=['kanto','johto','hoenn','sinnoh','unova'];
            if(kind==='ranked')s.mons[0].rank=1;
            if(kind==='unopened'){s.travel.to=['johto'];s.adv.chapter=20;open=['kanto','johto'];}
            if(kind==='missing-party'){s.team=[s.mons[0].uid];s.road=[s.mons[0].uid];}
            if(kind==='pending-party-change'){s=state(458,100);s.team=[s.mons[0].uid];}
            if(['target-copy','opposite-shiny','opposite-group'].includes(kind))s.mons.push({uid:'copy',id:397,level:50,reg:kind==='opposite-group'?'sinnoh':'kanto',shiny:kind==='opposite-shiny'});
            if(kind==='opposite-group')s.link={from:'kanto',to:'sinnoh',side:'from'};
            conditions.push({kind,s,open});
        }
        const values=await evaluate(`(()=>{const t=__pcResearch,G=t.Game;if(!G.S)G.load();t.Adventure.ensure();t.DAYTIME.force('day');
            const run=c=>{Object.assign(G.S,c.s);for(const r of t.STORY.REGIONS)r.open=c.open.includes(r.key);const mon=G.S.mons[0],rule=G.levelEvolution(mon);return{to:rule?.to||null,blocked:t.EVOLUTIONS[mon.id]?.map(edge=>[edge.to,G.evoBlocked(mon,edge.to)])};};
            const levels=${JSON.stringify(cases)}.map(run),conditions=${JSON.stringify(conditions)}.map(run);
            const s=${JSON.stringify(state(396,22))};Object.assign(G.S,s);for(const r of t.STORY.REGIONS)r.open=true;const m=G.S.mons[0],max=G.maxHp(m);m.hp=Math.round(max*.4);const ratio=m.hp/max,uid=m.uid;const result=G.evolveMon(uid,397);
            return{graph:t.EVOLUTIONS,time:t.CONFIG.TIME_EVOLUTIONS,levels,conditions,mutation:{result,uid:m.uid,id:m.id,level:m.level,hp:m.hp,max:G.maxHp(m),ratio,evolutions:G.S.stats.evolutions}};})()`);
        fs.writeFileSync(path.join(dir,'native-evolution.json'),JSON.stringify(values,null,2)+'\n');
        console.log('Native evolution audit: '+dir);
        assert.deepEqual(values.graph,gold.evolutions);assert.deepEqual(values.time,gold.time);
        const levelCases=[];for(const[c,index]of cases.map((c,index)=>[c,index])){const helper=H.levelEvolution(c.s,c.s.mons[0],{now}),native=values.levels[index].to;assert.equal(helper?.to||null,native,`${c.id}@${c.level}`);levelCases.push({id:c.id,level:c.level,party:c.rule.party||null,to:native});}
        for(const[c,index]of conditions.map((c,index)=>[c,index])){const helper=H.levelEvolution(c.s,c.s.mons[0],{now}),native=values.conditions[index].to;if(c.kind==='manual-branch'||c.kind==='target-copy')assert.equal(helper,null,c.kind);else assert.equal(helper?.to||null,native,c.kind);}
        assert.equal(values.mutation.uid,'native-evo-396');assert.equal(values.mutation.id,397);assert.equal(values.mutation.level,22);assert.equal(values.mutation.hp,Math.round(values.mutation.max*values.mutation.ratio));assert.equal(values.mutation.evolutions,1);
        const target=path.join(__dirname,'fixtures/pokecatch-evolution-native-v311.json');fs.writeFileSync(target,JSON.stringify({...gold,levelCases},null,2)+'\n');
        console.log(`PASS: ${cases.length} free-level cases, ${conditions.length} dynamic/policy conditions, native graph/time and same-UID mutation invariants. Artifacts: ${dir}`);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
