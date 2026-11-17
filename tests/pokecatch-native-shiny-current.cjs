// Read-only public bundle audit in a fresh local browser profile. Never opens the live game.
// Usage: node tests/pokecatch-native-shiny-current.cjs PATH_TO_PUBLIC_APP_JS [OUTPUT_JSON]
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process'), { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict'), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
    assert.ok(process.argv[2], 'Pass the cached public bundle path');
    const source = fs.readFileSync(process.argv[2], 'utf8');
    const namespace = /([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source), alias = namespace?.[1];
    const end = alias ? source.indexOf(`,${alias}.Roaming=`, namespace.index) : -1;
    assert.ok(end > 0, 'Review changed public module boundaries');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokecatch-native-shiny-'));
    fs.writeFileSync(path.join(dir, 'runtime.js'), 'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="offline-shiny-audit";' + source.slice(0, end) + `;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir, 'index.html'), '<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    assert.ok(chrome, 'Chrome/Edge required');
    const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port; await new Promise(resolve => server.close(resolve));
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let socket, send;
    try {
        let pages;
        for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.length) break; } catch {} await delay(100); }
        assert.ok(pages?.length, 'Isolated browser did not start');
        socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let sequence = 0; const pending = new Map();
        socket.onmessage = event => { const result = JSON.parse(event.data), call = pending.get(result.id); if (!call) return; pending.delete(result.id); clearTimeout(call.timer); result.error ? call.reject(Error(result.error.message)) : call.resolve(result.result); };
        send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
        const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error((result.exceptionDetails.exception?.description || result.exceptionDetails.text).slice(0, 1000)); return result.result.value; };
        await send('Network.enable');
        await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
        await send('Page.enable'); await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href });
        for (let i = 0; i < 80 && !await evaluate('!!window.__pcResearch'); i++) await delay(50);
        assert.equal(await evaluate('!!window.__pcResearch'), true);
        const result = await evaluate(`(() => {
            const N=__pcResearch, G=N.Game, A=N.Adventure, C=N.CONFIG; G.load(); A.ensure();
            const S=G.S; S.mons=[]; S.team=[]; S.road=[]; S.dex={}; S.seen={}; S.seenShiny={}; S.buffs={}; S.link=null;
            S.adv.chapter=0; S.adv.unlocked=8; S.adv.event=null; S.adv.zone=null; S.adv.league=null; S.adv.tower=null; S.adv.battle=null; S.adv.pending=null;
            const out={constants:{wild:C.SHINY_RATE,egg:C.PENSION.SHINY_RATE,parent:C.PENSION.SHINY_PARENT_RATE,legacyParent:C.PENSION.SHINY_PARENT_RATE_OLD,eggBerry:C.PENSION.SHINY_BERRY_MULT,raid:C.RAID.CATCH,pity:C.RAID.PITY}};
            out.wildBase=G.shinyRate('kanto'); out.dexBase=G.shinyDone('kanto');
            for(const id of G.regionDexIds(N.STORY.REGIONS.find(r=>r.key==='kanto'))) G.registerDex(id,false,'kanto');
            out.wildFull=G.shinyRate('kanto'); out.dexFull=G.shinyDone('kanto'); out.otherRegion=G.shinyRate('johto');
            S.items['starf-berry']=1; G.useBuffBerry('starf-berry'); out.buff=G.buffMult('shiny'); out.wildFullBuff=G.shinyRate('kanto')*G.buffMult('shiny');
            out.eggs=[{}, {sp:2}, {sp:1}, {bx:1}, {sp:2,bx:1}, {sp:1,bx:1}].map(e=>G.eggRate({...e,reg:'kanto'}));
            const now=G.time(); S.buffs={};
            out.captureBase=A.catchProb(A.catchCtx({id:25,level:5,shiny:true}));
            S.items['golden-razz-berry']=1; G.useBuffBerry('golden-razz-berry');
            out.captureBerry=A.catchProb(A.catchCtx({id:25,level:5,shiny:true}));
            S.adv.battle={rate:C.RAID.CATCH*255}; out.raidBerry=A.catchProb(A.catchCtx({id:25,level:100,shiny:true}));
            S.adv.battle=null; S.buffs={}; S.dex={}; S.mons=[]; S.team=[]; S.road=[];
            G.receive(G.makeMon(25,5,{shiny:false}),{home:'kanto'});
            const random=Math.random; Math.random=()=>0;
            try {
                out.firstShiny=A.tryCapture({...G.makeMon(25,5,{shiny:true}),foe:true});
                out.mons=S.mons.map(m=>({id:m.id,shiny:m.shiny}));
                out.repeatNormal=A.tryCapture({...G.makeMon(25,5,{shiny:false}),foe:true});
                const own=S.mons[0]; S.team=[own.uid]; S.road=[own.uid]; S.adv.nodes=[{type:'wild',name:'Audit route',bg:'prairie',areas:['kanto-route-1-area'],lv:[2,3]}]; S.adv.node=0; S.adv.battle=null; S.adv.pending=null;
                out.forcedMythical=A.step(); out.forcedMythicalEnemy=S.adv.battle?.enemies?.map(m=>({id:m.id,shiny:m.shiny}));
                own.id=150; own.level=100; own.hp=G.maxHp(own);
                out.forcedMythicalFate=[];
                for(let i=0;i<1000 && S.adv.battle;i++) out.forcedMythicalFate.push(...A.step().filter(e=>['fled','capture','victory','defeat'].includes(e.type)).map(e=>({type:e.type,id:e.enemy?.id,shiny:e.enemy?.shiny,success:e.success})));
                out.ownsForcedMythical=S.mons.some(m=>m.id===151);
            } finally { Math.random=random; }
            S.adv.battle=null; S.adv.pending=null;
            out.legendCanLay=[489,490,150,151].map(id=>({id,canLay:G.canLay(G.makeMon(id,5,{shiny:false}))}));
            out.legendEggRate=G.eggRate({id:489,sp:2,bx:1});
            let k=0; while(G.fixedRoll('egg',k)>=C.PENSION.SHINY_PARENT_RATE && k<100000)k++;
            const egg={uid:'audit-phione-egg',k,id:489,reg:'sinnoh',sp:2,laidAt:now-C.PENSION.HATCH_MIN*60000-1000,hatchAt:now-1000};
            G.pension().eggs=[egg]; const hatch=G.hatchEgg(egg.uid);
            out.legendHatch={id:hatch?.mon?.id,shiny:hatch?.mon?.shiny,sp:hatch?.mon?.esp,k};
            return out;
        })()`);
        assert.equal(result.constants.wild, 1 / 2048); assert.equal(result.wildBase, 1 / 2048);
        assert.equal(result.dexBase, false); assert.equal(result.dexFull, true); assert.equal(result.wildFull, 1 / 1024);
        assert.equal(result.otherRegion, 1 / 2048); assert.equal(result.buff, 2); assert.equal(result.wildFullBuff, 1 / 512);
        assert.deepEqual(result.eggs, [1 / 512, 1 / 16, .1, 1 / 256, 1 / 8, .2]);
        assert.equal(result.captureBase, 190 * .6 / 255); assert.equal(result.captureBerry, 190 * .6 / 255 * 1.5); assert.equal(result.raidBerry, .015);
        assert.equal(result.firstShiny.success, true); assert.equal(!!result.firstShiny.candy, false);
        assert.ok(result.mons.some(mon => !mon.shiny) && result.mons.some(mon => mon.shiny));
        assert.equal(result.repeatNormal.success, true); assert.ok(result.repeatNormal.candy);
        assert.deepEqual(result.forcedMythicalEnemy, [{ id: 151, shiny: true }]);
        assert.ok(result.forcedMythicalFate.some(event => event.type === 'fled' && event.id === 151 && event.shiny));
        assert.equal(result.ownsForcedMythical, false);
        assert.deepEqual(result.legendCanLay, [{id:489,canLay:true},{id:490,canLay:true},{id:150,canLay:false},{id:151,canLay:false}]);
        assert.equal(result.legendEggRate, 1 / 8);
        assert.equal(result.legendHatch.id, 489); assert.equal(result.legendHatch.shiny, true); assert.equal(result.legendHatch.sp, 2);
        const report = { pass: true, checks: 25, generated: new Date().toISOString(), source: process.argv[2], network: 'HTTP and HTTPS blocked before local page navigation', result };
        if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(process.argv[3] ? { pass: true, checks: report.checks, output: process.argv[3] } : report, null, 2));
    } finally { if (send && socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); } child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
