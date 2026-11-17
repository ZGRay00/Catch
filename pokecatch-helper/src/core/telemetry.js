    class Telemetry {
        constructor(metrics = {}) { this.metrics = metrics; this.sample = null; }
        begin(s, row, settings, now) {
            this.sample = { key: metricsKey(s, row, settings,now), route: row.key, members: row.members, wallet: Number(s.money) || 0,
                run: s.adv.runs || 0, startNode: s.adv.node, started: now, advanced: false, deaths: totalDeaths(s, row), fingerprint: teamFingerprint(s), speed: settings.speed,
                xp: experienceTotal(s), party: JSON.stringify(s.team || []), items: Object.fromEntries([...ITEMS.keys()].map(id => [id, itemCounter(s, id)])) };
        }
        observe(s, row, settings, now) {
            const old = this.sample;
            if (!old || !row || old.route !== row.key || old.key !== metricsKey(s, row, settings,now) || old.party !== JSON.stringify(s.team || []) || old.fingerprint !== teamFingerprint(s) || old.speed !== settings.speed || s.adv.event || s.adv.zone || s.adv.tower || s.adv.league || !row.members.includes(s.adv.chapter)) { this.sample = null; return null; }
            if ((s.adv.runs || 0) < old.run) { this.sample = null; return null; }
            old.advanced ||= s.adv.node !== old.startNode || !!s.adv.battle;
            const crossed = (s.adv.runs || 0) > old.run && (!row.league || s.adv.chapter === row.members[0]);
            if (!crossed) return null;
            const seconds = (now - old.started) / 1000, net = (Number(s.money) || 0) - old.wallet;
            const valid = seconds >= 10 && seconds < 6 * 3600 && old.advanced;
            // The first partial cycle is a warm-up, so entry near a gym can't inflate income.
            const currentXp = experienceTotal(s);
            // Ordinary leagues increment runs once per chapter. A return to the
            // first room alone is not evidence that all league chapters were cleared.
            const completeLoop=!row.league||(s.adv.runs||0)-old.run>=row.members.length;
            const result = { valid: valid && !!old.full && completeLoop, seconds, net, deaths: Math.max(0, totalDeaths(s, row) - old.deaths), xp: old.xp != null && currentXp != null ? Math.max(0, currentXp - old.xp) : null };
            if (result.valid) {
                const m = this.metrics[old.key] || { net: 0, seconds: 0, runs: 0, deaths: 0 };
                if (m.runs >= 8) { m.net *= .75; m.seconds *= .75; m.runs *= .75; m.deaths *= .75; if (m.xpSeconds) { m.xp *= .75; m.xpSeconds *= .75; m.xpRuns *= .75; } if (m.itemSeconds) { m.itemSeconds *= .75; m.itemRuns *= .75; for (const id of Object.keys(m.itemCounts)) m.itemCounts[id] *= .75; } }
                m.net += net; m.seconds += seconds; m.runs += 1; m.deaths += result.deaths; m.at = now;
                if (result.xp != null) { m.xp = (m.xp || 0) + result.xp; m.xpSeconds = (m.xpSeconds || 0) + seconds; m.xpRuns = (m.xpRuns || 0) + 1; }
                m.itemCounts ||= {}; m.itemSeconds = (m.itemSeconds || 0) + seconds; m.itemRuns = (m.itemRuns || 0) + 1;
                for (const id of ITEMS.keys()) m.itemCounts[id] = (m.itemCounts[id] || 0) + Math.max(0, itemCounter(s, id) - (old.items[id] || 0));
                this.metrics[old.key] = m;
            }
            this.begin(s, row, settings, now); this.sample.full = true;
            return result;
        }
    }
    function totalDeaths(s, row) { return row.members.reduce((n, id) => n + (Number(s.adv.deaths?.[id]) || 0), 0); }

