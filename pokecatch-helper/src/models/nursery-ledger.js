    // Account-local observations only. Native saves and task checkpoints are never changed here.
    const NURSERY_LEDGER_LIMITS=Object.freeze({active:32,pending:32,credits:32,seen:256,recent:64,events:40,windowMs:120000});
    class NurseryLedger {
        constructor(saved={}) {
            const limits=NURSERY_LEDGER_LIMITS,object=value=>value&&typeof value==='object'&&!Array.isArray(value);
            const number=value=>Number.isFinite(value)&&value>=0?Math.min(1e12,Math.floor(value)):0;
            const keys=value=>Array.isArray(value)?[...new Set(value.filter(key=>typeof key==='string'&&key.length>0&&key.length<=300))].slice(-limits.seen):[];
            saved=object(saved)&&saved.schema===1?saved:{};
            this.initialized=saved.initialized===true;this.dirty=false;this.stats=NurseryLedger.emptyStats();
            for(const key of Object.keys(this.stats))this.stats[key]=number(saved.stats?.[key]);
            this.stats.shinyObserved=Math.min(this.stats.shinyObserved,this.stats.eggsObserved);
            this.stats.plainObserved=Math.min(this.stats.plainObserved,this.stats.eggsObserved-this.stats.shinyObserved);
            this.stats.unknownObserved=this.stats.eggsObserved-this.stats.shinyObserved-this.stats.plainObserved;
            this.stats.shinyHatched=Math.min(this.stats.shinyHatched,this.stats.hatched);
            this.stats.plainHatched=Math.min(this.stats.plainHatched,this.stats.hatched-this.stats.shinyHatched);
            this.stats.unknownHatched=this.stats.hatched-this.stats.shinyHatched-this.stats.plainHatched;
            this.nativeHatched=Number.isFinite(saved.nativeHatched)&&saved.nativeHatched>=0?number(saved.nativeHatched):null;
            const startedAt=saved.segment?.startedAt;
            this.segment={ordinal:number(saved.segment?.ordinal),startedAt:Number.isSafeInteger(startedAt)&&startedAt>=0&&startedAt<=8.64e15?startedAt:null,reason:typeof saved.segment?.reason==='string'?saved.segment.reason.slice(0,80):'initial',generation:typeof saved.segment?.generation==='string'?saved.segment.generation.slice(0,400):''};
            this.active=[...new Map((Array.isArray(saved.active)?saved.active:[]).slice(0,limits.active).map(NurseryLedger.cleanRecord).filter(Boolean).map(row=>[row.key,row])).values()];
            this.pending=[...new Map((Array.isArray(saved.pending)?saved.pending:[]).slice(0,limits.pending).map(row=>{
                const record=NurseryLedger.cleanRecord(row);return record&&Number.isFinite(row.at)&&row.at>=0?{...record,at:row.at}:null;
            }).filter(Boolean).map(row=>[row.key,row])).values()];
            this.credits=(Array.isArray(saved.credits)?saved.credits:[]).slice(-limits.credits).map(row=>object(row)&&Number.isFinite(row.at)&&row.at>=0&&number(row.count)>0?{count:number(row.count),at:row.at,keys:keys(row.keys).slice(0,limits.active*2)}:null).filter(Boolean);
            this.seen=keys(saved.seen);this.resolved=keys(saved.resolved);this.sequence=number(saved.sequence);
            this.recent=(Array.isArray(saved.recent)?saved.recent:[]).slice(0,limits.recent).map(row=>{
                const record=NurseryLedger.cleanRecord(row);return record&&['hatched','unconfirmed'].includes(row.status)&&Number.isFinite(row.at)?{...record,status:row.status,at:Math.max(0,row.at)}:null;
            }).filter(Boolean);
            this.events=(Array.isArray(saved.events)?saved.events:[]).slice(0,limits.events).filter(row=>object(row)&&typeof row.type==='string'&&typeof row.text==='string'&&Number.isFinite(row.at)).map(row=>({sequence:number(row.sequence),segment:number(row.segment),at:Math.max(0,row.at),type:row.type.slice(0,80),text:row.text.slice(0,240)}));
            // Older readers capped modern millisecond timestamps at 10^12 when restoring counters.
            // Baseline events retained the original timestamp. A later event cannot date the start.
            if(this.initialized&&(this.segment.startedAt===1e12||this.segment.startedAt===null)){
                const start=this.events.find(event=>event.segment===this.segment.ordinal&&['baseline','segment-reset'].includes(event.type)
                    &&Number.isSafeInteger(event.at)&&event.at>=0&&event.at<=8.64e15);
                this.segment.startedAt=start?.at??null;
                if(this.segment.startedAt!==startedAt)this.dirty=true;
            }
        }
        static emptyStats(){return{eggsObserved:0,shinyObserved:0,plainObserved:0,unknownObserved:0,hatched:0,shinyHatched:0,plainHatched:0,unknownHatched:0,unconfirmedDisappearances:0};}
        static cleanRecord(row){
            if(!row||typeof row!=='object'||typeof row.key!=='string'||!row.key||row.key.length>300)return null;
            const known=row.known===true&&typeof row.shiny==='boolean';
            return{key:row.key,uid:typeof row.uid==='string'?row.uid.slice(0,180):null,id:Number.isInteger(row.id)&&row.id>0?row.id:null,known,shiny:known?row.shiny:null,source:typeof row.source==='string'?row.source.slice(0,40):'unknown',egg:row.egg&&typeof row.egg==='object'?NurseryLedger.eggEvidence(row.egg):null,
                ...(row.unclassifiedObservation===true?{unclassifiedObservation:true}:{})};
        }
        static eggEvidence(egg){
            const out={};for(const key of ['uid','id','k','sp','bx','laidAt','hatchAt','reg','shiny']){
                const value=egg[key];if(Object.hasOwn(egg,key)&&(value===null||['string','number','boolean'].includes(typeof value)))out[key]=typeof value==='string'?value.slice(0,240):value;
            }
            // Absence has a native default. An unreadable flag must stay unknown after a reload.
            for(const flag of ['shiny','sp','bx']){
                if(Object.hasOwn(egg,flag)&&!Object.hasOwn(out,flag))out[flag]=null;
            }
            return out;
        }
        static generation(s){
            const t=s?.trainer||{},scalar=value=>['string','number'].includes(typeof value)?String(value).slice(0,180):'';
            return scalar(t.id)+'|'+scalar(t.since);
        }
        static records(s,options={}){
            const rows=new Map();
            for(const egg of (Array.isArray(s?.pension?.eggs)?s.pension.eggs:[]).slice(0,NURSERY_LEDGER_LIMITS.active)){
                if(!egg||typeof egg!=='object')continue;
                let outcome;try{outcome=eggOutcome(s,egg,options);}catch{outcome={known:false,shiny:null,source:'unknown',key:null};}
                const uid=['string','number'].includes(typeof egg.uid)&&String(egg.uid).length>0?String(egg.uid).slice(0,180):null;
                const fallback=typeof outcome?.key==='string'&&outcome.key.length<=280?outcome.key:null,key=uid?'uid:'+uid:fallback?'outcome:'+fallback:null;
                if(!key)continue;
                const known=outcome?.known===true&&typeof outcome.shiny==='boolean',record={key,uid,id:Number.isInteger(egg.id)&&egg.id>0?egg.id:null,known,shiny:known?outcome.shiny:null,source:typeof outcome?.source==='string'?outcome.source:'unknown',egg:NurseryLedger.eggEvidence(egg)};
                // Duplicate identities cannot establish the origin of a hatch.
                if(rows.has(key)){record.known=false;record.shiny=null;record.source='duplicate';}
                rows.set(key,record);
            }
            return [...rows.values()];
        }
        event(type,text,now){
            this.events.unshift({sequence:++this.sequence,segment:this.segment.ordinal,at:now,type,text});
            this.events.length=Math.min(this.events.length,NURSERY_LEDGER_LIMITS.events);this.dirty=true;
        }
        remember(list,key){const at=list.indexOf(key);if(at>=0)list.splice(at,1);list.push(key);if(list.length>NURSERY_LEDGER_LIMITS.seen)list.shift();}
        baseline(s,now,reason,options={}){
            const previous=this.segment.ordinal;this.segment={ordinal:previous+1,startedAt:now,reason,generation:NurseryLedger.generation(s)};
            this.stats=NurseryLedger.emptyStats();this.nativeHatched=Number.isFinite(s?.stats?.hatched)&&s.stats.hatched>=0?Math.floor(s.stats.hatched):null;
            this.active=NurseryLedger.records(s,options);this.pending=[];this.credits=[];this.seen=this.active.map(row=>row.key);this.resolved=[];this.recent=[];this.initialized=true;
            const text=reason==='manual'?'本地孵蛋统计已重置；游戏累计不变':reason==='counter-rollback'?'游戏孵化计数回退，已建立新的观察统计段':reason==='trainer-changed'?'训练家存档种子变化，已建立新的观察统计段':'已建立孵蛋观察基线；现有蛋与历史孵化不计入本段';
            this.event(previous?'segment-reset':'baseline',text,now);if(options.snapshot!==false)return this.snapshot();
        }
        record(row,status,now){
            this.recent.unshift({...row,status,at:now});this.recent.length=Math.min(this.recent.length,NURSERY_LEDGER_LIMITS.recent);this.remember(this.resolved,row.key);this.dirty=true;
        }
        refineObservation(row){
            if(!row.unclassifiedObservation||!row.known)return;
            delete row.unclassifiedObservation;
            if(this.stats.unknownObserved>0){
                this.stats.unknownObserved--;
                if(row.shiny)this.stats.shinyObserved++;else this.stats.plainObserved++;
            }
            this.dirty=true;
        }
        expire(now){
            const limits=NURSERY_LEDGER_LIMITS,expired=this.pending.filter(row=>now-row.at>limits.windowMs);
            if(expired.length){
                this.pending=this.pending.filter(row=>!expired.includes(row));this.stats.unconfirmedDisappearances+=expired.length;
                for(const row of expired)this.record(row,'unconfirmed',now);
                this.event('unconfirmed',`${expired.length} 枚蛋离巢但未获原生孵化计数核对，不计为已孵异色`,now);
            }
            const credits=this.credits.filter(row=>now-row.at<=limits.windowMs);
            if(credits.length!==this.credits.length){this.credits=credits;this.dirty=true;}
        }
        match(now){
            if(!this.pending.length||!this.credits.length)return;
            const pendingKeys=new Set(this.pending.map(row=>row.key));
            const credits=this.credits.filter(credit=>credit.keys.some(key=>pendingKeys.has(key)));
            const count=credits.reduce((sum,row)=>sum+row.count,0);
            if(count!==this.pending.length)return;
            // A counter increment can confirm only eggs whose identity was already observed.
            // Counters unrelated to these departures remain available for their original candidates.
            const tickets=credits.flatMap(row=>Array.from({length:row.count},()=>new Set(row.keys))),assigned=new Map();
            const assign=(key,used)=>{
                for(let i=0;i<tickets.length;i++)if(tickets[i].has(key)&&!used.has(i)){
                    used.add(i);
                    if(!assigned.has(i)||assign(assigned.get(i),used)){assigned.set(i,key);return true;}
                }
                return false;
            };
            if(!this.pending.every(row=>assign(row.key,new Set())))return;
            let shiny=0,plain=0;
            for(const row of this.pending){
                if(row.known&&row.shiny)shiny++;else if(row.known)plain++;
                this.record(row,'hatched',now);
            }
            this.stats.shinyHatched+=shiny;this.stats.plainHatched+=plain;this.stats.unknownHatched=this.stats.hatched-this.stats.shinyHatched-this.stats.plainHatched;
            this.pending=[];this.credits=this.credits.filter(credit=>!credits.includes(credit));
            const unknown=count-shiny-plain;
            this.event('hatch-confirmed',`已核对孵化 ${count} 枚：异色 ${shiny}、普通 ${plain}${unknown?'、结果未知 '+unknown:''}`,now);
        }
        hatchlingsAwaitingEvidence(){
            if(!this.stats.unknownHatched)return [];
            return this.recent.filter(row=>row.status==='hatched'&&!row.known&&row.source!=='duplicate'&&row.uid
                &&Number.isSafeInteger(row.egg?.k)&&row.egg.k>=0);
        }
        reconcileHatchlings(s,now,rows=this.hatchlingsAwaitingEvidence()){
            if(!rows.length)return;
            // Native hatchEgg copies the egg UID and serial to an actual hatchling. Duplicates
            // can pay candy instead, and a previous PC UID collision creates a different UID.
            const uids=new Set(rows.map(row=>row.uid)),members=new Map();
            for(const mon of collectionMembers(s)){
                if(!uids.has(mon.uid))continue;
                members.set(mon.uid,members.has(mon.uid)?null:mon);
            }
            let confirmed=0;
            for(const row of rows){
                const mon=members.get(row.uid);
                if(!this.stats.unknownHatched||mon?.egg!==true||mon.ot||mon.ek!==row.egg.k||typeof mon.shiny!=='boolean')continue;
                row.known=true;row.shiny=mon.shiny;row.source='hatched-mon';
                this.refineObservation(row);
                if(mon.shiny)this.stats.shinyHatched++;else this.stats.plainHatched++;
                this.stats.unknownHatched--;confirmed++;
            }
            if(confirmed)this.event('hatch-evidence',`已按孵出个体的蛋身份与编号补全 ${confirmed} 枚闪色记录`,now);
            return confirmed;
        }
        observe(s,now=Date.now(),options={}){
            if(!s||typeof s!=='object'||Array.isArray(s))return options.snapshot===false?undefined:this.snapshot();
            now=Number.isFinite(now)&&now>=0?now:Date.now();
            const native=Number.isFinite(s.stats?.hatched)&&s.stats.hatched>=0?Math.floor(s.stats.hatched):null;
            if(!this.initialized)return this.baseline(s,now,'initial',options);
            if(this.segment.generation!==NurseryLedger.generation(s))return this.baseline(s,now,'trainer-changed',options);
            if(native!==null&&this.nativeHatched!==null&&native<this.nativeHatched)return this.baseline(s,now,'counter-rollback',options);
            this.expire(now);
            const refresh=row=>{
                if(row.source==='duplicate')return row;
                let result;try{result=row.egg?eggOutcome(s,row.egg,options):row.source==='saved'?row:null;}catch{result=null;}
                const known=result?.known===true&&typeof result.shiny==='boolean';return{...row,known,shiny:known?result.shiny:null,source:result?.source||'unknown'};
            };
            const refreshed=this.active.map(refresh),pending=this.pending.map(refresh);
            // Reconcile a departed egg with the build and evidence used for this hatch.
            for(const row of pending)this.refineObservation(row);
            if(JSON.stringify(refreshed)!==JSON.stringify(this.active)||JSON.stringify(pending)!==JSON.stringify(this.pending)){this.active=refreshed;this.pending=pending;this.dirty=true;}
            const current=NurseryLedger.records(s,options),before=new Map(this.active.map(row=>[row.key,row])),present=new Map(current.map(row=>[row.key,row]));
            for(const row of this.active)if(!present.has(row.key)&&!this.resolved.includes(row.key)&&!this.pending.some(pending=>pending.key===row.key)){
                this.refineObservation(row);
                this.pending.push({...row,at:now});this.event('egg-gone','蛋已离巢，等待游戏孵化计数核对',now);
            }
            while(this.pending.length>NURSERY_LEDGER_LIMITS.pending){const row=this.pending.shift();this.stats.unconfirmedDisappearances++;this.record(row,'unconfirmed',now);}
            for(const row of current){
                const pending=this.pending.findIndex(item=>item.key===row.key);
                const prior=before.get(row.key)||this.pending[pending];
                if(prior?.unclassifiedObservation&&prior.id===row.id&&row.source!=='duplicate'){
                    row.unclassifiedObservation=true;
                    this.refineObservation(row);
                }
                if(pending>=0){this.pending.splice(pending,1);this.event('egg-returned','待核对蛋重新出现，已撤销离巢待核对记录',now);}
                if(!before.has(row.key)&&!this.seen.includes(row.key)){
                    this.stats.eggsObserved++;if(row.known&&row.shiny)this.stats.shinyObserved++;else if(row.known)this.stats.plainObserved++;else this.stats.unknownObserved++;
                    if(!row.known&&row.source!=='duplicate')row.unclassifiedObservation=true;
                    this.event('egg-seen','观测到新蛋'+(row.known?(row.shiny?' · 异色':' · 普通'):' · 结果未知'),now);
                }
                if(!this.seen.includes(row.key)){this.remember(this.seen,row.key);this.dirty=true;}
            }
            if(native!==null&&this.nativeHatched!==null&&native>this.nativeHatched){
                const delta=native-this.nativeHatched;this.stats.hatched+=delta;this.stats.unknownHatched=this.stats.hatched-this.stats.shinyHatched-this.stats.plainHatched;
                const keys=[...new Set([...this.active,...this.pending].map(row=>row.key))].slice(0,NURSERY_LEDGER_LIMITS.active*2);
                if(keys.length){this.credits.push({count:delta,at:now,keys});this.credits=this.credits.slice(-NURSERY_LEDGER_LIMITS.credits);}
                this.event('native-hatched',`游戏孵化计数增加 ${delta}，按蛋身份核对来源`,now);
            }
            if(native!==null&&native!==this.nativeHatched){this.nativeHatched=native;this.dirty=true;}
            if(JSON.stringify(current)!==JSON.stringify(this.active)){this.active=current;this.dirty=true;}
            this.match(now);this.reconcileHatchlings(s,now);if(options.snapshot!==false)return this.snapshot();
        }
        reset(s={},now=Date.now(),options={}){return this.baseline(s,Number.isFinite(now)&&now>=0?now:Date.now(),'manual',options);}
        markClean(){this.dirty=false;}
        snapshot(){
            const current={eggs:this.active.length,shiny:this.active.filter(row=>row.known&&row.shiny).length,plain:this.active.filter(row=>row.known&&!row.shiny).length,unknown:this.active.filter(row=>!row.known).length,pendingDisappearances:this.pending.length};
            return JSON.parse(JSON.stringify({schema:1,initialized:this.initialized,segment:this.segment,nativeHatched:this.nativeHatched,stats:this.stats,current,active:this.active,pending:this.pending,credits:this.credits,seen:this.seen,resolved:this.resolved,recent:this.recent,events:this.events,sequence:this.sequence}));
        }
        serialize(){return this.snapshot();}
    }
