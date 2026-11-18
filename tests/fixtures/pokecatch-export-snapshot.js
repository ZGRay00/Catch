// Evaluate after the four existing exporters in an isolated public game runtime.
// __pcSnapshotParts={pools,teams,targets,automation}; each exporter returns JSON.
// The shipped userscript never calls these internal game objects.
(() => {
    const t=globalThis.__pcResearch,G=t.Game,S=t.STORY,C=t.CONFIG,A=t.Adventure;
    const parts=globalThis.__pcSnapshotParts;
    if(!parts||!parts.pools||!parts.teams||!parts.targets||!parts.automation)throw Error('Missing isolated snapshot components');
    if(!G.S)G.load();A.ensure();
    const previous=JSON.parse(JSON.stringify(G.S)),open=S.REGIONS.map(r=>[r,r.open]),oldPhase=t.DAYTIME.forced,oldWeather=t.WEATHER.forced,oldRandom=Math.random;
    const tr=value=>t.I18n.t(value||'');
    const regions=S.REGIONS.filter(r=>r.key&&r.dex).map(r=>{const ids=S.chaptersOf(r.key);return{key:r.key,name:tr(r.name),start:Math.min(...ids),end:Math.max(...ids),dexRange:[...r.dex]};});
    const dexMax=Math.max(...regions.map(r=>r.dexRange[1]));
    const basic=id=>{const seen=new Set();while(G.PREVO[id]&&!seen.has(id)){seen.add(id);const parent=G.PREVO[id].from;if(G.DEX[parent]?.baby)break;id=parent;}return id;};
    const root=id=>{
        if(id>dexMax)return t.FORMS?.baseOf(id)||id;
        if(!G.DEX[id]?.baby)return basic(id);
        return basic(+Object.keys(G.PREVO).find(child=>G.PREVO[child].from===id)||id);
    };
    const mons=t.POKEDEX.map(m=>({id:m.id,name:m.name,key:m.key,types:m.types,stats:m.stats,rate:m.captureRate,baby:!!m.baby,legend:!!(m.legendary||m.mythical),root:root(m.id),learn:parts.teams.learns[m.id]||[]}));
    try{
        let seed=0x20261116;
        Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
        G.S.travel={to:regions.map(r=>r.key)};G.S.link=null;
        for(const [r]of open)r.open=!!r.key;
        const adv=G.S.adv;adv.unlocked=S.CHAPTERS.length-1;adv.badges=S.CHAPTERS.flatMap(c=>c.steps.filter(s=>s.kind==='gym'&&s.badge).map(s=>s.badge));adv.gifts={};
        for(const c of S.CHAPTERS)for(const step of c.steps){if(step.once)adv.gifts[step.once]=true;if(step.gift?.key)adv.gifts[step.gift.key]=true;}
        G.S.dex=Object.fromEntries(t.POKEDEX.map(m=>[m.id,{caught:1}]));
        t.DAYTIME.force('day');t.WEATHER.force('none');
        const avg=value=>Array.isArray(value)?value.reduce((a,b)=>a+b,0)/value.length:Number(value)||1;
        const rewardFor=(node,league)=>{
            if(node.type==='gym')return node.gym.reward*(league?C.LEAGUE_TRAINERS.reward:1)*C.LEADER_REPLAY_MONEY*C.MONEY_GAIN;
            if(node.type!=='trainer')return 0;
            const level=node.team?.length?Math.max(...node.team.map(m=>m[1])):avg(node.lv)+(node.gymTrainer||node.league?0:avg(C.TRAINER_LEVEL_BONUS));
            return C.TRAINER_MONEY(level)*(node.league?C.LEAGUE_TRAINERS.moneyWon:1)*C.MONEY_GAIN;
        };
        const starterFoes=(c,id,baseline)=>{
            const steps=c.steps.filter(step=>step.byStarter&&step.kind==='gym');
            if(!steps.length)return null;
            const keys=[...new Set(steps.map(step=>step.byStarter.starter))];
            if(keys.length!==1)throw Error('Unsupported multiple starter selectors in one chapter');
            const key=keys[0],saved=adv.gifts[key],defaultTeams=steps.map(step=>S.gymTeam(id,step));
            const variants=[...new Set(steps.flatMap(step=>Object.keys(step.byStarter).filter(value=>/^\d+$/.test(value))))];
            const choices={},gymChoices={};
            try{
                for(const choice of variants){
                    adv.gifts[key]=Number(choice);
                    gymChoices[choice]=c.steps.filter(step=>step.kind==='gym').flatMap(step=>S.gymTeam(id,step));
                    const threats=new Map(baseline.map(([mon,level,weight])=>[`${mon}:${level}`,{id:mon,level,weight}]));
                    const add=(mon,level,weight)=>{const ref=`${mon}:${level}`,old=threats.get(ref);threats.set(ref,{id:mon,level,weight:(old?.weight||0)+weight});};
                    // Keep the exact exported route/league threats; replace only the gym
                    // portion using native getters after selecting that starter.
                    for(const team of defaultTeams)for(const [mon,level]of team)add(mon,level,-3);
                    for(const step of steps)for(const [mon,level]of S.gymTeam(id,step))add(mon,level,3);
                    choices[choice]=[...threats.values()].filter(row=>row.weight>1e-8).map(row=>[row.id,row.level,+row.weight.toFixed(5)]);
                }
            }finally{if(saved===undefined)delete adv.gifts[key];else adv.gifts[key]=saved;}
            return{key,choices,gymChoices,default:baseline};
        };
        const chapters=S.CHAPTERS.map((c,id)=>{
            let reward=0,units=0,trainers=0;
            // Node expansion includes native league members and gym support trainers.
            // These are planning estimates, independent of a user's combat party.
            for(let trial=0;trial<8;trial++){
                A.buildChapter(id);
                for(const node of adv.nodes){
                    reward+=rewardFor(node,!!c.league);
                    const enemies=node.type==='gym'?S.gymTeam(id,node.gym).length:node.team?.length||node.size||1;
                    units+=['wild','trainer','gym','static'].includes(node.type)?1+3*enemies:1;
                    if(node.type==='trainer')trainers++;
                }
            }
            const special=c.steps.filter(s=>['static','egg','trade'].includes(s.kind)).map(s=>Object.fromEntries(['kind','id','once','after','needs','needN','caught','skies','chance','offers','night','day'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]])));
            const gift=c.steps.filter(s=>s.kind==='gift').map(s=>{
                const choices=s.gift.choices||s.gift.items||[],variants=Object.fromEntries(Object.entries(s.byStarter||{}).filter(([,v])=>v?.gift).map(([id,v])=>[id,v.gift.choices||v.gift.items||[]]));
                return{key:s.gift.key,ids:[...new Set([...choices,...Object.values(variants).flat()])],...(s.badge?{badge:s.badge}:{}),...(Object.keys(variants).length?{byStarter:{key:s.byStarter.starter,default:choices,choices:variants}}:{})};
            });
            const threats=parts.teams.chapters.find(r=>r.id===id),foesByStarter=starterFoes(c,id,threats.foes);
            return{id,name:tr(c.name),reg:c.reg||'kanto',league:!!c.league,loop:A.loopKey(id),band:S.bandOf(id),ace:S.aceOf(id),reward:Math.round(reward/8),units:Math.round(units/8),trainers:Math.round(trainers/8),day:!!c.day,badges:c.steps.filter(s=>s.kind==='gym'&&s.badge).map(s=>s.badge),gifts:gift,special,
                ...parts.pools.chapters.find(r=>r.id===id),...parts.targets.chapters.find(r=>r.id===id),...threats,...(foesByStarter?{foesByStarter}:{}),shinyPools:parts.automation.chapters.find(r=>r.id===id).wild,leaders:parts.automation.chapters.find(r=>r.id===id).leaders,gymFoes:c.steps.filter(step=>step.kind==='gym').flatMap(step=>S.gymTeam(id,step))};
        });
        const targets=parts.targets,automation={...parts.automation};delete automation.build;delete automation.chapters;
        const {learns,chapters:ignored,build,...combat}=parts.teams;
        const snapshot={build:globalThis.BUILD,layout:adv.layout,generated:'2026-11-16',dexMax,mons,chapters,regions,zones:targets.zones,chart:t.TYPE_CHART,types:Object.fromEntries(Object.entries(t.TYPES).map(([key,value])=>[key,{...value,fr:tr(value.fr)}])),
            poolSchema:parts.pools.schema,items:targets.items,caps:targets.caps,xpThresholds:targets.xpThresholds,moneyFactors:targets.moneyFactors,economy:{...targets.economy,build:globalThis.BUILD,checked:'2026-11-16'},townCooldown:targets.townCooldown,tideMs:targets.tideMs,combat,automation};
        if(snapshot.chapters.length!==84||snapshot.mons.length<649)throw Error('Unexpected public snapshot shape');
        return JSON.stringify(snapshot);
    }finally{Object.assign(G.S,previous);for(const [region,wasOpen]of open)region.open=wasOpen;t.DAYTIME.force(oldPhase||null);t.WEATHER.force(oldWeather||null);Math.random=oldRandom;}
})();
