// Task/concurrency UI regression: a local page, synthetic saves and blocked HTTP(S).
// Does not run game controls, use an account or visit the online game.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const H=require('../Pokecatch自动助手.user.js'),original=fs.readFileSync(path.join(__dirname,'../Pokecatch自动助手.user.js'),'utf8');
const source=original.replace('    mount();','    window.__pcExecutionTest={engine};\n    mount();');
assert.notEqual(source,original,'Review the isolated test export hook');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const game={trainer:{id:'execution-ui-browser'},money:1000,mons:[{uid:'a',id:6,level:70,reg:'kanto'}],team:['a'],road:['a'],dex:{},stats:{},items:{},travel:{to:['johto','hoenn','sinnoh']},pension:{mons:[],eggs:[]},under:{slots:[],sent:0,used:{}},adv:{layout:6,chapter:0,unlocked:65,node:0,runs:0,speed:4,badges:['Maître','Forêt'],loops:[],gifts:{},deaths:{}}};
async function main(){
    assert.equal(typeof H.taskExecutionState,'function','Wait for the completed execution model');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-execution-ui-browser-'));
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);assert.ok(chrome);
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket,send;const checks=[];
    try{
        let pages;for(let n=0;n<80;n++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.length)break;}catch{}await delay(100);}assert.ok(pages?.length);
        socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let seq=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data),call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);};
        send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
        await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
        const setup=`localStorage.clear();window.fixtureState=${JSON.stringify(game)};localStorage.setItem('gachamon-save-v1',JSON.stringify(fixtureState));localStorage.setItem('pokecatch-helper:v1:'+fixtureState.trainer.id,JSON.stringify({settings:{spendBudget:20000}}));localStorage.setItem('pokecatch-tab','execution-ui-tab');window.GM_registerMenuCommand=()=>{};window.commitExecution=()=>{localStorage.setItem('gachamon-save-v1',JSON.stringify(fixtureState));__pcExecutionTest.engine.onChange()};`;
        const html=path.join(dir,'index.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><body><script>'+setup+'</script><script>'+source.replace(/<\/script/gi,'<\\/script')+'</script></body>');
        await send('Page.navigate',{url:pathToFileURL(html).href});for(let n=0;n<80&&!await evaluate('!!window.__pokecatchHelper?.ready');n++)await delay(50);assert.equal(await evaluate('!!window.__pokecatchHelper?.ready'),true);
        const root="document.querySelector('#pokecatch-auto-helper').shadowRoot";
        const standby=await evaluate(`(()=>{
            const r=${root},menu=r.querySelector('[data-setting="huntWeatherFallback"]');
            const choose=value=>{menu.value=value;menu.dispatchEvent(new Event('change',{bubbles:true}));};
            const initial=menu.value,shown=!!menu.getClientRects().length;
            choose('xp');const saved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+fixtureState.trainer.id)).settings.huntWeatherFallback;
            r.querySelector('[data-mode="money"]').click();const hidden=!menu.getClientRects().length;
            r.querySelector('[data-mode="dex"]').click();const returned=menu.value;
            choose(initial);return [initial,shown,saved,hidden,returned];
        })()`);
        assert.deepEqual(standby,['wait',true,'xp',true,'xp']);
        checks.push('weather standby is visible for a hunt and keeps its selection after switching tasks');
        const roamingBalls=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,s=fixtureState,initial={...e.settings};
            const pick=(field,value)=>{const input=r.querySelector('[data-setting="'+field+'"]');input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
            try{
                s.adv.chapter=31;s.link={from:'johto',to:'hoenn',side:'to',stash:{items:{'master-ball':2}}};commitExecution();
                r.querySelector('[data-mode="roam"]').click();pick('roamId','245');
                const stock=r.querySelector('[data-roam-ball-stock="roam"]'),check=r.querySelector('[data-fields="roam"] input[data-setting="roamAllowMasterBall"]');
                const before=[stock.textContent,check.checked,!!stock.getClientRects().length];check.click();
                const saved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+s.trainer.id)).settings.roamAllowMasterBall;
                pick('roamId','380');
                const destination=!!stock.getClientRects().length;pick('roamId','245');r.querySelector('[data-mode="legend"]').click();
                const multiBag=r.querySelector('[data-roam-ball-stock="legend"]').textContent;
                r.querySelector('[data-mode="roam"]').click();s.link.stash.items={};commitExecution();
                const removed=!!stock.getClientRects().length;r.querySelector('[data-mode="legend"]').click();
                const legend=!!r.querySelector('[data-roam-ball-stock="legend"]').getClientRects().length;
                return [before,saved,destination,multiBag,removed,legend];
            }finally{
                s.adv.chapter=0;delete s.link;e.settings=initial;e.persist();commitExecution();
            }
        })()`);
        assert.deepEqual(roamingBalls,[['城都背包 · 2 个',false,true],true,false,'背包合计 · 2 个',false,false]);
        checks.push('roaming and legendary screens hide the legacy Master Ball controls until the relevant bag has one');
        const daily=await evaluate(`(()=>{const r=${root},e=__pcExecutionTest.engine;
            const choices=[...r.querySelectorAll('.modes [data-group="adventure"]')].filter(el=>el.getClientRects().length);
            if(choices.map(el=>el.dataset.mode).join(',')!=='dex,money,progress,daily'||r.querySelector('#daily-routine').getClientRects().length)throw Error('Adventure task grid');
            choices[3].click();
            if(e.running||choices[3].getAttribute('aria-pressed')!=='true'||!r.querySelector('#daily-routine').getClientRects().length||r.querySelector('#ordinary-target').getClientRects().length||!r.querySelector('#add-job').disabled)throw Error('Daily card selection');
            const button=r.querySelector('#start');if(button.textContent!=='开始通关日常')throw Error('Daily start label');button.click();
            const result=[e.running,e.daily?.base.mode,button.disabled,r.querySelector('#run-state').textContent];
            r.querySelector('#stop').click();choices[0].click();
            if(!r.querySelector('#ordinary-target').getClientRects().length||r.querySelector('#daily-routine').getClientRects().length||button.textContent!=='开始当前任务')throw Error('Return to ordinary task');
            return result;})()`);
        assert.deepEqual(daily,[true,'dex',true,'通关日常 · 检查待办']);
        checks.push('daily routine starts from Tasks and stops using the normal task controls');
        const order=await evaluate(`(async()=>{
            const e=__pcExecutionTest.engine,r=${root},initial={...e.settings},marks={...e.dailyMarks},calls=[];
            const original=e.followMarkedHunt,screen=document.createElement('div');
            screen.id='screen-adventure';screen.className='active';screen.textContent='模拟冒险战斗';document.body.append(screen);
            try{
                e.settings={...initial,mode:'dex',dailyMain:'dex',raids:false,dailyWindow:false,dailyCandy:true,dailyWorld:true,dailyTower:false,dailyElite:false};
                e.dailyMarks={};fixtureState.adv.battle={kind:'trainer',enemies:[{id:25,hp:5}]};commitExecution();
                e.followMarkedHunt=()=>{if(e.settings.mode!=='dex')return false;calls.push('挂机');return true;};
                r.querySelector('[data-mode="daily"]').click();r.querySelector('#start').click();clearTimeout(e.timer);
                await e.step();calls.push(e.daily?.job?.kind);
                await e.step();calls.push(e.daily?.job?.waitingForBattle&&e.status.includes('日常已排队'));
                delete fixtureState.adv.battle;commitExecution();await e.step();
                calls.push(e.daily.job.waitingForBattle);e.completeTask('模拟工厂结算');
                await e.step();calls.push(e.daily?.job?.kind);e.completeTask('模拟世界首领结算');
                await e.step();calls.push(e.daily?.checking);
                return calls;
            }finally{
                if(e.running)e.stop();screen.remove();e.followMarkedHunt=original;delete fixtureState.adv.battle;
                e.dailyMarks=marks;e.settings=initial;e.persist();commitExecution();
            }
        })()`);
        assert.deepEqual(order,['candy',true,false,'world','挂机',false]);
        checks.push('a daily run reserves the factory during a trainer fight and dispatches the world boss before a marked dex route');
        const legendOrder=await evaluate(`(async()=>{
            const r=${root},e=__pcExecutionTest.engine,initial={...e.settings},marks={...e.dailyMarks},calls=[];
            const page=document.createElement('section');page.id='screen-map';page.className='active';
            page.innerHTML='<div id="map-root"><button class="rg open active" data-rg="kanto">关都</button><button class="mp-row sel" data-ch="0">原章节</button><button class="mp-go" data-go="0">继续</button></div>';
            document.body.append(page);const before={...fixtureState.adv};
            try{
                e.settings={...initial,mode:'dex',dailyMain:'dex',dailyWindow:true,dailyCandy:true,dailyTower:true,dailyWorld:true,dailyElite:false,raids:true};
                e.dailyMarks={};Object.assign(fixtureState.adv,{zone:{id:150,foe:150,back:0},battle:{kind:'wild',enemies:[{id:150,hp:4}]}});
                commitExecution();page.querySelector('.mp-go').onclick=()=>calls.push('返回原章节');
                r.querySelector('[data-mode="daily"]').click();r.querySelector('#start').click();clearTimeout(e.timer);
                await e.step();calls.push([e.running,e.dailyZoneExit?.kind,e.daily?.job]);
                delete fixtureState.adv.battle;commitExecution();e.driver.lastClick=0;await e.step();await e.step();
                calls.push(e.daily?.job);delete fixtureState.adv.zone;commitExecution();
                await e.step();calls.push(e.daily?.job?.kind);e.completeTask('模拟免费场结算');
                await e.step();calls.push(e.daily?.job?.kind);return calls;
            }finally{if(e.running)e.stop();page.remove();fixtureState.adv=before;e.dailyMarks=marks;e.settings=initial;e.persist();commitExecution();}
        })()`);
        assert.deepEqual(legendOrder,[[true,'candy',null],'返回原章节',null,'candy','tower']);
        checks.push('adopted Mewtwo encounter settles before one native map return, then factory and tower run before raids or dex');
        const legendMain=await evaluate(`(async()=>{
            const r=${root},e=__pcExecutionTest.engine,initial={...e.settings},marks={...e.dailyMarks};
            try{
                e.dailyMarks={};e.settings={...initial,raids:false,dailyCandy:true,dailyWindow:false,dailyWorld:false,dailyTower:false,dailyElite:false};
                r.querySelector('[data-mode="daily"]').click();
                const menu=r.querySelector('[data-setting="dailyMain"]');if(menu.querySelector('[value="raid"]'))throw Error('Obsolete raid main');
                menu.value='legend';menu.dispatchEvent(new Event('change',{bubbles:true}));
                const picker=r.querySelector('#daily-legend-fields #legend-picker'),summary=picker.querySelector('summary');
                if(!summary.getClientRects().length||r.querySelectorAll('#legend-picker').length!==1)throw Error('Expected one shared legendary picker');
                const checks=r.querySelector('#legend-checks'),search=r.querySelector('#legend-search');
                const filter=value=>{search.value=value;search.dispatchEvent(new Event('input',{bubbles:true}));};
                const only=id=>checks.querySelector('[value="'+id+'"]').closest('.legend-option').querySelector('button');
                summary.click();filter('丰缘 许愿');
                const rows=[...checks.querySelectorAll('.legend-option:not([hidden])')];
                if(rows.length!==1||rows[0].querySelector('input').value!=='385')throw Error('Combined region and place search did not match Jirachi');
                only(385).click();
                const saved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+fixtureState.trainer.id)).settings.legendId;
                if(picker.open||r.activeElement!==summary||!summary.textContent.includes('基拉祈'))throw Error('Only-select should collapse and return focus');
                summary.click();filter('关都');
                checks.querySelector('[value="145"]').click();
                if(e.settings.legendIds.join(',')!=='145,385')throw Error('Multiple legendary selection not saved');
                if(!summary.textContent.includes('已选 2 项'))throw Error('The summary must show the full selected count');
                r.querySelector('#legend-all').click();
                if(e.settings.legendIds.length!==checks.querySelectorAll('input').length)throw Error('Select all missed a region');
                const profile=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+fixtureState.trainer.id));
                if(profile.settings.legendIds.length!==e.settings.legendIds.length)throw Error('Legendary selection not persisted');
                const clear=picker.querySelector('#legend-clear');
                if(clear.textContent.trim()!=='取消'||!clear.getClientRects().length)throw Error('Missing visible clear selection control');
                clear.click();
                if(!picker.open||search.value!=='关都'||!clear.disabled||checks.querySelector('input:checked')||
                    !r.querySelector('#legend-count').textContent.includes('0 / '+checks.querySelectorAll('input').length))
                    throw Error('Clearing filtered targets must deselect all regions and keep the search open');
                const empty=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+fixtureState.trainer.id)).settings;
                if(empty.legendId!==null||empty.legendIds.length)throw Error('Empty selection not saved');
                e.loadAccount(e.read());e.onChange();
                r.querySelector('[data-mode="legend"]').click();
                if(!picker.closest('#ordinary-target')||checks.querySelector('input:checked')||e.settings.legendId!==null)
                    throw Error('Reloading the profile or switching to standalone mode restored a cancelled target');
                r.querySelector('#start').click();
                if(e.running)throw Error('Standalone hunt started without a selected legendary target');
                r.querySelector('[data-mode="daily"]').click();
                picker.open=true;
                filter('385');checks.querySelector('[value="385"]').click();
                if(e.settings.legendId!==385||clear.disabled)throw Error('Cannot select one target after clearing');
                checks.querySelector('[value="385"]').click();
                if(e.settings.legendId!==null||checks.querySelector('input:checked'))throw Error('Unchecking the last target must clear the selection');
                r.querySelector('#legend-all').click();
                if(e.settings.legendIds.length!==checks.querySelectorAll('input').length)throw Error('Select all failed to restore cleared targets');
                filter('no matching pokémon');if(r.querySelector('#legend-empty').hidden||!checks.hidden)throw Error('Missing empty search state');
                filter('385');only(385).click();filter('');
                if(e.settings.legendIds.length||e.settings.legendId!==385||!checks.querySelector('[value="385"]').checked||checks.querySelector('[value="385"]').disabled)throw Error('Single legendary target should remain selected and editable');
                // One selected goal is already registered, the other still needs a map visit.
                const oldDex=structuredClone(fixtureState.dex);
                fixtureState.dex[145]={caught:1};
                // Jirachi's zone requires the Hoenn dex before it can be the next route.
                for(let id=252;id<=386;id++)if(id!==385)fixtureState.dex[id]={caught:1};
                picker.open=true;
                checks.querySelector('[value="145"]').click();
                const dailyRaid=r.querySelector('#daily-shiny-raid');
                if(dailyRaid.checked||!dailyRaid.getClientRects().length)throw Error('Expected the visible saved daily raid preference');
                dailyRaid.click();
                if(!r.querySelector('[data-setting="raids"]').checked)throw Error('Daily raid settings differ');
                fixtureState.raids={seen:new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'}),done:{}};
                commitExecution();
                r.querySelector('#start').click();clearTimeout(e.timer);await e.step();
                const chore=e.daily?.job?.kind;e.completeTask('模拟工厂结算');
                const origTravel=e.travel,origServices=e.serviceBackground;e.serviceBackground=()=>false;
                let zone=0;e.travel=row=>{zone=row.id;};
                try{
                    await e.step();if(!e.raidProbe||zone||!dailyRaid.disabled)throw Error('Expected daily shiny raid before legendary travel');
                    e.onChange();
                    if(!r.querySelector('#run-state').textContent.includes('检查每日异色团体战'))throw Error('Raid check mislabeled');
                    // A draw day alone carries no regional identity. Record the native card before settling it.
                    e.rememberDraw(fixtureState,'kanto',35,Date.now());
                    fixtureState.adv.event={raid:true};commitExecution();
                    for(const selector of ['#run-state','#mini-state','#daily-state']){
                        if(!r.querySelector(selector).textContent.includes('每日异色团体战'))throw Error('Missing active raid in '+selector);
                    }
                    if(!r.querySelector('#daily-state').textContent.includes('基拉祈'))throw Error('Legendary destination missing');
                    delete fixtureState.adv.event;
                    fixtureState.raids.done['kanto|'+fixtureState.raids.seen]=Date.now();commitExecution();
                    await e.step();return [saved,chore,e.settings.mode,e.raidProbe,zone];
                }
                finally{
                    e.travel=origTravel;e.serviceBackground=origServices;
                    fixtureState.dex=oldDex;
                }
            }finally{if(e.running)e.stop();delete fixtureState.raids;e.dailyMarks=marks;e.settings=initial;e.persist();commitExecution();}
        })()`);
        assert.deepEqual(legendMain,[385,'candy','legend',false,385]);
        checks.push('clearing filtered legendary targets persists across daily and standalone modes, unchecking the last target works, and the user can select targets again');
        checks.push('daily shiny raids use the saved switch and run after the factory, then the daily legendary main routes to Jirachi');
        const dailyMain=await evaluate(`(async()=>{
            const r=${root},e=__pcExecutionTest.engine;
            const initial={...e.settings},marks={...e.dailyMarks},results=[];
            try{
                r.querySelector('[data-mode="progress"]').click();
                const set=(key,value)=>{const el=r.querySelector('[data-setting="'+key+'"]');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
                const raid=r.querySelector('[data-setting="raids"]');if(raid.checked)raid.click();
                r.querySelector('[data-mode="daily"]').click();
                for(const mode of ['dex','money','shiny','train']){
                    set('dailyMain',mode);if(mode==='money')set('moneyTarget','1');
                    e.dailyMarks={};r.querySelector('#start').click();clearTimeout(e.timer);
                    await e.step();const child=e.daily?.job?.kind;
                    e.completeTask('模拟工厂结算');const resumed=e.settings.mode;
                    const saved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+fixtureState.trainer.id));
                    if(mode==='money')await e.step();
                    const stoppedOnGoal=mode==='money'?!e.running:true;
                    if(e.running)r.querySelector('#stop').click();
                    results.push([mode,child,resumed,saved.settings.mode,saved.resume?.daily.base.mode,e.settings.mode,stoppedOnGoal]);
                }
            }finally{if(e.running)e.stop();e.dailyMarks=marks;e.settings=initial;e.persist();e.onChange();}
            return results;
        })()`);
        for(const [i,mode] of ['dex','money','shiny','train'].entries())
            assert.deepEqual(dailyMain[i],[mode,'candy',mode,'progress',mode,'progress',true]);
        checks.push('each daily main survives a facility handoff and preserves the ordinary selection; a satisfied money goal lets the factory finish first');
        assert.deepEqual(await evaluate('[__pcExecutionTest.engine.settings.spendBudget,__pcExecutionTest.engine.settings.autoPurchase]'),[20000,true]);
        checks.push('a pre-switch account with a saved positive procurement budget retains that authorization');
        const trainees=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,initial={...e.settings},oldQueue=e.queue.slice();
            try{
                fixtureState.mons.push({uid:'pc-target',id:9,level:70,reg:'kanto'});commitExecution();
                const set=(key,value)=>{const el=r.querySelector('[data-setting="'+key+'"]');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
                r.querySelector('[data-mode="daily"]').click();set('dailyMain','train');set('trainUid','team');
                const visible=selector=>!!r.querySelector(selector)?.getClientRects().length;
                const daily=visible('#daily-train-fields #train-members input:checked');
                r.querySelector('#train-members input:checked').click();
                const emptyBlocked=r.querySelector('#start').disabled;
                r.querySelector('#train-members input[value="a"]').click();
                const pc=r.querySelector('#train-pc-field');pc.open=true;
                const search=r.querySelector('#train-search');search.value='pc-target';search.dispatchEvent(new Event('input'));
                r.querySelector('#train-pc input[value="pc-target"]').click();
                r.querySelector('#daily-edit-goal').click();
                const direct=visible('#ordinary-target #train-members input:checked');
                const gems=r.querySelector('[data-setting="trainGems"]'),off=!gems.checked;gems.click();set('trainRank',2);
                r.querySelector('[data-mode="dex"]').click();set('huntWeatherFallback','xp');
                const weather=r.querySelector('#weather-train-fields #train-members');
                const checked=()=>[...weather.querySelectorAll('input:checked')].map(el=>el.value);
                const weatherIds=checked();
                r.querySelector('#add-job').click();
                const job=e.queue.at(-1);
                r.querySelector('[data-queue-job="'+job.id+'"] [data-job-action="edit"]').click();
                const edited=checked();r.querySelector('#cancel-job').click();
                return [daily,emptyBlocked,direct,weatherIds,off,job.settings.trainGems,job.settings.trainRank,job.settings.trainUid,edited];
            }finally{fixtureState.mons.pop();e.queue=oldQueue;e.settings=initial;e.persist();commitExecution();}
        })()`);
        assert.deepEqual(trainees,[true,true,true,['a','pc-target'],true,true,2,'selected',['a','pc-target']]);
        checks.push('daily, standalone and weather training share checked party and searchable PC targets and block empty selections');
        const panes=await evaluate(`(()=>{const r=${root},e=__pcExecutionTest.engine;const views=[];
            for(const key of ['tasks','dex','weather','eggs','settings','activity']){
                r.querySelector('[data-workspace="'+key+'"]').click();
                views.push([...r.querySelectorAll('[id^=pane-]')].filter(el=>el.getClientRects().length).map(el=>el.id));
                const lookup=['dex','weather','eggs'].includes(key);
                if(Boolean(r.querySelector('.commandbar #start').getClientRects().length)===lookup||e.running)throw Error('Unexpected workspace controls');
            }
            return views})()`);
        assert.deepEqual(panes,[['pane-tasks'],['pane-dex'],['pane-weather'],['pane-eggs'],['pane-settings'],['pane-activity']]);checks.push('lookup workspaces hide idle task commands and preserve the selected task');
        const calendar=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,r=${root},panel=r.querySelector('#season-calendar'),clock=Date.now;
            const read=()=>({key:panel.dataset.season,name:panel.querySelector('strong').textContent,
                remaining:panel.querySelector('.season-remaining').textContent,end:Date.parse(panel.querySelector('time:last-of-type').dateTime)});
            const before=read();panel.open=true;
            try{
                Date.now=()=>before.end-1;e.onChange();const last=read();
                Date.now=()=>before.end;e.onChange();return {before,last,after:read(),open:panel.open,cycle:panel.querySelector('.season-next').textContent};
            }finally{Date.now=clock;panel.open=false;e.onChange();}
        })()`);
        assert.equal(calendar.last.name,calendar.before.name);assert.match(calendar.last.remaining,/1分钟/);
        assert.notEqual(calendar.before.key,calendar.after.key);assert.ok(calendar.after.end>calendar.before.end);
        assert.ok(calendar.open);assert.match(calendar.cycle,/3 个日历日.*12 天/);
        checks.push('the visible season, local changeover and countdown roll over at midnight while the disclosure stays open');
        const seasonalDex=await evaluate(`(()=>{
            const r=${root},input=r.querySelector('#dex-search'),results=r.querySelector('#dex-results');
            const lookup=id=>{input.value=id;input.dispatchEvent(new Event('input',{bubbles:true}));};
            const originalSeasons=fixtureState.seasons;
            try{
                fixtureState.seasons={585:['spring','winter']};commitExecution();r.querySelector('[data-workspace="dex"]').click();
                lookup('#585');const forms=[...results.querySelectorAll('.season-forms li')].map(el=>[el.dataset.seen,el.textContent]);
                results.querySelector('.season-forms button[data-species="58501"]').click();
                const selected=[input.value,results.querySelector('.dex-heading')?.textContent];
                lookup('#522');return {forms,selected,summer:results.textContent,otherForms:!!results.querySelector('.season-forms')};
            }finally{
                fixtureState.seasons=originalSeasons;lookup('');r.querySelector('[data-workspace="activity"]').click();r.querySelector('[data-tab="maps"]').click();commitExecution();
            }
        })()`);
        assert.equal(seasonalDex.forms.length,4);assert.equal(seasonalDex.forms.filter(([seen])=>seen==='true').length,2);
        assert.equal(seasonalDex.forms.filter(([,label])=>label.includes('本季')).length,1);
        assert.equal(seasonalDex.selected[0],'#58501');assert.match(seasonalDex.selected[1],/四季鹿（夏季）/);
        assert.equal(seasonalDex.otherForms,false);assert.match(seasonalDex.summer,/夏季限定/);
        checks.push('the dex distinguishes a summer-only encounter source from four separately tracked seasonal sightings');
        const expedition=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,selector='[data-setting="underStartChoice"]';
            const task=r.querySelector('#pane-tasks '+selector),settings=r.querySelector('#pane-settings '+selector);
            const before=task.value==='auto'&&settings.value==='auto';
            task.value='50';task.dispatchEvent(new Event('change',{bubbles:true}));
            const manual=!e.settings.underAutoStart&&e.settings.underFrom===50,value=settings.value;
            settings.value='auto';settings.dispatchEvent(new Event('change',{bubbles:true}));e.onChange();
            const goals=[...r.querySelectorAll('[data-setting="underGoal"]')];
            goals[0].value='money';goals[0].dispatchEvent(new Event('change',{bubbles:true}));
            const sharedGoal=goals.length===2&&goals.every(el=>el.value==='money')&&e.settings.underGoal==='money';
            return {before,manual,value,sharedGoal,restored:task.value==='auto'&&e.settings.underAutoStart,buddyVisible:!r.querySelector('[data-setting="trainBuddy"]').closest('details')};
        })()`);
        assert.deepEqual(expedition,{before:true,manual:true,value:'50',sharedGoal:true,restored:true,buddyVisible:true});checks.push('underground task and background settings share the same starting-floor selector and preserve automatic mode');
        const raidNote=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine;
            e.raidCheckNote='已按设置跳过拥有的异色目标';
            r.querySelector('[data-workspace="settings"]').click();
            const note=r.querySelector('#raid-check');
            const result={visible:!!note.getClientRects().length,text:note.textContent};
            e.raidCheckNote='';r.querySelector('[data-workspace="activity"]').click();return result;
        })()`);
        assert.equal(raidNote.visible,true);assert.match(raidNote.text,/已按设置跳过拥有的异色目标/);checks.push('the daily raid setting explains why the most recent check skipped the target');
        const raidDone=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,previous=fixtureState.raids;
            const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
            try{
                fixtureState.raids={seen:day,done:{['kanto|'+day]:1},doneBoss:{['kanto|'+day]:35}};
                commitExecution();r.querySelector('[data-workspace="settings"]').click();
                return {text:r.querySelector('#raid-check').textContent,running:e.running};
            }finally{fixtureState.raids=previous;commitExecution();r.querySelector('[data-workspace="activity"]').click();}
        })()`);
        assert.equal(raidDone.running,false);assert.match(raidDone.text,/已完成.*下次刷新.+月.+日 \d{2}:\d{2}（本地时间）/);
        checks.push('the idle settings panel shows the next local refresh for a completed Paris raid without starting a task');
        const preparationRanking=await evaluate(`(async()=>{
            const e=__pcExecutionTest.engine,r=${root},s=fixtureState,initial=s.adv;
            const previousSettings=e.settings,initialLevel=s.mons[0].level;
            const speedOptions=Array.from(r.querySelector('[data-setting="speed"]').options,el=>Number(el.value));
            s.adv={...initial,chapter:1,unlocked:3};s.mons[0].level=28;
            e.settings={...e.settings,mode:'progress',region:'current'};
            e.preparation={phase:'train',context:{kind:'progress',reg:'kanto',label:'主线'},targets:[],uids:['a'],route:{key:'1',name:'蓝色徽章',members:[1]},avoid:{}};
            commitExecution();
            const waitUntil=async text=>{for(let i=0;i<100&&!r.querySelector('#view').textContent.includes(text);i++){await new Promise(resolve=>setTimeout(resolve,30));e.onChange();}};
            await waitUntil('EXP/分钟');
            const comparing=r.querySelector('#view').textContent,shown=r.querySelector('#view tr.active')?.textContent;
            const metric=value=>r.querySelector('[data-yield-view="'+value+'"]');
            const preparation=e.preparation,queue=JSON.stringify(e.queue);
            metric('money').click();await waitUntil('₽/分钟');
            const gold=r.querySelector('#view th:last-child')?.textContent;
            const savedMetric=JSON.parse(localStorage.getItem('pokecatch-helper:v1:ui')).yieldView;
            r.querySelector('[data-workspace="queue"]').click();
            const hiddenInQueue=!r.querySelector('#yield-metric').getClientRects().length;
            r.querySelector('[data-workspace="activity"]').click();r.querySelector('[data-tab="maps"]').click();metric('train').click();await waitUntil('EXP/分钟');
            const xp=r.querySelector('#view th:last-child')?.textContent;
            const viewOnly=e.preparation===preparation&&e.settings.mode==='progress'&&JSON.stringify(e.queue)===queue;
            metric('task').click();await waitUntil('按补练阵容');
            const follows=metric('task').getAttribute('aria-pressed');
            s.adv.chapter=0;commitExecution();
            await waitUntil('下一图蓝色徽章');
            const atStart=r.querySelector('#view').textContent;
            s.adv.unlocked=9;e.preparation.routeCeiling=30;commitExecution();
            await waitUntil('联盟最高');
            const excluded=r.querySelector('#view tbody')?.textContent;
            e.preparation=null;s.adv=initial;s.mons[0].level=initialLevel;e.settings=previousSettings;commitExecution();
            return {speedOptions,comparing,shown,atStart,excluded,metrics:{gold,xp,hiddenInQueue,viewOnly,savedMetric,follows}};
        })()`);
        assert.deepEqual(preparationRanking.speedOptions,[1,4]);assert.match(preparationRanking.comparing,/按补练阵容.*蓝色徽章.*上一图.*灰色徽章/);
        assert.match(preparationRanking.atStart,/下一图蓝色徽章.*当前在灰色徽章/);
        assert.match(preparationRanking.excluded,/关都 · 联盟已解锁.*补练难度上限 Lv.30/);
        assert.deepEqual(preparationRanking.metrics,{gold:'₽/分钟',xp:'EXP/分钟',hiddenInQueue:true,viewOnly:true,savedMetric:'money',follows:'true'});
        checks.push('gold and XP leaderboard switches preserve the task, training and queue, and remember the display preference');
        assert.match(preparationRanking.comparing,/EXP\/分钟/);assert.match(preparationRanking.shown,/蓝色徽章/);checks.push('mainline preparation compares the actual XP of adjacent routes in both directions, and speed choices match native buttons');
        const state=()=>evaluate(`(()=>{const r=${root},host=document.querySelector('#pokecatch-auto-helper').getBoundingClientRect(),e=__pcExecutionTest.engine;return{foreground:r.querySelector('#foreground-task')?.textContent,foregroundDetail:r.querySelector('#foreground-detail')?.textContent,services:r.querySelector('#background-services')?.textContent,serviceStates:Object.fromEntries([...r.querySelectorAll('#background-services [data-service]')].map(el=>[el.dataset.service,{state:el.dataset.state,text:el.textContent}])),owner:r.querySelector('#ui-owner')?.textContent,rules:r.querySelector('#parallel-rules')?.textContent,queue:r.querySelector('#start-queue')?.textContent,mini:r.querySelector('#mini-state')?.textContent,running:e.running,manual:!!e.manual,host:{left:host.left,right:host.right,top:host.top,bottom:host.bottom},card:!!r.querySelector('#execution-info'),save:localStorage.getItem('gachamon-save-v1')}})()`);
        let current=await state();assert.equal(current.card,true);assert.ok(current.host.right<=1280&&current.host.left>=0);assert.match(current.queue,/任务队列/);checks.push('the task card and dedicated queue entry mount before automation starts');
        await evaluate(`(()=>{const e=__pcExecutionTest.engine;e.schedule=()=>{};e.settings={...e.settings,mode:'money',autoTeam:true,autoPrepare:false,raids:false,moneyBuff:false};e.running=true;e.started=Date.now();e.startMoney=fixtureState.money;e.lastProgress=Date.now();e.status='fixture active primary';e.onChange()})()`);
        current=await state();assert.match(current.foreground,/刷钱/);assert.match(current.services,/未配置|没有|暂无|未寄养|未派遣|空闲/);checks.push('a selected primary task does not invent configured background work');
        assert.match(await evaluate(`${root}.querySelector('#action').textContent`),/助手已接管/);checks.push('a running task with no recent click never displays the idle start prompt');
        await evaluate(`(()=>{const now=Date.now();fixtureState.pension.eggs=[{uid:'egg',id:25,reg:'kanto',hatchAt:now+120000}];fixtureState.under.slots=[{id:'u',bay:0,start:now-1000,end:now+180000,team:['u0','u1','u2'],mons:[{uid:'u0',id:1,level:70},{uid:'u1',id:4,level:70},{uid:'u2',id:7,level:70}]}];commitExecution()})()`);
        current=await state();assert.match(current.services,/孵|蛋/);assert.match(current.services,/地下/);assert.match(current.services,/计时|进行|孵化|派遣|归队/);assert.equal(current.serviceStates.eggs.state,'timing');assert.equal(current.serviceStates.underground.state,'timing');assert.match(current.foreground,/刷钱/);checks.push('native egg and expedition timers are shown alongside one foreground task');
        const reused=await evaluate(`(()=>{const r=${root},service=r.querySelector('[data-service="eggs"]'),table=r.querySelector('#view table');__pcExecutionTest.engine.onChange();return !!table&&table.isConnected&&service.isConnected})()`);
        assert.ok(reused,'an unchanged foreground render preserves the service rows and route table');
        await evaluate(`fixtureState.pension.eggs[0].hatchAt=Date.now()-1;fixtureState.under.slots[0].end=Date.now()-1;commitExecution()`);
        current=await state();assert.match(current.services,/待|可领|成熟|归队/);assert.ok(['ready','waiting'].includes(current.serviceStates.eggs.state));assert.ok(['ready','waiting'].includes(current.serviceStates.underground.state));assert.match(current.foreground,/刷钱/);checks.push('mature background work becomes a pending service without replacing the main goal');
        await evaluate(`fixtureState.adv.battle={steps:2,enemies:[{id:19,hp:10}]};commitExecution()`);
        current=await state();assert.equal(current.serviceStates.eggs.state,'ready');assert.match(current.serviceStates.eggs.text,/成熟蛋优先/);assert.equal(current.serviceStates.underground.state,'ready');
        await evaluate(`fixtureState.adv.zone={id:643};__pcExecutionTest.engine.zoneId=643;commitExecution()`);
        current=await state();assert.equal(current.serviceStates.eggs.state,'ready');assert.equal(current.serviceStates.underground.state,'ready');assert.match(current.foreground,/传说/);
        await evaluate(`fixtureState.adv.zone=null;__pcExecutionTest.engine.zoneId=null;commitExecution()`);
        checks.push('mature eggs and underground rewards are both ready during ordinary and Reshiram combat');
        await evaluate(`fixtureState.adv.battle=null;commitExecution()`);
        await evaluate(`__pcExecutionTest.engine.settings.autoTeam=false;commitExecution()`);
        current=await state();assert.equal(current.serviceStates.eggs.state,'blocked');assert.equal(current.serviceStates.underground.state,'blocked');assert.match(current.services,/手动|阵容|入队/);checks.push('a manual party with free slots explicitly blocks services that could auto-fill it');
        await evaluate(`(()=>{const e=__pcExecutionTest.engine;e.settings.autoEggs=false;e.settings.autoUnderCollect=false;e.settings.autoUnderDispatch=false;e.onChange()})()`);
        current=await state();assert.equal(current.serviceStates.eggs.state,'disabled');assert.equal(current.serviceStates.underground.state,'disabled');assert.match(current.services,/关|手动|暂停|待领|成熟/);checks.push('native maturity remains visible when automatic service is disabled');
        await evaluate(`fixtureState.adv.event={raid:true,id:35,reg:'kanto',date:'2026-11-17'};commitExecution()`);
        current=await state();assert.match(current.foreground,/团体战/);checks.push('the foreground describes the actual raid while another main goal is selected');
        await evaluate(`fixtureState.adv.event=null;__pcExecutionTest.engine.running=false;__pcExecutionTest.engine.status='fixture stopped';commitExecution()`);
        current=await state();assert.match(current.services,/待|可领|成熟|归队|手动/);assert.equal(current.running,false);checks.push('stopping the assistant does not label native background timers as stopped game systems');
        await evaluate(`__pokecatchHelper.show();${root}.querySelector('#fold').click();fixtureState.pension.eggs[0].hatchAt=Date.now()+600000;commitExecution()`);
        current=await state();assert.ok(current.mini?.length>0);assert.ok(current.host.left>=0&&current.host.right<=1280&&current.host.bottom<=900);checks.push('the folded dock remains reachable and its status can update');
        await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});await evaluate('__pokecatchHelper.show()');
        const legendaryMobile=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,original=e.settings;
            const picker=r.querySelector('#legend-picker'),summary=picker.querySelector('summary');
            try{
                r.querySelector('[data-workspace="tasks"]').click();
                r.querySelector('[data-mode="legend"]').click();
                e.settings={...e.settings,legendId:486,legendIds:[]};e.onChange();picker.open=true;
                const rows=[...picker.querySelectorAll('.legend-option')],content=r.querySelector('.content');
                return {solo:summary.textContent.includes('雷吉奇卡斯'),ordinary:!!picker.closest('#ordinary-target'),
                    fits:content.scrollWidth<=content.clientWidth+1&&rows.every(row=>row.offsetHeight>=44&&row.scrollWidth<=row.clientWidth+1),
                    clearFits:picker.querySelector('#legend-clear').getBoundingClientRect().right<=picker.getBoundingClientRect().right+1,
                    distinctLocations:rows.every(row=>!!row.querySelector('small').textContent)};
            }finally{
                picker.open=false;e.settings=original;e.persist();e.onChange();r.querySelector('[data-workspace="activity"]').click();
            }
        })()`);
        assert.deepEqual(legendaryMobile,{solo:true,ordinary:true,fits:true,clearFits:true,distinctLocations:true});
        checks.push('a legacy single target is shown in the shared standalone picker and its full rows fit a 360-pixel viewport');
        const queuedLegend=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,before={settings:e.settings,queue:e.queue,index:e.queueIndex};
            const picker=r.querySelector('#legend-picker');
            const target=id=>picker.querySelector('[value="'+id+'"]');
            try{
                r.querySelector('[data-workspace="tasks"]').click();r.querySelector('[data-mode="legend"]').click();
                e.settings={...e.settings,legendId:145,legendIds:[145,385]};e.queue=[];e.onChange();
                r.querySelector('#add-job').click();
                r.querySelector('[data-workspace="queue"]').click();
                r.querySelector('[data-job-action="edit"]').click();
                picker.open=true;target(486).closest('.legend-option').querySelector('button').click();
                r.querySelector('#add-job').click();
                const saved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+e.account));
                return {queued:saved.queue[0].settings.legendId,count:saved.queue[0].settings.legendIds.length,current:saved.settings.legendIds};
            }finally{
                picker.open=false;e.settings=before.settings;e.queue=before.queue;e.queueIndex=before.index;e.persist();e.onChange();
                r.querySelector('[data-workspace="activity"]').click();
            }
        })()`);
        assert.deepEqual(queuedLegend,{queued:486,count:0,current:[145,385]});
        checks.push('editing a queued legendary task saves its new single target without changing the active standalone selection');
        const previous=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,r=${root},prior={settings:e.settings,adv:fixtureState.adv,to:fixtureState.travel.to,page:r.querySelector('[data-workspace][aria-pressed=true]').dataset.workspace};
            fixtureState.adv={...fixtureState.adv,chapter:76,unlocked:83};fixtureState.travel.to=[...fixtureState.travel.to,'unova'];
            e.settings={...e.settings,mode:'dex',dexSpecies:[529,530]};commitExecution();
            r.querySelector('[data-workspace="dex"]').click();
            const input=r.querySelector('#dex-search');input.value='';input.dispatchEvent(new Event('input'));
            return prior;
        })()`);
        const shortList=await evaluate(`(()=>{
            const r=${root},rows=[...r.querySelectorAll('.dex-target')],visible=el=>el.getClientRects().length>0;
            const data={names:rows.map(b=>b.querySelector('strong').textContent),fits:rows.every(b=>b.clientHeight>=44&&b.scrollWidth<=b.clientWidth+1),idle:!visible(r.querySelector('.commandbar'))};
            rows[1].click();data.detail=r.activeElement===r.querySelector('.dex-heading');
            r.querySelector('#dex-clear').click();data.returned=r.activeElement?.dataset.species==='530';
            return data;
        })()`);
        assert.deepEqual(shortList,{names:['螺钉地鼠','龙头地鼠'],fits:true,idle:true,detail:true,returned:true});
        const dexImage=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'dex-short-list.png'),Buffer.from(dexImage.data,'base64'));
        const restored=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,prior=${JSON.stringify(previous)};
            e.running=true;e.onChange();const shown=!!r.querySelector('#stop').getClientRects().length&&!r.querySelector('.queue-tools').getClientRects().length;
            e.running=false;e.settings=prior.settings;fixtureState.adv=prior.adv;fixtureState.travel.to=prior.to;commitExecution();
            r.querySelector('[data-workspace="'+prior.page+'"]').click();return shown;
        })()`);
        assert.ok(restored);checks.push('two-species mobile dex retains detail and return focus, active Stop, and full-width tap targets');
        const lookupFits=await evaluate(`(()=>{const r=${root},content=r.querySelector('.content');
            const open=page=>r.querySelector('[data-workspace="'+page+'"]').click();
            function firstScreen(selector){
                const rect=r.querySelector(selector).getBoundingClientRect(),viewport=content.getBoundingClientRect();
                return rect.width>0&&rect.height>0&&rect.top>=viewport.top&&rect.bottom<=viewport.bottom&&content.scrollWidth<=content.clientWidth+1;
            }
            open('dex');const dex=firstScreen('#dex-search');
            open('weather');const weather=firstScreen('#weather-panel [data-sky]');
            open('activity');return dex&&weather;
        })()`);
        assert.ok(lookupFits,'standalone search and weather filters fit the first mobile screen');
        const mobile=await evaluate(`(()=>{const r=${root},host=document.querySelector('#pokecatch-auto-helper').getBoundingClientRect(),card=r.querySelector('#execution-info').getBoundingClientRect(),content=r.querySelector('.content');return{host:{left:host.left,right:host.right,bottom:host.bottom},card:{left:card.left,right:card.right},width:content.clientWidth,scrollWidth:content.scrollWidth}})()`);
        assert.ok(mobile.host.left>=0&&mobile.host.right<=360&&mobile.host.bottom<=780,JSON.stringify(mobile));assert.ok(mobile.card.left>=mobile.host.left&&mobile.card.right<=mobile.host.right,JSON.stringify(mobile));assert.ok(mobile.scrollWidth<=mobile.width+1,JSON.stringify(mobile));checks.push('the task/concurrency card fits a 360-pixel viewport without horizontal overflow');
        const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'execution-mobile.png'),Buffer.from(screenshot.data,'base64'));
        current=await state();assert.equal(JSON.parse(current.save).money,game.money);assert.equal(JSON.parse(current.save).mons[0].uid,'a');assert.match(current.rules,/串行|互斥/);checks.push('rules describe serialized UI operations and the display never mutates the game save');
        await evaluate(`(()=>{const e=__pcExecutionTest.engine;fixtureState.mons.push({uid:'b',id:9,level:80,reg:'kanto'});fixtureState.team=['b','a'];fixtureState.road=['a'];e.settings.autoTeam=true;e.driver.teamTask={uids:['b','a'],started:Date.now(),pending:{at:Date.now(),before:'a'}};e.driver.navigation={screen:'team',name:'队伍 / PC',attempts:2,started:Date.now(),nextAt:Date.now()+1200};commitExecution();${root}.querySelector('#decision-info').open=true})()`);
        const decision=await evaluate(`(()=>{const r=${root},card=r.querySelector('#decision-info').getBoundingClientRect();return{route:r.querySelector('#execution-route').textContent,team:r.querySelector('#execution-team').textContent,reason:r.querySelector('#execution-reason').textContent,width:r.querySelector('.content').clientWidth,scrollWidth:r.querySelector('.content').scrollWidth,left:card.left,right:card.right}})()`);
        assert.match(decision.route,/实际路线.*正在打开队伍/);assert.match(decision.team,/等待拖放存档确认.*水箭龟.*当前行进阵容.*喷火龙/);assert.ok(decision.reason);assert.ok(decision.scrollWidth<=decision.width+1);assert.ok(decision.left>=0&&decision.right<=360);checks.push('expanded mobile decisions distinguish saved PC order, pending drag confirmation and the real travelling squad');
        const decisionScreenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'decision-mobile.png'),Buffer.from(decisionScreenshot.data,'base64'));
        await evaluate(`(()=>{const e=__pcExecutionTest.engine;e.driver.teamTask=null;e.driver.navigation=null;e.automation.state={};e.running=true;e.settings.autoTeam=true;e.settings.autoUnderDispatch=true;e.settings.autoUnderCollect=false;fixtureState.adv.chapter=48;fixtureState.adv.unlocked=60;fixtureState.travel.to=['johto','hoenn','sinnoh'];fixtureState.mons=[6,9,3,65,68,149,19,16,10,13].map((id,i)=>({uid:'idle-ui-'+i,id,level:i<6?100:20,reg:'sinnoh'}));fixtureState.team=fixtureState.mons.slice(0,6).map(mon=>mon.uid);fixtureState.road=[...fixtureState.team];fixtureState.under={day:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()),sent:0,used:{},slots:[],geodes:[0,0,0,0]};commitExecution()})()`);
        const dispatchUI=await evaluate(`(()=>{const r=${root},service=r.querySelector('[data-service="underground"]');return{enabled:r.querySelector('[data-setting="autoUnderDispatch"]').checked,state:service.dataset.state,text:service.textContent,rules:r.querySelector('#parallel-rules').textContent,width:r.querySelector('.content').clientWidth,scrollWidth:r.querySelector('.content').scrollWidth}})()`);
        assert.equal(dispatchUI.enabled,true);assert.equal(dispatchUI.state,'waiting');assert.match(dispatchUI.text,/自动派遣开.*领取关.*冒险配队|自动派遣开.*领取关.*适配冒险阵容/);assert.match(dispatchUI.rules,/空闲队员.*主队.*Buddy/);assert.ok(dispatchUI.scrollWidth<=dispatchUI.width+1);checks.push('Sinnoh background dispatch waits for adventure fitting and explains its independent settings');
        await evaluate(`(()=>{window.BUILD=${JSON.stringify(H.NURSERY_RULES.build)};fixtureState.pension.eggs=[{uid:'odds-sp2',id:25,sp:2,hatchAt:Date.now()+600000}];fixtureState.dex={};fixtureState.buffs={};const r=${root};r.querySelector('#probability-info').open=true;r.querySelector('#decision-info').open=true;commitExecution()})()`);
        const odds=await evaluate(`(()=>{const r=${root},panel=r.querySelector('.panel').getBoundingClientRect(),content=r.querySelector('.content');return{wild:r.querySelector('#probability-wild').textContent,eggs:r.querySelector('#probability-eggs').textContent,open:r.querySelector('#probability-info').open,importDisabled:r.querySelector('#import-profile').disabled,exportPresent:!!r.querySelector('#export-profile'),inputType:r.querySelector('#profile-file').type,left:panel.left,right:panel.right,bottom:panel.bottom,width:content.clientWidth,scrollWidth:content.scrollWidth}})()`);
        assert.equal(odds.open,true);assert.match(odds.wild,/1\/2048/);assert.match(odds.eggs,/1\/16/);assert.equal(odds.importDisabled,true);assert.equal(odds.exportPresent,true);assert.equal(odds.inputType,'file');
        assert.ok(odds.left>=0&&odds.right<=360&&odds.bottom<=780,JSON.stringify(odds));assert.ok(odds.scrollWidth<=odds.width+1,JSON.stringify(odds));checks.push('expanded mobile odds show native wild 1/2048 and new sp:2 egg 1/16 while importing remains disabled during execution');
        await evaluate("delete window.BUILD;commitExecution()");
        assert.equal(await evaluate(`${root}.querySelector('#probability-eggs').textContent`),'蛋的闪率和判定见「孵蛋」页。');
        await evaluate(`__pcExecutionTest.engine.stop('configuration review fixture');commitExecution()`);
        assert.equal(await evaluate(`${root}.querySelector('#import-profile').disabled`),false);checks.push('stopping the task re-enables configuration import without auto-starting a replacement task');
        const environment=await evaluate(`(async()=>{const e=__pcExecutionTest.engine,r=${root};e.running=true;e.started=Date.now();e.tabToken=localStorage.getItem('pokecatch-tab');e.manual=null;e.preparation=null;e.raidPreparation=null;e.driver.teamTask=null;e.driver.navigation=null;e.lastProgress=Date.now();Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.documentElement.setAttribute('data-pc-helper-background-at',String(Date.now()));e.onChange();const active=r.querySelector('#execution-environment').textContent;document.documentElement.setAttribute('data-pc-helper-background-at',String(Date.now()-90000));e.onChange();await e.step();e.onChange();const expired=r.querySelector('#execution-environment').textContent,status=e.status;document.documentElement.removeAttribute('data-pc-helper-background-at');delete document.hidden;e.stop('environment fixture complete');e.onChange();return{active,expired,status}})()`);
        assert.match(environment.active,/保活扩展已启用.*后台运行许可/);assert.match(environment.expired,/当前标签在后台.*等待回到游戏/);assert.match(environment.status,/后台等待/);checks.push('a fresh companion heartbeat grants background status while an expired heartbeat restores the ordinary hidden-tab wait');
        const expandedScreenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'probability-profile-mobile.png'),Buffer.from(expandedScreenshot.data,'base64'));
        const ended=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,r=${root},s=fixtureState;
            r.querySelector('[data-workspace="tasks"]').click();
            e.settings={...e.settings,mode:'train',trainUid:'team',trainLevel:100,raids:false};
            s.mons[0].xp=0;s.money=1000;commitExecution();e.start();if(!e.running)throw Error(e.status);e.onChange();
            s.adv.paused=true;commitExecution();
            const nativePause=[r.querySelector('#run-state').textContent,r.querySelector('#mini-state').textContent,r.querySelector('#resume').classList.contains('hidden')];
            s.adv.paused=false;commitExecution();
            const resumed=r.querySelector('#run-state').textContent;
            s.money+=300;s.mons[0].xp+=120;
            localStorage.setItem('gachamon-save-v1',JSON.stringify(s));
            r.querySelector('#stop').click();
            s.money+=700;s.mons[0].xp+=400;commitExecution();
            const training=[r.querySelector('#money-value').textContent,r.querySelector('#dex-value').textContent];
            e.settings={...e.settings,mode:'item',itemId:'rare-candy'};s.stats.itemIn={'rare-candy':6};
            commitExecution();e.start();if(!e.running)throw Error(e.status);
            s.stats.itemIn['rare-candy']+=2;commitExecution();r.querySelector('#stop').click();
            s.stats.itemIn['rare-candy']+=5;commitExecution();
            return {nativePause,resumed,training,items:r.querySelector('#dex-value').textContent,money:r.querySelector('#money-value').textContent};
        })()`);
        assert.deepEqual(ended.training,['+300','120']);assert.match(ended.items,/^2\//);assert.equal(ended.money,'0');
        assert.match(ended.nativePause[0],/游戏暂停/);assert.match(ended.nativePause[1],/游戏已暂停/);assert.equal(ended.nativePause[2],true);assert.match(ended.resumed,/运行中/);
        checks.push('the full panel and minimized label reflect native pause and resume without offering the manual takeover button');
        checks.push('final wallet, trainee EXP and item gains freeze at Stop while the native game continues, and the next task gets a fresh baseline');
        const purchaseUI=await evaluate(`(()=>{
            const r=${root},q=selector=>r.querySelector(selector);
            const task=q('#task-purchase'),settings=q('#settings-purchase');
            const taskInput=task.querySelector('[data-setting="autoPurchase"]'),settingsInput=settings.querySelector('[data-setting="autoPurchase"]');
            const visible=el=>el.getClientRects().length>0;
            const boxFits=el=>{const b=el.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1;};
            const set=(key,n)=>{const field=q('[data-setting="'+key+'"]');field.value=n;field.dispatchEvent(new Event('change',{bubbles:true}));};
            const selectTask=mode=>{
                const button=q('[data-mode="'+mode+'"]');
                q('[data-category="'+button.dataset.group+'"]').click();
                if(!visible(button))throw Error('Task not reachable: '+mode);
                button.click();
            };
            fixtureState.money=12340;commitExecution();q('[data-workspace="tasks"]').click();
            const discoverable=['resource','progress','breed'].map(mode=>{
                selectTask(mode);
                return visible(taskInput)&&boxFits(task)&&!taskInput.closest('details:not([open])');
            });
            selectTask('money');
            const farmingHidesSwitch=!visible(taskInput);
            selectTask('resource');
            q('#purchase-edit-budget').click();
            const linked=visible(settingsInput)&&q('#budget-details').open;
            set('spendBudget','5000');set('moneyReserve','12000');set('dailySpendBudget','0');
            const settingsText=settings.querySelector('[data-purchase-status]').textContent;
            settingsInput.click();
            const disabledGlobally=!taskInput.checked&&!settingsInput.checked;
            q('[data-workspace="tasks"]').click();
            const off=task.querySelector('[data-purchase-status]').textContent;
            taskInput.click();
            const text=task.querySelector('[data-purchase-status]').textContent;
            const content=q('.content');
            return {discoverable,linked,farmingHidesSwitch,disabledGlobally,off,text,settingsText,synced:taskInput.checked&&settingsInput.checked,
                fits:boxFits(task)&&content.scrollWidth<=content.clientWidth+1};
        })()`);
        assert.deepEqual(purchaseUI.discoverable,[true,true,true]);assert.ok(purchaseUI.linked&&purchaseUI.fits&&purchaseUI.farmingHidesSwitch);
        assert.ok(purchaseUI.disabledGlobally&&purchaseUI.synced);assert.match(purchaseUI.off,/关/);
        assert.match(purchaseUI.text,/340/);assert.match(purchaseUI.settingsText,/340/);
        checks.push('the mobile task page shows the same purchase switch for resource, training preparation and breeding and links to the expanded budget');
        checks.push('task and settings switches stay synchronized and explain the spendable balance on the narrow viewport');
        const purchaseSettings=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,r=${root},prefix='pokecatch-helper:v1:',key=prefix+e.account;
            const saved=()=>JSON.parse(localStorage.getItem(key));
            const edit=(field,value,eventName)=>{
                const input=r.querySelector('[data-setting="'+field+'"]');
                input.value=value;input.dispatchEvent(new Event(eventName,{bubbles:true}));
            };
            // Use task commands and native browser events on the isolated page, with no game actions.
            e.schedule=()=>{};r.querySelector('[data-mode="resource"]').click();
            edit('spendBudget','10000000','input');
            window.dispatchEvent(new Event('pagehide'));
            const afterHide=saved().settings.spendBudget;
            edit('dailySpendBudget','3500','change');
            edit('dailySpendBudget','','change');
            const emptyLimit=saved().settings.dailySpendBudget;
            const lengthBefore=e.queue.length;
            r.querySelector('#add-job').click();
            const invalidDraft=[e.queue.length===lengthBefore,r.activeElement===r.querySelector('[data-setting="dailySpendBudget"]'),r.activeElement?.getAttribute('aria-invalid')];
            r.querySelector('#start').click();
            const blockedStart=!e.running;
            edit('dailySpendBudget','0','change');
            edit('moneyReserve','10000','change');
            edit('useBudget','20','input');
            r.querySelector('#add-job').click();
            const queued=saved().queue.at(-1).settings;
            edit('moneyReserve','12000','change');
            const lease=prefix+'lease:'+e.account;
            localStorage.setItem(lease,JSON.stringify({token:'other-fixture',expires:Date.now()+60000}));
            edit('moneyReserve','0','change');
            const rejected=[saved().settings.moneyReserve,e.settings.moneyReserve,r.querySelector('[data-setting="moneyReserve"]').value,e.status];
            r.querySelector('#start-queue').click();
            const blockedQueue=!e.running;
            localStorage.removeItem(lease);
            r.querySelector('#start-queue').click();
            if(!e.running)throw Error(e.status);
            e.manualInput();e.onChange();
            const locked=r.querySelector('[data-setting="spendBudget"]').disabled;
            const master=r.querySelector('#task-purchase [data-setting="autoPurchase"]');
            const couldTurnOff=master.checked&&!master.disabled;
            master.click();
            const offWhileRunning=!master.checked&&master.disabled;
            e.budget.used=1;window.dispatchEvent(new Event('pagehide'));
            const checkpoint=saved().resume;
            e.onChange();
            const suspendedReadOnly=!!e.suspended&&[...r.querySelectorAll('[data-setting="autoPurchase"]')].every(input=>input.disabled);
            master.click();
            window.dispatchEvent(new Event('pageshow'));
            const restored=[e.settings.moneyReserve,e.budget.used,e.running,e.queueRunning,e.settings.autoPurchase];
            r.querySelector('#stop').click();
            const persisted=saved().settings.autoPurchase;
            r.querySelector('#start-queue').click();
            const queuedAgain=e.settings.autoPurchase;
            r.querySelector('#stop').click();
            return {afterHide,emptyLimit,invalidDraft,blockedStart,blockedQueue,rejected,queued:[queued.spendBudget,queued.dailySpendBudget,queued.moneyReserve,queued.useBudget],
                checkpoint:[checkpoint.settings.spendBudget,checkpoint.settings.moneyReserve,checkpoint.budget.used],locked,restored,
                couldTurnOff,offWhileRunning,suspendedReadOnly,persisted,queuedAgain};
        })()`);
        assert.equal(purchaseSettings.afterHide,10000000);assert.equal(purchaseSettings.emptyLimit,3500);
        assert.deepEqual(purchaseSettings.invalidDraft,[true,true,'true']);assert.ok(purchaseSettings.blockedStart&&purchaseSettings.blockedQueue);
        assert.deepEqual(purchaseSettings.rejected.slice(0,3),[12000,12000,'0']);assert.match(purchaseSettings.rejected[3],/未保存/);
        assert.deepEqual(purchaseSettings.queued,[10000000,0,10000,20]);assert.deepEqual(purchaseSettings.checkpoint,[10000000,10000,1]);
        assert.equal(purchaseSettings.locked,true);assert.deepEqual(purchaseSettings.restored,[10000,1,true,true,false]);
        assert.equal(purchaseSettings.couldTurnOff,true);assert.equal(purchaseSettings.offWhileRunning,true);
        assert.equal(purchaseSettings.suspendedReadOnly,true);
        assert.equal(purchaseSettings.persisted,false);assert.equal(purchaseSettings.queuedAgain,false);
        checks.push('uncommitted mobile budget input survives pagehide, an empty daily cap preserves its prior limit, and an explicit zero saves');
        checks.push('invalid or unsaved budget drafts stay editable and block start, queue launch and enqueue until corrected or successfully saved');
        checks.push('the queue snapshots the edited budget, keeps manual-pause settings locked and resumes with the same limits and use counter');
        checks.push('the account purchase switch can be turned off while running, and queue restart and page suspension cannot turn it back on');
        const queueWorkspace=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,r=${root},q=selector=>r.querySelector(selector);
            const previous={...e.settings,mode:'resource'},key='pokecatch-helper:v1:'+e.account;
            e.settings=previous;
            const ongoing={id:'money-test',title:'刷钱测试',settings:{...previous,mode:'money',moneyTarget:12000},status:'paused',result:'上次已停止',progress:{budget:{spent:25,used:2}}};
            const other={id:'resource-test',title:'道具测试',settings:previous,status:'pending',result:''};
            e.updateQueue([ongoing,other]);e.onChange();
            const open=()=>q('[data-workspace="queue"]').click();
            const row=id=>q('[data-queue-job="'+id+'"]');
            const action=(id,name)=>row(id).querySelector('[data-job-action="'+name+'"]').click();
            const visible=el=>el.getClientRects().length>0;
            const setTarget=value=>{const input=q('[data-setting="moneyTarget"]');input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
            q('[data-workspace="tasks"]').click();
            q('#open-queue').click();
            const entry=visible(q('#pane-queue'))&&visible(q('#start-queue'))&&!visible(q('#pane-activity'))&&q('[data-workspace="queue"]').textContent==='任务队列';
            const controls=[row('money-test').querySelector('[data-job-action="up"]').disabled,row('resource-test').querySelector('[data-job-action="down"]').disabled];
            const width=q('.panel').getBoundingClientRect().width,fit=q('.content').scrollWidth<=q('.content').clientWidth+1;
            action('money-test','edit');setTarget('14000');
            const draft=JSON.parse(localStorage.getItem(key));
            const isolated=visible(q('#queue-edit-note'))&&draft.settings.mode==='resource'&&draft.queue[0].settings.moneyTarget===12000;
            q('#cancel-job').click();
            const cancelled=visible(q('#pane-queue'))&&e.settings.mode==='resource'&&e.queue[0].settings.moneyTarget===12000;
            action('money-test','edit');setTarget('16000');q('#add-job').click();
            const edited=visible(q('#pane-queue'))&&e.settings.mode==='resource'&&e.queue[0].settings.moneyTarget===16000&&e.queue[0].progress?.budget.used===2;
            action('money-test','down');
            const order=JSON.parse(localStorage.getItem(key)).queue.map(job=>job.id);
            action('resource-test','skip');open();q('#start-queue').click();
            const resumed=[e.running,e.queue[e.queueIndex]?.id,e.budget.used];
            action('money-test','edit');setTarget('22000');
            const liveDraft=e.settings.moneyTarget===16000&&!q('#add-job').disabled&&visible(q('#add-job'));
            q('#add-job').click();
            const staged=e.running&&e.settings.moneyTarget===16000&&e.editableQueue().find(job=>job.id==='money-test')?.settings.moneyTarget===22000;
            q('#queue-add').click();q('[data-mode="money"]').click();setTarget('33000');q('#add-job').click();
            const added=e.editableQueue().at(-1)?.settings.moneyTarget===33000;
            q('#stop').click();
            q('#start-queue').click();
            const updated=e.running&&e.settings.moneyTarget===22000&&e.budget.used===2;
            q('#stop').click();
            const owner=localStorage.getItem('pokecatch-tab'),saved=localStorage.getItem(key);
            localStorage.setItem('pokecatch-tab','another-game-tab');
            action('resource-test','remove');
            const foreignSaved=!row('resource-test')&&localStorage.getItem(key)===saved&&q('#queue-notice').textContent.includes('已保存');
            localStorage.setItem('pokecatch-tab',owner);
            return{entry,controls,width,fit,isolated,cancelled,edited,order,resumed,liveDraft,staged,added,updated,foreignSaved};
        })()`);
        assert.equal(queueWorkspace.entry,true);assert.deepEqual(queueWorkspace.controls,[true,true]);assert.ok(queueWorkspace.width<=360&&queueWorkspace.fit);
        assert.ok(queueWorkspace.isolated&&queueWorkspace.cancelled&&queueWorkspace.edited);
        assert.deepEqual(queueWorkspace.order,['resource-test','money-test']);assert.deepEqual(queueWorkspace.resumed,[true,'money-test',2]);
        for(const check of ['liveDraft','staged','added','updated','foreignSaved'])assert.equal(queueWorkspace[check],true,check);
        const queueShot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(dir,'mobile-queue.png'),Buffer.from(queueShot.data,'base64'));
        checks.push('dedicated mobile queue opens directly, keeps drafts separate, reorders, skips and resumes the intended saved task');
        const itemCounts=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,r=${root},s=fixtureState,id='belue-berry';
            const values=job=>Array.from(r.querySelectorAll('[data-queue-job="'+job+'"] .queue-item-counts dd'),el=>el.textContent);
            const cfg={...e.settings,mode:'item',itemId:id,itemQuantity:3};
            s.items[id]=8;s.stats.itemIn={[id]:18};commitExecution();
            const first={id:'first',title:'靛莓果',settings:cfg,status:'pending'};
            e.updateQueue([first,{...first,id:'second',settings:{...cfg,itemQuantity:20}},
                {...first,id:'legacy',status:'done'}]);e.onChange();
            const pending=values('first'),legacy=values('legacy');
            r.querySelector('#start-queue').click();clearTimeout(e.timer);
            s.items[id]=7;s.stats.itemIn[id]=20;commitExecution();
            const running=values('first'),other=values('second');
            r.querySelector('#stop').click();
            const paused=values('first');
            r.querySelector('#start-queue').click();clearTimeout(e.timer);
            s.items[id]=9;s.stats.itemIn[id]=22;commitExecution();
            e.completeTask('达到道具目标');clearTimeout(e.timer);e.onChange();
            const done=values('first'),next=values('second');
            r.querySelector('#stop').click();
            e.updateQueue(JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+e.account)).queue);e.onChange();
            const saved=values('first');
            r.querySelector('[data-queue-job="first"] [data-job-action="retry"]').click();
            return {pending,legacy,running,other,paused,done,next,saved,reset:values('first')};
        })()`);
        assert.deepEqual(itemCounts,{pending:['3','8','0'],legacy:['3','8','未记录'],running:['3','7','2'],
            other:['20','7','0'],paused:['3','7','2'],done:['3','9','4'],next:['20','9','0'],saved:['3','9','4'],reset:['3','9','0']});
        checks.push('item queue cards show the goal, live stock and independent intake through spending, stop, resume, completion and reset');
        const insights=await evaluate(`(async()=>{
            const r=${root},e=__pcExecutionTest.engine,s=fixtureState;
            s.adv.chapter=0;s.adv.unlocked=4;s.travel={to:[]};delete s.link;
            s.casino={targets:[5,1],n:{spins:1,spent:60,won:3,balls:10,paid:100,money:75,items:{potion:1}}};commitExecution();
            r.querySelector('[data-workspace="activity"]').click();r.querySelector('[data-tab="maps"]').click();
            for(const id of ['casino-insight','party-history'])r.querySelector('#'+id).open=true;
            r.querySelector('[data-yield-view="box"]').click();
            const view=r.querySelector('#view');
            for(let i=0;i<150&&!view.textContent.includes('已检查 4/4');i++){
                await new Promise(resolve=>setTimeout(resolve,40));e.onChange();
            }
            return {casino:r.querySelector('#casino-insight .sub').textContent,party:r.querySelector('#party-history .sub').textContent,
                finished:view.textContent.includes('已检查 4/4'),mapTeams:view.querySelectorAll('details').length,task:e.running};
        })()`);
        assert.match(insights.casino,/花费 60 ₽/);assert.match(insights.casino,/每购买百球已入账 750 ₽/);
        assert.match(insights.party,/完整轮次/);assert.equal(insights.finished,true);assert.equal(insights.mapTeams,4);assert.equal(insights.task,false);
        checks.push('read-only box ranking finishes on mobile while casino and party history display their own data');
        const reentry=await evaluate(`(()=>{
            const e=__pcExecutionTest.engine,s=structuredClone(fixtureState);
            const row={id:69,members:[69],key:'69',reg:'unova',name:'古代城'};
            const gameMap=document.createElement('section');gameMap.id='screen-map';gameMap.className='active';
            gameMap.innerHTML='<div id="map-root"><button class="rg open active" data-rg="unova">合众</button><button class="mp-row sel" data-ch="69">古代城</button><button class="mp-restart" data-restart="69">重新开始</button></div>';
            document.body.append(gameMap);
            const initial=e.settings;let clicks=0;gameMap.querySelector('.mp-restart').onclick=()=>clicks++;
            try{
                e.running=true;e.settings={...initial,mode:'item',itemId:'light-stone'};e.visit={};e.target=row;e.driver.lastClick=0;
                Object.assign(s.adv,{chapter:69,unlocked:83,loops:[69],badges:['Maître Unys'],node:0,
                    nodes:[{type:'item',loot:{'light-stone':.01}},{type:'gym'}]});
                const step=()=>e.restartForPickups(s,row,['light-stone'],Date.now());
                step();const before=clicks;s.adv.node++;
                gameMap.querySelector('.mp-row').classList.remove('sel');
                const control=gameMap.querySelector('.mp-restart');
                control.dataset.restart='68';
                e.driver.map(row,s,{restart:true,pickup:true});
                const wrong=clicks;control.dataset.restart='69';e.driver.lastClick=0;
                s.adv.battle={kind:'trainer'};
                e.driver.map(row,s,{restart:true,pickup:true});
                const busy=clicks;delete s.adv.battle;
                step();step();return [before,wrong,busy,clicks,e.action];
            }finally{e.running=false;e.settings=initial;e.visit=e.target=null;gameMap.remove();}
        })()`);
        assert.deepEqual(reentry,[0,0,0,1,'本轮目标拾取机会已用尽，重开古代城']);
        checks.push('pickup farming clicks the native same-chapter restart once after passing the target node');
        const rotom=await evaluate(`(()=>{
            const r=${root},e=__pcExecutionTest.engine,initial=e.settings,s=structuredClone(fixtureState);
            const panel=document.createElement('section');panel.id='screen-map';panel.className='active';
            panel.innerHTML='<div id="map-root"><button class="rg open active" data-rg="sinnoh">神奥</button><button class="mp-row sel" data-ch="52">湿地徽章</button><button class="mp-restart" data-restart="52">重新开始</button></div>';
            document.body.append(panel);
            try{
                r.querySelector('[data-mode="shiny"]').click();
                const search=r.querySelector('#hunt-search');search.value='479';search.dispatchEvent(new Event('input'));
                const options=Array.from(r.querySelector('#hunt-picker').options,o=>+o.value);
                const row={id:52,members:[52],key:'52',reg:'sinnoh',name:'湿地徽章',targets:[{kind:'rotomStatic',id:47905}]};
                s.dex={479:{caught:1}};Object.assign(s.adv,{chapter:52,node:0,loops:[52],nodes:[{type:'trainer'},{type:'static',id:47902,once:'rotom-wash'}]});
                e.settings={...initial,mode:'dex',dexSpecies:[47902,47905]};e.running=true;e.visit={};e.target=row;
                e.driver.lastClick=0;let clicks=0;panel.querySelector('.mp-restart').onclick=()=>clicks++;
                const at=new Date(2026,10,25,12).getTime(),step=()=>e.restartForRotom(s,row,at);
                step();const retained=clicks;s.adv.nodes.pop();step();step();return [options,retained,clicks,e.action];
            }finally{e.running=false;e.settings=initial;e.visit=e.target=null;panel.remove();}
        })()`);
        assert.deepEqual(rotom,[[479,47901,47902,47903,47904,47905],0,1,'本轮没有剩余目标洛托姆，重开湿地徽章']);
        checks.push('all Rotom forms are selectable for shiny hunts and an empty first node can trigger one native restart');
        console.log('PASS: '+checks.length+' execution/concurrency UI checks: '+checks.join('; '));console.log('Artifacts: '+dir);
    }finally{if(send&&socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
