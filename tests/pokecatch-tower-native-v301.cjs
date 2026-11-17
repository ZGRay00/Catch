// Optional native Tower selection differential. Fresh offline Chrome profile only.
// Usage: node tests/pokecatch-tower-native-v301.cjs PATH_TO_PUBLIC_APP_JS
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mon=(uid,id,level=100,extra={})=>({uid,id,level,reg:'kanto',xp:0,...extra});
async function main(){
    assert.ok(process.argv[2],'Pass a downloaded public app bundle');
    const source=fs.readFileSync(process.argv[2],'utf8'),namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=namespace?.[1];
    const boundary=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;assert.ok(boundary>0,'Review the changed native module boundary');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-tower-native-v301-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-tower-test";'+source.slice(0,boundary)+`;window.__pcTowerNative=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);assert.ok(chrome,'Chrome/Edge required');
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}assert.ok(pages?.length,'Isolated Chrome did not start');
        socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error((result.exceptionDetails.exception?.description||result.exceptionDetails.text).slice(0,1200));return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcTowerNative');n++)await delay(50);assert.equal(await evaluate('!!window.__pcTowerNative'),true,'Native prefix mounted');
        const cases=[
            {name:'native raw HP ordering',mons:[mon('jigglypuff',39,50),mon('bulbasaur',1,50)]},
            {name:'one normal or shiny per species',mons:[mon('normal',6,90),mon('shiny',6,90,{shiny:true}),mon('normal2',9,100)]},
            {name:'single-being forms',mons:[mon('base',386,90),mon('attack',38601,90),mon('defense',38602,90),mon('speed',38603,90),mon('plain',25,90)]},
            {name:'rank and taste sorting',mons:[mon('a',6,90,{rank:1}),mon('b',9,90,{rank:2,taste:{h:'atk',up:{spa:25,spd:18}}}),mon('c',143,90,{shiny:true}),mon('d',150,80)]},
            {name:'source HP and multipliers are not snapshotted',mons:[mon('a',6,80,{hp:0,statMult:99,hpMult:99}),mon('b',9,80)]},
            {name:'underground included daycare excluded',mons:[mon('main',6,80)],under:{slots:[{mons:[mon('under',150,100)]}]},pension:{mons:[{mon:mon('parent',493,100)}]}},
            ...['from','to'].map(side=>({name:'destination exclusion while on '+side,mons:[mon('origin',6,80,{reg:'hoenn'}),mon('destination',643,100,{reg:'unova'})],link:{from:'sinnoh',to:'unova',side,stash:{money:0,items:{}}}})),
            {name:'first six native order',mons:[143,248,149,9,6,3,65,94,150,289,445,493].map((id,i)=>mon('party-'+i,id,60+i*3,{shiny:i%3===0,rank:i%4,taste:{h:'atk',up:{spa:i}}}))},
            {name:'floor-one resting threshold',mons:[mon('rest',150,39),mon('border',6,40),mon('ready',9,50)]},
            {name:'boss resting uses base level',mons:[mon('rest',150,52),mon('border',6,53),mon('ready',9,80)],snapshotFloor:10},
            {name:'level cap resting threshold',mons:[mon('rest',150,89),mon('border',6,90),mon('ready',9,100)],snapshotFloor:100},
            {name:'snapshot attrition',mons:[143,248,149,9,6,3,150,65].map((id,i)=>mon('reserve-'+i,id,100)),faintFirst:3},
        ];
        const results=await evaluate(`(()=>{const t=__pcTowerNative,G=t.Game;if(!G.S)G.load();t.Adventure.ensure();const cases=${JSON.stringify(cases)};return cases.map(input=>{const state={...G.S,mons:input.mons,team:[],road:[],link:input.link||null,tower:{best:null,run:null},under:input.under||{slots:[]},pension:input.pension||{mons:[],eggs:[]},adv:{...G.S.adv,chapter:0,unlocked:83,battle:null,tower:null}};return G.sandbox(state,()=>{const run=t.Tower.newRun(),fresh=t.Tower.team().map(uid=>run.mons.find(mon=>mon.uid===uid).src);if(input.snapshotFloor)run.floor=input.snapshotFloor;if(input.faintFirst)for(const mon of run.mons.slice(0,input.faintFirst))mon.hp=0;const active=t.Tower.team().map(uid=>run.mons.find(mon=>mon.uid===uid).src);return{input,run:JSON.parse(JSON.stringify(run)),fresh,active};});});})()`);
        let checks=0;for(const {input,run,fresh,active}of results){
            const state={mons:input.mons,link:input.link||null,under:input.under||{slots:[]},pension:input.pension||{},tower:{run},adv:{chapter:0,unlocked:83,tower:{back:0}}};
            assert.deepEqual(H.towerParty(state).map(mon=>mon.src),fresh,input.name+' fresh');checks++;
            assert.deepEqual(H.towerParty(state,{snapshot:true,now:Date.parse(run.week+'T12:00:00Z')}).map(mon=>mon.src),active,input.name+' saved snapshot');checks++;
        }
        fs.writeFileSync(path.join(dir,'tower-cases.json'),JSON.stringify(results,null,2));console.log(`PASS: ${checks} native Tower roster/snapshot comparisons (${results.length} scenarios).`);console.log('Artifacts: '+dir);
    }finally{socket?.close();child.kill();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
