// Evaluated only against the isolated public game runtime, never against a user's game.
(() => {
    const t=__pcResearch,G=t.Game,S=t.STORY,A=t.Adventure,C=t.CONFIG;
    if(!G.S)G.load();A.ensure();const previous={day:t.DAYTIME.forced,weather:t.WEATHER.forced};
    const chapters=[];
    try{
        for(const [id,c]of S.CHAPTERS.entries()){
            const wild={};const routes=c.steps.filter(n=>n.kind==='route');
            for(const phase of ['morning','day','night']){
                t.DAYTIME.force(phase);const hits=new Map();
                for(const sky of ['clear',...Object.keys(C.WEATHER.TYPES)]){
                    t.WEATHER.force(sky==='clear'?'none':sky);const per=new Map();
                    routes.forEach((route,i)=>{if(!route.wild)return;for(const m of A.zonePool({...route,ch:id,lv:route.lv||S.routeBand(id,i,routes.length)},id,true,null,true)){
                        if(m.on===false||G.DEX[m.id]?.legendary||G.DEX[m.id]?.mythical)continue;
                        const key=m.id+'|'+(m.when||[]).join(',');const row=per.get(key)||{id:m.id,n:0,when:m.when||[]};row.n+=route.wild*m.pct;per.set(key,row);
                    }});
                    for(const[key,row]of per){const old=hits.get(key)||{id:row.id,best:0,clear:0,when:row.when};old.best=Math.max(old.best,row.n);if(sky==='clear')old.clear=row.n;hits.set(key,old);}
                }
                wild[phase]=[...hits.values()].map(m=>[m.id,+m.best.toFixed(6),+m.clear.toFixed(6),m.when]);
            }
            chapters.push({id,wild,leaders:c.steps.filter(n=>n.kind==='gym').map(n=>`${id}:${n.leader}`)});
        }
        return JSON.stringify({build:BUILD,chapters,breed:Object.fromEntries(t.POKEDEX.map(m=>[m.id,{can:G.canLay({id:m.id}),egg:C.PENSION.LAYS[m.id]??t.FORMS?.eggOf?.(m.id)??G.famHead(m.id)}])),
            shop:C.SHOP.map(item=>({id:item.id,name:t.I18n.t(t.ITEM_NAMES[item.id]||item.id),price:item.price,amount:item.amount||1,qty:!!item.qty,once:item.once,region:item.region})),
            candies:(()=>{const link=G.S.link;try{return Object.fromEntries(Object.entries(C.EXP_CANDIES).map(([id,info])=>[id,{badges:info.badges,xp:Object.fromEntries(S.REGIONS.filter(reg=>reg.ace).map(reg=>{G.S.link={side:'from',from:reg.key};return[reg.key,G.expCandyXp(id)];}))}]));}finally{G.S.link=link;}})(),
            buffs:C.BUFF_BERRIES,buffMinutes:C.BUFF_MIN,buffStack:C.BUFF_STACK,pension:{slots:C.PENSION.SLOTS,incubator:C.PENSION.INCUBATOR,slotShop:C.PENSION.SLOT_SHOP,incubatorShop:C.PENSION.INCUBATOR_SHOP,hatchMinutes:C.PENSION.HATCH_MIN},
            under:{team:C.UNDERGROUND.TEAM,perDay:C.UNDERGROUND.PER_DAY,slots:C.UNDERGROUND.SLOTS},world:{perDay:C.WORLDBOSS.PER_DAY,team:C.WORLDBOSS.TEAM},travel:S.REGIONS.filter(r=>r.key).map(r=>({key:r.key,requires:r.after||null})),
            levels:{raid:C.RAID.LEVEL,underMax:Math.min(100,Math.round(C.UNDERGROUND.LV0+(C.UNDERGROUND.FLOORS-1)*C.UNDERGROUND.STEP)),towerStart:C.TOWER.LEVEL_START,towerStep:C.TOWER.LEVEL_STEP,towerMax:C.TOWER.LEVEL_MAX}});
    }finally{t.DAYTIME.force(previous.day||null);t.WEATHER.force(previous.weather||null);}
})();
