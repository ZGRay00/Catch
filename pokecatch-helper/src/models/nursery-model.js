    // Public launcher builds paired with the hashed application bundles checked by the native nursery differentials.
    // These functions read decoded saves. They never consume a roll, save or game action.
    const NURSERY_BUILDS=Object.freeze({
        '6e45170313':'0a26d39c19','84beed0145':'c9b850cf68','ac708615ae':'a5299b1690',
        'c742526349':'c8fb8b2e96','0a7dcb2280':'1125894b9a','3bdd8140e1':'b221fce46b','f01c6dd773':'aa84889c89',
        '023c732f7b':'7d13a92510','c8584bf7ba':'7d13a92510'
    });
    const NURSERY_RULES = Object.freeze({build:NURSERY_BUILDS['0a7dcb2280'],compatibleBuilds:Object.freeze([...new Set(Object.values(NURSERY_BUILDS))]),
        hashSalt:[24348,41597,15337,49222],baseRate:1/512,parentRate:1/16,legacyParentRate:.1,
        berryMultiplier:2,berry:'belue-berry',ditto:132,eggMs:14400000,hatchMs:14400000,maxEggs:4,
        noEgg:[137,442,479,47901,47902,47903,47904,47905,556],lays:{489:489,490:489}});
    const NURSERY_LINEAGE = {"prevo":{"2":1,"3":2,"5":4,"6":5,"8":7,"9":8,"11":10,"12":11,"14":13,"15":14,"17":16,"18":17,"20":19,"22":21,"24":23,"25":172,"26":25,"28":27,"30":29,"31":30,"33":32,"34":33,"35":173,"36":35,"38":37,"39":174,"40":39,"42":41,"44":43,"45":44,"47":46,"49":48,"51":50,"53":52,"55":54,"57":56,"59":58,"61":60,"62":61,"64":63,"65":64,"67":66,"68":67,"70":69,"71":70,"73":72,"75":74,"76":75,"78":77,"80":79,"82":81,"85":84,"87":86,"89":88,"91":90,"93":92,"94":93,"97":96,"99":98,"101":100,"103":102,"105":104,"106":236,"107":236,"110":109,"112":111,"113":440,"117":116,"119":118,"121":120,"122":439,"124":238,"125":239,"126":240,"130":129,"134":133,"135":133,"136":133,"139":138,"141":140,"143":446,"148":147,"149":148,"153":152,"154":153,"156":155,"157":156,"159":158,"160":159,"162":161,"164":163,"166":165,"168":167,"169":42,"171":170,"176":175,"178":177,"180":179,"181":180,"182":44,"183":298,"184":183,"185":438,"186":61,"188":187,"189":188,"192":191,"195":194,"196":133,"197":133,"199":79,"202":360,"205":204,"208":95,"210":209,"212":123,"217":216,"219":218,"221":220,"224":223,"226":458,"229":228,"230":117,"232":231,"233":137,"237":236,"242":113,"247":246,"248":247,"253":252,"254":253,"256":255,"257":256,"259":258,"260":259,"262":261,"264":263,"266":265,"267":266,"268":265,"269":268,"271":270,"272":271,"274":273,"275":274,"277":276,"279":278,"281":280,"282":281,"284":283,"286":285,"288":287,"289":288,"291":290,"292":290,"294":293,"295":294,"297":296,"301":300,"305":304,"306":305,"308":307,"310":309,"315":406,"317":316,"319":318,"321":320,"323":322,"326":325,"329":328,"330":329,"332":331,"334":333,"340":339,"342":341,"344":343,"346":345,"348":347,"350":349,"354":353,"356":355,"358":433,"362":361,"364":363,"365":364,"367":366,"368":366,"372":371,"373":372,"375":374,"376":375,"388":387,"389":388,"391":390,"392":391,"394":393,"395":394,"397":396,"398":397,"400":399,"402":401,"404":403,"405":404,"407":315,"409":408,"411":410,"413":412,"414":412,"416":415,"419":418,"421":420,"423":422,"424":190,"426":425,"428":427,"429":200,"430":198,"432":431,"435":434,"437":436,"444":443,"445":444,"448":447,"450":449,"452":451,"454":453,"457":456,"460":459,"461":215,"462":82,"463":108,"464":112,"465":114,"466":125,"467":126,"468":176,"469":193,"470":133,"471":133,"472":207,"473":221,"474":233,"475":281,"476":299,"477":356,"478":361,"496":495,"497":496,"499":498,"500":499,"502":501,"503":502,"505":504,"507":506,"508":507,"510":509,"512":511,"514":513,"516":515,"518":517,"520":519,"521":520,"523":522,"525":524,"526":525,"528":527,"530":529,"533":532,"534":533,"536":535,"537":536,"541":540,"542":541,"544":543,"545":544,"547":546,"549":548,"552":551,"553":552,"555":554,"558":557,"560":559,"563":562,"565":564,"567":566,"569":568,"571":570,"573":572,"575":574,"576":575,"578":577,"579":578,"581":580,"583":582,"584":583,"586":585,"589":588,"591":590,"593":592,"596":595,"598":597,"600":599,"601":600,"603":602,"604":603,"606":605,"608":607,"609":608,"611":610,"612":611,"614":613,"617":616,"620":619,"623":622,"625":624,"628":627,"630":629,"634":633,"635":634,"637":636,"41301":41201,"41302":41202,"42301":42201},"formBase":{"35101":351,"35102":351,"35103":351,"38601":386,"38602":386,"38603":386,"41201":412,"41202":412,"41301":413,"41302":413,"42201":422,"42301":423,"47901":479,"47902":479,"47903":479,"47904":479,"47905":479,"48701":487,"49201":492,"49301":493,"49302":493,"49303":493,"49304":493,"49305":493,"49306":493,"49307":493,"49308":493,"49309":493,"49310":493,"49311":493,"49312":493,"49313":493,"49314":493,"49315":493,"49316":493,"64101":641,"64201":642,"64501":645,"64601":646,"64602":646,"64801":648,"64901":649,"64902":649,"64903":649,"64904":649},"formEgg":{"41201":41201,"41202":41202,"41301":41201,"41302":41202},"numbers":{"20101":201,"20102":201,"20103":201,"20104":201,"20105":201,"20106":201,"20107":201,"20108":201,"20109":201,"20110":201,"20111":201,"20112":201,"20113":201,"20114":201,"20115":201,"20116":201,"20117":201,"20118":201,"20119":201,"20120":201,"20121":201,"20122":201,"20123":201,"20124":201,"20125":201,"20126":201,"20127":201,"35101":351,"35102":351,"35103":351,"38601":386,"38602":386,"38603":386,"41201":412,"41202":412,"41301":413,"41302":413,"42201":422,"42301":423,"47901":479,"47902":479,"47903":479,"47904":479,"47905":479,"48701":487,"49201":492,"49301":493,"49302":493,"49303":493,"49304":493,"49305":493,"49306":493,"49307":493,"49308":493,"49309":493,"49310":493,"49311":493,"49312":493,"49313":493,"49314":493,"49315":493,"49316":493,"64101":641,"64201":642,"64501":645,"64601":646,"64602":646,"64801":648,"64901":649,"64902":649,"64903":649,"64904":649,"90025":25}};
    function nurseryHash(value){
        const text=String(value),salt=NURSERY_RULES.hashSalt;
        let left=1779033703^(salt[0]<<16|salt[1]),right=3144134277^(salt[2]<<16|salt[3]);
        for(let i=0;i<text.length;i++){const unit=text.charCodeAt(i);left=Math.imul(left^unit,2654435761);right=Math.imul(right^unit,1597334677);}
        left=Math.imul(left^left>>>16,2246822507)^Math.imul(right^right>>>13,3266489909);
        right=Math.imul(right^right>>>16,2246822507)^Math.imul(left^left>>>13,3266489909);
        return(4294967296*(2097151&right)+(left>>>0))/9007199254740992;
    }
    function nurserySeed(s){
        const trainer=s?.trainer;
        if(!trainer||!Object.hasOwn(trainer,'id')||!Object.hasOwn(trainer,'since'))return null;
        if(!['string','number'].includes(typeof trainer.id)||!['string','number'].includes(typeof trainer.since)||String(trainer.id)===''||String(trainer.since)==='')return null;
        if(typeof trainer.id==='number'&&!Number.isFinite(trainer.id)||typeof trainer.since==='number'&&!Number.isFinite(trainer.since))return null;
        return`${trainer.since}:${trainer.id}`;
    }
    function nurseryFixedRoll(s,k,draw=0){
        const seed=nurserySeed(s);
        return seed===null||!Number.isSafeInteger(k)||k<0||!Number.isSafeInteger(draw)||draw<0?null:nurseryHash(`${seed}|egg|${k}|${draw}`);
    }
    function nurseryFlag(value){return value===true||value===false||value===1||value===0;}
    function nurseryEggRate(egg={}){
        // Native eggRate coerces old parent markers numerically; compact/imported eggs may carry "1" or "2".
        if(!egg||typeof egg!=='object'||(Object.hasOwn(egg,'sp')&&!nurseryFlag(egg.sp)&&egg.sp!==2&&egg.sp!=='1'&&egg.sp!=='2')||
            (Object.hasOwn(egg,'bx')&&!nurseryFlag(egg.bx)))return null;
        const parent=egg.sp?(Number(egg.sp)===2?NURSERY_RULES.parentRate:NURSERY_RULES.legacyParentRate):0;
        return Math.max(NURSERY_RULES.baseRate,parent)*(egg.bx?NURSERY_RULES.berryMultiplier:1);
    }
    function nurseryOffspringId(s,parent){
        let id=typeof parent==='object'?parent?.id:parent;
        if(!Number.isInteger(id)||!MONS.has(id))return null;
        if(NURSERY_RULES.lays[id]!=null)return NURSERY_RULES.lays[id];
        if(NURSERY_LINEAGE.formEgg[id]!=null)return NURSERY_LINEAGE.formEgg[id];
        id=NURSERY_LINEAGE.formBase[id]??id;
        const current=DATA.chapters.find(chapter=>chapter.id===s?.adv?.chapter)?.reg;
        const open=new Set(['kanto',...(s?.travel?.to||[]),s?.link?.to,current]);
        const available=value=>{
            const base=NURSERY_LINEAGE.formBase[value]??value,num=NURSERY_LINEAGE.numbers[base]??base;
            return DATA.regions.some(region=>open.has(region.key)&&region.dexRange&&num>=region.dexRange[0]&&num<=region.dexRange[1]);
        };
        const seen=new Set();
        while(NURSERY_LINEAGE.prevo[id]!=null&&available(NURSERY_LINEAGE.prevo[id])){
            if(seen.has(id))return null;seen.add(id);id=NURSERY_LINEAGE.prevo[id];
        }
        return id;
    }
    function nurseryEggKey(s,egg){
        if(egg?.uid!=null&&String(egg.uid)!=='')return'uid:'+String(egg.uid);
        const seed=nurserySeed(s);
        if(Number.isSafeInteger(egg?.k)&&egg.k>=0&&seed!==null)return'k:'+nurseryHash(seed).toString(16)+':'+egg.k;
        return egg?.laidAt!=null?'legacy:'+String(egg.laidAt):null;
    }
    function eggOutcome(s,egg,options={}){
        const unverified=!!options.build&&!NURSERY_RULES.compatibleBuilds.includes(options.build);
        const rate=egg&&typeof egg==='object'?nurseryEggRate(egg):null,key=nurseryEggKey(s,egg);
        const rateVerified=rate!==null&&!unverified;
        const unknown=reason=>({certainty:'unknown',known:false,shiny:null,rate,rateVerified,source:'unknown',key,reason});
        if(!egg||typeof egg!=='object')return unknown('蛋数据不可用');
        if(Object.hasOwn(egg,'shiny')){
            if(!nurseryFlag(egg.shiny))return unknown('存档的蛋闪色标记无法识别');
            return{certainty:'saved',known:true,shiny:!!egg.shiny,rate:egg.shiny?1:0,mechanismRate:rate,rateVerified,source:'saved',key};
        }
        if(rate===null)return unknown('存档的异色亲本或靛莓果标记无法识别');
        if(unverified)return unknown('当前游戏构建尚未核对确定性蛋规则');
        let roll,source;
        if(Number.isInteger(egg.k)){
            roll=nurseryFixedRoll(s,egg.k);source='counter';
            if(roll===null)return unknown('训练家种子或蛋序号不完整，未推测结果');
        }else{
            const legacy=egg.uid??egg.laidAt;
            if(legacy==null||String(legacy)==='')return unknown('旧蛋缺少可核对的 UID 或产蛋时间');
            roll=nurseryHash(String(legacy));source='legacy';
        }
        return{certainty:'deterministic',known:true,shiny:roll<rate,rate,rateVerified:true,roll,source,key};
    }
    function breedableOffspring(s, mon) {
        if (!mon || mon.noEgg || mon.id === NURSERY_RULES.ditto || NURSERY_RULES.noEgg.includes(mon.id) ||
            !DATA.automation.breed[mon.id]?.can) return null;
        return nurseryOffspringId(s, mon);
    }
    function nurseryParentPool(s){
        const rows=s?.pension?.mons;
        if(!Array.isArray(rows))return{known:false,parents:[],hasDitto:false,reason:'培育屋亲本列表不可用'};
        const parents=[];let hasDitto=false;
        for(let index=0;index<rows.length;index++){
            const mon=rows[index]?.mon,model=mon&&DATA.automation?.breed?.[mon.id];
            if(!mon||!Number.isInteger(mon.id)||!MONS.has(mon.id)||!model||typeof model.can!=='boolean')return{known:false,parents:[],hasDitto,reason:'有亲本不在已核对物种表中'};
            if(mon.id===NURSERY_RULES.ditto){hasDitto=true;continue;}
            const eggId = breedableOffspring(s, mon);
            if (eggId == null) continue;
            if(Object.hasOwn(mon,'shiny')&&!nurseryFlag(mon.shiny))return{known:false,parents:[],hasDitto,reason:'可繁殖亲本的异色标记无法识别'};
            parents.push({id:mon.id,eggId,uid:mon.uid??null,shiny:!!mon.shiny,index,slot:index+1});
        }
        return{known:true,parents,hasDitto,reason:!hasDitto?'需要百变怪才能自然产蛋':!parents.length?'没有可繁殖亲本':null};
    }
    function nurseryForecast(s,options={}){
        const scan=nurseryForecastSteps(s,options);
        let step;
        do{step=scan.next();}while(!step.done);
        return step.value;
    }
    function* nurseryForecastSteps(s,options={}){
        const limit=Number.isFinite(+options.limit)?Math.max(1,Math.min(50000,Math.floor(+options.limit))):20000;
        const pool=nurseryParentPool(s),pension=s?.pension,seed=nurserySeed(s);
        const berryKnown=!pension||!Object.hasOwn(pension,'bx')||nurseryFlag(pension.bx),pendingBerry=berryKnown?!!pension?.bx:null;
        const unverified=!!options.build&&!NURSERY_RULES.compatibleBuilds.includes(options.build);
        let laid=pension?.laid,counterSource=null;
        if(Number.isSafeInteger(laid)&&laid>=0)counterSource='saved';
        else if(laid==null&&!unverified&&Number.isSafeInteger(s?.stats?.hatched)&&s.stats.hatched>=0&&Array.isArray(pension?.eggs)){
            // The game's first egg allocation on a legacy save initializes this
            // counter before incrementing it. Do not use this to backfill history.
            laid=s.stats.hatched+pension.eggs.length;
            if(Number.isSafeInteger(laid))counterSource='native-initializer';
        }
        // Prior to drawing a parent, every eligible slot is equally likely, including
        // duplicate species. Ditto enables breeding but never contributes a shiny rate.
        const nextRate=berryKnown&&pool.known&&pool.hasDitto&&pool.parents.length?
            pool.parents.reduce((sum,parent)=>sum+nurseryEggRate({sp:parent.shiny?2:0,bx:pendingBerry}),0)/pool.parents.length:null;
        const result={certainty:'unavailable',known:false,active:false,build:NURSERY_RULES.build,counter:counterSource?laid:null,counterSource,
            nextRate,rateVerified:!unverified,
            limit,scanned:0,pool:pool.parents,hasDitto:pool.hasDitto,pendingBerry,nextEgg:null,nextShiny:null,hits:[],
            firstWithoutBerry:null,firstBerryOnly:null,
            assumptions:['亲本顺序与异色状态保持不变','期间没有赠送蛋等其他来源占用蛋序号','只计现有待用靛莓果，不假设后续自动喂果','距离指自然产蛋次数，不是孵化次数或保底进度'],
            scenarios:{plainParents:{hypothetical:true,nextShiny:null},shinyParents:{hypothetical:true,nextShiny:null},berryNext:{hypothetical:true,nextShiny:null}}};
        const reject=reason=>({...result,reason});
        if(unverified&&!options.estimateUnverified)return reject('当前游戏构建尚未核对确定性蛋规则');
        if(!pool.known)return reject(pool.reason);
        if(!berryKnown)return reject('待用靛莓果标记无法识别');
        if(seed===null)return reject('训练家 ID 或创建时间缺失，未使用空种子预测');
        if(result.counter===null)return reject('下一蛋序号缺失或异常，等待游戏自身初始化');
        if(!pool.hasDitto||!pool.parents.length)return reject(pool.reason);
        if(laid>Number.MAX_SAFE_INTEGER-limit)return reject('蛋序号超出安全整数范围');
        result.known=!unverified;result.estimated=unverified;result.active=true;
        result.certainty=unverified?'reference':'conditional';
        const keep=Number.isFinite(+options.count)?Math.max(1,Math.min(20,Math.floor(+options.count))):3;
        const prefix=seed+'|egg|',scenarios=result.scenarios;
        for(let offset=0;offset<limit;offset++){
            if(offset>0&&offset%64===0)yield;
            const k=laid+offset,drawPrefix=prefix+k+'|',roll=nurseryHash(drawPrefix+'0');
            result.scanned=offset+1;
            // A conditional berry window can reach 1/8 with a shiny parent.
            const ceiling=result.firstBerryOnly?NURSERY_RULES.parentRate:NURSERY_RULES.parentRate*NURSERY_RULES.berryMultiplier;
            if(offset>0&&roll>=ceiling)continue;
            const parentIndex=pool.parents.length===1?0:Math.floor(nurseryHash(drawPrefix+'1')*pool.parents.length);
            const parent=pool.parents[parentIndex],bx=offset===0&&pendingBerry;
            const rate=nurseryEggRate({sp:parent.shiny?2:0,bx}),row={k,offset,position:offset+1,eggId:parent.eggId,parent:{...parent},rate,roll,bx,shiny:roll<rate};
            const withoutBerry=parent.shiny?NURSERY_RULES.parentRate:NURSERY_RULES.baseRate;
            if(!result.firstWithoutBerry&&roll<withoutBerry)result.firstWithoutBerry={k,position:offset+1,eggId:parent.eggId};
            if(!result.firstBerryOnly&&roll>=withoutBerry&&roll<withoutBerry*NURSERY_RULES.berryMultiplier){
                result.firstBerryOnly={k,position:offset+1,eggId:parent.eggId};
            }
            if(offset===0){
                // Hold the egg number and the pending berry fixed while changing
                // only the selected parent's shiny status.
                const plainRate=nurseryEggRate({bx}),shinyRate=nurseryEggRate({sp:2,bx});
                const withBerry=withoutBerry*NURSERY_RULES.berryMultiplier;
                result.nextEgg={...row,withoutBerryShiny:roll<withoutBerry,withBerryShiny:roll<withBerry,
                    parentEffect:roll<plainRate?'always-shiny':roll<shinyRate?'depends':'always-plain'};
            }
            if(row.shiny&&result.hits.length<keep)result.hits.push(row);
            for(const key of Object.keys(scenarios)){
                if(scenarios[key].nextShiny)continue;
                const shinyParent=key==='berryNext'?parent.shiny:key==='shinyParents';
                const berry=key==='berryNext'?offset===0:bx;
                const threshold=nurseryEggRate({sp:shinyParent?2:0,bx:berry});
                if(roll<threshold)scenarios[key].nextShiny={...row,parent:{...parent,shiny:shinyParent},bx:berry,rate:threshold,shiny:true,hypothetical:true};
            }
            if(result.hits.length>=keep&&result.firstWithoutBerry&&result.firstBerryOnly&&scenarios.plainParents.nextShiny&&scenarios.shinyParents.nextShiny&&scenarios.berryNext.nextShiny)break;
        }
        result.nextShiny=result.hits[0]||null;result.truncated=!result.nextShiny;
        result.reason=result.nextShiny?'按当前亲本池核对的自然产蛋序列；条件变化时重新计算':'扫描范围内尚未找到；不代表之后不会出现';
        return result;
    }
    function nurserySnapshot(s,options={}){
        const now=Number.isFinite(options.now)?options.now:Date.now(),eggs=Array.isArray(s?.pension?.eggs)?s.pension.eggs:[];
        const eggRows=eggs.map(egg=>{const outcome=eggOutcome(s,egg,options),readyKnown=Number.isFinite(egg?.hatchAt);return{uid:egg?.uid??null,id:egg?.id??null,k:egg?.k??null,laidAt:egg?.laidAt??null,hatchAt:egg?.hatchAt??null,
            berryApplied:egg?.bx===undefined?false:nurseryFlag(egg.bx)?!!egg.bx:null,
            readyKnown,ready:readyKnown&&now>=egg.hatchAt,remainingMs:readyKnown?Math.max(0,egg.hatchAt-now):null,...outcome};});
        const total=eggRows.length,known=eggRows.filter(row=>row.known).length,shiny=eggRows.filter(row=>row.known&&row.shiny).length;
        const capacity=Math.min(NURSERY_RULES.maxEggs,Math.max(1,total,Number(s?.pension?.open?.eggs)||1));
        return{eggRows,counts:{total,known,shiny,unknown:total-known,ready:eggRows.filter(row=>row.ready).length},capacity,
            hatched:Number.isSafeInteger(s?.stats?.hatched)&&s.stats.hatched>=0?s.stats.hatched:null,
            counter:Number.isSafeInteger(s?.pension?.laid)&&s.pension.laid>=0?s.pension.laid:null,
            forecast:options.forecast===false?null:nurseryForecast(s,options)};
    }
