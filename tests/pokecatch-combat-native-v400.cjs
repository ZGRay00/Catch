// Optional differential extractor for a locally downloaded public game bundle.
// It opens only a temporary, network-blocked browser profile, never the live game.
// node tests/pokecatch-combat-native-v400.cjs PATH_TO_PUBLIC_APP_JS [--update-fixture]
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
    assert.ok(process.argv[2],'Pass a downloaded public app bundle');
    let source=fs.readFileSync(process.argv[2],'utf8');
    const namespace=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=namespace?.[1];
    const boundary=alias?source.indexOf(`,${alias}.Roaming=`,namespace.index):-1;
    assert.ok(boundary>0,'Native module boundary changed; review the extractor');
    source=source.slice(0,boundary);
    const selection=[...source.matchAll(/function ([\w$]+)\(([\w$]+),([\w$]+)\)\{Array\.isArray\(\3\)\|\|\(\3=\[\3\]\);/g)];
    const attacks=[...source.matchAll(/const ([\w$]+)=new WeakSet;function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)=null,([\w$]+)=\3\)/g)];
    const damage=[...source.matchAll(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+)\)\{const [\w$]+=[\w$]+\.statsOf\(\2\),[\w$]+=[\w$]+\.statsOf\(\3\)/g)];
    assert.equal(selection.length,1,'Find exactly one native battle move selector');
    assert.equal(attacks.length,1,'Find exactly one native consecutive-miss guard');
    assert.equal(damage.length,1,'Find exactly one native per-strike damage function');
    const hook=`const ${attacks[0][1]}=new WeakSet;`;
    source=source.replace(hook,hook+`${alias}.__combatNative={select:${selection[0][1]},attack:${attacks[0][2]},damage:${damage[0][1]}};`);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-combat-v400-'));
    fs.writeFileSync(path.join(dir,'runtime.js'),'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-combat-test";'+source+`;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    assert.ok(chrome,'Chrome/Edge is required');
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}
        assert.ok(pages?.length,'Isolated browser did not start');
        socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error((result.exceptionDetails.exception?.description||result.exceptionDetails.text).slice(0,1200));return result.result.value;};
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(path.join(dir,'index.html')).href});
        for(let n=0;n<80&&!await evaluate('!!window.__pcResearch');n++)await delay(50);assert.equal(await evaluate('!!window.__pcResearch'),true,'Native prefix mounted');
        const data=await evaluate(`(()=>{
            const t=__pcResearch,G=t.Game,N=t.__combatNative,C=t.CONFIG;if(!G.S)G.load();G.stopSaving?.();t.Adventure.ensure();
            const state={...G.S,mons:[],team:[],road:[],adv:{...G.S.adv,nodes:[],node:0,battle:null}};
            return G.sandbox(state,()=>{
                const moves=Object.fromEntries(Object.entries(t.MOVES).filter(([key])=>!C.MOVE_BLACKLIST.includes(key)&&G.movePower(key)>0).map(([key,move])=>[key,{type:move.type,cat:move.cat,power:G.movePower(key),acc:G.moveAcc(key)}]));
                const learn=Object.fromEntries(t.POKEDEX.map(mon=>[mon.id,G.learnOf({id:mon.id,level:100}).filter(([,key])=>moves[key]).map(([level,key])=>[level,key])]));
                const samples=[],foes=[19,94,74,81,9,149],levels=[5,20,50,100];
                for(const [i,model]of t.POKEDEX.entries())for(const [j,level]of levels.entries()){
                    const mon={id:model.id,uid:'ally',level,shiny:j%2===0,rank:j%3,status:['burn','poison',null,null][j]},foe={id:foes[(i+j)%foes.length],uid:'foe',level:Math.min(100,level+5),status:['sleep','freeze',null,null][j]};
                    const copy=mon.id===132&&foe.id!==132?{...mon,id:foe.id}:mon,move=N.select(copy,foe);
                    samples.push({mon,foe,key:move.key,type:move.type,power:move.power,accuracy:move.acc/100});
                }
                const duels=[];
                for(const [id,level,foeId,weather]of [[106,5,19,null],[106,10,19,null],[214,10,19,null],[214,20,19,null],[573,20,19,null],[91,37,19,null],[237,21,19,null],[65,50,81,null],[132,50,6,null],[6,50,9,{fire:1.5,water:.5}],[9,50,6,{fire:.5,water:1.5}]]){
                    G.S.adv.nodes=weather?[{weatherDamage:weather}]:[];G.S.adv.node=0;
                    const mon={id,uid:'sample',level},foe={id:foeId,uid:'foe',level},copy=id===132?{...mon,id:foeId}:mon;
                    const move=N.select(copy,foe),type=move.typeless?1:G.DEX[foeId].types.reduce((sum,key)=>sum*(t.TYPE_CHART[move.type]?.[key]??1),1);
                    const pattern=C.MULTI_HIT[move.key],mean=pattern==='2-5'?C.MULTI_HIT_ODDS.reduce((sum,p,i)=>sum+p*(i+2),0):Array.isArray(pattern)?1:pattern||1;
                    const powers=Array.isArray(pattern)?pattern:[t.MOVES[move.key]?.power||move.power];
                    if(!pattern)powers[0]=move.power;
                    const count=4096,means=powers.map(power=>{let sum=0;for(let i=0;i<count;i++)sum+=type>0?N.damage(copy,foe,{...move,power},type,false,.85+.15*(i+.5)/count):0;return sum/count;});
                    duels.push({mon,foe,weather,move,hit:means.reduce((sum,n)=>sum+n,0)*mean,rawCombined:move.power>0&&type>0?N.damage(copy,foe,move,type,false,.925):0});
                }
                G.S.adv.nodes=[];
                const mon={id:289,uid:'miss-test',level:100},foe={id:19,uid:'foe',level:100},move={key:'mega-kick',...moves['mega-kick']},random=Math.random;let misses;
                try{Math.random=()=>.999999;misses=Array.from({length:4},()=>N.attack(mon,foe,move,mon).miss);}finally{Math.random=random;}
                return{moves,learn,multi:{odds:C.MULTI_HIT_ODDS,moves:C.MULTI_HIT},multiBase:Object.fromEntries(Object.keys(C.MULTI_HIT).map(key=>[key,t.MOVES[key]?.power])),samples,duels,misses};
            });
        })()`);
        let checks=0;
        assert.deepEqual(data.multi,H.MULTI_HIT_DATA);assert.deepEqual(data.misses,[true,false,true,false]);checks+=2;
        for(const [key,move]of Object.entries(data.moves)){assert.deepEqual(H.DATA.combat.moves[key],move,'Native move power/accuracy: '+key);checks++;}
        for(const mon of H.DATA.mons){assert.deepEqual(mon.learn,data.learn[mon.id],'Native damaging learnAll: '+mon.id);checks++;}
        for(const {mon,foe,key,type,power,accuracy}of data.samples){const details=H.expectedDamage(mon,foe,H.effectiveStats(mon),H.effectiveStats(foe),{details:true});if(power<=0){assert.equal(details.hit,0);checks++;continue;}assert.equal(details.key||null,key,'Actual native selected move: '+JSON.stringify({mon,foe}));assert.equal(details.type,type);assert.equal(details.accuracy,accuracy);checks+=3;}
        for(const duel of data.duels){
            const details=H.expectedDamage(duel.mon,duel.foe,H.effectiveStats(duel.mon),H.effectiveStats(duel.foe),{details:true,weather:duel.weather});
            assert.equal(details.key,duel.move.key,'Weather-aware native selection');
            assert.ok(Math.abs(details.hit-duel.hit)<.012,'Mean per-strike native damage: '+JSON.stringify({duel,helper:details.hit}));
            checks+=2;
        }
        const fixture={build:'0a26d39c19',bundle:'app.6e45170313.js',multi:data.multi,multiBase:data.multiBase,misses:data.misses,duels:data.duels,checks,damagingLearnDifferences:0,moveDifferences:0,selectedMoves:data.samples.length};
        fs.writeFileSync(path.join(dir,'combat-v400-evidence.json'),JSON.stringify(fixture,null,2));
        if(process.argv.includes('--update-fixture'))fs.writeFileSync(path.join(__dirname,'fixtures','pokecatch-combat-v400.json'),JSON.stringify(fixture,null,2)+'\n');
        console.log(`PASS: ${checks} native comparisons, ${data.samples.length} actual selected moves; learnAll and move data unchanged. Evidence: ${dir}`);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
