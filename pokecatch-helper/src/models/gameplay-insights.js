    function familyMembers(id) {
        const model=MONS.get(Number(id));
        if(!model)return [];
        const root=model.root??model.id;
        return DATA.mons.filter(mon=>(mon.root??mon.id)===root);
    }
    function moveLabel(key) {
        return MOVE_ADVICE_NAMES[key]||String(key||'').replaceAll('-',' ')||'无可用招式';
    }
    function insightRoster(s) {
        const byUid=new Map();
        for(const mon of collectionMembers(s)){
            if(mon.uid&&MONS.has(mon.id)&&!byUid.has(String(mon.uid)))byUid.set(String(mon.uid),mon);
        }
        return [...byUid.values()];
    }
    function insightAttack(mon,foe,stats,defense,weather,coverage) {
        const species=mon.id===132?foe.id:mon.id;
        const entries=damagingMoves(MONS.get(species)),banned=activeMoveBans(mon,entries);
        const candidates=[];
        let strongest=null;
        for(const {level,key,move} of entries){
            if(level>mon.level||banned?.includes(key))continue;
            const hit=expectedDamage(mon,foe,stats,defense,{weather,move:key,details:true,knockoutFloor:true});
            if(!(hit.knockoutFloor>0))continue;
            if(!strongest||hit.choice>strongest.choice)strongest=hit;
            candidates.push({hit,power:move.power});
        }
        if(!strongest)return expectedDamage(mon,foe,stats,defense,{weather,details:true});
        coverage?.ordinary.add(strongest.key);
        // Native finishers favour accuracy, then power, then the original learn order.
        candidates.sort((a,b)=>b.hit.accuracy-a.hit.accuracy||b.power-a.power);
        let selected=null,highestFloor=0,higherPriorityFloor=0,previous;
        for(const candidate of candidates){
            const {hit,power}=candidate;
            if(!selected&&hit.knockoutFloor>=defense.hp)selected=hit;
            if(coverage){
                if(!previous||previous.hit.accuracy!==hit.accuracy||previous.power!==power)higherPriorityFloor=highestFloor;
                // Protect accurate finishers at any remaining HP, including equally ranked choices.
                if(hit.knockoutFloor>higherPriorityFloor)coverage.finishers.add(hit.key);
                highestFloor=Math.max(highestFloor,hit.knockoutFloor);
                previous=candidate;
            }
        }
        return selected||strongest;
    }
    function routeMemberComparison(s,mons,chapterId=s?.adv?.chapter,now=Date.now()) {
        const chapter=CHAPTERS.get(chapterId);
        if(!s?.adv||!chapter)return null;
        const foes=chapterCombatFoes(s,chapter).filter(foe=>MONS.has(foe.id)&&foe.weight>0);
        const total=foes.reduce((n,foe)=>n+foe.weight,0);
        if(!total)return null;
        const context={kind:'map',id:chapter.id};
        const weather=combatWeather(s,{chapter:chapter.id},context,now).weather;
        const prepared=foes.map(foe=>({foe,stats:effectiveStats(foe),weight:foe.weight/total}));
        const members=mons.filter(mon=>mon&&MONS.has(mon.id)).map(mon=>{
            const stats=effectiveStats(mon),used=new Map(),coverage={ordinary:new Set(),finishers:new Set()};
            let damage=0,incoming=0,accuracy=0;
            for(const {foe,stats:enemy,weight} of prepared){
                const hit=insightAttack(mon,foe,stats,enemy,weather,coverage);
                const counter=insightAttack(foe,mon,enemy,stats,weather);
                damage+=hit.damage*weight;incoming+=counter.damage*weight;
                accuracy+=(hit.key?hit.accuracy:0)*weight;
                if(!hit.key)continue;
                const entry=used.get(hit.key)||{key:hit.key,type:hit.type,weight:0,damage:0,accuracy:hit.accuracy};
                entry.weight+=weight;entry.damage+=hit.damage*weight;used.set(hit.key,entry);
            }
            const moves=[...used.values()].sort((a,b)=>b.weight-a.weight||b.damage-a.damage);
            return {uid:mon.uid,id:mon.id,stats,damage,incoming,accuracy,moves,
                ordinaryMoves:[...coverage.ordinary],finishingMoves:[...coverage.finishers],
                endurance:incoming>0?stats.hp/incoming:null};
        });
        return{chapter:chapter.id,foes:foes.length,members};
    }
    function moveAdvice(mon,summary) {
        if(!mon||!MONS.has(mon.id))return [];
        const moveMap=new Map(),model=MONS.get(mon.id),stats=effectiveStats(mon);
        const recorded=new Set(Array.isArray(mon.ban)?mon.ban:[]);
        const active=new Set(activeMoveBans(mon,damagingMoves(model))||[]);
        const add=(level,key,status=false)=>{
            if(level>mon.level||moveMap.has(key))return;
            const move=DATA.combat.moves[key],effect=MOVE_ADVICE_EFFECTS[key];
            const type=move?.type||effect?.type;
            if(!type)return;
            const power=move?.power||0,accuracy=Number.isFinite(move?.acc)?move.acc/100:null;
            // The supplementary table stores secondary effect rates. A status-only move
            // uses its own accuracy and the native cap; the effect rate alone cannot supply it.
            const previewEffect=status&&effect?{...effect,chance:null}:effect;
            moveMap.set(key,{key,type,status,level,power,accuracy,effect:previewEffect,banned:active.has(key),recorded:recorded.has(key),
                category:move?.cat||'status',score:power*accuracy*(move?.cat==='phys'?stats.atk:stats.spa)});
        };
        for(const [level,key] of model.learn||[])add(level,key);
        for(const [level,key] of MOVE_ADVICE_STATUS_LEARN[mon.id]||[])add(level,key,true);
        for(const key of [mon.counter,mon.burst])if(typeof key==='string')add(0,key);
        const rows=[...moveMap.values()],best=new Map();
        for(const row of rows){
            if(!row.power)continue;
            const key=row.type+'/'+row.category;
            const rival=best.get(key);
            if(!rival||row.score>rival.score)best.set(key,row);
        }
        const used=new Set((summary?.moves||[]).map(move=>move.key));
        const effects={burn:'灼伤',paralysis:'麻痹',poison:'中毒',freeze:'冰冻',sleep:'睡眠',confusion:'混乱',tri:'随机异常'};
        return rows.map(row=>{
            const rival=best.get(row.type+'/'+row.category),type=DATA.types[row.type]?.fr||row.type;
            let reason,action='keep';
            if(row.banned)reason='这只宝可梦已在游戏中禁用此招。';
            else if(row.key===mon.counter||row.key===mon.burst)reason='保留专用反击或爆发招式';
            else if(row.effect)reason=(row.status?'变化招':'附加状态')+' · '+(effects[row.effect.kind]||row.effect.kind)+
                (row.status?'':' '+row.effect.chance+'%');
            else if(used.has(row.key))reason='此路线会选用，保留对敌方的有效打点';
            else if(summary?.finishingMoves?.includes(row.key))reason='对手剩余 HP 较低时可优先选用的收尾招式';
            else if(summary?.ordinaryMoves?.includes(row.key))reason='未达到必杀线时的有效打点，保留';
            else if(row.key==='transform'||row.key==='struggle'||MULTI_HIT_DATA.moves[row.key])reason='保留特殊机制或多段攻击';
            else if(rival===row)reason='保留'+type+'系'+(row.category==='phys'?'物理':'特殊')+'打点';
            else if(!summary?.finishingMoves||!summary?.ordinaryMoves)reason='尚未完整评估路线，保留';
            else if(mon.rageMax!=null||mon.counter||mon.burst)reason='反击或爆发的实际选招取决于战况，保留';
            else if(!row.banned&&rival&&!rival.banned&&rival.score>row.score&&
                (row.accuracy<=rival.accuracy||rival.score>=row.score*1.2)){
                action='consider';reason='本路线未选用；'+moveLabel(rival.key)+' 同属性同类别，期望威力更高'+
                    (rival.accuracy<row.accuracy?'，替代招命中低 '+Math.round((row.accuracy-rival.accuracy)*100)+' 个百分点':'且命中不低');
            }else reason='保留命中率、属性覆盖或已有选择';
            if(row.recorded&&!row.banned){action='keep';reason='所有可用攻击均被勾选禁用，游戏自动恢复可用招式。'+reason;}
            return{...row,action,reason};
        });
    }
