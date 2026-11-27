    const saveBoxViews=new WeakMap(),saveRosterArrays=new WeakMap();
    const tasteKeys=['atk','def','spa','spd','spe'];
    function sameRosterCombat(a,b){
        if(!b||a.id!==b.id||a.reg!==b.reg||a.level!==b.level||a.shiny!==b.shiny||a.rank!==b.rank||
            a.statMult!==b.statMult||a.hpMult!==b.hpMult||a.damageMult!==b.damageMult||(a.rageMax!=null)!==(b.rageMax!=null)||a.taste?.h!==b.taste?.h)return false;
        if(a.taste?.up||b.taste?.up)for(const key of tasteKeys)if(a.taste?.up?.[key]!==b.taste?.up?.[key])return false;
        const x=a.ban,y=b.ban;
        return x===y||Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.every((key,i)=>key===y[i]);
    }
    function rosterCombatKey(mon){
        return JSON.stringify([mon.uid,mon.id,monRegion(mon),mon.level,mon.rank||0,+!!mon.shiny,mon.statMult||1,mon.hpMult||1,
            mon.damageMult||1,mon.rageMax!=null,tasteProfile(mon),moveBanKey(mon)]);
    }
    function makeRosterIndex(mons,previous,reuse){
        const byUid=new Map(),duplicates=new Set(),prior=previous?.byUid;
        const changed=new Map();let unchanged=!!prior,rebuilt=0;
        for(const mon of mons){
            if(!mon||!mon.uid)continue;
            if(byUid.has(mon.uid)||duplicates.has(mon.uid)){
                duplicates.add(mon.uid);byUid.delete(mon.uid);changed.delete(mon.uid);unchanged=false;continue;
            }
            byUid.set(mon.uid,mon);
            if(reuse){
                const stale=prior?.get(mon.uid);
                const known=previous?.profiles.get(mon.uid);
                const key=known&&sameRosterCombat(mon,stale)?known:rosterCombatKey(mon);
                if(key!==known){unchanged=false;rebuilt++;changed.set(mon.uid,key);}
            }
        }
        unchanged=unchanged&&byUid.size===prior.size;
        let profiles,fingerprint;
        if(reuse){
            profiles=unchanged?previous.profiles:changed;
            if(!unchanged&&previous)for(const uid of byUid.keys())if(!profiles.has(uid))profiles.set(uid,previous.profiles.get(uid));
            fingerprint=unchanged?previous.fingerprint:JSON.stringify([...profiles.values()].sort());
        }
        return{byUid,profiles,duplicates,fingerprint,rebuilt};
    }
    function publishSaveBox(s,previous){
        const prior=saveBoxViews.get(previous),roster=makeRosterIndex(s.mons,prior?.roster,true);
        const view={roster,locations:null,eligible:new Map()};
        if(prior?.adventureKeys&&prior.roster.profiles===roster.profiles&&previous.link?.to===s.link?.to&&previous.link?.side===s.link?.side)view.adventureKeys=prior.adventureKeys;
        saveBoxViews.set(s,view);saveRosterArrays.set(s.mons,roster);
        return view;
    }
    function rosterAvailabilityKey(s){
        return JSON.stringify([s.team,s.road,s.buddy?.uid,s.link?.to,s.link?.side,s.link?.stash?.team,
            (s.pension?.mons||[]).map(entry=>entry?.mon?.uid),
            (s.under?.slots||[]).map(slot=>[slot?.team,(slot?.mons||[]).map(mon=>mon?.uid)]),s.under?.day,s.under?.used,
            (s.candy?.run?.mons||[]).map(mon=>mon.src),s.eventTeams]);
    }
    function rosterIndex(s){return saveRosterArrays.get(s.mons)||makeRosterIndex(s.mons||[],null,false);}
    function pokemonByUid(s){
        const {byUid}=rosterIndex(s);
        return{get:uid=>byUid.get(uid),has:uid=>byUid.has(uid)};
    }
    function rosterLocations(s){
        const view=saveBoxViews.get(s);
        if(view?.locations)return view.locations;
        const locations=new Map(),bySpecies=new Map(),party=new Set(s.team||[]),road=new Set(s.road||[]);
        const add=(mon,position)=>{
            if(!mon)return;
            const entry={mon,position,party:party.has(mon.uid),road:road.has(mon.uid)};
            if(mon.uid){
                const entries=locations.get(mon.uid)||[];entries.push(entry);locations.set(mon.uid,entries);
            }
            const species=bySpecies.get(mon.id)||[];species.push(entry);bySpecies.set(mon.id,species);
        };
        for(const mon of s.mons||[])add(mon,'box');
        for(const entry of s.pension?.mons||[])add(entry?.mon,'daycare');
        for(const entry of s.under?.slots||[])for(const mon of entry?.mons||[])add(mon,'expedition');
        for(const mon of s.link?.stash?.mons||[])add(mon,'linked');
        const result={byUid:uid=>locations.get(uid)?.slice()||[],bySpecies:id=>bySpecies.get(id)?.slice()||[]};
        if(view)view.locations=result;
        return result;
    }
    function ownsRosterSpecies(s,id,shiny=false){
        if(saveBoxViews.has(s))return rosterLocations(s).bySpecies(id).some(entry=>!shiny||entry.mon.shiny);
        return collectionMembers(s).some(mon=>mon.id===id&&(!shiny||mon.shiny));
    }
    function eligibleRoster(s,reg){
        const view=saveBoxViews.get(s);
        if(view?.eligible.has(reg))return view.eligible.get(reg);
        const index=rosterIndex(s),eligible=[...index.byUid.values()].filter(mon=>teamEligible(s,mon,reg));
        if(view)view.eligible.set(reg,eligible);
        return eligible;
    }
    function partyMons(s,uids=s.team||[]) {
        if(!uids.length)return [];
        const {byUid}=rosterIndex(s);
        return uids.map(uid=>byUid.get(uid)).filter(Boolean);
    }
    function monRegion(mon) { const reg = mon.reg === 'kanto2' ? 'johto' : mon.reg; return DATA.regions.some(r => r.key === reg) ? reg : 'kanto'; }
    function tasteProfile(m){return m.taste?[m.taste.h||'',...tasteKeys.map(key=>Number(m.taste.up?.[key])||0)].join(':'):'';}
    function tasteMultiplier(taste,key){
        const config=DATA.combat.tastes;
        if(!taste||!config||!['atk','def','spa','spd','spe'].includes(key))return 1;
        const value=Math.min(Math.max(Number(taste.up?.[key])||0,0),config.MAX)/config.MAX;
        return 1+config.CAP*((1-config.LIN)*(1-(1-value)**2)+config.LIN*value)-(taste.h===key?config.DIS0:0);
    }
    function rosterFingerprint(s) {
        const key=saveRosterArrays.get(s.mons)?.fingerprint??JSON.stringify([...(s.mons||[])].filter(mon=>mon?.uid).map(rosterCombatKey).sort());
        return key+'|'+JSON.stringify([s.link?.to||'',s.link?.side||'']);
    }
    function rosterSubsetFingerprint(s,pool){
        const index=saveRosterArrays.get(s.mons);
        const profiles=pool.map(mon=>index?.byUid.get(mon.uid)===mon?index.profiles.get(mon.uid):rosterCombatKey(mon));
        return JSON.stringify([profiles.sort(),s.link?.to||'',s.link?.side||'']);
    }
    function adventureRosterFingerprint(s,reg){
        const index=rosterIndex(s),view=saveBoxViews.get(s);
        if(view?.adventureKeys?.has(reg))return view.adventureKeys.get(reg);
        const fingerprint=rosterSubsetFingerprint(s,eligibleRoster(s,reg))+'|'+JSON.stringify([...index.duplicates].sort());
        if(view)(view.adventureKeys??=new Map()).set(reg,fingerprint);
        return fingerprint;
    }
    function teamEligible(s, mon, reg = currentRegion(s)) {
        if (!MONS.has(mon.id) || !mon.uid || String(mon.uid).startsWith('t:') || String(mon.uid).startsWith('c:')) return false;
        return !s.link || (reg === s.link.to) === (monRegion(mon) === s.link.to);
    }

    function boxSnapshot(s,settings=DEFAULTS,now=Date.now(),gameBuild,observe){
        if(!s?.adv||!Array.isArray(s.mons))throw new Error('请先进入游戏并加载盒子');
        const stats=['atk','def','spa','spd','spe'],number=value=>Number.isFinite(value)?value:undefined;
        const refs=new Map(),members=[];
        const knownUid=uid=>typeof uid==='string'&&uid.length>0;
        const exportable=mon=>knownUid(mon?.uid)&&Number.isSafeInteger(mon.id)&&mon.id>0;
        const exportMember=(mon,uid)=>{
            observe?.(uid,mon);
            const model=MONS.get(mon.id);
            const up=Object.fromEntries(stats.filter(key=>Number.isFinite(mon.taste?.up?.[key])).map(key=>[key,mon.taste.up[key]]));
            const favoriteStat=stats.includes(mon.taste?.h)?mon.taste.h:undefined;
            return {
                uid,id:mon.id,name:model?.name,types:model?.types||[],reg:monRegion(mon),
                level:number(mon.level),xp:number(mon.xp),rank:number(mon.rank)??0,shiny:!!mon.shiny,favorite:!!mon.fav,
                statMult:number(mon.statMult),hpMult:number(mon.hpMult),damageMult:number(mon.damageMult),
                taste:favoriteStat||Object.keys(up).length?{h:favoriteStat,up}:undefined,
                bannedMoves:Array.isArray(mon.ban)?[...new Set(mon.ban.filter(key=>typeof key==='string'&&Object.hasOwn(DATA.combat.moves,key)))]:[],
                levelCap:trainingCap(s,mon),
            };
        };
        for(const mon of s.mons){
            if(!exportable(mon)||refs.has(mon.uid))continue;
            const uid='box-'+(members.length+1);
            refs.set(mon.uid,uid);
            members.push(exportMember(mon,uid));
        }
        const region=key=>DATA.regions.find(entry=>entry.key===key)?.key;
        const open=new Set(['kanto',currentRegion(s),...(Array.isArray(s.travel?.to)?s.travel.to:[])]);
        const lookup=uids=>Array.isArray(uids)?uids.map(uid=>refs.get(uid)).filter(Boolean):[];
        const team=lookup(s.team),road=lookup(s.road);
        const map=id=>{const chapter=CHAPTERS.get(id);return chapter?{id:chapter.id,name:chapter.name,region:chapter.reg}:null;};
        const link=s.link,to=region(link?.to),side=['from','to'].includes(link?.side)?link.side:undefined;
        const cfg=normalizeSettings(settings);
        let underground;
        if(s.under&&typeof s.under==='object'){
            const status=undergroundStatus(s,now),{best,capacity,sent,perDay,startFloors}=status;
            const away=new Map(),alias=uid=>{
                if(refs.has(uid))return refs.get(uid);
                if(!away.has(uid))away.set(uid,'under-'+(away.size+1));
                return away.get(uid);
            };
            const theme=key=>typeof key==='string'&&Object.hasOwn(UNDER_THEMES,key)?key:null;
            const slots=[];
            for(let bay=0;bay<capacity;bay++){
                const slot=undergroundBay(s,bay,status);
                if(!slot)continue;
                const party=(Array.isArray(slot.mons)?slot.mons:[]).filter(exportable);
                const team=[...new Set([...(Array.isArray(slot.team)?slot.team.filter(knownUid):[]),...party.map(mon=>mon.uid)])].map(alias);
                const ready=status.ready.includes(slot);
                slots.push({bay,theme:theme(slot.theme),from:Number.isSafeInteger(slot.from)&&slot.from>0?slot.from:1,
                    state:ready?'ready':'active',returnInSeconds:ready?0:Number.isFinite(+slot.end)&&+slot.end>0?Math.max(0,Math.ceil((slot.end-now)/1000)):undefined,
                    team,members:party.map(mon=>exportMember(mon,alias(mon.uid)))});
            }
            const used=s.under.day===status.day?Object.entries(s.under.used||{}).filter(([,value])=>value).map(([uid])=>refs.get(uid)||away.get(uid)).filter(Boolean):[];
            underground={best,capacity,sent,perDay,startFloors,
                nextThemes:Array.from({length:capacity},(_,bay)=>theme(s.under.next?.[bay])),goal:cfg.underGoal,
                preferredStartFloor:cfg.underAutoStart===false?cfg.underFrom:null,used,slots};
        }
        return {
            format:'pokecatch-box',schema:1,helperVersion:VERSION,dataBuild:DATA.build,
            gameBuild:typeof gameBuild==='string'&&/^[a-f0-9]{10}$/i.test(gameBuild)?gameBuild:undefined,
            exportedAt:new Date(now).toISOString(),
            progress:{chapter:map(s.adv.chapter),unlocked:map(s.adv.unlocked),
                regions:DATA.regions.filter(entry=>open.has(entry.key)).map(entry=>entry.key),walletRegion:economicRegion(s)},
            rules:{nativeAutoSwitch:s.autoSwitch!==false,mode:cfg.mode,autoTeam:cfg.autoTeam,activeSwitch:cfg.activeSwitch,
                regionScope:cfg.region,gameSpeed:number(s.adv.speed),helperSpeed:cfg.speed},
            rosterLink:to&&side?{from:region(link.from),to,side,storedTeam:lookup(link.stash?.team)}:null,
            team,activeTeam:road.length?road:team,buddy:refs.get(s.buddy?.uid)??null,members,underground,
        };
    }
