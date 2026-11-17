// Evaluate only in an isolated copy of the public game data runtime.
// __pcResearch is supplied by the local extraction harness, never by the userscript.
(() => {
    const { Game: game, STORY: story, Adventure: adventure, DAYTIME: day, WEATHER: weather, CONFIG: config } = globalThis.__pcResearch;
    if (!game.S) game.load();
    adventure.ensure();
    const previousPhase = day.forced, previousWeather = weather.forced;
    const dexMax = Math.max(...story.REGIONS.filter(r => r.key && r.dex).map(r => r.dex[1]));
    function basic(id) {
        const seen = new Set();
        while (game.PREVO[id] && !seen.has(id)) {
            seen.add(id);
            const parent = game.PREVO[id].from;
            if (game.DEX[parent]?.baby) break;
            id = parent;
        }
        return id;
    }
    try {
        const chapters = story.CHAPTERS.map((chapter, id) => {
            const routes = chapter.steps.filter(step => step.kind === 'route');
            const wild = routes.reduce((n, route) => n + (route.wild || 0), 0);
            const pools = {};
            for (const phase of ['morning', 'day', 'night']) {
                day.force(phase);
                const combined = new Map();
                for (const sky of ['clear', ...Object.keys(config.WEATHER.TYPES)]) {
                    weather.force(sky === 'clear' ? 'none' : sky);
                    const perWeather = new Map();
                    routes.forEach((route, index) => {
                        if (!route.wild) return;
                        const lv = route.lv || story.routeBand(id, index, routes.length);
                        const pool = adventure.zonePool({ ...route, ch: id, lv }, id, true, null, true);
                        for (const encounter of pool) {
                            if (encounter.on === false || encounter.id > dexMax || game.DEX[encounter.id]?.baby || basic(encounter.id) !== encounter.id) continue;
                            const when = Array.from(encounter.when || []);
                            const key = `${encounter.id}|${when.join(',')}`;
                            const entry = perWeather.get(key) || { id: encounter.id, expected: 0, when };
                            entry.expected += route.wild * encounter.pct;
                            perWeather.set(key, entry);
                        }
                    });
                    // Aggregate all routes within each weather, then merge those weather totals.
                    // Omitting this merge previously generated empty chapter tables.
                    for (const [key, entry] of perWeather) {
                        const merged = combined.get(key) || { id: entry.id, best: 0, clear: 0, when: entry.when };
                        merged.best = Math.max(merged.best, entry.expected);
                        if (sky === 'clear') merged.clear = entry.expected;
                        combined.set(key, merged);
                    }
                }
                pools[phase] = [...combined.values()].filter(row => row.best > 0)
                    .map(row => [row.id, +row.best.toFixed(5), +row.clear.toFixed(5), row.when]);
                if (wild > 0 && !pools[phase].length) throw new Error(`Missing wild pool: chapter ${id}, ${phase}`);
                if (pools[phase].some(([, best, clear]) => !Number.isFinite(best) || best < clear || clear < 0)) throw new Error(`Invalid pool weights: chapter ${id}`);
            }
            return { id, wild, pools };
        });
        return JSON.stringify({ build: globalThis.BUILD, schema: 1, chapters });
    } finally {
        day.force(previousPhase || null);
        weather.force(previousWeather || null);
    }
})();
