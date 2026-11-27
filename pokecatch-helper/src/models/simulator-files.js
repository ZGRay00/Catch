    const simFields=['level','rank','shiny','bannedMoves','taste','statMult','hpMult','damageMult'];
    const simOpaque=()=>crypto.randomUUID();
    const simHex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
    const simCanonical=v=>Array.isArray(v)?'['+v.map(simCanonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+simCanonical(v[k])).join(',')+'}':JSON.stringify(v);
    const simDigest=async v=>simHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(simCanonical(v))));
    function simIdentity(trainer,uids=[],reset=false){
        const fresh=()=>({scope:simOpaque(),secret:simHex(crypto.getRandomValues(new Uint8Array(32)))});
        if(!trainer)return Promise.resolve(fresh());
        return new Promise((ok,fail)=>{
            const req=indexedDB.open('pokecatch-simulator-identities',1);
            req.onupgradeneeded=()=>req.result.createObjectStore('saves');
            req.onerror=()=>fail(req.error);
            req.onsuccess=()=>{const db=req.result,tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves'),get=store.get(trainer);let value;
                get.onsuccess=()=>{const prior=get.result,seen=new Set(prior?.uids??[]);
                    const same=!reset&&uids.length&&uids.some(uid=>seen.has(uid));value=same?prior:fresh();
                    store.put({...value,uids:[...new Set(uids)]},trainer);};
                tx.oncomplete=()=>{db.close();ok(value);};tx.onabort=()=>{db.close();fail(tx.error??Error('身份空间不可读'));};
            };
        });
    }
    async function simulatorBox(s,settings,now,build,resources=false,identity=simIdentity){
        const raw=new Map(),box=boxSnapshot(s,settings,now,build,(alias,m)=>raw.set(alias,m));
        const trainer=s.trainer?.id;
        const space=await identity(typeof trainer==='string'&&trainer||typeof trainer==='number'&&String(trainer)||null,[...raw.values()].map(m=>m.uid));
        const zone=s.adv?.zone;const observedTarget=Number.isSafeInteger(zone?.id)&&Number.isSafeInteger(zone?.elite)?zone.id+'/'+(Number.isSafeInteger(zone.foe)?zone.foe:zone.id)+'/'+zone.elite:'unknown';
        const phase=Number.isInteger(s.adv.chapter)?phaseAt(s,now,s.adv.chapter):'unknown';
        const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(space.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const away=new Set(box.underground?.used??[]);
        const complete=async m=>{
            const original=raw.get(m.uid);
            m.stableId=simHex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(original.uid)));
            m.rank=Number.isInteger(original.rank)?original.rank:undefined;m.shiny=typeof original.shiny==='boolean'?original.shiny:undefined;
            if(original.ban!==undefined&&(!Array.isArray(original.ban)||original.ban.length>256||original.ban.some(k=>typeof k!=='string'||!k.length||k.length>96)))throw Error('禁招字段超出协议范围');
            m.bannedMoves=original.ban===undefined?[]:[...new Set(original.ban)].sort();
            m.unrecognized=(m.bannedMoves??[]).filter(k=>!Object.hasOwn(DATA.combat.moves,k));
            m.fieldProvenance=Object.fromEntries(simFields.map(k=>[k,k==='bannedMoves'&&original.ban===undefined?'verified-default':m[k]!==undefined?'raw':k==='taste'&&!original.taste?'verified-default':'unknown']));
            m.availability={state:away.has(m.uid)||m.uid.startsWith('under-')?'occupied':'available',reason:'导出时盒子与已知地下派遣记录'};
        };
        await Promise.all([...box.members,...(box.underground?.slots??[]).flatMap(slot=>slot.members??[])].map(complete));
        Object.assign(box,{schema:2,exporter:'pokecatch-helper/2',exportId:simOpaque(),identityScope:space.scope,
            capabilities:['stable-identity','field-provenance','conditions','raw-bans'],gameBuild:box.gameBuild??'unknown',
            conditionsSnapshot:{at:box.exportedAt,target:observedTarget,weather:['neutral','rain','storm','sun','sand','snow','fog'].includes(zone?.weather)?zone.weather:'unknown',phase:['day','night'].includes(phase)?phase:'unknown',nativeAutoSwitch:typeof s.autoSwitch==='boolean'?s.autoSwitch:'unknown',
                autoTeam:box.rules.autoTeam,activeSwitch:box.rules.activeSwitch},identityPersistent:!!trainer});
        if(resources)box.resourcesSnapshot={region:box.progress.walletRegion??'unknown',gold:Number.isFinite(s.money)?s.money:'unknown',walletXp:'unknown',items:'unknown'};
        return box;
    }
    const simProfile=m=>Object.fromEntries(['id','reg',...simFields].map(k=>[k,k==='bannedMoves'&&Array.isArray(m[k])?[...m[k]].sort():m[k]??null]));
    function readSimulatorPlan(raw){
        if(typeof raw!=='string'||raw.length>256*1024)throw Error('方案超过 256 KiB');
        const p=JSON.parse(raw),obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
        const keys=(v,list)=>obj(v)&&Object.keys(v).every(k=>list.includes(k));
        let count=0;
        function scan(v,d){if(++count>12000||d>16||typeof v==='string'&&v.length>1024||Array.isArray(v)&&v.length>256)throw Error('方案结构超限');
            if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('不支持的键');scan(x,d+1);}}
        scan(p,0);
        const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
        if(!keys(p,['format','schema','sourceBoxHash','identityScope','target','conditions','engine','rules','policy','team','sample','confirmedAt','training'])||
            p.format!=='pokecatch-team-plan'||p.schema!==1||!hex(p.sourceBoxHash)||!(p.identityScope===null||typeof p.identityScope==='string'&&/^[a-f0-9-]{32,64}$/i.test(p.identityScope))||
            typeof p.target!=='string'||!/^\d+\/\d+\/[1-5]$/.test(p.target)||!keys(p.conditions,['weather','phase','factors','maxRounds','strategy','seed','rng'])||
            !['day','night'].includes(p.conditions.phase)||typeof p.conditions.weather!=='string'||!obj(p.conditions.factors)||Object.values(p.conditions.factors).some(x=>!Number.isFinite(x))||
            !Number.isSafeInteger(p.conditions.maxRounds)||p.conditions.maxRounds<1||p.conditions.maxRounds>200||p.conditions.strategy!=='native-priority'||
            !Number.isInteger(p.conditions.seed)||typeof p.conditions.rng!=='string'||typeof p.engine!=='string'||!hex(p.rules)||typeof p.policy!=='string'||
            !keys(p.training,['actions','resourceKnowledge'])||!Array.isArray(p.training.actions)||p.training.actions.length>6||!['xp-known','unknown'].includes(p.training.resourceKnowledge)||p.training.actions.some(a=>!keys(a,['position','from','to','xp'])||!Number.isInteger(a.position)||a.position<1||a.position>(p.team?.length??0)||!Number.isInteger(a.from)||a.from<1||!Number.isInteger(a.to)||a.to<a.from||a.to>100||!(a.xp===null||Number.isSafeInteger(a.xp)&&a.xp>=0))||
            !Array.isArray(p.team)||!p.team.length||p.team.length>6||!keys(p.sample,['wins','trials','interval'])||!Number.isSafeInteger(p.sample.wins)||!Number.isSafeInteger(p.sample.trials)||p.sample.trials<1||p.sample.trials>10000||p.sample.wins<0||p.sample.wins>p.sample.trials||
            !Array.isArray(p.sample.interval)||p.sample.interval.length!==2||!p.sample.interval.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||p.sample.interval[0]>p.sample.interval[1]||p.training.resourceKnowledge==='xp-known'&&p.training.actions.some(a=>a.xp===null)||typeof p.confirmedAt!=='string'||!Number.isFinite(Date.parse(p.confirmedAt)))throw Error('挑战方案格式或版本无效');
        for(const m of p.team){if(!keys(m,['stableId','name','profile','fingerprint'])||!(m.stableId===null||hex(m.stableId))||typeof m.name!=='string'||!hex(m.fingerprint)||
            !keys(m.profile,['id','reg',...simFields])||!Number.isSafeInteger(m.profile.id)||m.profile.id<1||!Number.isInteger(m.profile.level)||m.profile.level<1||m.profile.level>100||!Number.isInteger(m.profile.rank)||m.profile.rank<0||m.profile.rank>5||
            typeof m.profile.shiny!=='boolean'||!(m.profile.reg===null||typeof m.profile.reg==='string')||!['statMult','hpMult','damageMult'].every(k=>m.profile[k]===null||Number.isFinite(m.profile[k])&&m.profile[k]>=0&&m.profile[k]<=1000)||
            !Array.isArray(m.profile.bannedMoves)||!m.profile.bannedMoves.every(k=>typeof k==='string'&&k.length<=96)||
            !(m.profile.taste===null||keys(m.profile.taste,['up','h'])&&(m.profile.taste.h===undefined||['atk','def','spa','spd','spe'].includes(m.profile.taste.h))&&(m.profile.taste.up===undefined||keys(m.profile.taste.up,['atk','def','spa','spd','spe'])&&Object.values(m.profile.taste.up).every(x=>Number.isFinite(x)&&x>=0&&x<=100000))))throw Error('成员画像无效');}
        const ids=p.team.map(m=>m.stableId).filter(Boolean);if(new Set(ids).size!==ids.length)throw Error('方案身份重复');
        return p;
    }
    async function reviewSimulatorPlan(plan,box){
        const same=!!plan.identityScope&&plan.identityScope===box.identityScope,rows=[];
        for(const m of plan.team){
            if(await simDigest(m.profile)!==m.fingerprint)throw Error('方案个体画像指纹不符');
            const mon=same&&m.stableId?box.members.find(p=>p.stableId===m.stableId):undefined;
            const differences=mon?Object.keys(m.profile).filter(k=>simCanonical(simProfile(mon)[k])!==simCanonical(m.profile[k])):[];
            rows.push({m,mon,differences,choices:mon?[]:box.members.filter(x=>x.id===m.profile.id)});
        }
        return {rows,same};
    }
