    function partyMons(s,uids=s.team||[]) {
        if(!uids.length)return [];
        const wanted=new Set(uids),found=new Map();
        for(const mon of s.mons||[]){
            const uid=mon.uid;
            if(wanted.delete(uid))found.set(uid,mon);
            if(!wanted.size)break;
        }
        return uids.map(uid=>found.get(uid)).filter(Boolean);
    }
    function monRegion(mon) { const reg = mon.reg === 'kanto2' ? 'johto' : mon.reg; return DATA.regions.some(r => r.key === reg) ? reg : 'kanto'; }
    function tasteProfile(m){return m.taste?[m.taste.h||'',...['atk','def','spa','spd','spe'].map(key=>Number(m.taste.up?.[key])||0)].join(':'):'';}
    function tasteMultiplier(taste,key){
        const config=DATA.combat.tastes;
        if(!taste||!config||!['atk','def','spa','spd','spe'].includes(key))return 1;
        const value=Math.min(Math.max(Number(taste.up?.[key])||0,0),config.MAX)/config.MAX;
        return 1+config.CAP*((1-config.LIN)*(1-(1-value)**2)+config.LIN*value)-(taste.h===key?config.DIS0:0);
    }
    function rosterFingerprint(s) { return (s.mons || []).map(m => `${m.uid}:${m.id}:${m.level}:${m.rank || 0}:${+!!m.shiny}:${monRegion(m)}:${m.statMult||1}:${m.hpMult||1}:${tasteProfile(m)}`).sort().join(',')+`|${s.link?.to||''}:${s.link?.side||''}`; }
    function teamEligible(s, mon, reg = currentRegion(s)) {
        if (!MONS.has(mon.id) || !mon.uid || String(mon.uid).startsWith('t:') || String(mon.uid).startsWith('c:')) return false;
        return !s.link || (reg === s.link.to) === (monRegion(mon) === s.link.to);
    }

    function boxSnapshot(s,settings=DEFAULTS,now=Date.now(),gameBuild){
        if(!s?.adv||!Array.isArray(s.mons))throw new Error('请先进入游戏并加载盒子');
        const stats=['atk','def','spa','spd','spe'],number=value=>Number.isFinite(value)?value:undefined;
        const refs=new Map(),members=[];
        for(const mon of s.mons){
            if(!mon||typeof mon.uid!=='string'||!mon.uid||!Number.isSafeInteger(mon.id)||mon.id<1||refs.has(mon.uid))continue;
            const uid='box-'+(members.length+1),model=MONS.get(mon.id);
            refs.set(mon.uid,uid);
            const up=Object.fromEntries(stats.filter(key=>Number.isFinite(mon.taste?.up?.[key])).map(key=>[key,mon.taste.up[key]]));
            const favoriteStat=stats.includes(mon.taste?.h)?mon.taste.h:undefined;
            members.push({
                uid,id:mon.id,name:model?.name,types:model?.types||[],reg:monRegion(mon),
                level:number(mon.level),xp:number(mon.xp),rank:number(mon.rank)??0,shiny:!!mon.shiny,favorite:!!mon.fav,
                statMult:number(mon.statMult),hpMult:number(mon.hpMult),damageMult:number(mon.damageMult),
                taste:favoriteStat||Object.keys(up).length?{h:favoriteStat,up}:undefined,
                bannedMoves:Array.isArray(mon.ban)?[...new Set(mon.ban.filter(key=>typeof key==='string'&&Object.hasOwn(DATA.combat.moves,key)))]:[],
                levelCap:trainingCap(s,mon),
            });
        }
        const region=key=>DATA.regions.find(entry=>entry.key===key)?.key;
        const open=new Set(['kanto',currentRegion(s),...(Array.isArray(s.travel?.to)?s.travel.to:[])]);
        const lookup=uids=>Array.isArray(uids)?uids.map(uid=>refs.get(uid)).filter(Boolean):[];
        const team=lookup(s.team),road=lookup(s.road);
        const map=id=>{const chapter=CHAPTERS.get(id);return chapter?{id:chapter.id,name:chapter.name,region:chapter.reg}:null;};
        const link=s.link,to=region(link?.to),side=['from','to'].includes(link?.side)?link.side:undefined;
        const cfg=normalizeSettings(settings);
        return {
            format:'pokecatch-box',schema:1,helperVersion:VERSION,dataBuild:DATA.build,
            gameBuild:typeof gameBuild==='string'&&/^[a-f0-9]{10}$/i.test(gameBuild)?gameBuild:undefined,
            exportedAt:new Date(now).toISOString(),
            progress:{chapter:map(s.adv.chapter),unlocked:map(s.adv.unlocked),
                regions:DATA.regions.filter(entry=>open.has(entry.key)).map(entry=>entry.key),walletRegion:economicRegion(s)},
            rules:{nativeAutoSwitch:s.autoSwitch!==false,mode:cfg.mode,autoTeam:cfg.autoTeam,activeSwitch:cfg.activeSwitch,
                regionScope:cfg.region,gameSpeed:number(s.adv.speed),helperSpeed:cfg.speed},
            rosterLink:to&&side?{from:region(link.from),to,side,storedTeam:lookup(link.stash?.team)}:null,
            team,activeTeam:road.length?road:team,buddy:refs.get(s.buddy?.uid)??null,members,
        };
    }
