// Offline integration fixture: native selector/receipt shapes, with Underground contracts from 1a16948eef.
// Fixture buttons alone mutate fixture state; the userscript must reach them through its driver.
(() => {
    const originalNav=window.nav,originalRaid=window.raid,originalMap=window.map;
    const e=()=>window.__pcTest?.engine,s=mock.state,save=()=>mock.save(),q=sel=>document.querySelector(sel);
    const pages=['pension','underground','shop'];
    for(const name of pages){const tab=document.createElement('button');tab.dataset.screen=name;tab.textContent=name;tab.onclick=()=>window.nav(name);q('#tabs').appendChild(tab);const screen=document.createElement('section');screen.className='screen';screen.id='screen-'+name;document.body.appendChild(screen);}
    function modal(className,body,fn){const root=q('#modal-root');root.className='open';root.innerHTML=`<div class="modal ${className}">${body}<div class="modal-actions">${className==='confirm'?'<button class="ghost">Cancel</button>':''}<button class="${className==='confirm'?'danger':'gold'}">OK</button></div></div>`;root.querySelector('.gold,.danger').onclick=()=>{fn?.();root.className='';root.replaceChildren();};}
    let eggPresentation='card',hatchClicks=0,hatchCommit=null;const eggReadiness=new Map();
    function pension(){
        const p=s.pension,root=q('#screen-pension'),search=q('#pc-search');root.innerHTML='<div id="pen-tabs"><button data-pen-tab="res" class="on">Residents</button><button data-pen-tab="egg">Eggs</button></div><div id="pen-res"></div><div id="pen-eggs"></div><div id="pen-grid"></div>';
        root.prepend(search);search.oninput=()=>{q('#pen-grid').innerHTML=s.mons.filter(m=>!s.team.includes(m.uid)&&(!search.value||String(m.id)===search.value)).map(m=>`<button data-uid="${m.uid}">${m.id}</button>`).join('');for(const card of root.querySelectorAll('#pen-grid [data-uid]'))card.onclick=()=>{const m=s.mons.find(m=>m.uid===card.dataset.uid);s.mons=s.mons.filter(x=>x!==m);p.mons.push({mon:m});save();pension();};};search.oninput();
        for(const tab of root.querySelectorAll('#pen-tabs [data-pen-tab]'))tab.onclick=()=>root.querySelectorAll('#pen-tabs [data-pen-tab]').forEach(other=>other.classList.toggle('on',other===tab));
        q('#pen-res').innerHTML=p.mons.map(x=>`<button class="pen-res" data-uid="${x.mon.uid}">${x.mon.id}</button>`).join('');
        q('#pen-eggs').innerHTML=p.eggs.map(egg=>{const ready=eggReadiness.has(egg.uid)?eggReadiness.get(egg.uid):egg.hatchAt<=Date.now();return`<button class="pen-egg ${ready?'ready':''}" data-egg="${egg.uid}" ${ready?'':'disabled'}>Egg</button>`;}).join('');
        const stock=s.items?.['belue-berry']||0;
        root.insertAdjacentHTML('beforeend',`<div id="pen-berries"><button data-myrte ${stock>0&&!p.bx?'':'disabled'}><span class="bag-qty">×${stock}</span></button></div>`);
        q('[data-myrte]').onclick=()=>{s.items['belue-berry']--;p.bx=1;save();pension();};
        for(const button of root.querySelectorAll('[data-egg]'))button.onclick=()=>{hatchClicks++;const commit=()=>{const egg=p.eggs.find(x=>x.uid===button.dataset.egg);p.eggs=p.eggs.filter(x=>x!==egg);s.stats.hatched=(s.stats.hatched||0)+1;save();pension();
            if(eggPresentation==='duplicate'){const fx=document.createElement('div');fx.className='rc-fx lk-fx lk-hatch';fx.innerHTML='<button class="rc-tap">Family XP</button>';fx.querySelector('.rc-tap').onpointerdown=()=>fx.remove();document.body.appendChild(fx);}
            else modal('dexcard-modal',eggPresentation==='plain'?'<b>Hatched</b>':'<b class="dc-new">Hatched</b>');};if(eggPresentation==='delayed')hatchCommit=commit;else commit();};
    }
    let shopQuantity='1';
    function shop(){
        const root=q('#screen-shop'),id='exp-candy-m',price=50;
        const count=shopQuantity==='max'?Math.max(1,Math.floor(s.money/price)):Number(shopQuantity);
        root.innerHTML=`<div id="shop-grid"><div class="sh-item" data-id="${id}">
            <span class="unit">${shopQuantity==='max'?'×'+count+' · ':''}${price} ₽ l’unité</span><b class="total">${price*count} ₽</b>
            <div class="seg">${['1','100','max'].map(n=>`<button data-n="${n}" class="${shopQuantity===n?'on':''}">${n}</button>`).join('')}</div>
            <button class="buy" ${price*count>s.money?'disabled':''}>Buy</button></div></div>`;
        for(const btn of root.querySelectorAll('[data-n]'))btn.onclick=()=>{shopQuantity=btn.dataset.n;shop();};
        root.querySelector('.buy').onclick=()=>{
            s.money-=price*count;s.items[id]=(s.items[id]||0)+count;s.stats.itemIn[id]=(s.stats.itemIn[id]||0)+count;
            s.stats.spent||={};s.stats.spent.candy=(s.stats.spent.candy||0)+price*count;save();shop();
        };
    }
    let underPage='exp',geodeOpened=0,underSelected=[],underSent=0,underTeamEdits=0,underPendingReturn=null,underCollectionClicks=0;
    function advanceUnderground(){
        if(!underPendingReturn)return;
        if(underPendingReturn.ticks-->0)return;
        const job=s.under.slots.find(job=>job.id===underPendingReturn.id);underPendingReturn=null;
        if(job){job.end=Date.now()-1;save();if(q('#screen-underground.active'))underground();}
    }
    function underground(){
        const root=q('#screen-underground');root.innerHTML=`<div id="ug-root"><button data-ug-tab="exp" class="${underPage==='exp'?'on':''}">Expeditions</button><button data-ug-tab="geo" class="${underPage==='geo'?'on':''}">Geodes</button></div>`;const ug=q('#ug-root'),job=s.under.slots[0];
        for(const button of ug.querySelectorAll('[data-ug-tab]'))button.onclick=()=>{underPage=button.dataset.ugTab;underground();};
        if(underPage==='geo'){
            const total=s.under.geodes.reduce((sum,n)=>sum+n,0),open=tier=>{
                if(tier==null)s.under.geodes=[0,0,0,0];else s.under.geodes[tier]--;save();
                const fx=document.createElement('div');fx.className='gd-fx';fx.innerHTML='<div class="gd-stage"><canvas></canvas></div><button class="gd-skip" hidden>Skip</button><button class="gd-ok" hidden>OK</button>';document.body.appendChild(fx);fx.querySelector('canvas').onpointerdown=()=>fx.querySelector('.gd-skip').hidden=false;fx.querySelector('.gd-skip').onclick=()=>{fx.querySelector('.gd-skip').hidden=true;fx.querySelector('.gd-ok').hidden=false;};fx.querySelector('.gd-ok').onclick=()=>{geodeOpened++;fx.remove();modal('ug-back','Gems');};
            };
            if(total>1){ug.insertAdjacentHTML('beforeend','<button data-ug-all>Open all</button>');ug.querySelector('[data-ug-all]').onclick=()=>open(null);}
            for(const [tier,count]of s.under.geodes.entries())if(count){const button=document.createElement('button');button.dataset.ugGeode=String(tier);button.textContent='Open geode';button.onclick=()=>open(tier);ug.appendChild(button);}return;
        }
        if(job){
            if(job.end<=Date.now()||job.recalled!=null){ug.insertAdjacentHTML('beforeend','<button data-ug-take="0">Collect</button>');ug.querySelector('[data-ug-take]').onclick=()=>{underCollectionClicks++;s.under.slots=s.under.slots.filter(other=>other.id!==job.id);s.mons.push(...job.mons);s.under.geodes[0]++;save();underground();modal('ug-back','Returned');};}
        }else{
            ug.insertAdjacentHTML('beforeend','<button data-ug-slot="0.0">Team</button><select data-ug-from="0"><option value="1">1</option></select><button data-ug-go="0">Send</button>');
            ug.querySelector('[data-ug-slot]').onclick=()=>{underTeamEdits++;factoryPicker('under:0',3,()=>{underSelected=[...(s.eventTeams?.['under:0']||[])];underground();});};
            const go=ug.querySelector('[data-ug-go]');go.disabled=underSelected.length!==3||underSelected.some(uid=>s.under.used?.[uid]||!s.mons.some(mon=>mon.uid===uid));
            go.onclick=()=>{const uids=[...underSelected],mons=uids.map(uid=>s.mons.find(mon=>mon.uid===uid));if(mons.some(mon=>!mon))throw Error('Fixture dispatch must take three actual PC members');underSent++;s.under.day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});s.under.sent=(s.under.sent||0)+1;s.under.used||={};for(const uid of uids)s.under.used[uid]=1;s.mons=s.mons.filter(mon=>!uids.includes(mon.uid));s.team=s.team.filter(uid=>!uids.includes(uid));s.road=s.road.filter(uid=>!uids.includes(uid));s.under.slots=[{id:'dispatch-'+underSent,bay:0,start:Date.now(),end:Date.now()+600000,team:uids,mons}];underSelected=[];(s.eventTeams||={})['under:0']=[];underPendingReturn={id:'dispatch-'+underSent,ticks:2};save();underground();};
        }
    }
    const utcWeek=()=>{const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(now.getUTCDay()+6)%7)).toISOString().slice(0,10);};
    const parisDay=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});
    const snapshot=(mon,prefix)=>({uid:prefix+mon.uid,src:mon.uid,id:mon.id,level:Math.min(100,mon.level),xp:0,shiny:!!mon.shiny,...mon.rank?{rank:mon.rank}:{},...mon.taste?{taste:mon.taste}:{}});
    function tower(){q('#raid-root').innerHTML='<div id="tower-root">'+(s.adv.tower||s.tower.run?'<button data-tw-quit>Quit</button>':'')+(!s.adv.tower?'<button data-tw-go>Go</button>':'')+'</div>';
        const go=q('[data-tw-go]');if(go){const pool=[...s.mons].filter(mon=>mon.level>=40).sort((a,b)=>b.level-a.level);go.disabled=!s.tower.run&&!pool.length;go.onclick=()=>{s.tower.run||={floor:1,week:utcWeek(),ms:0,mons:pool.slice(0,6).map(mon=>snapshot(mon,'t:')),log:[]};s.adv.tower={back:s.adv.chapter};save();window.nav('adventure');};}
        const quit=q('[data-tw-quit]');if(quit)quit.onclick=()=>modal('confirm','Abandonner la run ?',()=>{const run=s.tower.run;if(run){const floor=Math.max(0,run.floor-1),best=s.tower.best?.week===run.week?s.tower.best.floor:0;s.tower.best={week:run.week,floor:Math.max(best,floor),ms:run.ms||0};s.tower.gift={floor};}s.tower.run=null;s.adv.tower=null;save();tower();queueMicrotask(()=>modal('tw-back','Tower settlement',()=>{s.tower.gift=null;save();}));});
    }
    let factoryTheme='fire',factoryStarts=0,factoryDrags=0,factoryDeferSave=false,factoryFrom=1,factoryDrag=null,factoryClosedFilters=null;
    function factoryPicker(teamKey='candy',size=6,onClose=factory){
        const picker=document.createElement('div');picker.id='evt-pick';picker.style.cssText='width:720px;max-height:700px;overflow:auto;z-index:1000';
        picker.dataset.teamKey=teamKey;
        picker.innerHTML='<div id="evt-team" style="display:flex;gap:6px"></div><input id="evt-search" value="hidden"><select id="evt-sort"><option value="best">Best</option><option value="level">Level</option></select><button id="evt-eff" class="on">Effective</button><div id="evt-pc" style="width:680px;max-height:230px;min-height:110px;overflow:auto"></div><button data-evt-close>Close</button>';document.body.appendChild(picker);
        const render=()=>{
            const selected=s.eventTeams?.[teamKey]||[];q('#evt-team').innerHTML=Array.from({length:size},(_,i)=>`<div class="slot ${selected[i]?'filled':'empty'}" data-slot="${i}" ${selected[i]?`data-uid="${selected[i]}"`:''} style="width:85px;height:95px;border:1px solid #789">${selected[i]||'+'}</div>`).join('');
            const search=q('#evt-search').value,only=q('#evt-eff').classList.contains('on'),ordered=[...s.mons].sort((a,b)=>q('#evt-sort').value==='level'?b.level-a.level:a.id-b.id);
            q('#evt-pc').innerHTML=ordered.filter(mon=>!selected.includes(mon.uid)&&(!search||String(mon.id).includes(search))&&(!only||__pcTest.DATA.mons.find(model=>model.id===mon.id)?.types.includes(factoryTheme))).map(mon=>`<div class="pc-cell" data-uid="${mon.uid}" style="display:inline-block;width:85px;height:90px;border:1px solid #789">${mon.id}</div>`).join('');
        };
        q('#evt-search').oninput=render;q('#evt-sort').onchange=render;q('#evt-eff').onclick=()=>{q('#evt-eff').classList.toggle('on');render();};
        picker.querySelector('[data-evt-close]').onclick=()=>{if(teamKey==='candy')factoryClosedFilters={search:q('#evt-search').value,sort:q('#evt-sort').value,eff:q('#evt-eff').classList.contains('on')};picker.remove();onClose();};picker.render=render;render();
    }
    window.openEliteZonePicker=id=>factoryPicker('zone:'+id,6,()=>mock.nav('map'));
    document.addEventListener('pointerdown',event=>{const cell=event.target.closest('#evt-team [data-uid],#evt-pc .pc-cell[data-uid]');if(cell)factoryDrag={uid:cell.dataset.uid,id:event.pointerId,pc:!!cell.closest('#evt-pc')};});
    document.addEventListener('pointermove',event=>{if(factoryDrag&&factoryDrag.id===event.pointerId)factoryDrag.point={x:event.clientX,y:event.clientY};});
    document.addEventListener('pointerup',event=>{
        const drag=factoryDrag;factoryDrag=null;if(!drag||drag.id!==event.pointerId||!drag.point||!q('#evt-pick #evt-pc'))return;
        const contains=rect=>drag.point.x>=rect.left&&drag.point.x<=rect.right&&drag.point.y>=rect.top&&drag.point.y<=rect.bottom;
        const teamKey=q('#evt-pick').dataset.teamKey||'candy',slots=[...document.querySelectorAll('#evt-team .slot[data-slot]')],index=slots.findIndex(el=>contains(el.getBoundingClientRect())),team=[...(s.eventTeams?.[teamKey]||[])];
        if(index>=0){const old=team.indexOf(drag.uid);if(old>=0){const other=team[index];team[index]=drag.uid;if(other)team[old]=other;else team.splice(old,1);}else team[index]=drag.uid;}
        else if(contains(q('#evt-pc').getBoundingClientRect())){const old=team.indexOf(drag.uid);if(old>=0)team.splice(old,1);else return;}else return;
        s.eventTeams||={};s.eventTeams[teamKey]=team.filter(Boolean);factoryDrags++;if(teamKey!=='candy'||!factoryDeferSave)save();q('#evt-pick').render();
    });
    function factory(){
        s.candy||={v:3,played:null,best:0,total:{},run:null,last:null};const run=s.candy.run,active=s.adv.tower?.kind==='candy',played=s.candy.played===parisDay();
        q('#raid-root').innerHTML=`<div id="candy-root"><div class="cr-type"><b data-type="${factoryTheme}">${factoryTheme}</b></div><button data-cr-team>Team</button><button data-cr-from="1" class="${factoryFrom===1?'on':''}">Floor 1</button><button data-cr-from="6" class="${factoryFrom===6?'on':''}">Skip with rare candy</button>${active?'<button data-cr-follow>Follow</button><button data-cr-stop>Stop</button>':run?'<button data-cr-go>Resume</button><button data-cr-stop>Stop</button>':`<button data-cr-go ${played||!s.eventTeams?.candy?.length?'disabled':''}>Start</button>`}</div>`;
        q('[data-cr-team]').onclick=()=>factoryPicker();for(const button of document.querySelectorAll('#candy-root [data-cr-from]'))button.onclick=()=>{factoryFrom=+button.dataset.crFrom;factory();};
        const follow=q('[data-cr-follow]');if(follow)follow.onclick=()=>window.nav('adventure');
        const go=q('[data-cr-go]');if(go)go.onclick=()=>{factoryStarts++;if(!s.candy.run){s.candy.played=parisDay();s.candy.run={day:parisDay(),type:factoryTheme,from:factoryFrom,floor:factoryFrom,ms:0,at:Date.now(),mons:(s.eventTeams.candy||[]).map(uid=>s.mons.find(mon=>mon.uid===uid)).filter(Boolean).map(mon=>snapshot(mon,'c:')),got:{},skipPaid:0};}s.adv.tower={kind:'candy',back:s.adv.chapter};save();window.nav('adventure');};
        const stop=q('[data-cr-stop]');if(stop)stop.onclick=()=>modal('confirm','Arrêter le run ? Les bonbons gagnés sont gardés.',()=>{const run=s.candy.run;s.candy.last={day:run.day,type:run.type,from:run.from,floor:run.floor-1,ms:run.ms,at:run.at,got:{...run.got},team:run.mons.map(mon=>mon.src)};s.candy.best=Math.max(s.candy.best||0,run.floor-1);s.candy.run=null;s.adv.tower=null;save();factory();queueMicrotask(()=>modal('cr-back ug-back','Factory settlement'));});
    }
    function world(){q('#raid-root').innerHTML='<button class="rh-hb wb" data-wb-go>World</button>';q('[data-wb-go]').onclick=()=>renderWorld();}
    function renderWorld(){const root=q('#raid-root');root.innerHTML=s.wb.capture?'<div class="wb-capv"><button data-wbz-team>Team</button><button data-wbz-go>Capture</button></div>':'<button data-wb-atk>Attack</button>';
        const attack=q('[data-wb-atk]');if(attack)attack.onclick=()=>{s.wb.n++;save();renderWorld();};const edit=q('[data-wbz-team]');if(edit)edit.onclick=mock.team;
        const go=q('[data-wbz-go]');if(go)go.onclick=()=>{s.wb.tryEd=s.wb.ed;s.adv.zone={id:493};save();window.nav('adventure');};}
    function elite(reg='kanto'){
        const key='league:'+reg,tier=(s.eliteLeague[reg]?.t||0)+1;
        q('#map-root').innerHTML=['kanto','johto'].map(r=>`<button class="rg open ${r===reg?'active':''}" data-rg="${r}">${r}</button>`).join('')+
            `<button class="mp-row sel" data-ch="L">League</button><button class="on" data-lg-view="elite">Elite</button><button data-lg-team="${reg}">Team</button><button data-league="${reg}" data-tier="${tier}">Go</button>`;
        for(const r of document.querySelectorAll('#map-root [data-rg]'))r.onclick=()=>elite(r.dataset.rg);
        q('[data-lg-team]').onclick=()=>factoryPicker(key,6,()=>elite(reg));
        q('[data-league]').onclick=()=>{s.adv.league={reg,tier,team:[...(s.eventTeams?.[key]||s.team)]};save();window.nav('adventure');};
    }
    let unovaDeparture=null;
    function departure(){
        if(unovaDeparture){
            if(s.travel.to.includes('unova'))return originalMap();
            q('#map-root').innerHTML='<button class="rg open depart" data-depart="unova">合众</button>';
            q('[data-depart]').onclick=()=>{unovaDeparture.opens++;unovaDeparture.modal();};
            return;
        }
        q('#map-root').innerHTML='<button data-depart="johto">Depart</button>';q('[data-depart]').onclick=()=>{const root=q('#modal-root');root.className='open';root.innerHTML='<div class="modal dp-modal"><div class="modal-actions"><button class="primary">Depart</button></div></div>';root.querySelector('.primary').onclick=()=>{s.adv.chapter=14;s.adv.unlocked=14;s.travel.to=['johto'];root.className='';root.replaceChildren();save();window.nav('adventure');};};
    }
    function starterDepartureFixture(presentation){
        const starters=[[495,'藤藤蛇'],[498,'暖暖猪'],[501,'水水獭']];
        const art=id=>`<img class="art" src="assets/pokemon/art/still/${id}.png" alt="">`;
        let queuedReceipt=null;
        const close=()=>{
            const root=q('#modal-root');root.className='';root.replaceChildren();
            if(queuedReceipt){const id=queuedReceipt;queuedReceipt=null;showReceipt(id);}
        };
        const session={opens:0,confirmations:0,cancels:0,picks:[],grants:0,receipts:0};
        function showReceipt(id){
            const root=q('#modal-root');
            if(root.classList.contains('open')){queuedReceipt=id;return;}
            root.className='open';
            root.innerHTML=`<div class="modal dexcard-modal"><div class="modal-body"><div class="dexcard v2"><div class="dc-head"><div class="dc-sum"><span>编号 <b>${String(id).padStart(4,'0')}</b></span></div></div><div class="dc-top"><div class="dc-hero caught">${art(id)}</div></div></div></div><div class="modal-actions solo"><button class="btn gold">太好了！</button></div></div>`;
            root.querySelector('.gold').onclick=()=>{session.receipts++;close();};
        }
        session.modal=(destination='unova')=>{
            const destinationName=destination==='unova'?'合众':'城都';
            const shownStarters=destination==='unova'?starters:[[152,'菊草叶'],[155,'火球鼠'],[158,'小锯鳄']];
            const root=q('#modal-root');root.className='open';
            root.innerHTML=`<div class="modal dexcard-modal oc-modal dp-modal"><div class="modal-body"><div class="dc-head"><h2>出发前往${destinationName}！</h2><button class="dc-x">×</button></div><div class="dp-banner"><div class="dp-starters">`+
                shownStarters.map(([id,name])=>`<figure>${art(id)}<figcaption>${name}</figcaption></figure>`).join('')+
                `</div></div></div><div class="modal-actions"><button class="btn ghost">稍后</button><button class="btn primary">前往${destinationName}</button></div></div>`;
            root.querySelector('.ghost').onclick=root.querySelector('.dc-x').onclick=()=>{session.cancels++;close();};
            root.querySelector('.primary').onclick=()=>{
                session.confirmations++;close();
                if(!q('.tv-fx'))document.body.appendChild(Object.assign(document.createElement('div'),{className:'tv-fx',textContent:'神奥 → 合众'}));
            };
        };
        session.arrive=({stale=false,knownReceipt=false}={})=>{
            q('.tv-fx')?.remove();
            // The departure button resolves its modal before travel FX and the native save.
            s.link={side:'to',from:'sinnoh',to:'unova',stash:{mons:s.mons,team:s.team,items:s.items,money:s.money}};
            s.mons=[];s.team=[];s.road=[];s.money=3000;s.travel.to.push('unova');
            Object.assign(s.adv,{chapter:66,unlocked:66,node:0,nodes:[{type:'gift',name:'Renouet',gift:{key:'starter-unova',choices:starters.map(([id])=>id),level:5}}],pending:null});
            delete s.adv.gifts['starter-unova'];save();window.nav('adventure');
            // A previously queued departure dialog can still be visible below the gift FX.
            if(stale)session.modal();
            const fx=document.createElement('div'),link=presentation==='link';
            const title='在鹿子镇的家里，红豆杉博士送来的礼物：选择你的宝可梦吧！';
            fx.className=link?'rc-fx lk-fx lk-choice multi':'hatch-fx gift';
            fx.innerHTML=link?`<div class="rc-title lk-title">${title}</div><div class="lk-stage">${starters.map(([id])=>`<div class="lk-slot pick"><span class="lk-pad"></span><div class="lk-mon">${art(id)}</div></div>`).join('')}</div><button class="btn primary lg lk-go" disabled>选择一只宝可梦</button>`:
                `<div class="hx-title">${title}</div><div class="gift-balls">${starters.map(([id,name])=>`<button class="gift-ball ready sway" data-id="${id}" aria-label="${name}"><div class="gb-mon"><div class="gb-art">${art(id)}</div></div></button>`).join('')}</div><button class="btn primary lg gift-go" disabled>选择一只宝可梦</button>`;
            document.body.appendChild(fx);
            const go=fx.querySelector('.gift-go,.lk-go'),buttons=[...fx.querySelectorAll('.gift-ball,.pick')];let chosen=null;
            buttons.forEach((button,index)=>button.onclick=()=>{
                chosen=starters[index][0];session.picks.push(chosen);buttons.forEach(other=>other.classList.toggle('on',button===other));go.disabled=false;
            });
            go.onclick=()=>{
                if(!chosen||go.disabled)return;
                go.disabled=true;session.grants++;fx.remove();
                const mon={uid:'starter-'+chosen,id:chosen,level:5,reg:'unova',xp:0};
                s.mons=[mon];s.team=[mon.uid];s.road=[mon.uid];s.adv.gifts['starter-unova']=chosen;s.adv.node=1;
                s.dex[chosen]={caught:(s.dex[chosen]?.caught||0)+1};save();
                if(knownReceipt)showReceipt(chosen);
            };
        };
        return session;
    }
    let bagFolded=false,buddyChanges=0;
    function buffBag(){
        let root=q('#bag-panel');if(!root){root=document.createElement('div');root.id='bag-panel';q('#screen-adventure').appendChild(root);}
        root.innerHTML=`<div class="bag-box ${bagFolded?'folded':''}"><button class="zone-head">Inventory</button><div ${bagFolded?'hidden':''}>${['pinap-berry','lansat-berry'].map(id=>`<button class="bag-cell" data-k="${id}" ${s.items?.[id]>0?'':'disabled'}>${id}</button>`).join('')}</div></div>`;
        root.querySelector('.zone-head').onclick=()=>{bagFolded=!bagFolded;buffBag();};
        for(const button of root.querySelectorAll('[data-k]'))button.onclick=()=>{const id=button.dataset.k,family=id==='pinap-berry'?'xp':'money',previous=s.buffs?.[family],active=previous?.until>Date.now()&&!(previous.side==='from'&&s.link?.side==='to');s.items[id]--;s.stats.itemOut[id]=(s.stats.itemOut[id]||0)+1;s.buffs||={};s.buffs[family]={key:id,until:(active&&previous.key===id?previous.until:Date.now())+3600000,side:s.link?.side};save();buffBag();};
    }
    window.raid=()=>{
        if(e()?.settings.mode==='tower')return tower();if(e()?.settings.mode==='candy')return factory();if(e()?.settings.mode==='world')return world();originalRaid();
        const leave=q('#raid-root [data-raid-leave]');if(leave){const native=leave.onclick;leave.onclick=()=>{s.fixtureRaidTries=s.adv.event?.loops||0;native();};}
        const go=q('#raid-root [data-raid-go]');if(go){const native=go.onclick;go.onclick=()=>{native();if(s.adv.event?.raid&&s.fixtureRaidTries){s.adv.event.loops=s.fixtureRaidTries;save();}};}
    };
    window.map=()=>e()?.settings.mode==='elite'&&!s.adv.league?elite():e()?.settings.mode==='progress'&&e().settings.autoTravel?departure():originalMap();
    window.nav=function(name){
        if(name==='team'){const search=q('#pc-search');if(search&&!q('#screen-team').contains(search))q('#screen-team').prepend(search);}
        if(pages.includes(name)){document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id==='screen-'+name));({pension,shop,underground})[name]();return;}
        originalNav(name);if(name==='adventure')buffBag();
    };
    let evolutionClicks=[],evolutionDetails=[],evolutionDeferSave=false,evolutionCommit=null;
    const nativeFreeEvolution={1:{to:2,level:16},2:{to:3,level:32},63:{to:64,level:16}};
    function evolutionDetail(uid){
        const mon=s.mons.find(mon=>mon.uid===uid);if(!mon)throw Error('Fixture evolution member missing: '+uid);
        const rule=nativeFreeEvolution[mon.id],free=rule&&mon.level>=rule.level&&!mon.rank,root=q('#modal-root');
        evolutionDetails.push({uid,id:mon.id});root.className='open';
        root.innerHTML=`<div class="modal mon-modal"><div class="dexcard v2 mon-card"><div class="dc-hero sprite"><div class="w"><img data-id="${mon.id}" src="data:," alt="${mon.id}"></div></div><button class="dc-x">Close</button><div class="item-actions">${free?'<button class="btn gold evo-btn">Evolve</button>':mon.id===493?'<button class="btn gold evo-btn">Change plate</button>':'<button class="item-evolution"><img src="https://example.invalid/thunder-stone.png">Use stone</button>'}</div></div></div>`;
        root.querySelector('.dc-x').onclick=()=>{root.className='';root.replaceChildren();};
        const button=root.querySelector('.evo-btn');if(!button)return;
        button.onclick=()=>{
            if(!free)throw Error('Fixture must never auto-approve an Arceus plate choice');
            evolutionClicks.push({uid,from:mon.id,to:rule.to});root.className='';root.replaceChildren();
            const fx=document.createElement('div');fx.className='rc-fx lk-fx lk-evo';fx.innerHTML='<button class="rc-tap">Continue evolution</button>';document.body.appendChild(fx);
            const tap=fx.querySelector('.rc-tap');let stage='before';
            fx.onpointerdown=()=>{
                if(stage==='before'){
                    stage='saving';mon.id=rule.to;s.dex[rule.to]||={caught:1};
                    const commit=()=>{save();stage='after';tap.disabled=false;evolutionCommit=null;};
                    if(evolutionDeferSave){tap.disabled=true;evolutionCommit=commit;}else commit();
                }else if(stage==='after'){stage='done';fx.remove();evolutionDetail(uid);}
            };
        };
    }
    document.addEventListener('click',event=>{
        const card=event.target.closest('#team-slots [data-uid],#pc-grid [data-uid]');if(!card)return;
        if(e()?.settings.autoEvolve&&e().automation.state.evolution?.stage==='open'){evolutionDetail(card.dataset.uid);return;}
        if(e()?.settings.mode!=='resource'&&!(e()?.preparation&&e().settings.progressCandy)&&!(e()?.settings.trainBuddy&&(e().settings.mode==='train'||e().preparation?.phase==='train')))return;
        const root=q('#modal-root');root.className='open';root.innerHTML=`<div class="modal mon-modal"><div class="mon-card"><button class="dc-x">Close</button><button class="dc-buddy" aria-pressed="${s.buddy?.uid===card.dataset.uid}">Buddy</button><button class="dc-candy"><img src="https://example.invalid/exp-candy-m.png"></button></div></div>`;
        root.querySelector('.dc-buddy').onclick=event=>{buddyChanges++;s.buddy={uid:s.buddy?.uid===card.dataset.uid?null:card.dataset.uid,ko:0};event.currentTarget.setAttribute('aria-pressed',String(s.buddy.uid===card.dataset.uid));save();};
        root.querySelector('.dc-x').onclick=()=>{root.className='';root.replaceChildren();};root.querySelector('.dc-candy').onclick=()=>{s.items['exp-candy-m']--;s.stats.itemOut['exp-candy-m']=(s.stats.itemOut['exp-candy-m']||0)+1;
            if(e().settings.mode!=='resource'){
                const data=__pcTest.DATA,mon=s.mons.find(m=>m.uid===card.dataset.uid),reg=mon.reg||'kanto',economy=__pcTest.economicRegion(s),table=data.xpThresholds[economy][mon.rank||0],cap=data.caps[s.adv.unlocked][reg];
                mon.xp=(mon.xp||0)+data.automation.candies['exp-candy-m'].xp[economy];while(mon.level<cap&&mon.xp>=table[mon.level]){mon.xp-=table[mon.level];mon.level++;}if(mon.level>=cap)mon.xp=0;
            }save();};
    });
    window.runAutomationTests=async()=>{
        const engine=e(),checks=[];const assert=(value,label)=>{if(!value)throw Error('Automation: '+label);checks.push(label);};const base={...engine.settings};
        const reset=(mode,settings={})=>{
            engine.stop();engine.queueRunning=false;engine.queue=[];engine.cooldowns={};engine.raidCooldown={};engine.driver.recent.clear();
            shopQuantity='1';
            underSelected=[];underSent=0;underTeamEdits=0;underPage='exp';underPendingReturn=null;underCollectionClicks=0;delete s.link;if(s.eventTeams)delete s.eventTeams['under:0'];
            q('#modal-root').className='';q('#modal-root').replaceChildren();q('#evt-pick')?.remove();document.querySelectorAll('.lk-evo').forEach(fx=>fx.remove());
            evolutionClicks=[];evolutionDetails=[];evolutionDeferSave=false;evolutionCommit=null;
            Object.assign(s,{money:1000,mons:[{uid:'a',id:6,level:30},{uid:'d',id:132,level:20},{uid:'p',id:1,level:30}],team:['a'],road:['a'],buddy:{uid:null,ko:0},buffs:{},dex:{},items:{},stats:{hatched:0,itemIn:{},itemOut:{}},pension:{open:{slots:2,eggs:1},mons:[],eggs:[]},under:{slots:[],geodes:[0,0,0,0]},tower:{},eliteLeague:{},wb:{ed:5,day:0,n:0}});
            Object.assign(s.adv,{chapter:0,unlocked:mode==='resource'?3:8,badges:[],pending:null,battle:null,event:null,zone:null,tower:null,league:null,loops:[],speed:4});save();window.nav('adventure');
            engine.settings={...base,mode,raids:false,autoTeam:false,autoEvolve:false,autoUnderDispatch:false,pensionService:false,manualPause:false,moneyTarget:0,spendBudget:0,moneyReserve:0,useBudget:10,trainBuddy:false,trainBuff:false,moneyBuff:false,...settings};
            engine.schedule=()=>{};engine.start();clearTimeout(engine.timer);engine.timer=null;
        };
        const tick=async()=>{
            advanceUnderground();engine.driver.lastClick=0;engine.automation.state.waitUntil=0;
            await engine.step();
            // The accelerated game loop must also give native timers a turn to score routes.
            if(engine.rankingJobs.size||engine.teamSearch)await new Promise(resolve=>setTimeout(resolve,8));
        };
        const until=async(predicate,n=20)=>{for(let i=0;i<n&&!predicate();i++)await tick();};
        const adventureWin=amount=>{for(const uid of s.road||[]){const mon=s.mons.find(m=>m.uid===uid);if(!mon)continue;const reg=mon.reg||'kanto',table=__pcTest.DATA.xpThresholds[__pcTest.economicRegion(s)][mon.rank||0],cap=__pcTest.DATA.caps[s.adv.unlocked][reg];mon.xp=(mon.xp||0)+amount;while(mon.level<cap&&mon.xp>=table[mon.level]){mon.xp-=table[mon.level];mon.level++;}if(mon.level>=cap)mon.xp=0;}save();};
        const information=(classes='dexcard-modal',body='<div class="dexcard v2"><button class="dc-x">Close</button></div>')=>{const root=q('#modal-root');root.className='open';root.innerHTML=`<div class="modal ${classes}">${body}</div>`;const close=root.querySelector('.dc-x');if(close)close.onclick=()=>{root.className='';root.replaceChildren();};return root;};
        const resetFactory=(settings={},theme='fire')=>{
            reset('candy',{candyFloor:10,candyRuns:1,autoPrepare:false,optimizeRaid:true,...settings});factoryTheme=theme;factoryStarts=0;factoryDrags=0;factoryDeferSave=false;factoryFrom=6;factoryDrag=null;factoryClosedFilters=null;
            s.mons=[6,9,3,65,68,149,19,13].map((id,i)=>({uid:'factory-'+i,id,level:i<6?100:10,reg:'kanto'}));s.team=s.mons.slice(0,6).map(mon=>mon.uid);s.road=[...s.team];s.eventTeams={candy:['factory-7']};
            s.travel.to=['johto','hoenn'];s.adv.unlocked=47;s.adv.badges=['Maître','Maître Johto','Maître Hoenn'];s.items={'rare-candy':30};s.candy={v:3,played:null,best:0,total:{},run:null,last:null};save();window.nav('raid');
        };
        const resetBackgroundUnderground=()=>{
            reset('money',{autoUnderDispatch:true,autoUnderCollect:true,optimizeRaid:false,autoTeam:false,autoPrepare:false,autoEggs:false});
            s.mons=[6,9,3,65,68,149].map((id,i)=>({uid:'protected-main-'+i,id,level:100,reg:'sinnoh'}));s.team=s.mons.map(mon=>mon.uid);s.road=[...s.team];
            s.mons.push({uid:'protected-buddy',id:25,level:100,reg:'sinnoh'},{uid:'protected-raid',id:150,level:100,reg:'sinnoh'},{uid:'protected-trainee',id:4,level:100,reg:'sinnoh'},...[74,95,112].map((id,i)=>({uid:'background-idle-'+i,id,level:80,reg:'sinnoh'})));
            s.eventTeams={'raid:kanto':['protected-raid']};s.buddy={uid:'protected-buddy',ko:0};engine.trainProtected=['protected-trainee'];
            s.travel.to=['johto','hoenn','sinnoh'];s.adv.chapter=48;s.adv.unlocked=65;s.adv.badges=['Forêt'];s.adv.battle={steps:3,enemies:[{id:19,level:20,hp:30}]};
            factoryDrags=0;save();window.nav('adventure');
        };
        const resetEvolution=(settings={},bench=false)=>{
            reset('money',{autoEvolve:true,autoPrepare:false,autoTeam:false,animations:false,dismissInfo:false,...settings});
            s.mons=[{uid:'evo-leaf',id:2,level:60,xp:0,reg:'kanto'}];
            if(bench)s.mons.unshift({uid:'evo-active',id:6,level:60,xp:0,reg:'kanto'});
            s.team=[bench?'evo-active':'evo-leaf'];s.road=[...s.team];s.dex={2:{caught:1}};save();window.nav('adventure');
        };
        for(const mode of ['money','item','train','dex','shiny']){
            reset(mode,{autoPrepare:false,autoEggs:false,autoUnderCollect:false,itemId:'rare-candy',shinyId:25,trainUid:'team',trainLevel:70});
            s.adv.pending={type:'gym'};save();window.nav('raid');await tick();
            assert(engine.running&&!!q('#screen-adventure.active')&&s.adv.pending?.type==='gym',mode+' returns from the result page to an unfinished native choice without skipping that choice ('+engine.status+')');
        }
        for(const kind of ['egg','evolution']){
            reset('money',{autoPrepare:false,animations:false,dismissInfo:false});
            let acknowledged=0,skipped=0;const at=Date.now(),fx=document.createElement('div');fx.className=kind==='egg'?'lk-fx lk-hatch':'lk-fx lk-evo';fx.innerHTML='<button class="rc-tap">Continue animation</button>';fx.querySelector('button').onpointerdown=()=>{skipped++;fx.remove();};document.body.appendChild(fx);
            if(kind==='egg'){engine.automation.state.eggService={started:at,tx:{uid:'audit-egg',before:0,at}};engine.automation.state.eggReceiptUntil=at+15000;}
            else engine.automation.state.evolution={uid:'a',fromId:5,toId:6,started:at,clickedAt:at,stage:'confirm'};
            modal('dexcard-modal','<b class="dc-new">Capture receipt above animation</b>',()=>acknowledged++);await tick();
            assert(acknowledged===1&&skipped===0&&fx.isConnected&&engine.budget.used===0,kind+' acknowledges the safe top receipt without skipping its covered animation or consuming budget');
            fx.remove();
        }
        reset('money',{autoPrepare:false,autoEggs:false,autoUnderCollect:false,autoTeam:true});
        s.mons=[{uid:'swap-a',id:6,level:70},{uid:'swap-b',id:9,level:70}];s.team=['swap-a','swap-b'];s.road=[...s.team];save();window.nav('team');
        engine.driver.teamTask={chapter:0,members:[0],uids:['swap-b','swap-a'],started:Date.now(),attempts:0};
        const nativeSetItem=Storage.prototype.setItem;let delayedPartySave=null,delayedPartyWrites=0;
        try{
            Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='gachamon-save-v1'){delayedPartySave=String(value);delayedPartyWrites++;return;}return nativeSetItem.call(this,key,value);};
            await tick();for(let i=0;i<5;i++)await tick();
            assert(delayedPartyWrites===1&&!!engine.driver.teamTask?.pending&&s.team.join('|')==='swap-b|swap-a','a delayed native adventure save causes one pointer swap and no repeated undo drag');
        }finally{Storage.prototype.setItem=nativeSetItem;}
        assert(!!delayedPartySave,'native drag produced a party save awaiting confirmation');nativeSetItem.call(localStorage,'gachamon-save-v1',delayedPartySave);await tick();
        assert(!engine.driver.teamTask&&!!q('#screen-adventure.active')&&s.road.join('|')==='swap-a|swap-b','confirmed PC order returns to adventure and still waits for native road application');
        resetEvolution();engine.onChange();
        assert(__pcTest.DEFAULTS.autoEvolve===true&&q('#pokecatch-auto-helper').shadowRoot.querySelector('[data-setting="autoEvolve"]').checked,'free level evolution defaults on and is available as an explicit task setting');
        engine.budget.spent=123;engine.budget.used=2;engine.teamCheck={key:'stale-form'};engine.coach.checked='stale-form';
        await until(()=>evolutionClicks.length===1,20);
        assert(s.mons[0].id===2&&!!q('.lk-fx.lk-evo')&&!q('#modal-root.open')&&evolutionDetails[0].uid==='evo-leaf','native single-member evolution starts its own animation without changing species before onEvolve');
        await until(()=>!engine.automation.state.evolution&&!!q('#screen-adventure.active'),25);
        assert(s.mons[0].id===3&&s.mons[0].uid==='evo-leaf'&&s.team[0]==='evo-leaf'&&engine.budget.spent===123&&engine.budget.used===2&&engine.running,'native onEvolve preserves UID, original task and budgets and returns to adventure');
        assert(evolutionClicks.length===1&&evolutionDetails.some(detail=>detail.uid==='evo-leaf'&&detail.id===3)&&!q('#modal-root.open')&&!q('.lk-evo'),'owned evolution uses pointer continuation, closes the automatically reopened new-form card and never clicks twice');
        const evolvedState=engine.read(),evolvedContext={force:true,size:1,foes:[{id:9,level:60,weight:1}]};
        const evolvedPlan=__pcTest.planAdventureTeam(evolvedState,engine.settings,[],evolvedContext),oldPlan=__pcTest.planAdventureTeam({...evolvedState,mons:evolvedState.mons.map(mon=>({...mon,id:2}))},engine.settings,[],evolvedContext);
        assert(engine.teamCheck===null&&engine.coach.checked===null&&evolvedPlan.score>oldPlan.score,'confirmed native evolution invalidates cached teams and immediate scoring uses the actual new species');
        resetEvolution({},true);for(let i=0;i<8;i++)await tick();
        assert(evolutionClicks.length===0&&s.mons.find(mon=>mon.uid==='evo-leaf').id===2&&s.team.join('|')==='evo-active','manual adventure selection never chooses an unselected bench candidate for automatic evolution');
        resetEvolution({autoTeam:true},true);await until(()=>s.mons.find(mon=>mon.uid==='evo-leaf').id===3&&!engine.automation.state.evolution,30);
        assert(evolutionClicks.length===1&&evolutionClicks[0].uid==='evo-leaf'&&evolutionDetails[0].uid==='evo-leaf'&&s.team[0]==='evo-active','a stronger eligible bench candidate is opened by its PC UID without substituting the adventure leader');
        engine.settings.autoTeam=true;engine.fitTeam(engine.read(),Date.now());
        if(engine.teamSearch)await window.tickWithTeam(engine);
        await until(()=>!engine.driver.teamTask,30);
        assert(s.team.includes('evo-leaf')&&s.mons.find(mon=>mon.uid==='evo-leaf').id===3,'after save confirmation the evolved bench member can join the real adventure party through native PC controls');
        resetEvolution();evolutionDeferSave=true;await until(()=>!!evolutionCommit,25);
        for(let i=0;i<7;i++)await tick();
        assert(s.mons[0].id===3&&engine.read().mons[0].id===2&&evolutionClicks.length===1&&!!engine.automation.state.evolution&&!(engine.automation.state.evolved>0),'unsaved native evolution mutation is not mistaken for confirmed new battle power');
        const evolutionRealNow=Date.now,evolutionLater=evolutionRealNow()+20000;Date.now=()=>evolutionLater;
        try{await tick();assert(engine.running&&evolutionClicks.length===1&&!!q('.lk-evo'),'slow evolution animation retains only its owned continuation after fifteen seconds');evolutionCommit();await until(()=>!engine.automation.state.evolution&&!!q('#screen-adventure.active'),25);}finally{Date.now=evolutionRealNow;}
        assert(engine.read().mons[0].id===3&&evolutionClicks.length===1&&!q('#modal-root.open'),'delayed native save settles once and closes its new-form details before returning');
        resetEvolution();s.mons=[{uid:'stone',id:25,level:60,reg:'kanto'},{uid:'branch',id:133,level:60,reg:'kanto'},{uid:'plate',id:493,level:60,reg:'kanto'},{uid:'ranked',id:2,level:60,rank:1,reg:'kanto'}];s.team=s.mons.map(mon=>mon.uid);s.road=[...s.team];s.items={'thunder-stone':3,'water-stone':3,'fire-stone':3};save();for(let i=0;i<10;i++)await tick();
        assert(evolutionClicks.length===0&&!engine.automation.state.evolution&&s.items['thunder-stone']===3&&s.items['water-stone']===3&&s.items['fire-stone']===3&&s.mons.every(mon=>[25,133,493,2].includes(mon.id)),'automatic level evolution leaves item, branch, plate and ranked-member decisions untouched');
        resetEvolution();s.mons.push({uid:'evo-other',id:2,level:60,xp:0,reg:'kanto'});save();engine.budget.spent=77;engine.budget.used=3;
        engine.queue=[{id:'evolution-resume',title:'Free evolution then money',settings:{...engine.settings},status:'running',result:''}];engine.queueRunning=true;engine.queueIndex=0;
        await until(()=>engine.automation.owner?.kind==='evolution'&&!!q('#modal-root.open .mon-card'),20);engine.stop();
        assert(engine.queue[0].progress.flowOwner.uid==='evo-leaf'&&engine.queue[0].progress.flow.evolution.uid==='evo-leaf','queued checkpoint stores the exact intended evolution UID and the pending native card');
        evolutionDetail('evo-other');engine.startQueue();await tick();
        assert(evolutionClicks.length===0&&!q('#modal-root.open'),'resuming a queue closes a same-species stranger card before granting evolution authority');
        await until(()=>s.mons.find(mon=>mon.uid==='evo-leaf').id===3&&!engine.automation.state.evolution,30);
        assert(evolutionClicks.length===1&&evolutionClicks[0].uid==='evo-leaf'&&s.mons.find(mon=>mon.uid==='evo-other').id===2&&engine.budget.spent===77&&engine.budget.used===3,'queue resume reopens its saved UID, evolves only that member and preserves the cumulative budget');
        reset('progress',{progressUntil:65,autoTravel:false,autoPrepare:false,optimizeRaid:true,manualPause:true,manualResume:true});
        engine.read();engine.manualInput();s.adv.event={raid:true,reg:'kanto',id:68,loops:23};save();window.nav('raid');engine.manual.until=0;await tick();
        assert(!!engine.manual&&!!q('#screen-raid.active'),'idle handoff waits for a raid manually opened during mainline');
        engine.onChange();const resumeRaid=q('#pokecatch-auto-helper').shadowRoot.querySelector('#resume');
        assert(resumeRaid.textContent==='接管当前团体战','manual resume button explicitly offers raid takeover');
        resumeRaid.click();assert(!engine.manual&&engine.driver.raid?.boss===68,'resume button adopts the running raid without waiting for completion');
        await until(()=>!!q('#screen-adventure.active'),20);
        assert(engine.running&&!!q('#screen-adventure.active')&&!q('#evt-pick')&&s.adv.event?.loops===23,'adopted raid configures its native team and returns to adventure without resetting attempts');
        s.adv.event=null;save();await until(()=>s.adv.chapter===8,25);
        assert(engine.running&&engine.settings.mode==='progress'&&s.adv.chapter===8,'manual raid completion resumes the original mainline frontier');
        const resetEggs=(settings={},presentation='card')=>{eggPresentation=presentation;hatchClicks=0;hatchCommit=null;eggReadiness.clear();reset('money',{autoPrepare:false,...settings});s.mons.push(...[7,4,25].map((id,i)=>({uid:'egg-party-'+i,id,level:30})));s.team=s.mons.map(mon=>mon.uid);s.road=[...s.team];save();};
        assert(base.autoEggs===true&&q('#pokecatch-auto-helper').shadowRoot.querySelector('[data-setting="autoEggs"]').checked,'automatic mature egg collection is enabled by default and visible in the panel');
        resetEggs();engine.automation.lastService=0;s.pension.eggs=[{uid:'service-egg',id:1,hatchAt:Date.now()-1000}];save();
        await until(()=>s.stats.hatched===1&&engine.automation.lastService>0,25);
        await until(()=>!engine.automation.state.eggService,12);
        assert(s.stats.hatched===1&&engine.running&&engine.settings.mode==='money'&&!!q('#screen-adventure.active'),'incidental hatching still claims a mature egg and returns to the money task');
        assert(hatchClicks===1&&engine.automation.state.autoHatched===1&&!engine.automation.owner&&engine.budget.spent===0&&engine.budget.used===0,'egg collection confirms one native hatch without consuming the item or currency budget');
        resetEggs();s.adv.battle={steps:3,enemies:[{id:19,level:10,hp:10}]};s.pension.eggs=[{uid:'combat-egg',id:1,hatchAt:Date.now()-1000}];const combatEggBattle=JSON.stringify(s.adv.battle),combatEggRoad=JSON.stringify(s.road),combatEggNode=s.adv.node;save();
        await until(()=>s.stats.hatched===1&&!engine.automation.state.eggService,20);
        assert(hatchClicks===1&&engine.running&&!!q('#screen-adventure.active')&&JSON.stringify(s.adv.battle)===combatEggBattle&&JSON.stringify(s.road)===combatEggRoad&&s.adv.node===combatEggNode,'a mature egg is collected during ordinary combat and returns without resetting the native battle, route or travelling squad');
        resetEggs({autoTeam:false});s.team=['a'];s.road=['a'];const manualEggTeam=JSON.stringify(s.team),manualEggRoad=JSON.stringify(s.road);s.pension.eggs=[{uid:'manual-small-party-egg',id:1,hatchAt:Date.now()-1000}];save();for(let i=0;i<6;i++)await tick();
        assert(hatchClicks===0&&s.stats.hatched===0&&!engine.automation.state.eggService&&JSON.stringify(s.team)===manualEggTeam&&JSON.stringify(s.road)===manualEggRoad,'a manual party with empty slots blocks incidental hatching without changing its members or order');
        resetEggs();s.pension.eggs=[{uid:'ready-mixed',id:1,hatchAt:Date.now()-1000},{uid:'future-mixed',id:4,hatchAt:Date.now()+3600000}];save();await until(()=>s.stats.hatched===1&&!engine.automation.state.eggService,20);
        assert(hatchClicks===1&&s.pension.eggs[0]?.uid==='future-mixed'&&!!q('#screen-adventure.active'),'a batch leaves immature eggs untouched and immediately returns after the mature egg');
        resetEggs();s.pension.eggs=[{uid:'native-unready',id:1,hatchAt:Date.now()-1000}];eggReadiness.set('native-unready',false);save();window.nav('pension');q('[data-egg]').disabled=true;q('[data-egg]').classList.remove('ready');q('#pen-tabs [data-pen-tab="egg"]').click();await until(()=>!engine.automation.state.eggService&&engine.automation.state.eggRetryAt>Date.now(),25);
        assert(hatchClicks===0&&!engine.automation.state.eggService&&engine.automation.state.eggRetryAt>Date.now(),'wall-clock maturity cannot force a disabled native hatch control and discovery backs off');
        resetEggs({autoEggs:false});s.pension.eggs=[{uid:'disabled-egg',id:1,hatchAt:Date.now()-1000}];save();for(let i=0;i<6;i++)await tick();
        assert(s.stats.hatched===0&&!engine.automation.state.eggService&&hatchClicks===0,'disabling automatic egg collection preserves mature eggs');
        resetEggs({animations:false,dismissInfo:false},'duplicate');s.pension.eggs=[{uid:'duplicate-1',id:1,hatchAt:Date.now()-1000},{uid:'duplicate-2',id:4,hatchAt:Date.now()-1000}];save();
        await until(()=>s.stats.hatched===2&&!engine.automation.state.eggService&&!q('.lk-hatch,.hatch-fx'),30);
        assert(s.stats.hatched===2&&hatchClicks===2&&engine.automation.state.autoHatched===2&&engine.automation.state.hatched===0&&!!q('#screen-adventure.active'),'batch duplicate eggs finish their own animations without a dex card, retain the task and keep breeding goals separate');
        resetEggs({animations:false,dismissInfo:false},'duplicate');s.pension.eggs=[{uid:'slow-animation',id:1,hatchAt:Date.now()-1000}];save();await until(()=>!!q('.lk-hatch'),15);q('.lk-hatch .rc-tap').disabled=true;await tick();
        const eggRealNow=Date.now,eggLater=eggRealNow()+20000;Date.now=()=>eggLater;try{q('.lk-hatch .rc-tap').disabled=false;await tick();await until(()=>!engine.automation.state.eggService,15);assert(s.stats.hatched===1&&engine.automation.state.autoHatched===1&&!q('.lk-hatch')&&!!q('#screen-adventure.active'),'slow native hatch loading beyond fifteen seconds retains only its owned animation and returns to the original task');}finally{Date.now=eggRealNow;}
        resetEggs({animations:false,dismissInfo:false},'plain');s.pension.eggs=[{uid:'plain-egg',id:7,hatchAt:Date.now()-1000}];save();await until(()=>s.stats.hatched===1&&!engine.automation.state.eggService,20);
        assert(s.stats.hatched===1&&!q('#modal-root.open')&&!!q('#screen-adventure.active'),'owned hatch receipt closes even when generic information cleanup and animation skipping are disabled');
        resetEggs({},'delayed');s.pension.eggs=[{uid:'delayed-egg',id:1,hatchAt:Date.now()-1000}];save();await until(()=>!!hatchCommit,15);for(let i=0;i<8;i++)await tick();
        assert(hatchClicks===1&&s.stats.hatched===0&&engine.automation.state.eggService.tx.uid==='delayed-egg','a delayed native save cannot cause duplicate hatch clicks');
        engine.automation.state=JSON.parse(JSON.stringify(engine.progressSnapshot().flow));hatchCommit();await until(()=>!engine.automation.state.eggService,15);
        assert(hatchClicks===1&&engine.automation.state.autoHatched===1&&!!q('#screen-adventure.active'),'serialized pending egg UID reconciles once and returns to its original screen');
        resetEggs();await until(()=>!engine.backgroundYield&&!engine.driver.pendingMap&&!engine.driver.teamTask,25);s.pension.eggs=[{uid:'native-ready',id:1,hatchAt:Date.now()+60000}];eggReadiness.set('native-ready',true);save();window.nav('pension');q('[data-egg]').disabled=false;q('[data-egg]').classList.add('ready');await until(()=>s.stats.hatched===1&&!engine.automation.state.eggService,20);
        assert(hatchClicks===1&&!!q('#screen-pension.active'),'native ready status overrides estimated wall-clock maturity and preserves the original screen');
        reset('progress',{autoEggs:true,autoPrepare:true,autoTeam:false,progressCandy:false,progressUntil:65});s.adv.unlocked=1;for(const mon of s.mons)mon.level=5;s.mons.push(...[7,4,25].map((id,i)=>({uid:'egg-prep-member-'+i,id,level:5})));s.team=s.mons.map(mon=>mon.uid);s.road=[...s.team];save();await until(()=>engine.preparation?.phase==='train',45);
        const eggPrep=engine.preparation,eggGoal=JSON.stringify(eggPrep.targets),eggSpent=engine.budget.spent,eggUses=engine.budget.used;s.pension.eggs=[{uid:'preparation-egg',id:1,hatchAt:Date.now()-1000}];save();await until(()=>s.stats.hatched===1&&!engine.automation.state.eggService,25);
        assert(s.stats.hatched===1&&engine.preparation===eggPrep&&JSON.stringify(eggPrep.targets)===eggGoal&&engine.settings.mode==='progress'&&engine.settings.progressUntil===65&&engine.budget.spent===eggSpent&&engine.budget.used===eggUses,'automatic egg collection during preparation preserves the original trainees, frontier and budgets');
        reset('underground',{autoEggs:true,autoTeam:true,underRuns:1,underOpenGeodes:false});s.under.slots=[{id:'egg-wait-dispatch',bay:0,end:Date.now()+600000,mons:[]}];window.nav('underground');s.pension.eggs=[{uid:'idle-activity-egg',id:1,hatchAt:Date.now()-1000}];save();await until(()=>s.stats.hatched===1&&!engine.automation.state.eggService,25);
        assert(s.stats.hatched===1&&engine.settings.mode==='underground'&&s.under.slots[0]?.id==='egg-wait-dispatch'&&engine.automation.state.underDone===0,'independent activity idle time can collect eggs without changing dispatch progress');
        eggPresentation='card';hatchCommit=null;
        reset('money',{dismissInfo:true});information();await tick();assert(!q('#modal-root.open'),'ordinary dex card closes without requiring a new-capture badge');
        for(const cls of ['ug-dlg','bag-modal','opt-modal']){
            information('dexcard-modal '+cls,'<button class="dc-x">Close</button><button>Choose</button>');
            await tick();assert(!!q('#modal-root.open .'+cls),'shared dex styling does not dismiss '+cls);
            q('#modal-root .dc-x').click();
        }
        information('dexcard-modal mon-modal','<div class="mon-card"><button class="dc-x">Close</button><button class="dc-candy">Candy</button></div>');engine.automation.own('mon','.mon-modal',{uid:'a'});assert(!engine.driver.dismissInformation(s)&&!!q('#modal-root.open'),'owned item card is protected from information cleanup');
        let coveredUses=0;q('.dc-candy').onclick=()=>coveredUses++;const fx=document.createElement('button');fx.className='fx-skip';fx.textContent='Skip evolution';fx.onclick=()=>fx.remove();document.body.appendChild(fx);await tick();assert(!fx.isConnected&&coveredUses===0&&!!q('#modal-root.open'),'top evolution overlay finishes before using an owned item card');engine.automation.owner=null;q('#modal-root').className='';q('#modal-root').replaceChildren();
        reset('money',{dismissInfo:true,manualPause:true,manualResume:true});engine.read();engine.manualInput();information('dexcard-modal mon-modal');await tick();assert(!!q('#modal-root.open')&&!!engine.manual,'information remains untouched during the manual grace period');engine.manual.until=0;await tick();assert(!q('#modal-root.open')&&!!engine.manual,'idle manual inspection closes its information card');await tick();assert(!engine.manual&&engine.running,'manual inspection resumes the original task automatically');
        information('','<button class="gold">Buy?</button>');let approved=0;q('.gold').onclick=()=>approved++;await tick();assert(approved===0&&!!q('#modal-root.open')&&engine.running,'unknown purchase confirmation is not auto-approved');
        engine.modalWaitSince=Date.now()-121000;information('','<button class="gold">Another choice</button>');await tick();assert(engine.running&&Date.now()-engine.modalWaitSince<2000,'a new modal gets a new independent timeout');q('#modal-root').className='';q('#modal-root').replaceChildren();
        information('dexcard-modal','<b class="dc-new">New</b><div class="modal-actions"><button class="ghost">Later</button><button class="gold">Choose</button></div>');await tick();assert(!!q('#modal-root.open'),'dex-style choice dialogs are retained for selection');q('#modal-root').className='';q('#modal-root').replaceChildren();
        reset('money',{dismissInfo:false});information();await tick();assert(!!q('#modal-root.open'),'information cleanup can be disabled explicitly');q('#modal-root').className='';q('#modal-root').replaceChildren();
        reset('money',{dismissInfo:true});modal('ug-back','Already collected');engine.automation.own('receipt','.ug-back');await tick();assert(!q('#modal-root.open')&&!engine.automation.owner,'owned reward receipt is acknowledged by its workflow without leaving a stale owner');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:3,resourceAction:'use',useUid:'a',useBudget:10});s.items['exp-candy-m']=3;save();await until(()=>!!q('#modal-root.open .mon-card'));await tick();let wrongMemberUses=0;information('mon-modal','<div class="mon-card"><button class="dc-x">Close</button><button class="dc-candy">Wrong member</button></div>');q('.dc-candy').onclick=()=>wrongMemberUses++;await tick();assert(wrongMemberUses===0&&!engine.automation.owner,'a replacement member card cannot inherit the previous card consumption authority');await until(()=>!engine.running,35);assert(wrongMemberUses===0&&s.stats.itemOut['exp-candy-m']===3,'resource task reopens its intended member and preserves its usage goal');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:2,resourceAction:'use',useUid:'a',useBudget:10});s.items['exp-candy-m']=2;save();information('mon-modal','<div class="mon-card"><button class="dc-x">Close</button><button class="dc-candy">Restored unknown member</button></div>');q('.dc-candy').onclick=()=>wrongMemberUses++;engine.automation.restoreOwner({kind:'mon',selector:'.mon-modal',uid:'a'});await tick();assert(!q('#modal-root.open')&&wrongMemberUses===0&&engine.budget.used===0,'checkpoint restoration closes an unverifiable card before reselecting the saved member');await until(()=>!engine.running,35);assert(s.stats.itemOut['exp-candy-m']===2&&wrongMemberUses===0,'checkpoint member revalidation resumes without duplicate item use');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:1,resourceAction:'use',useUid:'a',useBudget:10});s.items['exp-candy-m']=1;save();await until(()=>!!q('#modal-root.open .mon-card'));let fixtureHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>fixtureHidden});document.dispatchEvent(new Event('visibilitychange'));const hiddenStart=Date.now()-180000;engine.hiddenAt=hiddenStart;engine.automation.owner.started=hiddenStart;await tick();assert(s.items['exp-candy-m']===1&&engine.running,'background idle performs no item actions');fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));await tick();assert(engine.running&&!/超时/.test(engine.status),'returning to a native item card does not count background duration as UI timeout');delete document.hidden;await until(()=>!engine.running,15);assert(s.stats.itemOut['exp-candy-m']===1,'foreground return finishes the original item action exactly once');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:1,resourceAction:'buy',autoPurchase:true});await until(()=>!engine.running);assert(!s.items['exp-candy-m']&&engine.budget.spent===0,'enabling purchase alone still blocks a native order with zero budget');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:2,resourceAction:'buyUse',autoPurchase:false,spendBudget:10000000,useBudget:2,useUid:'a'});
        s.items['exp-candy-m']=1;save();await until(()=>!engine.running,40);
        assert(!engine.running&&s.money===1000&&!s.stats.itemIn['exp-candy-m']&&s.stats.itemOut['exp-candy-m']===1&&engine.budget.spent===0&&engine.budget.used===1,
            'buy-and-use with the account switch off uses existing stock once and never purchases the missing serving');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:2,resourceAction:'buy',autoPurchase:true,spendBudget:10000000});
        await until(()=>!!engine.automation.state.resourceTx,15);
        const purchaseSwitch=document.querySelector('#pokecatch-auto-helper').shadowRoot.querySelector('#task-purchase [data-setting="autoPurchase"]');
        engine.onChange();purchaseSwitch.click();await until(()=>!engine.running,20);
        assert(!engine.running&&engine.settings.autoPurchase===false&&engine.automation.state.resourcePurchased===1&&s.stats.itemIn['exp-candy-m']===1&&
            engine.budget.spent===50&&s.money===950,'turning purchase off during an outstanding native order acknowledges that receipt and submits no second order');
        engine.onChange();purchaseSwitch.click();
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:3,resourceAction:'buy',spendBudget:100});await until(()=>!engine.running);assert(s.items['exp-candy-m']===2&&engine.budget.spent===100,'per-action budget stops the third purchase');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:2,resourceAction:'use',useBudget:2,useUid:'a'});s.items['exp-candy-m']=3;save();await until(()=>!engine.running);assert(s.items['exp-candy-m']===1&&engine.budget.used===2&&!q('#modal-root.open'),'native member card uses exact quantity and closes');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:3,resourceAction:'buyUse',spendBudget:150,useBudget:3,useUid:'a'});await until(()=>!engine.running,50);assert(engine.budget.spent===150&&engine.budget.used===3&&s.stats.itemIn['exp-candy-m']===3&&s.stats.itemOut['exp-candy-m']===3,'buy-use returns to shop between empty member cards');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:1,resourceAction:'buyUse',spendBudget:50,useBudget:1,useUid:'a'});
        const dayBeforeJobs=engine.budget.day().spent;
        engine.settings.dailySpendBudget=dayBeforeJobs+100;
        engine.queue=['first','second','third'].map(id=>({id,title:id,settings:{...engine.settings},status:'pending',result:''}));
        engine.queueRunning=true;engine.queueIndex=0;engine.queue[0].status='running';
        await until(()=>!engine.running,100);
        assert(engine.queue.map(job=>job.status).join(',')==='done,done,failed'&&s.money===900&&s.stats.itemOut['exp-candy-m']===2&&engine.budget.day().spent===dayBeforeJobs+100,'each order gets a new purchase and use allowance; the third is blocked by the shared daily limit');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:3,resourceAction:'use',useBudget:3,useUid:'a'});s.items['exp-candy-m']=3;save();engine.queue=[{id:'paused-card',title:'Use candy',settings:{...engine.settings},status:'running',result:''}];engine.queueRunning=true;engine.queueIndex=0;await until(()=>engine.budget.used===1);engine.stop();assert(!!q('#modal-root.open .mon-card'),'resource queue was paused with native card open');engine.startQueue();await until(()=>!engine.running);assert(engine.queue[0].status==='done'&&engine.budget.used===3&&s.items['exp-candy-m']===0,'paused queue resumes its own open member card without repeating uses');
        const realNow=Date.now;let clock=realNow();Date.now=()=>clock;try{reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:110,resourceAction:'use',useBudget:110,useUid:'a'});s.items['exp-candy-m']=110;save();for(let i=0;i<130&&engine.running;i++){clock+=1300;await tick();}assert(!engine.running&&engine.budget.used===110&&s.stats.itemOut['exp-candy-m']===110,'active resource card remains usable for more than two minutes');}finally{engine.stop();Date.now=realNow;}
        const pensionTab=q('#tabs [data-screen="pension"]'),group=document.createElement('div');group.className='nav-grp';group.innerHTML='<button class="nav-grp-h" aria-expanded="false">Activities</button><div class="nav-grp-in" inert></div>';q('#tabs').appendChild(group);group.querySelector('.nav-grp-in').appendChild(pensionTab);group.querySelector('.nav-grp-h').onclick=()=>{group.querySelector('.nav-grp-h').setAttribute('aria-expanded','true');group.querySelector('.nav-grp-in').inert=false;};
        reset('breed',{breedId:1,breedGoal:1,autoTeam:true});await until(()=>/手动寄养/.test(engine.status));
        for(let i=0;i<5;i++)await tick();
        assert(s.pension.mons.length===0&&s.mons.some(m=>m.uid==='d')&&s.mons.some(m=>m.uid==='p')&&s.team.join()==='a','breeding waits without touching nursery residents or the adventure party');
        q('#pc-search').value='';q('#pc-search').dispatchEvent(new Event('input',{bubbles:true}));
        q('#pen-grid [data-uid="d"]').click();q('#pen-grid [data-uid="p"]').click();
        s.pension.eggs=[{uid:'egg1',id:1,hatchAt:Date.now()-1000}];save();pension();await until(()=>!engine.running);assert(s.stats.hatched===1&&engine.automation.state.hatched===1,'mature egg hatches and completes matching goal after manual daycare setup');
        assert(!group.querySelector('.nav-grp-in').inert,'collapsed inert activity navigation expands before entering daycare');
        reset('money',{autoTeam:true});engine.stop('fixture idle nursery');hatchClicks=0;s.pension.eggs=[{uid:'idle-ready',id:1,hatchAt:Date.now()-1000}];save();
        const idle=()=>{engine.driver.lastClick=0;engine.nurseryAssist.idleStep();};
        const nurseryRoot=q('#pokecatch-auto-helper').shadowRoot;
        nurseryRoot.querySelector('[data-workspace="settings"]').click();
        const idlePref=nurseryRoot.querySelector('[data-nursery-pref="idleHatch"]'),feedPref=nurseryRoot.querySelector('[data-nursery-pref="autoFeed"]');
        const refPref=nurseryRoot.querySelector('[data-nursery-pref="allowReferenceFeed"]');
        assert(!idlePref.checked&&!feedPref.checked&&!refPref.checked&&refPref.disabled,'nursery options are off by default and the fallback requires auto-feed');
        idle();assert(s.stats.hatched===0,'stopped helper leaves mature eggs alone by default');
        idlePref.click();for(let i=0;i<12;i++)idle();
        assert(!engine.running&&s.stats.hatched===1&&hatchClicks===1&&!!q('#screen-adventure.active'),'opt-in idle collection hatches once and restores the native page without starting a task');
        idlePref.click();
        const savedBuild=window.BUILD,fixtureNursery=window.__pcNurseryAutomation;
        try{
            s.trainer.since=1234;s.pension.mons=[{mon:{id:132,uid:'d'}},{mon:{id:1,uid:'p',shiny:true}}];
            s.pension.tick=Date.now();s.pension.egg=0;s.pension.laid=0;s.items['belue-berry']=3;
            while(!(fixtureNursery.nurseryFixedRoll(s,s.pension.laid)>=1/16&&fixtureNursery.nurseryFixedRoll(s,s.pension.laid)<1/8))s.pension.laid++;
            save();feedPref.click();
            window.BUILD='future-nursery-bundle';for(let i=0;i<4;i++)idle();
            assert(!s.pension.bx&&s.items['belue-berry']===3&&!!q('#screen-adventure.active'),'an unverified game build leaves feeding alone without the extra opt-in');
            window.BUILD=fixtureNursery.NURSERY_RULES.build;
            const berrySerial=s.pension.laid;
            idle();assert(!!q('#screen-pension.active'),'verified candidate opens the nursery');
            while(fixtureNursery.nurseryFixedRoll(s,s.pension.laid)>=1/16)s.pension.laid++;
            save();for(let i=0;i<6;i++)idle();
            assert(!s.pension.bx&&s.items['belue-berry']===3&&!!q('#screen-adventure.active'),'a changed next egg cancels feeding after navigation and restores the original page');
            s.pension.laid=berrySerial;save();for(let i=0;i<12;i++)idle();
            assert(!engine.running&&s.pension.bx===1&&s.items['belue-berry']===2&&!!q('#screen-adventure.active'),'verified next berry-only shiny consumes exactly one stocked berry and returns while idle');
            delete s.pension.bx;save();engine.nurseryAssist.refresh();for(let i=0;i<6;i++)idle();
            assert(s.items['belue-berry']===2,'the durable serial guard prevents re-feeding the same egg after a delayed or lost confirmation');
            do{s.pension.laid++;}while(!(fixtureNursery.nurseryFixedRoll(s,s.pension.laid)>=1/16&&fixtureNursery.nurseryFixedRoll(s,s.pension.laid)<1/8));
            window.BUILD='future-nursery-bundle';save();
            assert(!refPref.disabled,'enabling auto-feed exposes the optional old-rule permission');
            refPref.click();idle();
            assert(!!q('#screen-pension.active'),'old-rule opt-in allows preparing the unknown-build candidate');
            refPref.click();for(let i=0;i<6;i++)idle();
            assert(!s.pension.bx&&s.items['belue-berry']===2&&!!q('#screen-adventure.active'),'revoking permission before the click cancels the feeding and restores the previous page');
            refPref.click();for(let i=0;i<12;i++)idle();
            assert(!engine.running&&s.pension.bx===1&&s.items['belue-berry']===1&&/旧规则预测/.test(engine.nurseryAssist.note),'old-rule opt-in feeds exactly once while idle and labels the prediction');
            delete s.pension.bx;
            do{s.pension.laid++;}while(!(fixtureNursery.nurseryFixedRoll(s,s.pension.laid)>=1/16&&fixtureNursery.nurseryFixedRoll(s,s.pension.laid)<1/8));
            save();engine.settings.useBudget=0;engine.start();
            for(let i=0;i<4;i++)await tick();
            assert(!s.pension.bx&&s.items['belue-berry']===1,'old-rule feeding also respects a zero foreground use budget');
            engine.settings.useBudget=1;await until(()=>s.pension.bx===1&&engine.nurseryAssist.feed===null,14);
            assert(s.items['belue-berry']===0&&engine.budget.used===1&&engine.running,'foreground feeding uses one berry and one allowance then resumes its task');
            engine.stop('fixture nursery complete');
            refPref.click();
            feedPref.click();
        }finally{window.BUILD=savedBuild;delete s.trainer.since;save();}
        reset('underground',{underRuns:1});await until(()=>s.under.slots.length>0);assert(s.under.slots.length===1,'underground team edit and native dispatch');const dispatched=s.under.slots[0],dispatchedUIDs=[...dispatched.team];assert(dispatched.mons.length===3&&dispatchedUIDs.every(uid=>!s.mons.some(mon=>mon.uid===uid))&&s.under.sent===1&&underCollectionClicks===0&&engine.automation.state.underDone===0,'native dispatch detaches exactly three PC members and never collects a future expedition');await until(()=>!engine.running);assert(engine.automation.state.underDone===1&&s.under.slots.length===0&&underCollectionClicks===1&&dispatchedUIDs.every(uid=>s.mons.some(mon=>mon.uid===uid)),'dispatch collection completes task only after the original three UIDs return');assert(geodeOpened===1&&!q('.gd-fx')&&!q('#modal-root.open')&&engine.budget.used===1,'single-geode tap, skip, receipt and exact usage budget without an open-all button');
        reset('underground',{underRuns:3,underOpenGeodes:false});s.mons.push({uid:'u1',id:9,level:50},{uid:'u2',id:3,level:50},{uid:'u3',id:68,level:50});save();await until(()=>engine.automation.state.underDone===2,45);await tick();assert(engine.running&&underSent===2&&underTeamEdits===2&&/队员不足/.test(engine.status),'second expedition selects fresh members and exhaustion waits without opening an empty picker ('+engine.status+'; sent='+underSent+', edits='+underTeamEdits+')');
        reset('underground',{underRuns:1,underOpenGeodes:false});engine.queue=[{id:'paused-team',title:'Underground',settings:{...engine.settings},status:'running',result:''}];engine.queueRunning=true;engine.queueIndex=0;await until(()=>!!engine.driver.ownedDialog);engine.stop();assert(!!q('#evt-pick'),'special team editor remains open at queue stop');engine.startQueue();await until(()=>!engine.running,25);assert(engine.queue[0].status==='done'&&underSent===1,'paused queue resumes recommendation editor and dispatches exactly once');
        resetBackgroundUnderground();underPage='geo';const protectedUnderTeam=JSON.stringify(s.team),protectedUnderRoad=JSON.stringify(s.road),protectedUnderBattle=JSON.stringify(s.adv.battle),underClaimBase=engine.services.underClaimed,underDispatchBase=engine.services.underDispatched;
        await until(()=>underSent===1&&!engine.services.underground,100);
        assert(underSent===1&&engine.services.underDispatched===underDispatchBase+1&&factoryDrags>=3&&underTeamEdits===1&&!!q('#screen-adventure.active'),'background underground manually drags only safe idle UIDs and dispatches one confirmed squad during ordinary combat ('+engine.status+')');
        assert(s.under.slots[0]?.team.every(uid=>uid.startsWith('background-idle-'))&&JSON.stringify(s.team)===protectedUnderTeam&&JSON.stringify(s.road)===protectedUnderRoad&&JSON.stringify(s.adv.battle)===protectedUnderBattle&&s.buddy.uid==='protected-buddy'&&s.mons.some(mon=>mon.uid==='protected-raid')&&s.mons.some(mon=>mon.uid==='protected-trainee'),'background dispatch preserves the full manual party, travelling squad, Buddy, trainee and reserved raid members');
        s.adv.battle=null;save();
        await until(()=>engine.services.underClaimed===underClaimBase+1&&!engine.services.underground,70);
        assert(underSent===1&&underCollectionClicks===1&&s.under.slots.length===0&&s.mons.filter(mon=>mon.uid.startsWith('background-idle-')).length===3&&engine.budget.used===0&&!!q('#screen-adventure.active'),'background return collection confirms the original UIDs without reopening geodes or resending daily-used members');
        s.mons.push(...[75,76,81].map((id,i)=>({uid:'background-next-'+i,id,level:80,reg:'sinnoh'})));s.adv.battle=JSON.parse(protectedUnderBattle);save();
        await until(()=>underSent===2&&!engine.services.underground,100);
        assert(underSent===2&&s.under.slots[0]?.team.every(uid=>uid.startsWith('background-next-'))&&JSON.stringify(s.team)===protectedUnderTeam&&engine.services.underDispatched===underDispatchBase+2,'a later background dispatch selects a fresh idle batch and never reuses today\'s earlier three UIDs');
        resetBackgroundUnderground();await until(()=>engine.driver.ownedDialog?.type==='backgroundUnderTeam'&&!!q('#evt-pick'),30);const newlyProtectedUnderUid=engine.services.underground?.uids?.[0];assert(!!newlyProtectedUnderUid,'background underground picker belongs to its persisted safe UID plan');
        s.buddy.uid=newlyProtectedUnderUid;save();await until(()=>!engine.services.underground&&!q('#evt-pick'),40);
        assert(underSent===0&&s.under.slots.length===0&&s.mons.some(mon=>mon.uid===newlyProtectedUnderUid)&&s.buddy.uid===newlyProtectedUnderUid&&engine.running&&!!q('#screen-adventure.active'),'a newly protected Buddy cancels the owned underground picker and returns to the original foreground task without dispatch');
        reset('tower',{towerFloor:2});for(const mon of s.mons)mon.level=60;save();await until(()=>!!s.adv.tower);assert(!!s.adv.tower&&s.tower.run.week===utcWeek()&&s.tower.run.mons.every(mon=>mon.src&&mon.uid==='t:'+mon.src),'tower starts a current-week native snapshot through the activity entry');s.tower.run.floor=3;save();await until(()=>!engine.running);assert(!s.adv.tower&&engine.automation.state.towerReached&&s.tower.best.floor===2&&!s.tower.gift&&!q('#modal-root.open'),'tower reaches its completed-floor goal and confirms native quit and settlement');
        reset('tower',{towerFloor:10,towerRuns:1,autoPrepare:false});for(const mon of s.mons)mon.level=60;save();await until(()=>!!s.adv.tower&&!engine.automation.state.towerLaunch&&engine.automation.state.towerWasActive,25);s.tower.run.floor=4;const pausedTowerParty=JSON.stringify(s.tower.run.mons);s.adv.tower=null;save();await until(()=>!!s.adv.tower&&!engine.automation.state.towerLaunch,25);
        assert(engine.running&&!!s.adv.tower&&s.tower.run.floor===4&&JSON.stringify(s.tower.run.mons)===pausedTowerParty&&!engine.automation.state.towerAttempts,'paused tower resumes the same floor and snapshot without spending an attempt');
        s.tower.run=null;s.adv.tower=null;s.tower.best={week:utcWeek(),floor:3,ms:1000};save();modal('tw-back','Defeat');await until(()=>!engine.running,15);assert(engine.automation.state.towerAttempts===1&&!q('#modal-root.open'),'a confirmed tower defeat settles once before enforcing its attempt limit');
        resetFactory({optimizeRaid:false});s.eventTeams.candy=['factory-1','factory-0'];save();factory();await until(()=>s.adv.tower?.kind==='candy',25);
        assert(factoryDrags===0&&!engine.driver.ownedDialog&&s.eventTeams.candy.join('|')==='factory-1|factory-0'&&s.candy.run.mons.map(mon=>mon.src).join('|')==='factory-1|factory-0','manual special-team selection starts the factory with the user-configured member order and never opens an optimizer');
        resetFactory();factoryDeferSave=true;await until(()=>engine.driver.ownedDialog?.type==='factoryTeam'&&!!q('#evt-pick'),30);const factoryDesired=[...engine.driver.ownedDialog.uids];
        assert(!q('#evt-opt')&&factoryDesired.length>0,'factory opens its native manual-only team editor without relying on an optimize button');await until(()=>factoryDrags>0,35);const firstFactoryDrags=factoryDrags;await tick();await tick();
        assert(firstFactoryDrags===1&&factoryDrags===1&&!!engine.driver.ownedDialog.pending,'factory drag waits for the native save before performing another swap');factoryDeferSave=false;save();await until(()=>s.adv.tower?.kind==='candy'&&!q('#evt-pick'),120);
        assert(engine.running&&JSON.stringify(s.eventTeams.candy)===JSON.stringify(factoryDesired)&&s.candy.run.mons.every(mon=>mon.src&&mon.uid==='c:'+mon.src)&&factoryDrags>=factoryDesired.length-1,'factory configures its scored members through native pointer dragging and saves copied run members');
        assert(factoryFrom===1&&factoryStarts===1&&JSON.stringify(factoryClosedFilters)===JSON.stringify({search:'hidden',sort:'best',eff:true})&&s.items['rare-candy']===30&&engine.budget.used===0&&engine.budget.spent===0,'factory restores editor filters, closes the picker and starts at the free first floor without spending skip resources');
        for(let i=0;i<6;i++)await tick();assert(factoryStarts===1&&s.adv.tower?.kind==='candy'&&!!q('#screen-adventure.active'),'an already running factory is followed without repeatedly submitting its daily entry');
        s.candy.run.floor=11;s.candy.run.got={'exp-candy-xl':2,'rare-candy':5};s.items['exp-candy-xl']=2;s.items['rare-candy']+=5;save();await until(()=>!engine.running,30);
        assert(engine.automation.state.candyDone===1&&s.candy.last.floor===10&&s.candy.last.got['rare-candy']===5&&s.items['rare-candy']===35&&!q('#modal-root.open')&&!s.adv.tower,'factory banks at its completed camp goal, acknowledges settlement and preserves already credited candy');
        resetFactory({candyFloor:5,spendBudget:100},'water');engine.queue=[{id:'factory-paused-editor',title:'Factory',settings:{...engine.settings},status:'running',result:''}];engine.queueRunning=true;engine.queueIndex=0;engine.budget.spent=55;engine.budget.used=2;await until(()=>engine.driver.ownedDialog?.type==='factoryTeam',30);const queuedFactoryDesired=[...engine.driver.ownedDialog.uids];await tick();engine.stop();
        const factorySaved=JSON.parse(localStorage.getItem('pokecatch-helper:v1:'+engine.account));assert(factorySaved.queue[0].progress.specialDialog.type==='factoryTeam'&&JSON.stringify(factorySaved.queue[0].progress.specialDialog.uids)===JSON.stringify(queuedFactoryDesired),'factory queue checkpoint serializes its exact planned member UIDs while the native editor is open');
        engine.queue=factorySaved.queue;engine.queueIndex=factorySaved.queueIndex;engine.startQueue();await until(()=>s.adv.tower?.kind==='candy'&&!q('#evt-pick'),120);
        assert(engine.running&&JSON.stringify(s.eventTeams.candy)===JSON.stringify(queuedFactoryDesired)&&engine.budget.spent===55&&engine.budget.used===2&&factoryStarts===1,'restored factory queue resumes its pending native team editor with its original party and resource budget');s.candy.run.floor=6;save();await until(()=>!engine.running,30);
        assert(engine.queue[0].status==='done'&&engine.automation.state.candyDone===1&&s.candy.last.floor===5,'factory queue completes only after the same observed run has settled');
        resetFactory({candyFloor:10,optimizeRaid:false});s.candy.played=parisDay();s.candy.run={day:parisDay(),type:factoryTheme,from:1,floor:6,ms:1000,at:Date.now()-1000,mons:s.mons.slice(0,2).map(mon=>snapshot(mon,'c:')),got:{'exp-candy-xl':1},skipPaid:0};const pausedFactoryAt=s.candy.run.at;save();factory();await until(()=>s.adv.tower?.kind==='candy',25);
        assert(s.candy.run.at===pausedFactoryAt&&s.candy.run.floor===6&&factoryStarts===1,'factory resumes its existing daily run without resetting its floor or identity');s.candy.run.floor=11;save();await until(()=>!engine.running,30);
        resetFactory({optimizeRaid:false});s.candy.played=parisDay();save();factory();for(let i=0;i<5;i++)await tick();assert(engine.running&&factoryStarts===0&&engine.nextWake>Date.now()&&/今日/.test(engine.status),'a used factory daily entry waits for reset without retrying a disabled native button');engine.stop();
        reset('elite',{eliteTier:1,eliteRegion:'kanto'});await until(()=>!!s.adv.league,100);assert(s.eventTeams?.['league:kanto']?.length===3&&s.adv.league?.tier===1,'elite league selects next tier and dedicated team');s.eliteLeague.kanto={t:1};s.adv.league=null;save();modal('lgp-modal','<div class="rk-gems"><button class="pl-opt" data-k="fire">Fire</button></div>');q('.pl-opt').onclick=()=>q('.pl-opt').classList.add('on');await until(()=>!engine.running);assert(!q('#modal-root.open')&&s.eliteLeague.kanto.t===1,'elite gem picker acknowledged before completion');
        reset('elite',{eliteTier:1,eliteRegion:'johto',autoPrepare:false,optimizeRaid:false});
        const firstRegionParty=[...s.eventTeams['league:kanto']];
        s.eventTeams['league:johto']=['p'];save();await until(()=>!!s.adv.league,30);
        assert(s.adv.league?.reg==='johto'&&s.adv.league.team.join()==='p'&&s.eventTeams['league:kanto'].join()===firstRegionParty.join(),'manual elite party enters the selected region and preserves both saved regional teams');
        reset('elite',{eliteTier:1,eliteRegion:'johto',autoPrepare:false,optimizeRaid:true});
        await until(()=>!!s.adv.league,100);
        assert(s.adv.league?.reg==='johto'&&s.adv.league.team.length===3&&s.eventTeams['league:kanto'].join()===firstRegionParty.join(),'automatic elite selection updates only Johto before launch');
        reset('elite',{eliteTier:2,eliteRegion:'kanto',autoPrepare:false});
        await until(()=>!!s.adv.league,100);s.adv.league.tries=2;s.adv.league.back=s.adv.chapter;save();
        await until(()=>!engine.running);
        assert(!s.adv.league&&!engine.running&&/挑战失败，已跳过/.test(engine.status),'elite defeat exits through ordinary map controls before ending the task');
        const rememberEliteView=()=>{const root=q('#map-root'),go=root.querySelector('.mp-go[data-go="L"]');go.remove();const tab=document.createElement('button');tab.dataset.lgView='league';tab.textContent='League';root.appendChild(tab);tab.onclick=()=>{tab.remove();root.appendChild(go);};};
        reset('money',{autoPrepare:false});s.adv.unlocked=13;save();window.nav('map');q('#map-root .rg[data-rg="kanto"]').click();q('#map-root .mp-row[data-ch="L"]').click();rememberEliteView();engine.travel(__pcTest.candidates(s,engine.settings).find(row=>row.key==='L'),Date.now());await until(()=>s.adv.chapter===9,12);assert(s.adv.chapter===9&&!q('#map-root [data-lg-view="league"]'),'ordinary league farming leaves the remembered elite detail before replay');
        reset('progress',{progressUntil:13,autoPrepare:false});s.adv.unlocked=9;s.adv.chapter=8;save();window.nav('map');q('#map-root .rg[data-rg="kanto"]').click();q('#map-root .mp-row[data-ch="L"]').click();rememberEliteView();await until(()=>s.adv.chapter===9,12);assert(s.adv.chapter===9&&!s.adv.league&&!q('#map-root [data-lg-view="league"]'),'mainline leaves the remembered elite detail before ordinary league entry');
        reset('money',{raids:true,autoPrepare:false,optimizeRaid:false});s.adv.badges=['Maître'];save();engine.nextRaid=0;window.nav('raid');
        q('#raid-root').innerHTML='<div class="rc-card" data-rc="kanto"><h3>皮皮</h3><div class="boss"><img data-id="35"></div><button data-raid-go="kanto">Raid</button></div>';
        q('[data-raid-go]').onclick=()=>{
            const root=q('#modal-root');root.className='open';
            root.innerHTML='<div class="modal"><div class="modal-body"><p>Une fois le raid lancé, tu ne pourras plus relancer le tirage du jour.</p></div><div class="modal-actions duo"><button class="btn ghost">Annuler</button><button class="btn primary">Lancer</button></div></div>';
            root.querySelector('.primary').onclick=()=>{root.className='';root.replaceChildren();s.adv.event={raid:true,reg:'kanto',id:35,loops:0};save();window.nav('adventure');};
        };
        await until(()=>s.adv.event?.raid,15);assert(s.adv.event?.id===35&&!q('#modal-root.open'),'daily raid priority accepts only its native launch warning and starts through the confirmed action');
        reset('world',{worldActions:2,worldCapture:false});await until(()=>!engine.running);assert(s.wb.n===2,'world attack quota uses completed native attacks');
        reset('world',{worldActions:1,worldCapture:false});window.nav('raid');q('#raid-root').innerHTML='<div id="tower-root"><button data-raid-page="home">Home</button></div>';q('[data-raid-page="home"]').onclick=world;await until(()=>!engine.running);assert(s.wb.n===1,'world workflow exits another activity detail before locating its entry');
        reset('money',{raids:true});s.adv.badges=['Maître'];save();window.nav('raid');q('#raid-root').innerHTML='<div id="tower-root"><button data-raid-page="home">Home</button></div>';q('[data-raid-page="home"]').onclick=originalRaid;engine.raidProbe=true;engine.raidProbeStarted=Date.now();engine.queue=[{id:'pending-raid',title:'Money with raids',settings:{...engine.settings},status:'running',result:''}];engine.queueRunning=true;engine.queueIndex=0;await until(()=>!!engine.driver.ownedDialog);engine.stop();engine.startQueue();await until(()=>!!s.adv.event?.raid);assert(!!s.adv.event?.raid,'daily raid probe survives queue pause at recommendation editor and exits prior activity details');
        reset('world',{worldActions:1,worldCapture:true});s.wb.capture=true;save();await until(()=>!!s.adv.zone);assert(s.adv.zone?.id===493,'world capture configures native special team');s.adv.zone=null;s.wb.caught=5;save();await until(()=>!engine.running);assert(!engine.running&&/已捕获/.test(engine.status),'world capture is tracked by edition');
        reset('money',{raids:true,autoPrepare:true,autoTeam:true,optimizeRaid:false});s.eventTeams={};s.adv.badges=['Maître'];save();engine.raidProbe=true;engine.raidProbeStarted=Date.now();const manualOptCount=window.teamOptimizations||0;await until(()=>!!q('#evt-pick'),20);await tick();assert(!!q('#evt-pick')&&!engine.driver.ownedDialog&&(window.teamOptimizations||0)===manualOptCount,'disabled special optimization leaves an empty raid editor for manual configuration');q('#evt-pick')?.remove();s.eventTeams={'raid:kanto':['a']};save();await until(()=>!!engine.preparation,20);assert(engine.preparation?.targets.length===1&&engine.preparation.targets[0].uid==='a','raid preparation follows the newly configured native member rather than adventure auto-team candidates');
        reset('resource',{resourceItem:'exp-candy-m',resourceQuantity:2,resourceAction:'use',useUid:'a',useBudget:10});s.items['exp-candy-m']=2;save();await until(()=>!!q('#modal-root.open .mon-card'));
        const pausedResourceSettings={...engine.settings},pausedResourceProgress=engine.progressSnapshot();engine.queue=[{id:'prior-money',title:'Prior money',settings:{...engine.settings,mode:'money'},status:'running',result:''},{id:'reordered-resource',title:'Paused resource',settings:pausedResourceSettings,status:'pending',result:'',progress:pausedResourceProgress}];engine.queueRunning=true;engine.queueIndex=0;engine.settings={...engine.settings,mode:'money'};engine.completeTask('previous task completed');assert(engine.automation.owner?.kind==='mon','queue advancement restores a paused native resource card owner');await until(()=>!engine.running,30);assert(s.stats.itemOut['exp-candy-m']===2&&engine.queue[1].status==='done','reordered paused resource task completes without losing its native card');
        reset('progress',{progressUntil:29,autoPrepare:false,autoTeam:false});s.adv.chapter=24;s.adv.unlocked=25;s.adv.loops=[0];s.travel.to=['johto'];save();window.nav('map');q('#map-root .rg[data-rg="kanto"]').click();for(let i=0;i<12;i++)await tick();assert(s.adv.chapter===25&&q('#map-root .rg.active')?.dataset.rg==='johto'&&!s.adv.loops.length,'mainline returns to Johto before launching its shared league row after closing Kanto loops');
        reset('progress',{progressUntil:15,autoTravel:true});s.adv.chapter=13;s.adv.unlocked=14;save();await until(()=>s.adv.chapter===14);assert(s.travel.to.includes('johto'),'new region departure confirms native dialog');
        async function openUnova(presentation,gifts){
            reset('progress',{progressUntil:83,autoTravel:true,autoPrepare:false,autoEggs:false,gifts,manualPause:!gifts,manualResume:true});
            unovaDeparture=starterDepartureFixture(presentation);
            s.travel.to=['johto','hoenn','sinnoh'];s.adv.chapter=65;s.adv.unlocked=66;
            s.dex[495]={caught:1};save();
            await until(()=>unovaDeparture.confirmations>0);
            assert(unovaDeparture.confirmations===1,'departure confirmation reaches the native travel animation for '+presentation);
            for(let i=0;i<5;i++)await tick();
            assert(unovaDeparture.opens===1&&unovaDeparture.confirmations===1,'slow native travel never opens or confirms Unova twice');
            return unovaDeparture;
        }
        for(const presentation of ['reduced','link']){
            const journey=await openUnova(presentation,true);
            const known=presentation==='link';
            if(known){s.dex[498]={caught:1};s.dex[501]={caught:1};}
            journey.arrive({stale:true,knownReceipt:known});
            assert(q('#modal-root.open .dp-modal')&&s.adv.pending===null,'starter FX and queued modal overlap before a gift pending record is available');
            if(presentation==='reduced'){
                engine.stop('simulate the previously timed out installation');engine.start();
                assert(engine.running,'restarting on an empty destination team can adopt the native starter picker');
            }
            await until(()=>!!s.adv.gifts['starter-unova']);
            assert(journey.picks.join(',')===(known?'495':'498')&&journey.grants===1,'prefers a missing starter when available and grants exactly once in '+presentation+' presentation');
            await until(()=>engine.target?.reg==='unova'&&!!q('#screen-adventure.active')&&!q('#modal-root.open'));
            if(known)assert(journey.receipts===1,'the registered starter receipt queued after the stale modal is acknowledged before mainline resumes');
            assert(journey.confirmations===1&&journey.cancels===1&&engine.running&&engine.target?.reg==='unova','only the stale departure is dismissed and mainline resumes in the new region');
            unovaDeparture=null;
        }
        {
            const journey=await openUnova('reduced',false);
            s.dex[501]={caught:1};journey.arrive({stale:true,knownReceipt:true});
            await tick();engine.lastProgress=Date.now()-240000;engine.modalWaitSince=Date.now()-240000;await tick();
            assert(engine.running&&journey.picks.length===0&&journey.grants===0,'manual starter selection waits beyond the generic modal timeout without choosing a gift');
            engine.manualInput();engine.manual.until=0;await tick();
            assert(engine.manual&&journey.grants===0&&journey.cancels===0,'a player in control can inspect the starter without losing the picker to its underlying modal');
            q('.gift-ball[data-id="501"]').click();q('.gift-go').click();
            await until(()=>engine.target?.reg==='unova'&&!q('#modal-root.open'));
            assert(engine.running&&!engine.manual&&engine.target?.reg==='unova'&&s.adv.gifts['starter-unova']===501&&journey.grants===1&&journey.receipts===1,'a manual starter choice acknowledges only its registered starter receipt and returns automatically to Unova mainline');
            journey.modal('johto');await tick();await tick();
            assert(q('#modal-root.open .dp-modal')&&journey.confirmations===1&&journey.cancels===1,'an unrelated destination dialog remains untouched after reaching Unova');
            q('#modal-root .dc-x').click();
            unovaDeparture=null;
        }
        reset('progress',{progressUntil:1,autoPrepare:true,autoTeam:false,prepareGap:0});s.adv.unlocked=1;s.mons[0].level=5;save();await until(()=>engine.preparation?.phase==='train',45);assert(!!engine.preparation&&engine.settings.mode==='progress'&&s.adv.chapter<=1&&engine.preparation.uids.includes('a'),'weak mainline member uses its temporary training party on an eligible route');
        assert(s.team.join('|')==='a'&&engine.preparation.uids.join('|')==='a'&&engine.preparation.targets.every(target=>target.uid==='a'),'manual training keeps its chosen one-member lineup without adding available high-level carriers');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,35);await until(()=>s.adv.chapter===1,35);assert(s.adv.chapter===1&&s.team.length===1&&s.team[0]==='a','trained manual party is restored and resumes the original frontier');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:false,progressCandy:false,manualPause:true,manualResume:true});s.adv.unlocked=1;s.mons[0].level=5;save();await until(()=>engine.preparation?.phase==='train',50);engine.read();engine.manualInput();s.mons.find(mon=>mon.uid==='p').level=8;s.mons.find(mon=>mon.uid==='d').level=7;s.team=['d','p'];s.road=[...s.team];save();engine.manual.until=0;await tick();for(let i=0;i<4;i++)await tick();
        assert(!engine.manual&&engine.running&&s.team.join('|')==='d|p'&&engine.preparation.uids.join('|')==='d|p'&&engine.preparation.targets.every(target=>['d','p'].includes(target.uid)),'resuming manual training adopts the new user-selected UID order instead of restoring the removed trainee');
        s.road=[...s.team];adventureWin(1000000);await until(()=>!engine.preparation,35);await until(()=>s.adv.chapter===1,25);
        assert(s.team.join('|')==='d|p'&&engine.settings.progressUntil===65&&engine.running,'manual training completion preserves the updated party while returning to the original mainline goal');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:true,progressCandy:false,manualPause:true,manualResume:true});s.adv.unlocked=1;s.mons=s.mons.filter(mon=>mon.uid==='a');s.mons[0].level=5;save();await until(()=>engine.preparation?.phase==='train',50);engine.read();engine.manualInput();s.team=s.team.filter(uid=>uid!=='a');s.road=[...s.team];save();adventureWin(1000);assert(s.mons[0].level===5,'native-style party XP does not level a trainee left in the PC');engine.manual.until=0;await tick();await until(()=>s.team.includes('a')&&!engine.driver.teamTask,45);assert(engine.running&&s.team.includes('a'),'automatic mode resumes its unfinished trainee through PC controls');s.road=[...s.team];adventureWin(1000000);await until(()=>!engine.preparation,35);await until(()=>s.adv.chapter===1,25);assert(s.adv.chapter===1&&engine.running,'actual active-party XP completes preparation and returns to mainline');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:true,progressCandy:false});s.adv.unlocked=3;s.mons=[20,18,22,24,28,40].map((id,i)=>({uid:'trained'+i,id,level:5}));s.team=s.mons.map(m=>m.uid);s.road=[...s.team];save();await until(()=>engine.preparation?.phase==='train',60);s.road=[...s.team];adventureWin(1000000);s.mons.push({uid:'new-candidate',id:65,level:5});save();await until(()=>!engine.preparation,30);await until(()=>s.adv.chapter===3,30);assert(engine.running&&!engine.preparation&&s.adv.chapter===3,'a new low-level counter cannot restart training before the prepared frontier is tried');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:true,manualPause:true,manualResume:true});s.adv.chapter=18;s.adv.unlocked=18;s.adv.deaths={};s.travel.to=['johto'];s.link={to:'johto',side:'to'};s.mons=[157,176,156,43,56,203].map((id,i)=>({uid:'j'+i,id,level:[46,46,44,42,32,30][i],reg:'johto'}));s.team=s.mons.map(m=>m.uid);s.road=[...s.team];s.money=11339;save();engine.read();engine.manualInput();await tick();assert(!engine.preparation&&!!engine.manual,'manual handoff remains in control before screenshot-party training');
        engine.manual.until=0;await tick();assert(!!engine.preparation&&engine.preparation.targets.filter(m=>m.level<=32).every(m=>m.goal===46),'screenshot party schedules capped regional training immediately after manual resume');
        await until(()=>engine.preparation?.phase==='train',60);assert(engine.preparation?.route.reg==='johto'&&s.adv.chapter<=18,'screenshot party actually enters an eligible Johto training map including an efficient open frontier');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,50);await until(()=>s.adv.chapter===18,40);assert(s.adv.chapter===18&&engine.settings.progressUntil===65,'screenshot party returns to its mainline objective after weak members reach 46');
        reset('progress',{progressUntil:3,autoPrepare:true,autoTeam:false,progressCandy:true,prepareGap:0,spendBudget:300,moneyReserve:100,useBudget:10});
        s.adv.unlocked=3;s.mons[0].level=37;save();
        await until(()=>engine.preparation?.phase==='train'&&engine.preparation.candyDisabled,100);
        assert(s.mons[0].xp===36000&&engine.budget.spent===200&&engine.budget.used===4,'four single candies fit below cap; remaining XP comes from training');
        s.mons[0].level=38;s.mons[0].xp=0;save();await until(()=>!engine.preparation,50);await until(()=>s.adv.chapter===3,25);
        assert(s.adv.chapter===3&&engine.settings.progressUntil===3,'training completes the remaining gap and returns to the original mainline goal');
        reset('progress',{progressUntil:3,autoPrepare:true,autoTeam:false,progressCandy:true,prepareGap:0,spendBudget:100,moneyReserve:100,useBudget:10});s.adv.unlocked=3;s.mons[0].level=37;save();await until(()=>engine.preparation?.phase==='train'&&engine.preparation.candyDisabled,100);assert(engine.running&&engine.preparation?.candyDisabled&&engine.budget.spent===100&&engine.budget.used===2,'candy budget exhaustion falls back to map training without stopping the task');
        for(const remembered of ['100','max']){
            reset('progress',{progressUntil:3,autoPrepare:true,autoTeam:false,progressCandy:true,prepareGap:0,spendBudget:10000000,dailySpendBudget:0,moneyReserve:10000,useBudget:20});
            shopQuantity=remembered;s.adv.unlocked=3;s.mons[0].level=37;s.money=10049;save();
            await until(()=>engine.preparation?.phase==='train'&&engine.preparation.candyDisabled,100);
            assert(engine.budget.spent===0&&s.money===10049,'coins below the single-candy reserve boundary stay untouched');
            s.money+=1;save();
            await until(()=>engine.budget.used===1&&engine.preparation?.phase==='train'&&engine.preparation.candyDisabled,100);
            assert(shopQuantity==='1'&&engine.budget.spent===50&&s.money===10000&&s.stats.spent.candy===50&&s.stats.itemOut['exp-candy-m']===1,
                'mainline rechecks an affordable single serving after earnings with remembered '+remembered+' and preserves the reserve');
        }
        reset('progress',{progressUntil:3,autoPrepare:true,autoTeam:false,progressCandy:true,prepareGap:0,spendBudget:300,moneyReserve:100,useBudget:10});
        shopQuantity='100';s.adv.unlocked=3;s.mons[0].level=37;s.money=150;save();
        await until(()=>engine.budget.used===1&&engine.preparation?.phase==='train'&&engine.preparation.candyDisabled,100);
        assert(s.money===100&&engine.budget.spent===50,'a disabled bulk buy switches to one affordable candy');
        reset('progress',{progressUntil:3,autoPrepare:true,autoTeam:false,progressCandy:true,prepareGap:0,spendBudget:0,moneyReserve:100,useBudget:10});s.adv.unlocked=3;s.mons[0].level=37;s.items['exp-candy-m']=1;save();await until(()=>engine.preparation?.phase==='train'&&engine.preparation.candyDisabled,80);assert(engine.running&&engine.budget.spent===0&&engine.budget.used===1&&s.stats.itemOut['exp-candy-m']===1,'owned candy is used before purchases and zero purchase budget still permits map training');
        reset('money',{autoPrepare:true,autoTeam:true,optimizeRaid:true,raids:false,prepareGap:0});s.adv.unlocked=13;s.adv.event={raid:true,reg:'kanto',id:68,loops:23};for(const mon of s.mons)mon.level=5;save();engine.driver.raid={reg:'kanto',boss:68,started:Date.now()};await until(()=>engine.preparation?.phase==='train',60);assert(!!engine.preparation&&!s.adv.event&&s.fixtureRaidTries===23,'owned underleveled raid leaves through its native control before training');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,40);await until(()=>!!s.adv.event?.raid,35);assert(s.adv.event?.id===68&&s.adv.event.loops===23,'prepared raid returns original boss and attempts');
        reset('underground',{autoPrepare:true,autoTeam:true,underRuns:1,underOpenGeodes:false,prepareGap:0});s.adv.chapter=49;s.adv.unlocked=49;s.travel.to=['johto','hoenn','sinnoh'];s.link={to:'sinnoh',side:'to'};for(const mon of s.mons){mon.level=5;mon.reg='sinnoh';}save();await until(()=>engine.preparation?.phase==='train',55);assert(!!engine.preparation&&underSent===0,'underground dispatch waits until regional members are trained');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,45);await until(()=>!engine.running,35);assert(underSent===1&&engine.automation.state.underDone===1,'capped regional training completes before a single native dispatch');
        reset('tower',{autoPrepare:true,autoTeam:true,towerFloor:2,towerRuns:1,prepareGap:0});s.tower.run={floor:1,week:utcWeek(),ms:0,mons:[{uid:'t:a',src:'a',id:6,level:40}],log:[]};s.adv.tower={back:s.adv.chapter};for(const mon of s.mons)mon.level=mon.uid==='a'?40:5;save();engine.automation.state.towerWasActive=true;await until(()=>engine.preparation?.phase==='train',60);assert(!!engine.preparation&&!s.adv.tower&&!engine.automation.state.towerAttempts,'old tower snapshot is quit before training without consuming an attempt');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,45);await until(()=>!!s.adv.tower,35);assert(!!s.adv.tower&&!engine.automation.state.towerAttempts,'trained roster starts a fresh native tower run');
        reset('legend',{autoPrepare:true,autoTeam:true,legendId:150,legendTier:0,prepareGap:0});s.adv.unlocked=13;s.adv.badges.push('Maître');for(const mon of s.mons)mon.level=5;save();await until(()=>engine.preparation?.phase==='train',60);assert(engine.preparation?.context.id===150&&!s.adv.zone,'specified legendary challenge waits for training');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,45);await until(()=>!!s.adv.zone,35);assert(s.adv.zone?.id===150,'training returns to the specified legendary target');
        reset('progress',{progressUntil:68,autoTravel:false,autoPrepare:false});s.travel.to=['johto','hoenn','sinnoh','unova'];s.link={from:'sinnoh',to:'unova',side:'to'};s.adv.chapter=66;s.adv.unlocked=68;s.mons[0].id=495;s.mons[0].reg='unova';s.mons[0].level=50;save();
        await until(()=>s.adv.chapter===68,25);assert(engine.running&&s.adv.chapter===68,'Unova mainline selects its native region and frontier through ordinary controls');
        reset('progress',{progressUntil:83,autoTravel:false,autoPrepare:false});s.travel.to=['johto','hoenn','sinnoh','unova'];s.adv.chapter=0;s.adv.unlocked=78;save();
        await until(()=>s.adv.chapter===77,25);assert(engine.running&&s.adv.chapter===77,'explicit mainline returns from Kanto farming to the opened Unova league');
        s.adv.node=3;s.adv.battle={steps:2,enemies:[{id:563,level:75,hp:100}]};save();window.nav('adventure');const leagueActions=mock.actions;
        await tick();await tick();assert(!!q('#screen-adventure.active')&&s.adv.chapter===77&&s.adv.node===3&&mock.actions===leagueActions,'an active league behind its frontier preserves the battle without repeated map visits');
        reset('train',{trainUid:'team',trainLevel:40,autoPrepare:false,trainBuddy:true,trainBuff:true});s.items={'pinap-berry':2,'lansat-berry':2};s.buddy={uid:'p',ko:7};bagFolded=true;save();window.nav('adventure');const trainingBuddyChanges=buddyChanges;
        await until(()=>s.buddy.uid==='a'&&!!s.buffs?.xp&&!q('#modal-root.open'),45);
        assert(s.buddy.uid==='a'&&s.items['pinap-berry']===1&&s.items['lansat-berry']===2&&engine.budget.used===1,'training selects the actual trainee buddy and consumes one owned XP berry through native controls');
        engine.onChange();const supportText=q('#pokecatch-auto-helper').shadowRoot.querySelector('#support-info').textContent;assert(supportText.includes('Buddy：喷火龙')&&supportText.includes('经验增益')&&supportText.includes('预算剩 9'),'training support displays the active buddy, live boost and remaining use budget');
        for(let n=0;n<8;n++)await tick();assert(buddyChanges===trainingBuddyChanges+1&&engine.budget.used===1&&s.buddy.uid==='a','training keeps an unfinished buddy and never stacks an already active XP buff');
        reset('train',{trainUid:'team',trainLevel:40,autoPrepare:false,trainBuddy:true,trainBuff:false});s.buddy={uid:'p',ko:7};s.adv.battle={steps:1,enemies:[{id:19,level:5,hp:100}]};save();const battleBuddyChanges=buddyChanges;
        await until(()=>s.buddy.uid==='a',35);
        await until(()=>!engine.automation.buddyTask&&!!q('#screen-adventure.active'),20);
        assert(engine.running&&s.adv.battle?.steps===1&&!q('#modal-root.open')&&!!q('#screen-adventure.active')&&buddyChanges===battleBuddyChanges+1,'ordinary training switches a completed buddy and returns to adventure during the same ongoing battle');
        reset('train',{trainUid:'team',trainLevel:40,autoPrepare:false,trainBuddy:true,trainBuff:false});s.buddy={uid:'p',ko:7};save();const refreshedBuddyChanges=buddyChanges;
        await until(()=>engine.automation.owner?.kind==='buddy',35);const refreshBuddyButton=q('#modal-root .dc-buddy'),nativeBuddyClick=refreshBuddyButton.onclick;
        refreshBuddyButton.onclick=event=>{nativeBuddyClick(event);s.adv.battle={steps:1,enemies:[{id:19,level:5,hp:100}]};save();q('#modal-root').className='';q('#modal-root').replaceChildren();};
        await until(()=>s.buddy.uid==='a'&&!engine.automation.buddyTask&&!!q('#screen-adventure.active'),25);
        assert(engine.running&&!!q('#screen-adventure.active')&&buddyChanges===refreshedBuddyChanges+1,'native refresh removing the buddy card preserves its return action and never toggles the selected buddy twice');
        reset('progress',{progressUntil:1,autoPrepare:true,autoTeam:false,progressCandy:false,trainBuddy:true,trainBuff:true});s.adv.unlocked=1;s.mons[0].level=5;s.items['pinap-berry']=1;save();window.nav('adventure');
        await until(()=>engine.preparation?.phase==='train',50);assert(!s.buddy.uid&&!s.buffs.xp,'training support waits until the native road party applies');s.road=[...s.team];s.adv.battle={steps:2,enemies:[{id:19,level:5,hp:100}]};save();
        await until(()=>s.buddy.uid==='a'&&!engine.automation.buddyTask&&!!q('#screen-adventure.active'),35);
        assert(engine.preparation?.phase==='train'&&s.adv.battle?.steps===2&&!s.buffs.xp&&s.items['pinap-berry']===1,'mainline preparation changes its buddy mid-battle and keeps berry consumption for a safe boundary');s.adv.battle=null;save();
        await until(()=>!!engine.preparation&&s.buddy.uid==='a'&&!!s.buffs?.xp&&!q('#modal-root.open'),65);
        assert(engine.preparation?.context.kind==='progress'&&s.buddy.uid==='a'&&s.items['pinap-berry']===0&&engine.budget.used===1,'mainline preparation uses the same automatic buddy and XP berry support');
        s.road=[...s.team];for(const target of engine.preparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,35);await until(()=>s.adv.chapter===1,30);assert(engine.running&&s.adv.chapter===1,'buddy and berry support do not block the return from training to the mainline goal');
        reset('money',{moneyBuff:true});s.items={'lansat-berry':2,'pinap-berry':2};s.buddy={uid:'p',ko:7};save();window.nav('adventure');await until(()=>!!s.buffs.money,25);
        assert(s.items['lansat-berry']===1&&s.items['pinap-berry']===2&&engine.budget.used===1&&s.buddy.uid==='p'&&s.buddy.ko===7,'money farming consumes only its money berry and preserves the existing buddy');
        for(let n=0;n<5;n++)await tick();assert(engine.budget.used===1,'active money buffs are not renewed early');
        s.buffs.money.until=Date.now()-1;save();await until(()=>engine.budget.used===2,15);assert(s.items['lansat-berry']===0,'expired money buffs are replenished without a global one-minute task delay');
        reset('money',{moneyBuff:true,useBudget:0});s.items['lansat-berry']=2;save();window.nav('adventure');for(let n=0;n<10;n++)await tick();assert(engine.running&&s.items['lansat-berry']===2&&engine.budget.used===0,'an exhausted berry budget keeps farming without consuming or buying anything');
        engine.onChange();assert(q('#pokecatch-auto-helper').shadowRoot.querySelector('#support-info').textContent.includes('预算已用完'),'support status explains why a stocked berry is not consumed with zero budget');
        reset('resource',{resourceItem:'lansat-berry',resourceAction:'use',resourceQuantity:3,useBudget:3});s.items['lansat-berry']=4;save();window.nav('adventure');await until(()=>!engine.running,25);assert(s.stats.itemOut['lansat-berry']===3&&s.items['lansat-berry']===1&&engine.budget.used===3&&s.buffs.money.until>Date.now()+2*3600000,'an explicit resource task stacks exactly its requested servings through the native bag controls');
        const hoennTrainingParty=()=>{
            s.mons=[289,282,330,257,310,275].map((id,i)=>({uid:'h'+i,id,level:[52,52,52,52,44,43][i],reg:'hoenn'}));s.team=s.mons.map(m=>m.uid);s.road=[...s.team];
            s.travel.to=['johto','hoenn'];s.link={to:'hoenn',side:'to'};Object.assign(s.adv,{chapter:35,unlocked:38,deaths:{},loops:[35]});save();
        };
        const volcano=()=>({...__pcTest.DATA.chapters.find(c=>c.id===35),key:'35',members:[35]});
        reset('train',{trainUid:'team',trainLevel:52,autoPrepare:false});hoennTrainingParty();engine.trainProtected=[...s.team];engine.target=volcano();engine.visit={started:Date.now()-31000,deaths:0};
        await until(()=>s.adv.chapter===38,35);assert(engine.running&&s.adv.chapter===38,'the screenshot party leaves an unmeasured low-level volcano and enters its efficient open frontier through native controls');
        await tick();s.adv.unlocked=40;s.mons[0].level=65;save();await until(()=>s.adv.chapter===39,35);
        assert(engine.running&&s.adv.chapter===39&&engine.settings.trainLevel===52,'carrier growth immediately upgrades training to an efficient higher-level map without changing the trainee goal');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:false,progressCandy:false});hoennTrainingParty();engine.progress(engine.read(),Date.now());
        const upgradedPreparation=engine.preparation;assert(!!upgradedPreparation,'the screenshot party retains unfinished preparation targets');
        Object.assign(upgradedPreparation,{phase:'train',route:volcano(),routeCeiling:37,visit:{at:Date.now(),deaths:0},routeCheck:Date.now()});
        await until(()=>s.adv.chapter===38,35);assert(engine.preparation===upgradedPreparation&&!Number.isFinite(upgradedPreparation.routeCeiling)&&s.adv.chapter===38,'an old persisted difficulty ceiling no longer traps mainline preparation on the volcano');
        s.road=[...s.team];for(const target of upgradedPreparation.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;save();await until(()=>!engine.preparation,35);await until(()=>s.adv.chapter===38,35);
        assert(engine.running&&s.adv.chapter===38&&engine.settings.progressUntil===65,'upgraded preparation still restores the original mainline task after the weak members reach the cap');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:false,progressCandy:false,manualPause:true,manualResume:true});hoennTrainingParty();
        for(const [i,mon]of s.mons.entries())mon.level=[69,68,69,71,71,69][i];Object.assign(s.adv,{chapter:41,unlocked:42,loops:[41]});save();engine.progress(engine.read(),Date.now());
        const frontierPreparation=engine.preparation;assert(!!frontierPreparation&&frontierPreparation.context.id===42,'the level-69 screenshot keeps its original Victory Road preparation goal');
        Object.assign(frontierPreparation,{phase:'train',route:{...__pcTest.DATA.chapters.find(c=>c.id===41),key:'41',members:[41]},visit:{at:Date.now()-31000,deaths:0},routeCheck:Date.now()});frontierPreparation.routeProfile=engine.coach.reviewDifficulty(engine.read(),frontierPreparation,Date.now());
        engine.manualInput();engine.inputHeld=true;engine.onChange();
        const pausedPrep=q('#pokecatch-auto-helper').shadowRoot;
        assert(pausedPrep.querySelector('#prepare-title').textContent.includes('补练已暂停')&&pausedPrep.querySelector('#prepare-route').textContent.includes('雨滴徽章'),'a manual pause labels the detour as paused and preserves its actual training map');
        q('#pokecatch-auto-helper').shadowRoot.querySelector('#resume').click();await until(()=>s.adv.chapter===42&&frontierPreparation.phase==='train',40);
        assert(engine.running&&!engine.manual&&s.adv.chapter===42&&s.adv.loops.includes(42),'resuming the level-69 party enters and loops the efficient latest ordinary map through native controls');
        engine.onChange();assert(q('#pokecatch-auto-helper').shadowRoot.querySelector('#prepare-route').textContent.includes('冠军之路'),'the preparation card updates to the latest actual training map');
        s.adv.unlocked=43;save();await until(()=>engine.preparation!==frontierPreparation,30);
        assert(engine.running&&engine.settings.progressUntil===65&&engine.preparation!==frontierPreparation,'beating the frontier during training releases the completed detour and preserves the later mainline goal');
        reset('progress',{progressUntil:65,autoPrepare:true,autoTeam:true,progressCandy:false,trainBuddy:false,trainBuff:false});
        s.mons=[289,282,257,319,310,365].map((id,i)=>({uid:'league'+i,id,level:[92,90,93,83,83,74][i],reg:'hoenn',xp:0}));s.team=s.mons.map(mon=>mon.uid);s.road=[...s.team];s.autoSwitch=true;s.travel.to=['johto','hoenn'];s.link={from:'kanto',to:'hoenn',side:'to'};
        Object.assign(s.adv,{chapter:42,unlocked:46,loops:[42],battle:null,pending:null,deaths:{}});save();engine.progress(engine.read(),Date.now());
        const leaguePreparation=engine.preparation;assert(!!leaguePreparation&&leaguePreparation.targets.some(target=>target.goal===95),'the screenshot party still prepares while its guarded critical matchups remain unsafe');
        Object.assign(leaguePreparation,{phase:'train',route:{...__pcTest.DATA.chapters[42],key:'42',members:[42]},visit:{at:Date.now(),deaths:0}});
        engine.onChange();assert(q('#pokecatch-auto-helper').shadowRoot.querySelector('#prepare-assessment').textContent.includes('实际战力'),'the preparation card explains that readiness can release the level targets early');
        s.team=[...leaguePreparation.uids];s.road=[...s.team];save();
        await until(()=>s.adv.chapter===43&&leaguePreparation.phase==='train'&&leaguePreparation.route?.league,50);
        assert(engine.preparation===leaguePreparation&&engine.settings.progressUntil===65&&s.adv.loops.includes('L:hoenn'),'the source-46 screenshot party enters the already-open league for higher-yield training through native map controls');
        engine.onChange();assert(q('#pokecatch-auto-helper').shadowRoot.querySelector('#prepare-route').textContent.includes('联盟试刷'),'league preparation is labelled as an estimated trial rather than a completed full-loop sample');
        for(const mon of s.mons)mon.level=92;s.team=[...leaguePreparation.uids];s.road=[...s.team];engine.budget.spent=321;engine.budget.used=4;save();
        await until(()=>!engine.preparation,35);assert(engine.running&&engine.coach.ready?.trial&&s.mons.every(mon=>mon.level===92),'a sufficiently prepared level-92 league party returns without forcing all six to 95');
        await until(()=>s.adv.chapter===43,45);assert(engine.running&&s.adv.chapter===43&&engine.settings.progressUntil===65&&!engine.preparation&&engine.budget.spent===321&&engine.budget.used===4,'early preparation completion uses native map controls to resume the original league and keeps the resource budget');
        reset('breed',{breedGoal:2});engine.automation.state.hatched=1;engine.budget.spent=50;s.pension.mons=[{mon:s.mons[1]},{mon:s.mons[2]}];s.mons=[s.mons[0]];s.pension.eggs=[{uid:'future',id:1,hatchAt:Date.now()+14400000}];save();engine.suspend();localStorage.setItem('pc-regression-resume','1');
        return checks;
    };
    window.setupPreparationReload=()=>{
        const engine=e();engine.stop();engine.queueRunning=false;engine.queue=[];Object.assign(s,{mons:[{uid:'a',id:6,level:5}],team:['a'],road:['a'],dex:{},stats:{battles:0,wins:0,caught:0},money:1000});delete s.link;Object.assign(s.adv,{chapter:0,unlocked:1,loops:[0],event:null,zone:null,tower:null,league:null,battle:null,pending:null});save();
        engine.settings={...engine.settings,mode:'progress',autoPrepare:true,autoTeam:false,progressUntil:1,raids:false,moneyTarget:0};engine.schedule=()=>{};engine.start();engine.progress(engine.read(),Date.now());const p=engine.preparation;p.phase='train';p.route={id:0,key:'0',members:[0],reg:'kanto',name:'Training',reward:1206,units:58};p.visit={at:Date.now(),deaths:0};p.routeCheck=Date.now();engine.budget.used=2;engine.suspend();localStorage.setItem('pc-regression-resume','1');return p.targets[0].goal;
    };
})();
