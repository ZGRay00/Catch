    // The native picker reads each owned Pokémon's ban list on its next attack.
    // Use its own controls for changes. Storage here belongs only to the helper.
    function bossMoveBattle(adv){
        const b=adv?.battle;
        if(!b||adv.event||adv.tower||b.raid)return null;
        const legend=adv.zone&&b.zone===adv.zone.id&&b.kind==='static';
        const league=adv.league?.tier>0&&['trainer','gym'].includes(b.kind);
        if(!legend&&!league)return null;
        const foes=(b.enemies||[]).filter(m=>m?.uid&&m.hp>0&&MONS.has(m.id)&&b.foes?.includes(m.uid));
        return foes.length&&b.allies?.length?{foes,allies:b.allies}:null;
    }
    function bossAttackChoice(keys,foes){
        const attacks=keys.filter(key=>DATA.combat.moves[key]?.power>0).sort((a,b)=>{
            const left=DATA.combat.moves[a],right=DATA.combat.moves[b];
            return right.power-left.power||right.acc-left.acc||a.localeCompare(b);
        });
        // A single list applies to every target. With multiple opponents only
        // override when the same attack is appropriate against every active foe.
        const choices=foes.map(foe=>{
            const model=MONS.get(foe.id),defense=defensiveTypes(model);
            const usable=attacks.filter(k=>defense[DATA.combat.moves[k].type]!==0);
            const canInflict=status=>{
                if(status==='tri')return ['burn','paralysis','freeze'].some(canInflict);
                if(['sleep','freeze'].includes(status)&&foe.lockCd>0)return false;
                const immune={burn:['fire'],freeze:['ice'],poison:['steel','poison']};
                return !(immune[status]||[]).some(t=>model.types.includes(t));
            };
            const effect=!foe.status&&!foe.confused&&usable.find(k=>RAID_ALLY.moves[k]&&canInflict(RAID_ALLY.moves[k].status));
            return effect||usable.find(k=>!RAID_ALLY.moves[k])||usable[0]||null;
        });
        return choices.length&&choices.every(key=>key===choices[0])?choices[0]:null;
    }
    function bossMoveChanges(rows,owned,choice){
        const changes=[];
        // Enable first so the game's last-damaging-move protection always holds.
        for(const row of rows)if(row.banned&&owned.includes(row.key)&&(!choice||row.key===choice))
            changes.push({key:row.key,ban:false});
        // Remove the strongest competitors first when initial setup spans several ticks.
        const power=r=>DATA.combat.moves[r.key]?.power||0;
        if(choice)for(const row of [...rows].sort((a,b)=>power(b)-power(a)))if(!row.banned&&row.key!==choice)
            changes.push({key:row.key,ban:true});
        return changes;
    }
    async function bossMoveDialog(mon,visit){
        const q=selector=>document.querySelector(selector);
        if(q('#modal-root.open,.mvd-root:not(.out)')||visible(q('#evt-pick'))||document.body.classList.contains('swap-mode'))return false;
        const member=()=>Array.from(document.querySelectorAll('#adv-team .tcard[data-uid],#team-slots [data-uid],#pc-grid .pc-cell[data-uid]:not([data-out])'))
            .find(el=>el.dataset.uid===mon.uid);
        const tab=id=>Array.from(document.querySelectorAll('#tabs [data-screen]')).find(el=>el.dataset.screen===id);
        const screen=q('.screen.active')?.id?.replace(/^screen-/,'');
        let switched=false,search,priorSearch,modal,drawer,interrupted=false;
        const interrupt=event=>{if(event.isTrusted)interrupted=true;};
        const inputEvents=['pointerdown','keydown','wheel'];
        const input=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
        try{
            for(const type of inputEvents)document.addEventListener(type,interrupt,true);
            let card=member();
            if(!card){
                if(!screen||!tab(screen))return false;
                if(screen!=='team'){
                    const team=tab('team');
                    if(!team||team.disabled||team.matches('.locked,.hold'))return false;
                    team.click();
                    switched=!!q('#screen-team.active');
                    if(!switched)return false;
                }
                card=member();
                if(!card&&(search=q('#pc-search'))&&search.value!==String(mon.id)){
                    priorSearch=search.value;input(search,String(mon.id));card=member();
                }
                // The native PC filters and virtual grid repaint on a later frame.
                for(let wait=0;!card&&wait<6;wait++){
                    await new Promise(resolve=>setTimeout(resolve,35));
                    if(interrupted||!q('#screen-team.active')||q('#modal-root.open,.mvd-root:not(.out)'))return false;
                    card=member();
                }
            }
            if(!card)return false;
            card.click();
            modal=q('#modal-root.open .mon-modal .mon-card');
            if(!modal)return false;
            modal.querySelector('.dc-move.tap')?.click();
            drawer=q('.mvd-root:not(.out) .mvd.own');
            if(!drawer)return false;
            const read=()=>Array.from(drawer.querySelectorAll('.mvd-row.done[data-k]'),el=>({key:el.dataset.k,banned:el.classList.contains('ban')}));
            const toggle=(key,ban)=>{
                const row=()=>Array.from(drawer.querySelectorAll('.mvd-row.done[data-k]')).find(el=>el.dataset.k===key);
                row()?.querySelector('.mvd-mv')?.click();
                return row()?.classList.contains('ban')===ban;
            };
            return visit(read(),toggle);
        }finally{
            if(drawer)drawer.parentElement.style.visibility='hidden';
            drawer?.querySelector('.mvd-head .dc-x')?.click();
            modal?.querySelector('.dc-x')?.click();
            if(!interrupted&&priorSearch!==undefined&&search.value===String(mon.id))input(search,priorSearch);
            if(!interrupted&&switched&&q('#screen-team.active'))tab(screen)?.click();
            for(const type of inputEvents)document.removeEventListener(type,interrupt,true);
        }
    }
    class BossMoves{
        constructor(engine,dialog=bossMoveDialog){
            this.e=engine;this.dialog=dialog;this.cache=new Map();this.retry=new Map();
        }
        key(part){return PREFIX+'boss-moves:'+part+':'+this.e.account;}
        enabled(){return !!this.e.account&&this.e.storage.getItem(this.key('on'))==='verified-v1';}
        async enable(value,password,signal){
            const account=this.e.account;
            if(!account||!this.e.mayPersist())return false;
            if(value){
                if(typeof password!=='string'||!password.length)return false;
                const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password));
                const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
                if(digest!=='7870a682eef2fb914ebb5b15a2eb8c4ea44eaee54793e04ae2b2589e68564409'||
                    signal?.aborted||account!==this.e.account||!this.e.mayPersist())return false;
            }
            // A legacy '1' predates password verification. Keep its undo journal available.
            this.e.storage.setItem(this.key('on'),value?'verified-v1':'0');
            this.cache.clear();this.retry.clear();this.suppressed=null;return true;
        }
        journal(entries){
            const storage=this.e.storage,key=this.key('undo');
            if(entries.length)storage.setItem(key,JSON.stringify(entries));
            else storage.removeItem(key);
        }
        async tick(now=Date.now()){
            if(this.busy)return;
            this.busy=true;
            try{await this.step(now);}finally{this.busy=false;}
        }
        async step(now){
            const e=this.e;
            if(!e.account||e.suspended||this.retired){this.disconnectArena();return;}
            if(this.account!==e.account){
                this.account=e.account;this.cache.clear();this.retry.clear();this.suppressed=null;this.note='';this.encounter=null;
            }
            const on=this.enabled(),raw=e.storage.getItem(this.key('undo'));
            if(!on&&!raw){this.disconnectArena();this.note='';return;}
            if(!e.mayPersist()){this.disconnectArena();return;}
            const s=e.read();
            if(!s?.adv||s.adv.layout!==DATA.layout||accountId(s)!==e.account)return;
            const entries=raw?JSON.parse(raw):[],battle=bossMoveBattle(s.adv);
            this.encounter=battle&&battle.foes.map(m=>m.uid).join('|');
            if(this.suppressed!==this.encounter)this.suppressed=null;
            const active=on&&!e.manual&&battle&&this.suppressed!==this.encounter;
            this.watchArena(active);
            const allies=active?battle.allies:[];
            if(!allies.length)this.cache.clear();
            if(!entries.length&&!allies.length){this.note='';return;}
            if(e.inputHeld||e.gameInputFocused?.()||e.driver?.teamTask||e.automation?.buddyTask||e.nurseryAssist?.feed)return;
            const foes=active?battle.foes.map(mon=>this.liveFoe(mon)):[];
            const members=rosterIndex(s).byUid;
            const context=JSON.stringify(foes.map(m=>[m.id,!!m.status,!!m.confused,m.lockCd>0]));
            this.note=active?'按当前对手状态选招':'正在恢复原禁招';
            const ids=[...new Set([...entries.filter(x=>!allies.includes(x.uid)).map(x=>x.uid),...allies])];
            for(const uid of ids){
                if(this.retry.get(uid)>now)continue;
                const mon=members.get(uid),entry=entries.find(x=>x.uid===uid);
                if(!mon){this.retry.set(uid,now+5000);continue;}
                const manage=allies.includes(uid);
                const signatureFor=bans=>JSON.stringify([mon.id,mon.level,manage?context:null,[...bans].sort()]);
                const signature=signatureFor(mon.ban||[]);
                if(manage&&this.cache.get(uid)===signature)continue;
                const result=await this.dialog(mon,(rows,toggle)=>{
                    // Navigation/search can yield to the game or to another tab.
                    if(this.retired||!e.mayPersist()||this.account!==e.account||this.enabled()!==on||e.suspended)return false;
                    const fresh=e.read();
                    if(!fresh?.adv||accountId(fresh)!==this.account)return false;
                    if(manage){
                        const next=bossMoveBattle(fresh.adv);
                        if(e.manual||this.suppressed===this.encounter||!next?.allies.includes(uid)||
                            next.foes.map(m=>m.uid).join('|')!==this.encounter)return false;
                    }
                    if(!rows.length)return false;
                    const owned=entry?.keys||[];
                    const choice=manage?bossAttackChoice(rows.filter(r=>!r.banned||owned.includes(r.key)).map(r=>r.key),foes):null;
                    const changes=bossMoveChanges(rows,owned,choice);
                    if(!changes.length){
                        if(entry&&!rows.some(r=>r.banned&&owned.includes(r.key))){
                            // A changed roster may temporarily hide previously learned moves.
                            const hidden=owned.filter(k=>!rows.some(r=>r.key===k)&&(mon.ban||[]).includes(k));
                            if(hidden.length){entry.keys=hidden;this.journal(entries);return false;}
                            entries.splice(entries.indexOf(entry),1);this.journal(entries);
                        }
                        this.cache.set(uid,signature);return true;
                    }
                    let record=entry;
                    if(!record){record={uid,keys:[]};entries.push(record);}
                    const resultingBans=new Set(mon.ban||[]);
                    // Bound initial setup and restoration. A normal status transition takes two clicks.
                    for(const {key,ban} of changes.slice(0,4)){
                        if(ban&&!record.keys.includes(key)){record.keys.push(key);this.journal(entries);}
                        if(!toggle(key,ban))return false;
                        if(ban)resultingBans.add(key);else resultingBans.delete(key);
                        if(!ban){record.keys=record.keys.filter(k=>k!==key);this.journal(entries);}
                    }
                    if(!record.keys.length){entries.splice(entries.indexOf(record),1);this.journal(entries);}
                    if(changes.length<=4)this.cache.set(uid,signatureFor(resultingBans));else this.cache.delete(uid);
                    return true;
                });
                if(result)return;
                this.retry.set(uid,now+1800);
            }
            if(this.retry.size&&ids.some(uid=>this.retry.get(uid)>now))this.note='等待可操作的队员详情后继续';
        }
        liveFoe(mon){
            if(typeof document==='undefined'||!document.querySelector('#screen-adventure.active'))return mon;
            const sprite=Array.from(document.querySelectorAll('#enemy-slot .enemy[data-uid]:not(.fxclone):not(.fainted)')).find(el=>el.dataset.uid===mon.uid);
            if(!sprite)return mon;
            return {...mon,status:['burn','sleep','poison','paralysis','freeze'].find(k=>sprite.classList.contains('st-'+k)),confused:sprite.classList.contains('st-confusion')};
        }
        watchArena(active){
            const arena=active&&typeof document!=='undefined'?document.querySelector('#screen-adventure.active #enemy-slot'):null;
            if(arena===this.arena)return;
            this.disconnectArena();
            if(!arena)return;
            this.arena=arena;
            const signature=()=>Array.from(arena.querySelectorAll('.enemy[data-uid]:not(.fxclone):not(.fainted)'),el=>
                [el.dataset.uid,...Array.from(el.classList).filter(c=>c.startsWith('st-')).sort()].join('.')).join('|');
            let last=signature();
            this.observer=new MutationObserver(records=>{
                if(!records.some(r=>r.type==='attributes'?r.target.matches('.enemy[data-uid]'):r.target===arena))return;
                const current=signature();
                if(current===last)return;
                last=current;
                if(!this.wake)this.wake=setTimeout(()=>{
                    this.wake=null;this.tick().catch(err=>{this.note='切招暂缓 · '+err.message;});
                },60);
            });
            this.observer.observe(arena,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
        }
        disconnectArena(){
            this.observer?.disconnect();this.observer=null;this.arena=null;
            clearTimeout(this.wake);this.wake=null;
        }
    }

