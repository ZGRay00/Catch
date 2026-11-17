// Read-only audit of a downloaded public bundle in a fresh, network-blocked browser.
// No live game page, account, player save or reward upload is used.
// Usage: node tests/pokecatch-yields-native-20261117.cjs APP_JS [OUTPUT_JSON]
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process'), { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    assert.ok(process.argv[2], 'Pass the downloaded public bundle');
    const source = fs.readFileSync(process.argv[2], 'utf8');
    const namespace = /([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source), alias = namespace?.[1];
    const boundary = alias ? source.indexOf(`,${alias}.Roaming=`, namespace.index) : -1;
    assert.ok(boundary > 0, 'Review the public module boundary before running');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokecatch-yields-native-20261117-'));
    fs.writeFileSync(path.join(dir, 'runtime.js'), 'window.LANG_PICK={pref:"fr",lang:"fr",LANGS:["fr"]};window.BUILD="isolated-yield-audit";' + source.slice(0, boundary) + `;window.__pcResearch=${alias};})();`);
    fs.writeFileSync(path.join(dir, 'index.html'), '<meta charset="utf-8"><script src="runtime.js"></script>');
    const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    assert.ok(chrome, 'Chrome or Edge is required');
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let socket, send;
    try {
        let pages;
        for (let n = 0; n < 80; n++) {
            try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.length) break; } catch {}
            await delay(100);
        }
        assert.ok(pages?.length, 'The isolated browser did not start');
        socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let seq = 0;
        const pending = new Map();
        socket.onmessage = event => {
            const message = JSON.parse(event.data), call = pending.get(message.id);
            if (!call) return;
            pending.delete(message.id); clearTimeout(call.timer);
            message.error ? call.reject(Error(message.error.message)) : call.resolve(message.result);
        };
        send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 15000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => {
            const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
            return result.result.value;
        };
        await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
        await send('Page.enable'); await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href });
        for (let n = 0; n < 80 && !await evaluate('!!window.__pcResearch'); n++) await delay(50);
        assert.equal(await evaluate('!!window.__pcResearch'), true);
        const results = await evaluate(`(() => {
            const t=__pcResearch,G=t.Game,A=t.Adventure,C=t.CONFIG;
            G.load(); A.ensure(); G.stopSaving();
            const adv=structuredClone(G.S.adv),originalRandom=Math.random,base=Date.now(); let serial=0,auditNow=base;
            t.Clock={now:()=>auditNow};
            const run=(mode,kind,random,options={})=>{
                const now=base+(++serial)*10000; auditNow=now; G.setClock(now);
                const s=G.freshState();
                Object.assign(s,{money:0,mons:[{uid:'active',id:6,reg:'kanto',level:40,xp:0},{uid:'bench',id:9,reg:'kanto',level:40,xp:0}],team:['active','bench'],road:['active','bench'],trainer:{feats:{}},lastTick:now-1500});
                s.adv={...structuredClone(adv),chapter:3,unlocked:8,nodes:[],node:0,battle:null,pending:null,loops:[],badges:[],gifts:{},event:null,zone:null,tower:null,league:null,speed:4};
                if(options.buddy)s.buddy={uid:'active',ko:0};
                if(kind==='reward'){
                    s.adv.nodes=[{type:'trainer',team:[[19,30]],trainer:'audit-trainer'}];
                    s.adv.battle={kind:'trainer',enemies:[{id:19,uid:'foe',level:30,hp:0,foe:true}],allies:['active'],foes:['foe'],slots:1,queue:[],turn:1};
                }
                else s.adv.nodes=[{type:'item',find:{item:kind,n:1},name:'audit-item'}];
                let seed=random; Math.random=options.constant?()=>random:()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
                try{return G.sandbox(s,()=>{let sum=null,events=null;
                    if(mode==='offline'){const job=A.offline(1500);job.run();sum=job.sum;}else events=A.step();
                    return{money:s.money,xp:s.mons.map(mon=>mon.xp),levels:s.mons.map(mon=>mon.level),wins:s.stats.wins,items:s.items,steps:sum?.steps??1,eventTypes:events?.map(event=>event.type),sum};
                });}finally{Math.random=originalRandom;G.setClock(null);}
            };
            const pairedBattles=[1,10,100,500,1000].map(seed=>({seed,online:run('online','reward',seed),offline:run('offline','reward',seed)}));
            const buddy={online:run('online','reward',1,{buddy:true}),offline:run('offline','reward',1,{buddy:true})};
            const itemThresholds=[.249,.25,.49,.499999,.5,.9].map(random=>({random,online:run('online','potion',random,{constant:true}),offline:run('offline','potion',random,{constant:true}),offlineStone:run('offline','fire-stone',random,{constant:true})}));
            const rates=G.sandbox({...G.freshState(),adv:{...structuredClone(adv),chapter:3,unlocked:8},dex:{}},()=>{
                const base=G.shinyRate('kanto'); for(const id of G.regionDexIds(t.STORY.REGIONS.find(region=>region.key==='kanto')))G.S.dex[id]={caught:1};
                return{base,complete: G.shinyRate('kanto')};
            });
            return{pairedBattles,buddy,itemThresholds,rates,config:{shiny:C.SHINY_RATE,xpOffline:C.OFFLINE_XP_MULT,itemOffline:C.OFFLINE_ITEM_RATE,maxOfflineMs:C.OFFLINE_MAX_MS,maxOfflineLevels:C.OFFLINE_MAX_LEVELS,normalOfflineStepMs:C.OFFLINE_STEP_MS,actionMs:C.ACTION_MS,speedPace:C.SPEED_PACE,activeBonus:C.XP_ACTIVE_BONUS,buddyXp:C.BUDDY_XP_MULT,pensionShiny:C.PENSION.SHINY_RATE,pensionShinyParent:C.PENSION.SHINY_PARENT_RATE}};
        })()`);
        fs.writeFileSync(path.join(dir, 'raw-results.json'), JSON.stringify(results, null, 2) + '\n');
        for (const { online, offline } of results.pairedBattles) {
            assert.equal(online.wins, 1); assert.equal(offline.wins, 1);
            assert.equal(online.money, offline.money); assert.ok(online.money > 0);
            for (let i = 0; i < online.xp.length; i++) assert.ok(Math.abs(online.xp[i] * .5 - offline.xp[i]) <= 1);
        }
        for (const { random, online, offline, offlineStone } of results.itemThresholds) {
            assert.equal(online.items.potion, 1);
            assert.equal(offline.items.potion || 0, random < .5 ? 1 : 0);
            assert.equal(offlineStone.items['fire-stone'], 1);
        }
        assert.equal(results.rates.base, 1 / 2048); assert.equal(results.rates.complete, 1 / 1024);
        assert.equal(results.config.maxOfflineMs, 8 * 3600000); assert.equal(results.config.maxOfflineLevels, 12);
        assert.equal(results.config.buddyXp, 1.3);
        const report = { date: '2026-11-17', build: '1a16948eef', source: 'https://pokecatch-online.pages.dev/bundle/app.17255d8d2e.js', sha256: createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'), method: 'Synthetic native reward settlement, identical defeated trainer foe and party; all external HTTP(S) blocked; does not measure a player account per hour.', ...results };
        const output = process.argv[3] || path.join(dir, 'results.json');
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ result: 'PASS', report: output, paired: report.pairedBattles.map(({ seed, online, offline }) => ({ seed, onlineXp: online.xp, offlineXp: offline.xp, onlineMoney: online.money, offlineMoney: offline.money })), rates: report.rates, config: report.config }, null, 2));
    } finally {
        if (send && socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
        child.kill();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
