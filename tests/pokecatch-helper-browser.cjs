// Offline browser regression. No game account, API calls, or modified game runtime.
// Run: node tests/pokecatch-helper-browser.cjs (Chrome/Edge, Node 22+).
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { pathToFileURL } = require('node:url');
const net = require('node:net'), assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');
const delay = ms => new Promise(r => setTimeout(r, ms));
const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokecatch-helper-browser-'));
const chrome = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
assert.ok(chrome, 'Set CHROME_PATH to Chrome or Edge');

function fixture() {
    const s = { trainer: { id: 'offline-browser' }, money: 3000, mons: [{ uid: 'a', id: 6, level: 100 }, { uid: 'b', id: 9, level: 100 }], team: ['a', 'b'],
        dex: {}, stats: { wins: 0, caught: 0, battles: 0 }, travel: { to: ['johto', 'hoenn', 'sinnoh'] },
        adv: { layout: 6, chapter: 0, unlocked: 65, node: 0, runs: 0, speed: 4, loops: [0, 31], badges: ['Maître'], gifts: { starter: true }, deaths: {} } };
    const source = fs.readFileSync(path.join(__dirname, '..', 'Pokecatch自动助手.user.js'), 'utf8')
        .replace('    mount();', '    window.__pcTest={engine,DOMDriver,DATA,DEFAULTS,candidates,economicRegion,levelEvolution,projectEvolution,planAdventureTeam}; mount();');
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PokéCatch · offline test</title>
    <style>body{background:#111a29;color:#eee;font:16px system-ui;margin:0;padding:20px}.screen{display:none}.screen.active{display:block}.rg,.mp-row,.mp-go,#tabs button{padding:8px;margin:4px}.pg-loop{display:inline-block;padding:9px;background:#345}.modal{position:fixed;left:10px;top:100px;background:#234;padding:20px}#modal-root:not(.open){display:none}#evt-pick{position:fixed;top:100px;left:20px;background:#234;padding:20px}</style>
    <style>#tabs>[data-screen="adventure"]{display:none}@media(max-width:700px){#tabs>[data-screen="adventure"]{display:inline-block}#side-chapter{display:none}}</style>
    <button id="side-chapter">当前章节 / 返回冒险</button><nav id="tabs">${['adventure', 'map', 'raid','team'].map(n => `<button data-screen="${n}">${n}</button>`).join('')}</nav>
    <section class="screen active" id="screen-adventure"><h1>离线游戏夹具</h1><div id="speed-btns"><button data-speed="1">×1</button><button data-speed="2">×2</button><button data-speed="4">×3</button></div></section>
    <section class="screen" id="screen-map"><div id="map-root"></div></section><section class="screen" id="screen-raid"><div id="raid-root"></div></section><section class="screen" id="screen-team"><div id="team-slots" style="display:flex;gap:4px"></div><div id="team-mini" hidden></div><input id="pc-search"><div id="pc-active"></div><div id="pc-grid" style="min-height:110px"></div></section><div id="modal-root"></div>
    <script>
    const previousHelperUI=localStorage.getItem('pokecatch-helper:v1:ui'),preserveResume=localStorage.getItem('pc-regression-resume');if(!preserveResume)localStorage.clear();if(previousHelperUI)localStorage.setItem('pokecatch-helper:v1:ui',previousHelperUI);window.BUILD=${JSON.stringify(H.DATA.build)};
    const state=preserveResume?JSON.parse(localStorage.getItem('gachamon-save-v1')):${JSON.stringify(s)}, chapters=${JSON.stringify(H.DATA.chapters.map(c => ({ id: c.id, reg: c.reg, loop: c.loop, name: c.name, league: c.league }))) },zones=${JSON.stringify(H.DATA.zones)};
    let region='kanto', selected='0', allies=0, phase='home';let actions=0;const save=()=>localStorage.setItem('gachamon-save-v1',JSON.stringify(state));localStorage.setItem('pokecatch-tab','offline');save();
    function nav(name){document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('active',e.id==='screen-'+name));if(name==='map')map();if(name==='raid')raid();if(name==='team')adventureTeam()}
    function adventureTeam(){const slots=document.querySelector('#team-slots');slots.innerHTML=Array.from({length:6},(_,i)=>'<div class="slot '+(state.team[i]?'filled':'empty')+'" '+(state.team[i]?'data-uid="'+state.team[i]+'"':'')+' style="width:75px;height:90px;border:1px solid #678">'+(state.team[i]||'+')+'</div>').join('');const search=document.querySelector('#pc-search');search.oninput=()=>{const q=search.value;document.querySelector('#pc-grid').innerHTML=state.mons.filter(m=>!state.team.includes(m.uid)&&(!q||String(m.id)===q)).map(m=>'<div class="pc-cell" data-uid="'+m.uid+'" style="display:inline-block;width:75px;height:80px;border:1px solid #789">'+m.id+'</div>').join('')};search.oninput()}
    let nativeDrag=null;document.addEventListener('pointerdown',e=>{const card=e.target.closest('#team-slots [data-uid],#pc-grid [data-uid]');if(card)nativeDrag={uid:card.dataset.uid,pc:!!card.closest('#pc-grid'),id:e.pointerId}});
    document.addEventListener('pointermove',e=>{if(nativeDrag&&e.pointerId===nativeDrag.id)nativeDrag.point={x:e.clientX,y:e.clientY}});
    document.addEventListener('pointerup',e=>{const d=nativeDrag;nativeDrag=null;if(!d||d.id!==e.pointerId||!d.point)return;const contains=r=>d.point.x>=r.left&&d.point.x<=r.right&&d.point.y>=r.top&&d.point.y<=r.bottom;const slots=[...document.querySelector('#team-slots').children],index=slots.findIndex(el=>contains(el.getBoundingClientRect()));if(index>=0){if(d.pc){if(index<state.team.length)state.team[index]=d.uid;else state.team.push(d.uid)}else{const old=state.team.indexOf(d.uid);[state.team[old],state.team[index]]=[state.team[index],state.team[old]]}}else if(!d.pc&&contains(document.querySelector('#pc-grid').getBoundingClientRect()))state.team=state.team.filter(uid=>uid!==d.uid);else return;save();actions++;adventureTeam()});
    document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>nav(b.dataset.screen));
    document.querySelector('#side-chapter').onclick=()=>document.querySelector('#screen-adventure.active')?nav('map'):document.querySelector('#tabs [data-screen="adventure"]').click();
    function map(){const root=document.querySelector('#map-root');const rows=chapters.filter(c=>c.reg===region);const seen=new Set();root.innerHTML='<div class="pg-regions">'+[...new Set(chapters.map(c=>c.reg))].map(r=>'<button class="rg open '+(r===region?'active':'')+'" data-rg="'+r+'">'+r+'</button>').join('')+'</div>'+rows.filter(c=>!seen.has(c.loop)&&seen.add(c.loop)).map(c=>{const id=c.league?'L':c.id;return '<button class="mp-row '+(String(selected)===String(id)?'sel':'')+'" data-ch="'+id+'">'+c.name+' <span class="pg-loop" data-loop="'+c.loop+'" aria-checked="'+state.adv.loops.includes(c.loop)+'">↻</span></button>'}).join('')+'<button class="mp-go" data-go="'+selected+'">Go</button>';
      root.insertAdjacentHTML('beforeend',zones.filter(z=>z.reg===region).map(z=>'<button class="mp-row lz-open '+(String(selected)==='Z'+z.id?'sel':'')+'" data-ch="Z'+z.id+'">'+z.monName+'</button>').join(''));
      if(String(selected).startsWith('Z')){const id=+String(selected).slice(1),tier=state.dex[id]?.caught?(state.elite?.[id]?.t||0)+1:0;root.insertAdjacentHTML('beforeend','<button class="mp-go" data-zone="'+id+'" '+(tier?'data-tier="'+tier+'"':'')+' '+(window.zoneLocked?'disabled':'')+'>'+(window.zoneLocked?'条件未满足':'Challenge')+'</button>');root.querySelector('[data-zone]').onclick=()=>{state.adv.zone={id,foe:id,back:state.adv.chapter,...(tier?{elite:tier}:{})};save();actions++;nav('adventure')}}
      root.querySelectorAll('[data-rg]').forEach(b=>b.onclick=()=>{region=b.dataset.rg;selected=String(chapters.find(c=>c.reg===region).id);actions++;map()});
      root.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>{selected=b.dataset.ch;actions++;map()});
      root.querySelectorAll('[data-loop]').forEach(b=>b.onclick=e=>{e.stopPropagation();const c=chapters.find(c=>String(c.loop)===b.dataset.loop);state.adv.loops=state.adv.loops.includes(c.loop)?state.adv.loops.filter(k=>k!==c.loop):[...state.adv.loops,c.loop];save();actions++;map()});
      root.querySelector('[data-go]').onclick=()=>{const current=chapters.find(c=>c.id===state.adv.chapter),next=selected==='L'?(current?.reg===region&&current.league?current.id:chapters.find(c=>c.reg===region&&c.league).id):+selected;if(next!==state.adv.chapter||state.adv.event||state.adv.zone){state.adv.node=0;state.adv.battle=null;state.adv.pending=null;state.adv.event=null;state.adv.zone=null;}state.adv.chapter=next;save();actions++;nav('adventure')};
    }
    function team(){const el=document.createElement('div');el.id='evt-pick';el.innerHTML='<div id="evt-team"></div><button id="evt-opt">Optimise</button><button data-evt-close>Close</button>';document.body.appendChild(el);el.querySelector('#evt-opt').onclick=()=>{window.teamOptimizations=(window.teamOptimizations||0)+1;state.eventTeams={'raid:kanto':['a','b']};save();el.querySelector('#evt-team').innerHTML='<div data-uid="a"></div><div data-uid="b"></div>';actions++};el.querySelector('[data-evt-close]').onclick=()=>{el.remove();actions++}}
    function ally(){const root=document.querySelector('#modal-root');root.className='open';root.innerHTML='<div class="modal dexcard-modal raid-dlg"><button class="dc-x">Close</button><button disabled data-pick="disabled">Unavailable</button><button data-pick="weak"><span class="rt-mon"><img data-id="10" src="data:,">弱盟友</span></button><button data-pick="strong"><span class="rt-mon"><img data-id="150" src="data:,">强盟友</span></button></div>';root.querySelector('.dc-x').onclick=()=>{root.className='';root.replaceChildren();window.allyCloses=(window.allyCloses||0)+1};root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{window.lastAlly=b.dataset.pick;allies++;root.className='';root.innerHTML='';actions++;raid()})}
    function raid(){const root=document.querySelector('#raid-root');if(phase==='home'){root.innerHTML='<button data-raid-page="chroma">Chroma</button>';root.firstChild.onclick=()=>{phase='cards';actions++;raid()};return}root.innerHTML='<div class="rc-card" data-rc="kanto"><h3>怪力</h3><div class="boss"><img data-id="68" src="data:,"></div><button data-raid-edit="kanto">Team</button><button data-raid-go="kanto">Raid</button></div>';if(state.adv.event?.raid){root.insertAdjacentHTML('beforeend','<button data-raid-leave>Leave raid</button>');root.querySelector('[data-raid-leave]').onclick=()=>{state.adv.event=null;save();actions++;nav('adventure')}}root.querySelector('[data-raid-edit]').onclick=team;root.querySelector('[data-raid-go]').onclick=()=>{actions++;if(!state.eventTeams?.['raid:kanto']?.length)return team();if(allies<2)return ally();state.adv.event={raid:true,reg:'kanto',id:68,loops:0};save();nav('adventure')}}
    window.mock={state,save,nav,team,get actions(){return actions}};
    <\/script><script>${fs.readFileSync(path.join(__dirname,'fixtures/pokecatch-automation-browser.js'),'utf8').replace(/<\/script/gi,'<\\/script')}</script><script>${source.replace(/<\/script/gi, '<\\/script')}</script></html>`;
}
async function main() {
    const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r));
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(taskDir, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let socket, send, errors = [];
    try {
        let pages;
        for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.length) break; } catch {} await delay(100); }
        assert.ok(pages?.length, 'Browser debugging endpoint');
        socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl); await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
        let id = 0; const pending = new Map();
        socket.onmessage = event => { const m = JSON.parse(event.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
        send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; const timer = setTimeout(() => { pending.delete(seq); reject(new Error('CDP timeout: ' + method)); }, 15000); pending.set(seq, { resolve, reject, timer }); socket.send(JSON.stringify({ id: seq, method, params })); });
        const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
        await send('Runtime.enable'); await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        const html = path.join(taskDir, 'fixture.html'); fs.writeFileSync(html, fixture()); await send('Page.navigate', { url: pathToFileURL(html).href });
        for (let n = 0; n < 60 && !await evaluate('!!window.__pcTest'); n++) await delay(100);
        assert.equal(await evaluate('!!window.__pcTest'), true);
        // A separate active tab exercises real Page Visibility and the same Chromium
        // focus command used by the optional extension. No game account is involved.
        const {targetId:otherTab}=await send('Target.createTarget',{url:'about:blank',background:false});
        try{
            await send('Target.activateTarget',{targetId:otherTab});
            for(let i=0;i<20&&!await evaluate('document.hidden');i++)await delay(100);
            const tryAction=`(()=>{const e=__pcTest.engine;const probe=document.createElement('button');probe.textContent='test';document.body.append(probe);
                let clicked=false;probe.onclick=()=>{clicked=true};e.running=true;e.driver.lastClick=0;
                try{e.driver.click(probe,'test background control');return {hidden:document.hidden,clicked};}
                finally{probe.remove();e.running=false;e.action='';}})()`;
            assert.deepEqual(await evaluate(tryAction),{hidden:true,clicked:false});
            await send('Emulation.setFocusEmulationEnabled',{enabled:true});
            assert.deepEqual(await evaluate(tryAction),{hidden:false,clicked:true});
        }finally{
            await send('Emulation.setFocusEmulationEnabled',{enabled:false});await send('Target.closeTarget',{targetId:otherTab});await send('Page.bringToFront');
        }
        const railTest=await evaluate(`(()=>{
            const e=__pcTest.engine,root=document.querySelector('#pokecatch-auto-helper').shadowRoot;
            const toggle=root.querySelector('[data-setting="activeSwitch"]'),defaultOff=!toggle.checked;
            toggle.click();
            const fixture=document.createElement('div');
            fixture.innerHTML='<div id="enemy-slot"><span class="enemy" data-uid="f">F</span></div><div id="team-rail"><button class="tr-row active" data-uid="g">G</button><button class="tr-row" data-uid="w">W</button></div>';
            document.querySelector('#screen-adventure').append(fixture);
            const foe={id:478,uid:'f',level:100,hp:500},b={kind:'gym',slots:1,allies:['g'],foes:['f'],enemies:[foe]};
            const s={mons:[{uid:'g',id:389,level:100,hp:1},{uid:'w',id:395,level:100}],team:['g','w'],road:['g','w'],adv:{chapter:55,unlocked:55,battle:b}};
            let clicks=0;fixture.querySelector('[data-uid="w"]').onclick=()=>clicks++;
            e.running=true;const attempt=()=>{e.driver.lastClick=0;return e.driver.switchInBattle(s,1732000000000)};
            const native=attempt();s.autoSwitch=false;
            const enemy=fixture.querySelector('.enemy');enemy.dataset.uid='previous';const stale=attempt();enemy.dataset.uid='f';
            const first=attempt(),repeat=attempt();
            e.running=false;fixture.remove();toggle.click();
            return {defaultOff,native,stale,first,repeat,clicks};
        })()`);
        assert.deepEqual(railTest,{defaultOff:true,native:false,stale:false,first:true,repeat:false,clicks:1},'active switch uses one live rail click and yields to the native setting or a stale scene');
        assert.equal(await evaluate(`(()=>{const root=document.querySelector('#pokecatch-auto-helper').shadowRoot;return __pcTest.engine.settings.autoEvolve===true&&root.querySelector('[data-setting="autoEvolve"]').checked})()`),true,'free level evolution is enabled by default and visible in the panel');
        const manualPolicy=await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot;for(const key of ['autoTeam','optimizeRaid']){const el=r.querySelector('[data-setting="'+key+'"]');if(el.tagName!=='SELECT')throw Error(key+' must expose an explicit automatic/manual selector');el.value='false';el.dispatchEvent(new Event('change',{bubbles:true}));}r.querySelector('#add-job').click();const saved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:offline-browser'));localStorage.setItem('pc-regression-resume','1');return{auto:e.settings.autoTeam,special:e.settings.optimizeRaid,types:[typeof e.settings.autoTeam,typeof e.settings.optimizeRaid],saved:[saved.settings.autoTeam,saved.settings.optimizeRaid],queued:[e.queue[0].settings.autoTeam,e.queue[0].settings.optimizeRaid]}})()`);
        assert.deepEqual(manualPolicy,{auto:false,special:false,types:['boolean','boolean'],saved:[false,false],queued:[false,false]},'manual selectors persist real booleans and queue snapshots');
        const manualPolicyOrigin=await evaluate('performance.timeOrigin');await send('Page.reload');
        for(let n=0;n<80&&!await evaluate(`performance.timeOrigin!==${manualPolicyOrigin}&&!!window.__pcTest`);n++)await delay(50);
        assert.deepEqual(await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot;return{settings:[e.settings.autoTeam,e.settings.optimizeRaid],values:['autoTeam','optimizeRaid'].map(key=>r.querySelector('[data-setting="'+key+'"]').value),queued:[e.queue[0].settings.autoTeam,e.queue[0].settings.optimizeRaid]}})()`),{settings:[false,false],values:['false','false'],queued:[false,false]},'a real reload restores explicit manual choices and their queued job');
        await evaluate(`(()=>{const e=__pcTest.engine;e.queue=[];e.queueRunning=false;e.queueIndex=0;e.persist(false);localStorage.removeItem('pc-regression-resume');e.onChange()})()`);
        assert.equal(await evaluate(`(()=>{const e=__pcTest.engine;e.schedule=()=>{};const root=document.querySelector('#pokecatch-auto-helper').shadowRoot;for(const [key,value] of Object.entries({mode:'money',region:'all',autoTeam:true,optimizeRaid:true,raids:false,autoPrepare:false,autoEvolve:false,autoUnderDispatch:false,trainBuddy:false,trainBuff:false,moneyBuff:false})){const el=root.querySelector('[data-setting="'+key+'"]');if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))}e.start();return e.running})()`), true);
        await evaluate(`(()=>{const e=__pcTest.engine;e.travel(__pcTest.candidates(e.read(),e.settings,true).find(c=>c.id===15),Date.now())})()`);
        for (let n = 0; n < 25 && await evaluate('!!__pcTest.engine.driver.pendingMap'); n++) await evaluate('(async()=>{const e=__pcTest.engine;e.driver.lastClick=0;await e.step()})()');
        assert.equal(await evaluate('mock.state.adv.chapter'), 15);
        assert.deepEqual(await evaluate('mock.state.adv.loops'), [15], 'clear loops in every other region');
        await evaluate(`(()=>{const e=__pcTest.engine;e.target=null;e.raidProbe=true;e.raidProbeStarted=Date.now();e.settings.raids=true;e.driver.lastClick=0;e.onChange()})()`);
        let handoffs=0;
        for (let n=0;n<45&&!await evaluate('!!mock.state.adv.event');n++){
            if(await evaluate("!!document.querySelector('#modal-root.open .raid-dlg')")&&handoffs<2){
                await evaluate(`(()=>{const e=__pcTest.engine;e.settings.manualResume=true;e.manualInput();e.inputHeld=true;e.onChange()})()`);
                if(!handoffs){
                    await evaluate("document.querySelector('#pokecatch-auto-helper').shadowRoot.querySelector('#resume').click()");
                }else{
                    await evaluate('__pcTest.engine.inputHeld=false;__pcTest.engine.manual.until=0');
                }
                handoffs++;
            }
            await evaluate('(async()=>{const e=__pcTest.engine;e.driver.lastClick=0;await e.step();e.onChange()})()');await delay(10);
        }
        assert.equal(handoffs,2,'resume button and idle recovery both continue an interrupted ally choice');
        assert.equal(await evaluate('window.allyCloses||0'),0,'a native ally picker must never be dismissed as a dex information card');
        assert.equal(await evaluate('mock.state.adv.event?.raid'), true, 'raid entry with team and two allies');
        assert.equal(await evaluate('window.lastAlly'), 'strong');
        assert.equal(await evaluate('mock.state.eventTeams["raid:kanto"].length'), 2);
        // Reproduce the screenshot: already fighting Clefairy at attempt 23, then Start.
        const adopted = await evaluate(`(async()=>{const e=__pcTest.engine;e.stop('fixture-refresh');mock.state.adv.event={raid:true,reg:'kanto',id:35,loops:23,date:'2026-11-12',back:0};mock.save();e.settings.raids=false;e.onChange();const label=document.querySelector('#pokecatch-auto-helper').shadowRoot.querySelector('#start').textContent;const party=JSON.stringify(mock.state.eventTeams);e.driver.raid=null;e.start();const save=localStorage.getItem('gachamon-save-v1'),before=mock.actions;await e.step();e.onChange();return{label,running:e.running,status:e.status,boss:e.driver.raid?.boss,adopted:e.driver.raid?.adopted,clicks:mock.actions-before,partyUnchanged:party===JSON.stringify(mock.state.eventTeams),saveUnchanged:save===localStorage.getItem('gachamon-save-v1')}})()`);
        assert.equal(adopted.label, '接管当前团体战'); assert.equal(adopted.running, true);
        assert.match(adopted.status, /团体战进行中.*23\/150/);
        assert.equal(adopted.boss, 35); assert.equal(adopted.adopted, true); assert.equal(adopted.clicks, 0);
        assert.equal(adopted.partyUnchanged, true); assert.equal(adopted.saveUnchanged, true);
        const returned=await evaluate(`(()=>{nav('raid');const e=__pcTest.engine,tab=document.querySelector('#tabs [data-screen="adventure"]'),before=localStorage.getItem('gachamon-save-v1');e.driver.lastClick=0;const first=e.driver.nav('adventure'),second=e.driver.nav('adventure');return{hidden:getComputedStyle(tab).display==='none',first,second,screen:document.querySelector('.screen.active').id,saveUnchanged:before===localStorage.getItem('gachamon-save-v1')}})()`);
        assert.equal(returned.hidden,true);assert.equal(returned.first,false);assert.equal(returned.second,true);assert.equal(returned.screen,'screen-adventure');assert.equal(returned.saveUnchanged,true);
        const recovered=await evaluate(`(()=>{nav('raid');const e=__pcTest.engine,tab=document.querySelector('#tabs [data-screen="team"]'),handler=tab.onclick,before=localStorage.getItem('gachamon-save-v1');let delayed=0;try{tab.onclick=()=>delayed++;e.driver.lastClick=0;e.driver.nav('team');const pending=!!e.driver.navigation;tab.onclick=handler;e.driver.navigation.nextAt=0;e.driver.lastClick=0;e.driver.nav('team');const accepted=e.driver.nav('team');e.driver.lastClick=0;e.driver.nav('adventure');e.driver.nav('adventure');return{pending,delayed,accepted,cleared:!e.driver.navigation,screen:document.querySelector('.screen.active').id,saveUnchanged:before===localStorage.getItem('gachamon-save-v1')}}finally{tab.onclick=handler;}})()`);
        assert.deepEqual(recovered,{pending:true,delayed:1,accepted:true,cleared:true,screen:'screen-adventure',saveUnchanged:true});
        // Fresh catch acknowledgement versus a purchase confirmation: only the former is handled.
        assert.equal(await evaluate(`(()=>{const el=document.querySelector('#modal-root');el.className='open';el.innerHTML='<div class="modal dexcard-modal"><span class="dc-new">NEW</span><div class="modal-actions solo"><button class="btn gold">Continue</button></div></div>';el.querySelector('button').onclick=()=>{el.className='';el.innerHTML=''};__pcTest.engine.driver.lastClick=0;return __pcTest.engine.driver.receipt()})()`), true);
        assert.equal(await evaluate(`(()=>{const el=document.querySelector('#modal-root');el.className='open';el.innerHTML='<div class="modal dexcard-modal"><p>Buy?</p><div class="modal-actions"><button class="btn gold">Buy</button></div></div>';return __pcTest.engine.driver.receipt()})()`), false);
        await evaluate(`document.querySelector('#modal-root').className='';__pcTest.engine.onChange()`);
        const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(taskDir, 'desktop.png'), Buffer.from(shot.data, 'base64'));
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const bounds = await evaluate(`(()=>{const r=document.querySelector('#pokecatch-auto-helper').getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`);
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.bottom <= bounds.height, 'mobile panel stays inside viewport');
        const mobile = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(taskDir, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
        const resumed = await evaluate(`(async()=>{const e=__pcTest.engine;e.stop('manual pause');e.start();await e.step();const running=e.running;mock.state.adv.event=null;mock.save();await e.step();return{running,after:e.running,raid:e.driver.raid,probe:e.raidProbe,pending:!!e.driver.pendingMap}})()`);
        assert.equal(resumed.running, true); assert.equal(resumed.after, true); assert.equal(resumed.raid, null); assert.equal(resumed.probe, false); assert.equal(resumed.pending, true);
        const timed = await evaluate(`(async()=>{const e=__pcTest.engine;e.stop('timeout-fixture');mock.state.adv.event={raid:true,reg:'kanto',id:35,loops:23};mock.save();phase='home';mock.nav('adventure');e.start();e.driver.raid.started=Date.now()-91*60000;for(let i=0;i<8&&mock.state.adv.event;i++){e.driver.lastClick=0;await e.step()}return{event:mock.state.adv.event,cooldowns:Object.values(e.raidCooldown),now:Date.now(),running:e.running}})()`);
        assert.equal(timed.event, null, 'timeout must open Chroma from raid home before clicking Leave');
        assert.equal(timed.running, true); assert.ok(timed.cooldowns.some(expiry => expiry > timed.now));
        const stopped = await evaluate(`(async()=>{const e=__pcTest.engine;e.stop('test-stop');const before=mock.actions;await e.step();e.driver.click(document.querySelector('#tabs button'),'must not click');return{before,after:mock.actions,running:e.running}})()`);
        assert.equal(stopped.before, stopped.after); assert.equal(stopped.running, false);
        const setUI = async values => evaluate(`(()=>{const root=document.querySelector('#pokecatch-auto-helper').shadowRoot,folded=root.querySelector('.panel').classList.contains('hidden');if(folded)root.querySelector('.mini').click();__pcTest.engine.onChange();for(const [key,value] of Object.entries(${JSON.stringify(values)})){const el=root.querySelector('[data-setting="'+key+'"]');if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))}if(folded)root.querySelector('#fold').click()})()`);
        const tick = async () => evaluate('(async()=>{const e=__pcTest.engine;e.driver.lastClick=0;await e.step();e.onChange()})()');
        const begin = async () => evaluate(`document.querySelector('#pokecatch-auto-helper').shadowRoot.querySelector('#start').click()`);
        await setUI({ mode:'legend',legendId:145,legendTier:0,optimizeRaid:false,raids:true });
        await begin();
        for(let n=0;n<15&&!await evaluate('!!mock.state.adv.zone');n++)await tick();
        assert.equal(await evaluate('mock.state.adv.zone?.id'),145,'specified legendary launches through native map');
        assert.equal(await evaluate('__pcTest.engine.raidProbe'),false,'specified legend keeps priority over raids');
        await evaluate('mock.state.dex[145]={caught:1};mock.state.adv.zone=null;mock.save()');await tick();
        assert.equal(await evaluate('__pcTest.engine.running'),false,'ordinary catch ends target task');
        await setUI({legendTier:2});await begin();
        for(let n=0;n<15&&!await evaluate('!!mock.state.adv.zone');n++)await tick();
        assert.equal(await evaluate('mock.state.adv.zone?.elite'),1);
        await evaluate('mock.state.elite={145:{t:1}};mock.state.adv.zone=null;mock.save()');
        for(let n=0;n<15&&!await evaluate('!!mock.state.adv.zone');n++)await tick();
        assert.equal(await evaluate('mock.state.adv.zone?.elite'),2,'only next elite tier is selected');
        await evaluate('mock.state.elite[145].t=2;mock.state.adv.zone=null;mock.save()');await tick();assert.equal(await evaluate('__pcTest.engine.running'),false);
        await setUI({legendId:144,legendTier:0});await evaluate('window.zoneLocked=true');await begin();
        for(let n=0;n<15&&await evaluate('__pcTest.engine.running');n++)await tick();
        assert.match(await evaluate('__pcTest.engine.status'),/等待.*开放.*条件未满足/);
        assert.equal(await evaluate('__pcTest.engine.running'),true,'native closed conditions keep the target waiting');
        assert.equal(await evaluate('mock.state.adv.zone'),null,'disabled target never starts');await evaluate('window.zoneLocked=false;mock.nav("map")');
        for(let n=0;n<15&&!await evaluate('!!mock.state.adv.zone');n++)await tick();
        assert.equal(await evaluate('mock.state.adv.zone?.id'),144,'original target launches after native conditions unlock');
        await evaluate('mock.state.dex[144]={caught:1};mock.state.adv.zone=null;mock.save()');await tick();
        assert.equal(await evaluate('__pcTest.engine.running'),false,'the unlocked legendary goal completes normally');
        await setUI({mode:'item',itemId:'berry-oran',itemQuantity:2,raids:false});await begin();await tick();
        assert.ok(await evaluate('!!__pcTest.engine.driver.pendingMap'),'item planner chooses native chapter');
        await evaluate('mock.state.stats.itemIn={"berry-oran":2};mock.save()');await tick();
        assert.equal(await evaluate('__pcTest.engine.running'),false);
        assert.equal(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#dex-value").textContent'),'2/2');
        await evaluate('mock.state.mons.forEach(m=>{m.level=40;m.xp=0});mock.save()');
        await setUI({mode:'train',trainUid:'team',trainLevel:41});await begin();await tick();
        assert.ok(await evaluate('!!__pcTest.engine.driver.pendingMap'),'training planner chooses XP map');
        await evaluate('mock.state.mons.forEach(m=>{m.level=41;m.xp=0});mock.save()');await tick();
        assert.equal(await evaluate('__pcTest.engine.running'),false);assert.match(await evaluate('__pcTest.engine.status'),/Lv.41/);
        await setUI({mode:'item',itemId:'rare-candy'});
        const itemShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(taskDir,'mobile-items.png'),Buffer.from(itemShot.data,'base64'));
        await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
        await setUI({mode:'train'});const trainShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(taskDir,'desktop-training.png'),Buffer.from(trainShot.data,'base64'));
        const targetOptions=await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot,before={...e.settings};e.settings={...e.settings,trainUid:'gone-a',useUid:'gone-use-a'};e.onChange();e.settings={...e.settings,trainUid:'gone-b',useUid:'gone-use-b'};e.onChange();const train=r.querySelector('[data-setting="trainUid"]'),use=r.querySelector('[data-setting="useUid"]'),result={train:train.value,trainLabel:train.selectedOptions[0]?.textContent,use:use.value,useLabel:use.selectedOptions[0]?.textContent};e.settings=before;e.onChange();return result})()`);
        assert.equal(targetOptions.train,'gone-b');assert.match(targetOptions.trainLabel,/原目标已离队/);assert.equal(targetOptions.use,'gone-use-b');assert.match(targetOptions.useLabel,/原目标已离开PC/);
        const towerProgress=await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot,before={...e.settings},tower=mock.state.tower;e.settings={...e.settings,mode:'tower',towerFloor:100};mock.state.tower={best:{week:'2000-01-03',floor:100}};mock.save();e.onChange();const result={value:r.querySelector('#dex-value').textContent,progress:r.querySelector('#task-progress').getAttribute('aria-valuenow')};e.settings=before;mock.state.tower=tower;mock.save();e.onChange();return result})()`);
        assert.equal(towerProgress.value,'0/100');assert.equal(towerProgress.progress,'0','old weekly records cannot fill the current tower progress bar');
        const backgroundRender=await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot,observer=new MutationObserver(()=>{});let hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'));observer.observe(r.querySelector('#view'),{childList:true,subtree:true});for(let i=0;i<10;i++)e.onChange();const waiting=observer.takeRecords().length;hidden=false;document.dispatchEvent(new Event('visibilitychange'));const resumed=observer.takeRecords().length;observer.disconnect();delete document.hidden;return{waiting,resumed}})()`);
        assert.equal(backgroundRender.waiting,0,'background rendering performs no repeated table rebuilds');assert.ok(backgroundRender.resumed>0,'foreground return immediately refreshes deferred main content');
        // Drag with real pointer input; helper UI must not count as manual gameplay.
        const dragBounds=await evaluate('(()=>{const h=document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("header").getBoundingClientRect();return{x:h.left+90,y:h.top+20}})()');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:dragBounds.x,y:dragBounds.y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragBounds.x-120,y:dragBounds.y+20,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:dragBounds.x-120,y:dragBounds.y+20,button:'left',clickCount:1});
        assert.ok(await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui")).panel.x>=0'),'expanded panel drag position persisted');
        const panelPosition=await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui")).panel');
        await evaluate('(()=>{const root=document.querySelector("#pokecatch-auto-helper").shadowRoot;root.querySelector("#fold").click()})()');
        assert.equal(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".panel").classList.contains("hidden")'),true);
        const compactMutations=await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot,view=r.querySelector('#view'),observer=new MutationObserver(()=>{});observer.observe(view,{childList:true,subtree:true});e.status='compact-live-status';for(let i=0;i<12;i++)e.onChange();const result={mutations:observer.takeRecords().length,status:r.querySelector('#status').textContent,stopDisabled:r.querySelector('#stop').disabled};observer.disconnect();return result})()`);
        assert.equal(compactMutations.mutations,0,'folded rendering performs no repeated map-table rebuilds');assert.equal(compactMutations.status,'compact-live-status');
        const expandedRefresh=await evaluate(`(()=>{const r=document.querySelector('#pokecatch-auto-helper').shadowRoot,observer=new MutationObserver(()=>{});observer.observe(r.querySelector('#view'),{childList:true,subtree:true});r.querySelector('.mini').click();const count=observer.takeRecords().length;observer.disconnect();r.querySelector('#fold').click();return count})()`);
        assert.ok(expandedRefresh>0,'unfold immediately refreshes the deferred main content');
        const miniBottom=await evaluate('(()=>{const r=document.querySelector("#pokecatch-auto-helper").getBoundingClientRect();return{bottom:innerHeight-r.bottom,right:innerWidth-r.right,x:r.left+40,y:r.top+15}})()');
        assert.ok(miniBottom.bottom>=13&&miniBottom.bottom<=15,'first fold docks to bottom');assert.ok(miniBottom.right>=13&&miniBottom.right<=15);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:miniBottom.x,y:miniBottom.y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:miniBottom.x-180,y:miniBottom.y-100,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:miniBottom.x-180,y:miniBottom.y-100,button:'left',clickCount:1});
        assert.equal(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".panel").classList.contains("hidden")'),true,'dragging mini never unfolds it');
        const miniPosition=await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui")).mini');assert.ok(miniPosition.x>=0&&miniPosition.y>=0);
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".mini").click()');
        assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui")).panel'),panelPosition,'mini drag does not replace expanded position');
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#fold").click()');
        assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui")).mini'),miniPosition);
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const miniBounds=await evaluate('(()=>{const r=document.querySelector("#pokecatch-auto-helper").getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()');
        assert.ok(miniBounds.left>=0&&miniBounds.right<=miniBounds.width&&miniBounds.bottom<=miniBounds.height,'dragged mini clamps to mobile viewport');
        const miniShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(taskDir,'mobile-mini.png'),Buffer.from(miniShot.data,'base64'));
        await setUI({mode:'money',raids:false,manualPause:true,manualResume:true,resumeSeconds:3});await begin();
        const session=await evaluate('({started:__pcTest.engine.started,loops:__pcTest.engine.oldLoops})');
        const nativeClick=async selector=>{
            const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
            await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
            await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
        };
        await nativeClick('#tabs [data-screen="map"]');
        assert.equal(await evaluate('!!__pcTest.engine.manual&&__pcTest.engine.running'),true,'trusted gameplay input temporarily yields control');
        assert.equal(await evaluate('(()=>{const e=__pcTest.engine;e.driver.lastClick=0;return e.driver.click(document.querySelector("#tabs button"),"must wait")})()'),false);
        const manualActions=await evaluate('mock.actions');await tick();assert.equal(await evaluate('mock.actions'),manualActions,'idle grace period contains no helper clicks');
        await evaluate('__pcTest.engine.manual.until=Date.now()-1');await tick();
        assert.equal(await evaluate('__pcTest.engine.manual'),null);assert.equal(await evaluate('__pcTest.engine.running'),true);
        assert.equal(await evaluate('__pcTest.engine.started'),session.started);assert.deepEqual(await evaluate('__pcTest.engine.oldLoops'),session.loops);
        assert.ok(await evaluate('!!__pcTest.engine.driver.pendingMap'),'original money task replans after user map selection');
        await nativeClick('#tabs [data-screen="adventure"]');
        await evaluate('(()=>{const m=document.querySelector("#modal-root");m.className="open";m.innerHTML="<div class=modal>Manual choice</div>";__pcTest.engine.manual.until=Date.now()-1})()');await tick();
        assert.match(await evaluate('__pcTest.engine.status'),/弹窗/);assert.ok(await evaluate('!!__pcTest.engine.manual'));
        assert.match(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#mini-state").textContent'),/待选择/,'expired choice wait shows its blocker rather than 0s');
        await evaluate('(()=>{document.querySelector("#modal-root").className="";const input=document.createElement("input");input.id="manual-chat";input.style="position:fixed;left:10px;top:90px";document.body.appendChild(input);input.focus();__pcTest.engine.manual.until=Date.now()-1})()');await tick();
        assert.match(await evaluate('__pcTest.engine.status'),/输入框/);
        assert.match(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#mini-state").textContent'),/输入中/,'editing focus has a specific compact status');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',text:'a'});
        assert.equal(await evaluate('__pcTest.engine.inputHeld'),true);await evaluate('__pcTest.engine.manual.until=Date.now()-1');await tick();assert.ok(await evaluate('!!__pcTest.engine.manual'));
        assert.match(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#mini-state").textContent'),/等松开/);
        // Native animation handlers can stop release propagation before document listeners.
        await evaluate('window.pcStopKeyUp=event=>event.stopPropagation();window.addEventListener("keyup",pcStopKeyUp,true)');
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA'});
        assert.equal(await evaluate('__pcTest.engine.inputHeld'),false,'release tracking survives a native window capture handler');
        await evaluate('window.removeEventListener("keyup",pcStopKeyUp,true);delete window.pcStopKeyUp');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'b',code:'KeyB',text:'b'});
        assert.equal(await evaluate('__pcTest.engine.inputHeld'),true);
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#resume").click()');
        assert.equal(await evaluate('__pcTest.engine.manual'),null);assert.equal(await evaluate('__pcTest.engine.running'),true);
        assert.equal(await evaluate('__pcTest.engine.inputHeld'),false,'explicit Resume clears a stale held-key record');
        assert.notEqual(await evaluate('document.activeElement?.id'),'manual-chat','explicit Resume releases abandoned game input focus');
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'b',code:'KeyB'});
        await evaluate('document.querySelector("#manual-chat").remove();window.pcStopPointerUp=event=>event.stopPropagation();window.addEventListener("pointerup",pcStopPointerUp,true)');
        await nativeClick('#tabs [data-screen="map"]');
        assert.equal(await evaluate('__pcTest.engine.inputHeld'),false,'mouse release tracking survives native capture propagation blockers');
        await evaluate('window.removeEventListener("pointerup",pcStopPointerUp,true);delete window.pcStopPointerUp;document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#resume").click()');
        assert.equal(await evaluate('__pcTest.engine.manual'),null);
        // Native toggles and dropdowns retain focus after a click; static focus is not typing.
        await evaluate(`(()=>{const toggle=document.createElement('input');toggle.id='manual-toggle';toggle.type='checkbox';toggle.style='position:fixed;left:10px;top:100px';document.body.appendChild(toggle);const select=document.createElement('select');select.id='manual-select';select.innerHTML='<option>Current region</option>';select.style='position:fixed;left:10px;top:130px';document.body.appendChild(select)})()`);
        await nativeClick('#manual-toggle');assert.ok(await evaluate('!!__pcTest.engine.manual'));
        await evaluate('__pcTest.engine.manual.until=Date.now()-1');await tick();assert.equal(await evaluate('__pcTest.engine.manual'),null,'focused checkbox cannot leave recovery stuck');
        await nativeClick('#manual-toggle');await evaluate('document.querySelector("#manual-select").focus();__pcTest.engine.manual.until=Date.now()-1');await tick();
        assert.equal(await evaluate('__pcTest.engine.manual'),null,'focused dropdown cannot leave recovery stuck');
        await evaluate('document.querySelector("#manual-toggle").remove();document.querySelector("#manual-select").remove()');
        // The PC search has type=text in the game; after idle it may blur without clearing its text.
        await nativeClick('#tabs [data-screen="team"]');await evaluate('document.querySelector("#pc-search").focus()');
        await send('Input.insertText',{text:'沙奈朵'});assert.ok(await evaluate('!!__pcTest.engine.manual'));
        await evaluate('__pcTest.engine.manual.until=Date.now()-1');await tick();
        assert.equal(await evaluate('__pcTest.engine.manual'),null,'idle PC search automatically returns to the task');
        assert.equal(await evaluate('document.querySelector("#pc-search").value'),'沙奈朵','automatic recovery preserves the search text');
        // Real IME composition must finish before automatic recovery is allowed.
        await nativeClick('#tabs [data-screen="team"]');await evaluate('document.querySelector("#pc-search").focus()');
        await send('Input.imeSetComposition',{text:'测试',selectionStart:2,selectionEnd:2});
        assert.equal(await evaluate('__pcTest.engine.inputComposing'),true,'native IME composition is tracked');
        await evaluate('__pcTest.engine.manual.until=Date.now()-1');await tick();
        assert.ok(await evaluate('!!__pcTest.engine.manual'));assert.match(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#mini-state").textContent'),/选词中/);
        await send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});assert.equal(await evaluate('__pcTest.engine.inputComposing'),false,'closing native IME composition releases its blocker');
        await evaluate('__pcTest.engine.manual.until=Date.now()-1');await tick();assert.equal(await evaluate('__pcTest.engine.manual'),null);
        await nativeClick('#tabs [data-screen="map"]');assert.ok(await evaluate('!!__pcTest.engine.manual'));
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
        await tick();assert.equal(await evaluate('__pcTest.engine.running'),false);assert.equal(await evaluate('__pcTest.engine.manual'),null,'Esc permanently cancels resume');
        await setUI({manualResume:false});await begin();await nativeClick('#tabs [data-screen="adventure"]');
        assert.equal(await evaluate('__pcTest.engine.running'),false,'stop-only setting preserves old behavior');
        await evaluate(`(()=>{const s=mock.state;s.adv.event=null;s.adv.zone=null;s.adv.chapter=0;s.adv.unlocked=0;s.adv.loops=[];s.link=null;s.mons=[10,13,16,19,21,23].map((id,i)=>({uid:'weak'+i,id,level:5}));s.team=s.mons.map(m=>m.uid);s.road=[...s.team];s.mons.push(...[6,9,3,65,94,149,150].map((id,i)=>({uid:'strong'+i,id,level:90})));mock.save()})()`);
        await setUI({mode:'progress',raids:false,autoTeam:true,optimizeRaid:false});await begin();await tick();
        assert.ok(await evaluate('!!__pcTest.engine.driver.teamTask'),'mainline progression creates an adaptive team plan');
        for(let n=0;n<40&&await evaluate('!!__pcTest.engine.driver.teamTask');n++)await tick();
        assert.equal(await evaluate('__pcTest.engine.driver.teamTask'),null);
        assert.ok(await evaluate('mock.state.team.length===6&&mock.state.team.every(uid=>uid.startsWith("strong"))'),'native PC drag replaces all weak members');
        assert.ok(await evaluate('mock.state.road.every(uid=>uid.startsWith("weak"))'),'current road party remains unchanged until a native healing point');
        const swaps=await evaluate('mock.actions');await tick();await tick();assert.equal(await evaluate('mock.actions'),swaps,'stable roster does not repeatedly swap');
        await evaluate('mock.state.adv.chapter=1;mock.state.adv.unlocked=1;mock.state.road=[...mock.state.team];mock.save()');await tick();
        assert.equal(await evaluate('__pcTest.engine.teamCheck.key'),'1','automatic chapter advance re-evaluates its enemy profile');
        await evaluate(`(()=>{const e=__pcTest.engine;e.stop();const s=mock.state;s.adv.chapter=0;s.adv.unlocked=8;s.team=['weak0','strong6'];s.road=[...s.team];mock.save();e.onChange()})()`);
        await setUI({mode:'train',trainUid:'weak0',trainLevel:50,autoTeam:true});await begin();await tick();
        for(let n=0;n<40&&await evaluate('!!__pcTest.engine.driver.teamTask');n++)await tick();
        assert.ok(await evaluate('mock.state.team.includes("weak0")&&mock.state.team.length===6'),'single trainee is retained while supports are optimized');
        assert.notEqual(await evaluate('mock.state.team[0]'),'weak0','a protected trainee does not displace its carrier from the lead');
        await evaluate(`(()=>{const e=__pcTest.engine;e.stop();const s=mock.state;s.autoSwitch=false;s.mons=s.mons.filter(m=>['weak0','strong6'].includes(m.uid));s.team=['weak0','strong6'];s.road=[...s.team];mock.save();e.onChange()})()`);
        await setUI({mode:'money',autoTeam:true});await begin();await tick();
        for(let n=0;n<12&&await evaluate('!!__pcTest.engine.driver.teamTask');n++)await tick();
        assert.deepEqual(await evaluate('mock.state.team'),['strong6','weak0'],'native PC drag applies a lead-only reorder');
        await evaluate('mock.state.autoSwitch=true;mock.save()');
        await evaluate(`(()=>{const e=__pcTest.engine;e.stop();const s=mock.state;s.adv.chapter=14;s.adv.unlocked=14;s.link={to:'johto',side:'to'};s.mons=[{uid:'old-legend',id:150,reg:'kanto',level:100},{uid:'new0',id:155,reg:'johto',level:10},{uid:'new1',id:158,reg:'johto',level:10},{uid:'new2',id:152,reg:'johto',level:10}];s.team=['new0'];s.road=['new0'];mock.save();e.onChange()})()`);
        await setUI({mode:'progress',autoTeam:true});await begin();await tick();
        for(let n=0;n<25&&await evaluate('!!__pcTest.engine.driver.teamTask');n++)await tick();
        assert.ok(await evaluate('mock.state.team.length===3&&!mock.state.team.includes("old-legend")'),'new region uses only eligible native-region members');
        await evaluate(`(()=>{const e=__pcTest.engine;e.stop();mock.state.adv.event={raid:true,reg:'kanto',id:68,loops:23};mock.save();e.onChange()})()`);
        await setUI({mode:'money',autoTeam:false,optimizeRaid:true});const beforeOptimize=await evaluate('window.teamOptimizations||0');await begin();
        const adventureParty=await evaluate('mock.state.team');
        for(let n=0;n<12;n++)await tick();
        assert.equal(await evaluate('window.teamOptimizations'),beforeOptimize+1,'adopted raid gets its own recommended party');
        assert.deepEqual(await evaluate('mock.state.team'),adventureParty,'special optimization does not change adventure team');
        assert.equal(await evaluate('mock.state.adv.event.loops'),23,'special optimization does not restart its raid');
        for(let n=0;n<5;n++)await tick();assert.equal(await evaluate('window.teamOptimizations'),beforeOptimize+1,'special optimization cache avoids churn');
        await evaluate('mock.state.mons.push({uid:"new-counter",id:145,level:100,reg:"kanto"});mock.save()');
        for(let n=0;n<12;n++)await tick();assert.equal(await evaluate('window.teamOptimizations'),beforeOptimize+2,'new roster triggers a fresh special recommendation');
        await evaluate('mock.state.mons.find(m=>m.uid==="new0").level=11;mock.save()');
        for(let n=0;n<12;n++)await tick();assert.equal(await evaluate('window.teamOptimizations'),beforeOptimize+3,'a single level within the same ten-level bucket refreshes the special recommendation');
        await evaluate('__pcTest.engine.stop();__pcTest.engine.onChange()');
        await evaluate('(()=>{const root=document.querySelector("#pokecatch-auto-helper").shadowRoot;if(root.querySelector(".panel").classList.contains("hidden"))root.querySelector(".mini").click()})()');
        const automationChecks=await evaluate('runAutomationTests()');
        console.log('Automation checks: '+automationChecks.join('; '));
        const resumeOrigin=await evaluate('performance.timeOrigin');await send('Page.reload');
        for(let n=0;n<80&&!await evaluate(`performance.timeOrigin!==${resumeOrigin}&&!!window.__pcTest?.engine.running`);n++)await delay(50);
        assert.equal(await evaluate('__pcTest.engine.running'),true,'a real page reload resumes the pending daycare task');
        assert.equal(await evaluate('__pcTest.engine.settings.mode'),'breed');assert.equal(await evaluate('__pcTest.engine.automation.state.hatched'),1);assert.equal(await evaluate('__pcTest.engine.budget.spent'),50);
        await evaluate('__pcTest.engine.stop();localStorage.removeItem("pc-regression-resume");__pcTest.engine.onChange()');
        await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".mini").click();__pcTest.engine.onChange()');
        const breedShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(taskDir,'desktop-breeding.png'),Buffer.from(breedShot.data,'base64'));
        await evaluate(`(()=>{const r=document.querySelector('#pokecatch-auto-helper').shadowRoot;r.querySelector('#add-job').click();const mode=r.querySelector('[data-setting="mode"]');mode.value='resource';mode.dispatchEvent(new Event('change',{bubbles:true}));r.querySelector('#add-job').click()})()`);
        assert.equal(await evaluate('__pcTest.engine.queue.length'),2,'queue UI stores configured task snapshots');
        await evaluate(`(()=>{const r=document.querySelector('#pokecatch-auto-helper').shadowRoot;r.querySelector('[data-job-action="edit"]').click();const goal=r.querySelector('[data-setting="breedGoal"]');goal.value=3;goal.dispatchEvent(new Event('change',{bubbles:true}));r.querySelector('#add-job').click()})()`);
        assert.equal(await evaluate('__pcTest.engine.queue[0].settings.breedGoal'),3,'queue editor updates its own task');
        assert.equal(await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot,button=r.querySelector('[data-job-action="edit"]');button.focus();e.onChange();return button===r.querySelector('[data-job-action="edit"]')&&r.activeElement===button})()`),true,'unchanged queue rendering preserves focused controls');
        assert.equal(await evaluate(`(()=>{const e=__pcTest.engine,r=document.querySelector('#pokecatch-auto-helper').shadowRoot;e.queue[0].status='running';e.queueRunning=false;e.running=true;e.onChange();const label=r.querySelector('.job-state').textContent;e.running=false;e.queue[0].status='pending';e.onChange();return label})()`),'已暂停','running a single task cannot label a paused queue item as running');
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".content").scrollTop=100000');
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const queueBounds=await evaluate(`(()=>{const r=document.querySelector('#pokecatch-auto-helper').shadowRoot,b=r.querySelector('.panel').getBoundingClientRect(),c=r.querySelector('.content');return {right:b.right,width:innerWidth,overflow:c.scrollWidth-c.clientWidth}})()`);
        const queueShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(taskDir,'mobile-queue.png'),Buffer.from(queueShot.data,'base64'));
        assert.ok(queueBounds.right<=queueBounds.width&&queueBounds.overflow<=1,'new queue and budget UI fits mobile '+JSON.stringify(queueBounds));
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#fold").click()');
        const preparationGoal=await evaluate('setupPreparationReload()'),preparationOrigin=await evaluate('performance.timeOrigin');await send('Page.reload');
        for(let n=0;n<80&&!await evaluate(`performance.timeOrigin!==${preparationOrigin}&&!!window.__pcTest?.engine.running&&!!__pcTest.engine.preparation`);n++)await delay(50);
        assert.equal(await evaluate('__pcTest.engine.preparation?.targets[0].goal'),preparationGoal,'a real reload preserves achievable training goals');
        assert.equal(await evaluate('__pcTest.engine.settings.mode'),'progress','temporary preparation keeps the original mainline task');
        assert.equal(await evaluate('__pcTest.engine.budget.used'),2,'reload keeps the preparation resource budget');
        await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".mini").click()');
        assert.equal(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#prepare-info").classList.contains("hidden")'),false,'unfolding after reload immediately shows the original destination and live levels');
        assert.equal(await evaluate('(()=>{const r=document.querySelector("#pokecatch-auto-helper").shadowRoot;return Math.round(parseFloat(r.querySelector("#prepare-bar").style.width))})()'),Math.round(5/preparationGoal*100),'training progress is separate from mainline progress');
        await evaluate('(()=>{const r=document.querySelector("#pokecatch-auto-helper").shadowRoot;r.querySelector(".mini").click();r.querySelector(".content").scrollTop=0})()');
        const preparationShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(taskDir,'mobile-preparation.png'),Buffer.from(preparationShot.data,'base64'));
        await evaluate('__pcTest.engine.stop();localStorage.removeItem("pc-regression-resume");__pcTest.engine.onChange();document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector("#fold").click()');
        const savedUI=await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui"))');
        const previousOrigin=await evaluate('performance.timeOrigin');await send('Page.reload');
        for(let n=0;n<60&&!await evaluate(`performance.timeOrigin!==${previousOrigin}&&!!window.__pcTest`);n++)await delay(50);
        assert.equal(await evaluate(`performance.timeOrigin!==${previousOrigin}&&!!window.__pcTest`),true,'new page finished mounting');
        assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("pokecatch-helper:v1:ui"))'),savedUI,'both positions and fold state survive reload');
        assert.equal(await evaluate('document.querySelector("#pokecatch-auto-helper").shadowRoot.querySelector(".panel").classList.contains("hidden")'),true);
        assert.deepEqual(errors, []);
        console.log('PASS: raid/money/legend/item/training; bottom dock/manual resume; adaptive adventure PC swaps, delayed road application, chapter changes, trainee retention, region restrictions and roster-sensitive special optimization.');
        console.log('Screenshots: ' + taskDir);
    } finally {
        if (send && socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
        child.kill();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
