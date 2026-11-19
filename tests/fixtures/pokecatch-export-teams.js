// Run only in an isolated copy of the public data runtime, never on a user's save.
(() => {
    const t = globalThis.__pcResearch, G = t.Game, S = t.STORY, A = t.Adventure, C = t.CONFIG;
    if (!G.S) G.load(); A.ensure();
    const moves = Object.fromEntries(Object.entries(t.MOVES).filter(([key, m]) => !C.MOVE_BLACKLIST.includes(key) && G.movePower(key) > 0)
        .map(([key, m]) => [key, { type: m.type, cat: m.cat, power: G.movePower(key), acc: G.moveAcc(key) }]));
    const learns = Object.fromEntries(t.POKEDEX.map(m => [m.id, G.learnOf({ id: m.id, level: 100 }).filter(([, key]) => moves[key])]));
    const singles = Object.fromEntries(t.POKEDEX.map(m => [m.id, G.singleOf(m.id)]).filter(([, key]) => key));
    const chapters = S.CHAPTERS.map((c, id) => {
        const threats = new Map(), routes = c.steps.filter(s => s.kind === 'route');
        const add = (mon, level, weight) => { if (!(weight > 0)) return; const key = `${mon}:${level}`, old = threats.get(key); threats.set(key, { id: mon, level, weight: weight + (old?.weight || 0) }); };
        for (const step of c.steps) if (step.kind === 'gym') for (const [mon, level] of S.gymTeam(id, step)) add(mon, level, 3);
        for (const step of c.steps) if (step.kind === 'trainer') for (const [mon, level] of S.trainerTeam(id, step)) add(mon, level, 1);
        routes.forEach((route, index) => {
            if (c.league) return; // The native league expands this route into fixed teams below.
            const band = route.lv || S.routeBand(id, index, routes.length) || S.bandOf(id) || [2, 8];
            const level = Math.round((band[0] + band[1]) / 2);
            for (const m of A.zonePool({ ...route, ch: id, lv: band }, id, true, null, true)) if (m.on !== false) add(m.id, level, m.pct * ((route.wild || 0) + 2 * (route.trainers || 0)));
        });
        if (c.league) for (const step of c.steps.filter(s => s.kind === 'gym')) {
            const teams = t.LEAGUE_TEAMS?.[`${c.reg || 'kanto'}:${step.leader}`];
            if (!teams?.length) throw Error(`Missing league team for chapter ${id}, leader ${step.leader}`);
            teams.forEach((team, i) => team.team.forEach(mon => add(mon, S.aceOf(id) - C.LEAGUE_TRAINERS.below[i], 1)));
        }
        return { id, foes: [...threats.values()].map(m => [m.id, m.level, +m.weight.toFixed(5)]) };
    });
    return JSON.stringify({ build: globalThis.BUILD, moves, learns, singles, chapters, rankStat: C.UNDERGROUND.RANK_STAT, levelGap: C.LEVEL_GAP, hpScale: C.HP_LEVEL_SCALE, hpMax: C.HP_LEVEL_MAX });
})();
