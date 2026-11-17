// Offline extraction harness only. The installed userscript never exposes game internals.
(() => {
    const t = globalThis.__pcResearch, G = t.Game, S = t.STORY, C = t.CONFIG, A = t.Adventure;
    if (!G.S) G.load(); A.ensure();
    // The isolated prefix omits UI initialisation; progress text only needs its formatter.
    const oldUI = t.UI; if (!oldUI) t.UI = { fmt: n => Number(n).toLocaleString('zh-CN') };
    const state = G.S, oldAdv = JSON.parse(JSON.stringify(state.adv)), oldLink = state.link;
    const oldOpen = new Map(S.REGIONS.map(region => [region, region.open]));
    const allBadges = S.CHAPTERS.flatMap(c => c.steps).filter(s => s.kind === 'gym' && s.badge).map(s => s.badge);
    state.adv.badges = allBadges; state.adv.unlocked = S.CHAPTERS.length - 1;
    const items = new Map(), chapters = [], caps = [], xpThresholds = {}, moneyFactors = [];
    const avg = n => Array.isArray(n) ? (n[0] + n[1]) / 2 : Number(n) || 1;
    const add = (id, source) => {
        if (!id || id.startsWith('egg:') || !(source.expected > 0)) return;
        if (!items.has(id)) items.set(id, { id, name: t.ITEM_NAMES[id] || id, sources: [] });
        items.get(id).sources.push(source);
    };
    const xp = (level, id, trainer = false, league = null) => G.levelXp(level) / C.XP_WINS_PER_LEVEL * Math.sqrt((t.BASE_EXP[id] || C.XP_BASE_REF) / C.XP_BASE_REF) * (trainer ? 1.5 : 1) * (league ? C.LEAGUE_TRAINERS.xp[league] || 1 : 1);
    try {
        // currentRegion() follows the highest opened frontier, except on a linked origin side.
        // Merely selecting another chapter does not change XP costs or the money penalty.
        state.link = null;
        for (let frontier = 0; frontier < S.CHAPTERS.length; frontier++) {
            state.adv.unlocked = frontier;
            for (const region of S.REGIONS.filter(r => r.key)) region.open = S.firstChapterOf(region.key) <= frontier;
            state.adv.badges = S.CHAPTERS.slice(0, frontier).flatMap(c => c.steps).filter(s => s.kind === 'gym' && s.badge).map(s => s.badge);
            caps[frontier] = { main: S.levelCap(state.adv) };
            for (const region of S.REGIONS.filter(r => r.key)) caps[frontier][region.key] = S.regionCap(state.adv, region.key);
            moneyFactors[frontier] = S.CHAPTERS.map((_, id) => G.behindMoney(id));
        }
        state.adv.unlocked = S.CHAPTERS.length - 1; state.adv.badges = allBadges;
        for (const region of S.REGIONS.filter(r => r.key)) {
            state.adv.chapter = S.firstChapterOf(region.key);
            state.link = { side: 'from', from: region.key };
            xpThresholds[region.key] = Array.from({ length: C.UNDERGROUND.RANK_MAX + 1 }, (_, rank) => Array.from({ length: 101 }, (_, level) => level > 0 && level < 100 ? G.xpForNext(level, { rank }) : 0));
            if (G.currentRegion().key !== region.key) throw new Error(`XP economic region mismatch: ${region.key}`);
        }
        state.link = null;
        S.CHAPTERS.forEach((chapter, id) => {
            state.adv.chapter = id;
            const reg = chapter.reg || 'kanto', routes = chapter.steps.filter(s => s.kind === 'route');
            let experience = 0;
            const odds = A.itemOdds(id), stoneProbability = Math.max(0, 1 - odds.reduce((n, row) => n + row.p, 0));
            const stones = G.shopStones(id);
            routes.forEach((route, index) => {
                const band = route.lv || S.routeBand(id, index, routes.length) || S.bandOf(id) || [2, 8];
                const level = (band[0] + band[1]) / 2;
                const pool = A.zonePool({ ...route, ch: id, lv: band }, id, true, null, true).filter(p => p.on !== false);
                const meanXp = pool.reduce((n, p) => n + xp(level, p.id) * p.pct, 0) || xp(level, 19);
                experience += (route.wild || 0) * meanXp;
                if (chapter.league) {
                    C.LEAGUE_TRAINERS.below.forEach((below, i) => experience += C.LEAGUE_TRAINERS.sizes[i] * xp(S.aceOf(id) - below, pool[0]?.id || 19, true, reg));
                } else {
                    const size = 1 + Math.min(2, Math.floor((id - S.firstChapterOf(reg)) / 2) + 1) / 2;
                    experience += (route.trainers || 0) * size * meanXp * 1.5;
                }
                if (route.item) {
                    for (const row of odds) if (row.item) add(row.item, { ch: id, kind: 'route', expected: C.ITEM_EVENT_CHANCE * row.p * avg(row.n), repeat: true });
                    for (const stone of stones) add(stone, { ch: id, kind: 'stone', expected: C.ITEM_EVENT_CHANCE * stoneProbability / stones.length, repeat: false, stone: true });
                    for (const [item, value] of Object.entries(route.loot || {})) {
                        const rule = typeof value === 'number' ? { p: value } : value;
                        add(item, { ch: id, kind: 'loot', expected: C.ITEM_EVENT_CHANCE * rule.p, once: item, repeat: false, badge: rule.badge, owns: rule.owns, tide: route.tide });
                    }
                }
                if (route.candy) add('rare-candy', { ch: id, kind: 'find', expected: 1, once: route.candy, repeat: false });
            });
            const town = A.townOdds(id);
            for (const row of town.list) add(row.item, { ch: id, kind: 'town', expected: town.towns * row.p * (row.item.startsWith('exp-candy') ? 2 : 1), repeat: true });
            for (const step of chapter.steps) {
                if (step.kind === 'find') add(step.item, { ch: id, kind: 'find', expected: 1, once: step.once, repeat: !step.once });
                if (step.kind !== 'gym') continue;
                const team = S.gymTeam(id, step);
                experience += team.reduce((n, [mon, level]) => n + xp(level, mon, true, chapter.league ? reg : null), 0);
                if (!chapter.league && step.badge && !step.champion) {
                    const ordinal = S.chaptersOf(reg).filter(ch => ch <= id && S.CHAPTERS[ch].steps.some(s => s.kind === 'gym' && s.badge)).length;
                    const n = C.GYM_TRAINERS.counts[Math.min(ordinal, C.GYM_TRAINERS.counts.length) - 1] || 1;
                    for (let i = 0; i < n; i++) experience += xp((step.ace ?? S.aceOf(id)) - C.GYM_TRAINERS.below[Math.min(i, C.GYM_TRAINERS.below.length - 1)], team[0]?.[0] || 19, true);
                }
            }
            chapters.push({ id, xpEstimate: Math.round(experience), name: t.I18n.t(chapter.name) });
        });
        return JSON.stringify({ build: globalThis.BUILD, chapters, items: [...items.values()], caps, xpThresholds, moneyFactors,
            economy: { behindMoney: [...C.BEHIND_MONEY], xpMultipliers: Object.fromEntries(S.REGIONS.filter(r => r.key).map(r => [r.key, C.REGION_XP?.[r.key] ?? r.xp ?? 1])), xpThresholdSchema: 2 },
            townCooldown: C.TOWN_EVENT.minMs, tideMs: S.TIDE_MS,
            zones: [...t.LegendZones.ZONES, ...t.LegendZones.ROAM_ZONES].filter(z => !z.wb).map(z => { const p = t.LegendZones.progress(z), eliteOnly = t.LegendZones.ROAM_ZONES.includes(z); return { id: z.id, reg: z.region, name: ({'Île du Sud':'南方孤岛','Caverne Vérité':'心齐湖洞窟'})[z.zone] || t.I18n.t(z.zone), monName: G.DEX[z.id]?.name, level: z.level, forms: z.forms, eliteOnly, condition: (p.lines || [p]).map(line => line.text).filter(Boolean).join('；') || `先捕获${G.DEX[z.id]?.name}，此入口用于精英战`, when: z.when, at: t.LegendZones.atChapter(z) }; }),
            extraMons: t.POKEDEX.filter(m => m.id > 493).map(m => ({ id: m.id, name: m.name, key: m.key, types: m.types, stats: m.stats, rate: m.captureRate, root: t.FORMS?.baseOf(m.id) || m.id, baby: false, legend: !!(m.legendary || m.mythical) })) });
    } finally { state.adv = oldAdv; state.link = oldLink; for (const [region, open] of oldOpen) region.open = open; if (!oldUI) delete t.UI; }
})();
