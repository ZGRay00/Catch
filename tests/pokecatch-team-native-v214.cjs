// Optional native deployment check. Runs only a downloaded public bundle in a new,
// network-blocked Chrome profile; never opens the online game or a player account.
// Usage: node tests/pokecatch-team-native-v214.cjs PATH_TO_PUBLIC_APP_JS
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
    assert.ok(process.argv[2],'Pass a downloaded public app bundle');
    let source=fs.readFileSync(process.argv[2],'utf8');
    const namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=namespace?.[1];
    const boundary=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;
    assert.ok(boundary>0,'Public module boundary changed; inspect before running');
    source=source.slice(0,boundary);
    const hook='function An(k){const v=[],Pe=qs(k).slice(0,Math.min(k.slots,3));';
    assert.equal(source.split(hook).length,2,'Native deployment extractor must match exactly once');
    source=source.replace(hook,`${alias}.__teamNative={sort:Ks,alive:Qt,slots:on,typeScore:vt,typeExtra:$s,move:Hs,attack:pn,damage:cn};`+hook);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-team-native-v214-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-team-test";'+source+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    assert.ok(chrome,'Chrome/Edge is required');
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}
        assert.ok(pages?.length,'Isolated browser did not start');socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error((result.exceptionDetails.exception?.description||result.exceptionDetails.text).slice(0,1000));return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcResearch');n++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true,'Native prefix mounted');
        const results=await evaluate(`(()=>{
            const t=__pcResearch,G=t.Game,N=t.__teamNative;if(!G.S)G.load();t.Adventure.ensure();
            const carrier={uid:'carrier',id:65,level:70,xp:0},learner={uid:'learner',id:66,level:20,xp:0},foe={uid:'foe',id:19,level:50,xp:0,foe:true};
            const run=(name,patch={},allies=[])=>{const state={...G.S,mons:[{...carrier},{...learner}],team:['carrier','learner'],road:['carrier','learner'],autoSwitch:undefined,adv:{...G.S.adv,chapter:3,battle:null},...patch};return G.sandbox(state,()=>{const alive=N.alive(),sort=N.sort(alive,[foe],allies);return{name,uids:sort.map(mon=>mon.uid),scores:alive.map(mon=>({uid:mon.uid,score:N.typeScore(mon,foe)})),moves:alive.map(mon=>({uid:mon.uid,...N.move(mon,foe)}))};});};
            return[run('default-auto-switch'),run('disabled-auto-switch',{autoSwitch:false}),run('fainted-learner',{mons:[{...carrier},{...learner,hp:0}]}),run('equal-type-active-stability',{mons:[{...carrier,id:65},{...learner,id:65,level:70}]},['learner'])];
        })()`);
        assert.equal(results[0].uids[0],'learner','Default auto-switch chooses type advantage before the high-level carrier');
        assert.equal(results[1].uids[0],'carrier','Disabled auto-switch preserves the road order');
        assert.deepEqual(results[2].uids,['carrier'],'Fainted members are removed before deployment scoring');
        assert.equal(results[3].uids[0],'learner','The currently deployed ally wins an equal-type tie');
        const duels=await evaluate(`(()=>{
            const t=__pcResearch,G=t.Game,N=t.__teamNative,ids=[6,9,65,66,94,132,143,145,149,150,248,289,445,493,643,649],foes=[19,94,74,81,9,149];
            const state={...G.S,adv:{...G.S.adv,nodes:[],node:0,chapter:3,battle:null}},results=[];
            return G.sandbox(state,()=>{
                for(const [i,id]of ids.entries())for(const [j,level]of [5,20,50,70,100].entries()){
                    const mon={id,uid:'ally',level,shiny:j%2===0,rank:j%3,status:['burn','poison',null,null,null][j]},foe={id:foes[(i+j)%foes.length],uid:'foe',level:100-level+5,foe:true,status:['sleep','freeze',null,null,null][j]};
                    const copy=mon.id===132&&foe.id!==132?{...mon,id:foe.id}:mon,move=N.move(copy,foe);
                    const type=move.typeless?1:t.Game.DEX[foe.id].types.reduce((n,key)=>n*(t.TYPE_CHART[move.type]?.[key]??1),1);
                    const hit=move.power>0&&type>0?N.damage(copy,foe,move,type,false,.925):0;
                    results.push({mon,foe,move,hit,deployment:N.typeScore(mon,foe)+.01*N.typeExtra(mon,foe)});
                }
                return results;
            });
        })()`);
        const combat=await evaluate(`(()=>{const t=__pcResearch,G=t.Game,C=t.CONFIG;return{moves:Object.fromEntries(Object.entries(t.MOVES).filter(([key,move])=>!C.MOVE_BLACKLIST.includes(key)&&G.movePower(key)>0).map(([key,move])=>[key,{type:move.type,cat:move.cat,power:G.movePower(key),acc:G.moveAcc(key)}])),learns:Object.fromEntries(t.POKEDEX.map(mon=>[mon.id,G.learnOf({id:mon.id,level:100}).filter(([,key])=>!C.MOVE_BLACKLIST.includes(key)&&G.movePower(key)>0)])),rankStat:C.UNDERGROUND.RANK_STAT,levelGap:C.LEVEL_GAP,hpScale:C.HP_LEVEL_SCALE,hpMax:C.HP_LEVEL_MAX,hpBoost:C.HP_BOOST}})()`);
        fs.writeFileSync(path.join(dir,'combat.json'),JSON.stringify(combat));fs.writeFileSync(path.join(dir,'duels.json'),JSON.stringify(duels,null,2));
        console.log('Native combat extraction: '+path.join(dir,'combat.json'));
        const raid=await evaluate(`(()=>{const t=__pcResearch,G=t.Game,A=t.Adventure,C=t.CONFIG,metadata={build:'1a16948eef',raid:C.RAID.BOSS,team:C.TEAM_SIZE,enemyHp:C.ENEMY_HP_PER_ALLY,bossStatus:C.BOSS_STATUS,legend:C.LEGEND_ZONE,statusChance:C.STATUS_MOVE_CHANCE,statusSure:C.STATUS_SURE,statusTeam:C.STATUS_TEAM,statusParaCost:C.STATUS_PARA_COST,moves:Object.fromEntries(Object.entries(t.STATUS.MOVES).map(([key,move])=>[key,{status:move[0],chance:move[1],cap:t.STATUS.capOf(key),type:t.MOVES[key]?.type,power:G.movePower(key),acc:G.moveAcc(key)}])),learn:Object.fromEntries(t.POKEDEX.map(mon=>[mon.id,G.learnOf({id:mon.id,level:100}).filter(([,key])=>t.STATUS.MOVES[key]&&G.movePower(key)<=0)]).filter(([,learn])=>learn.length))},cases=[];for(const boss of [14,35,130,25,81])for(const id of [3,6,35,43,80,94,125,126,132])for(const level of [5,50,100]){const parts=A.counterParts({id,level,shiny:false,rank:0},{id:boss,level:100,boss:true});cases.push([boss,id,level,parts.value,parts.dot,parts.para]);}return{metadata,cases}})()`);
        fs.writeFileSync(path.join(dir,'raid-ally.json'),JSON.stringify(raid,null,2));console.log('Native raid extraction: '+path.join(dir,'raid-ally.json'));
        assert.equal(typeof H.deploymentScore,'function','Helper must export its deployment model for this optional differential check');
        for(const {mon,foe,move,hit,deployment}of duels){
            const label=JSON.stringify({mon,foe,move}),details=H.expectedDamage(mon,foe,H.effectiveStats(mon),H.effectiveStats(foe),{details:true});
            assert.ok(Math.abs(H.deploymentScore(mon,foe)-deployment)<1e-10,'Native deployment score: '+label);
            if(move.power>0){assert.equal(details.type,move.type,'Native selected move type: '+label);assert.ok(Math.abs(details.accuracy-move.acc/100)<1e-10,'Native selected accuracy: '+label);}
            assert.ok(Math.abs(details.hit-hit)<1.01,'Native deterministic damage: '+label+' '+JSON.stringify({actual:details.hit,native:hit}));
        }
        for(const [boss,id,level,value,dot,para]of raid.cases){
            const expected=value+dot-(dot>0?para:0),actual=H.allyStrength([{id,level}],boss);
            assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-9,'Native raid counter score: '+JSON.stringify({boss,id,level,actual,expected}));
        }
        fs.writeFileSync(path.join(dir,'deployment.json'),JSON.stringify(results,null,2));
        fs.writeFileSync(path.join(dir,'duels.json'),JSON.stringify(duels,null,2));
        console.log('PASS: 4 native deployment scenarios, '+duels.length+' native deployment/move/damage comparisons and '+raid.cases.length+' native raid counter comparisons. '+JSON.stringify(results.map(({name,uids,scores})=>({name,uids,scores}))));console.log('Artifacts: '+dir);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
