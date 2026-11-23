    // Validate each measurement independently. Older profiles can contain XP-only
    // samples, and a damaged item history should not erase a valid wallet sample.
    function readRouteMetric(value, region) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const positive = n => Number.isFinite(n) && n > 0;
        const nonnegative = n => Number.isFinite(n) && n >= 0;
        const money = positive(value.seconds) && positive(value.runs) && Number.isFinite(value.net);
        // Older Unova records counted level-ups using the former 1× curve.
        // Balances alone cannot recover how many levels were crossed in a sample.
        const multiplier = DATA.economy.xpMultipliers[region];
        const compatibleXp = recordedXpCompatible(region, value.xpMultiplier);
        const xp = compatibleXp && positive(value.xpSeconds) && positive(value.xpRuns) && nonnegative(value.xp);
        const items = positive(value.itemSeconds) && positive(value.itemRuns) && value.itemCounts &&
            typeof value.itemCounts === 'object' && !Array.isArray(value.itemCounts);
        if (!money && !xp && !items) return null;
        const metric = { net: money ? value.net : 0, seconds: money ? value.seconds : 0,
            runs: money ? value.runs : 0, deaths: nonnegative(value.deaths) ? value.deaths : 0,
            at: nonnegative(value.at) ? value.at : 0 };
        if (xp) {
            Object.assign(metric, { xp: value.xp, xpSeconds: value.xpSeconds, xpRuns: value.xpRuns });
            if (multiplier != null) metric.xpMultiplier = multiplier;
        }
        if (items) {
            metric.itemCounts = Object.fromEntries(Object.entries(value.itemCounts)
                .filter(([id, count]) => ITEMS.has(id) && positive(count)));
            metric.itemSeconds = value.itemSeconds;
            metric.itemRuns = value.itemRuns;
        }
        return metric;
    }
    function readRouteHistory(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, readRouteMetric(value, key.split('|', 2)[1])])
            .filter(([, metric]) => metric).sort((a, b) => b[1].at - a[1].at).slice(0, 200));
    }
    function itemLedger(s) {
        const intake = s.stats?.itemIn;
        return intake && typeof intake === 'object' ? intake : null;
    }
    function itemSnapshot(s, ledger) {
        const ids = ledger ? Object.keys(ledger) : new Set([...Object.keys(s.items || {}), ...Object.keys(s.link?.stash?.items || {})]);
        const counts = {};
        for (const id of ids) {
            if (!ITEMS.has(id)) continue;
            const count = itemCounter(s, id);
            if (count > 0 && Number.isFinite(count)) counts[id] = count;
        }
        return counts;
    }
    class Telemetry {
        constructor(metrics = {}) { this.metrics = metrics; this.sample = null; }
        begin(s, row, settings, now, goals) {
            if(s.adv.speed!=null&&s.adv.speed!==settings.speed){this.sample=null;return;}
            const ledger=itemLedger(s);
            const targets=trainingXpTargets(s,settings,goals);
            this.sample = { key: metricsKey(s, row, settings,now), route: row.key, wallet: Number(s.money) || 0,
                run: s.adv.runs || 0, startNode: s.adv.node, started: now, advanced: false, deaths: totalDeaths(s, row),
                xp: targets?null:experienceTotal(s), targets, xpSuffix:trainingXpSuffix(targets),
                expenses:routeExpenseSignature(s), party: JSON.stringify(s.team || []), ledger: !!ledger, items: itemSnapshot(s,ledger) };
        }
        observe(s, row, settings, now, goals) {
            const old = this.sample;
            if (!old || !row || old.route !== row.key || old.key !== metricsKey(s, row, settings,now) || old.party !== JSON.stringify(s.team || []) || s.adv.speed!=null&&s.adv.speed!==settings.speed || s.adv.event || s.adv.zone || s.adv.tower || s.adv.league || !row.members.includes(s.adv.chapter)) { this.sample = null; return null; }
            if(old.expenses!==routeExpenseSignature(s)){this.sample=null;return null;}
            // A multi-cycle jump lacks individual boundary evidence.
            if((s.adv.runs||0)-old.run>(row.league?row.members.length:1)){this.sample=null;return null;}
            if ((s.adv.runs || 0) < old.run) { this.sample = null; return null; }
            const ledger=itemLedger(s);
            // Older saves start with inventory balances and may acquire lifetime intake counters mid-run.
            if(old.ledger!==!!ledger)old.items=null;
            old.advanced ||= s.adv.node !== old.startNode || !!s.adv.battle;
            const crossed = (s.adv.runs || 0) > old.run && (!row.league || s.adv.chapter === row.members[0]);
            if (!crossed) return null;
            const seconds = (now - old.started) / 1000, net = (Number(s.money) || 0) - old.wallet;
            const valid = seconds >= 10 && seconds < 6 * 3600 && old.advanced;
            // The first partial cycle is a warm-up, so entry near a gym can't inflate income.
            const targets=trainingXpTargets(s,settings,goals),currentXp=targets?null:experienceTotal(s);
            let xp=null;
            if(old.targets&&targets&&trainingXpSuffix(targets)===old.xpSuffix&&targets.length===old.targets.length){
                const gains=old.targets.map((before,i)=>{
                    const after=targets[i];
                    return before.uid===after.uid&&before.identity.every((key,j)=>key===after.identity[j])&&before.xp!=null&&after.xp!=null&&after.xp>=before.xp?Math.min(after.xp-before.xp,before.remaining):null;
                });
                if(gains.every(gain=>gain!=null))xp=gains.reduce((a,b)=>a+b,0);
            }else if(!targets&&!old.targets&&old.xp!=null&&currentXp!=null&&currentXp>=old.xp)xp=currentXp-old.xp;
            // Ordinary leagues increment runs once per chapter. A return to the
            // first room alone is not evidence that all league chapters were cleared.
            const completeLoop=!row.league||(s.adv.runs||0)-old.run>=row.members.length;
            const result = { valid: valid && !!old.full && completeLoop, seconds, net, deaths: Math.max(0, totalDeaths(s, row) - old.deaths), xp };
            if (result.valid) {
                const m = this.metrics[old.key] || { net: 0, seconds: 0, runs: 0 };
                m.deaths ??= 0;
                if (m.runs >= 8) { m.net *= .75; m.seconds *= .75; m.runs *= .75; m.deaths *= .75; if (m.xpSeconds) { m.xp *= .75; m.xpSeconds *= .75; m.xpRuns *= .75; } if (m.itemSeconds) { m.itemSeconds *= .75; m.itemRuns *= .75; for (const id of Object.keys(m.itemCounts)) m.itemCounts[id] *= .75; } }
                m.net += net; m.seconds += seconds; m.runs += 1; m.deaths += result.deaths; m.at = now;
                if(result.xp!=null){
                    const key=old.key+old.xpSuffix,record=old.xpSuffix?this.metrics[key]||{net:0,seconds:0,runs:0}:m;
                    if(old.xpSuffix&&record.xpRuns>=8){record.xp*=.75;record.xpSeconds*=.75;record.xpRuns*=.75;}
                    record.xp=(record.xp||0)+result.xp;record.xpSeconds=(record.xpSeconds||0)+seconds;record.xpRuns=(record.xpRuns||0)+1;
                    record.xpMultiplier=DATA.economy.xpMultipliers[economicRegion(s)];record.at=now;this.metrics[key]=record;
                }
                if(old.items && (!ledger || Object.entries(old.items).every(([id,count])=>itemCounter(s,id)>=count))){
                    m.itemCounts ||= {}; m.itemSeconds = (m.itemSeconds || 0) + seconds; m.itemRuns = (m.itemRuns || 0) + 1;
                    for(const [id,count] of Object.entries(itemSnapshot(s,ledger))){
                        const gain=count-(old.items[id]||0);
                        if(gain>0)m.itemCounts[id]=(m.itemCounts[id]||0)+gain;
                    }
                }
                this.metrics[old.key] = m;
            }
            this.begin(s, row, settings, now,goals); if(this.sample)this.sample.full = true;
            return result;
        }
    }
    function routeExpenseSignature(s){
        return JSON.stringify(['shop','candy','pension'].map(key=>Number(s.stats?.spent?.[key])||0));
    }
    function totalDeaths(s, row) { return row.members.reduce((n, id) => n + (Number(s.adv.deaths?.[id]) || 0), 0); }

