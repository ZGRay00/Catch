    const NURSERY_STORE_PREFIX='pokecatch-helper:nursery:v1:';
    function nurseryRuntimeOptions(){
        if(typeof document==='undefined')return{};
        const declared=typeof window!=='undefined'&&typeof window.BUILD==='string'?window.BUILD:'';
        const scripts=[...(document.querySelectorAll?.('script[src]')||[])];
        const hashes=new Set(scripts.map(node=>/(?:^|\/)bundle\/app\.([a-f0-9]{10})\.js(?:[?#]|$)/.exec(node.getAttribute?.('src')||'')?.[1]).filter(Boolean));
        if(hashes.size>1)return{build:'unverified:mixed-bundles'};
        if(!hashes.size)return{build:declared||'unverified:missing'};
        const [bundle]=hashes;
        // A launcher-only deployment can still serve exactly the same reviewed application.
        if(NURSERY_BUILDS[bundle]&&/^[a-f0-9]{10}$/.test(declared)&&!NURSERY_RULES.compatibleBuilds.includes(declared)){
            return{build:NURSERY_BUILDS[bundle],bundle,launcherBuild:declared};
        }
        if(declared&&declared!==NURSERY_BUILDS[bundle])return{build:'unverified:'+bundle};
        return{build:NURSERY_BUILDS[bundle]||'unverified:'+bundle};
    }
    class NurseryMonitor {
        constructor(engine){this.e=engine;this.account=null;this.key=null;this.raw=null;this.ledger=new NurseryLedger();this.error='';}
        load(s,now=Date.now()){
            this.account=this.e.account;this.key=NURSERY_STORE_PREFIX+encodeURIComponent(this.account);this.raw=null;this.ledger=new NurseryLedger();this.error='';
            return this.observe(s,now);
        }
        restore(raw){
            let saved={};try{saved=JSON.parse(raw||'{}');}catch{}
            this.ledger=new NurseryLedger(saved);this.raw=raw;this.observationKey=null;
        }
        fresh(s){
            if(this.e.raw!==null&&this.e.raw!==undefined&&this.e.storage.getItem(SAVE_KEY)!==this.e.raw)return false;
            if(!this.e.state||s===this.e.state)return true;
            const stamp=value=>JSON.stringify([value?.trainer?.id,value?.trainer?.since,value?.stats?.hatched,
                (value?.pension?.eggs||[]).map(egg=>[egg?.uid,egg?.id,egg?.k,egg?.sp,egg?.bx,egg?.laidAt,egg?.hatchAt,Object.hasOwn(egg||{},'shiny')?[egg.shiny]:[]])]);
            return stamp(s)===stamp(this.e.state);
        }
        observe(s,now=Date.now(),withSnapshot=true){
            if(!s?.adv||!this.account||this.account!==this.e.account||accountId(s)!==this.account)return null;
            const result=()=>withSnapshot?this.ledger.snapshot():null;
            try{
                const options={...nurseryRuntimeOptions(),snapshot:false};
                for(let attempt=0;attempt<2;attempt++){
                    const raw=this.e.storage.getItem(this.key);if(raw!==this.raw)this.restore(raw);
                    if(!this.fresh(s)){this.error='游戏存档已更新，等待最新状态再核对蛋统计';return result();}
                    const before=this.ledger.stats.shinyObserved;
                    // A caller may still hold an equivalent nursery snapshot from a previous
                    // read. Use the latest decoded save for matching actual hatched members.
                    const latest=this.e.raw!=null&&this.e.state?this.e.state:s;
                    const key=JSON.stringify([options.build,latest.trainer?.since,latest.trainer?.id,latest.stats?.hatched,latest.pension?.eggs]);
                    const l=this.ledger;
                    if(!l.initialized||l.dirty||key!==this.observationKey||l.pending.length||l.credits.length||l.stats.unknownHatched){
                        l.observe(latest,now,options);this.observationKey=key;
                    }
                    if(!l.dirty){this.error='';return result();}
                    if(!this.e.mayPersist())return result();
                    // Re-read before saving so another tab's newer ledger is reloaded and reconciled.
                    if(this.e.storage.getItem(this.key)!==raw)continue;
                    if(!this.fresh(s)){this.restore(raw);this.error='游戏存档已更新，本次旧快照未写入统计';return result();}
                    const encoded=JSON.stringify(this.ledger.serialize());
                    this.e.storage.setItem(this.key,encoded);this.raw=encoded;this.ledger.markClean();this.error='';
                    if(this.ledger.stats.shinyObserved>before)this.e.log(`培育屋本段已确认的异色蛋 +${this.ledger.stats.shinyObserved-before}`);
                    return result();
                }
                this.error='另一个标签页正在更新蛋统计，下一次重新核对';
            }catch(error){this.error='蛋统计暂未保存：'+String(error.message||error).slice(0,160);}
            return result();
        }
        reset(s,now=Date.now()){
            if(!s?.adv||accountId(s)!==this.account||this.account!==this.e.account||!this.e.mayPersist())throw new Error('当前账号不可写入蛋统计，请回到管理该账号的标签页');
            if(!this.fresh(s))throw new Error('游戏存档已更新，请读取最新状态后再清空观测统计');
            const raw=this.e.storage.getItem(this.key),ledger=new NurseryLedger((()=>{try{return JSON.parse(raw||'{}');}catch{return{};}})());
            ledger.reset(s,now,nurseryRuntimeOptions());
            if(this.e.storage.getItem(this.key)!==raw||!this.e.mayPersist()||!this.fresh(s))throw new Error('另一个标签页更新了统计，请重新核对后再清空');
            const encoded=JSON.stringify(ledger.serialize());this.e.storage.setItem(this.key,encoded);
            this.ledger=ledger;this.raw=encoded;this.observationKey=null;this.ledger.markClean();this.error='';return ledger.snapshot();
        }
    }
