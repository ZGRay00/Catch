    function partyMons(s) { return (s.team || []).map(uid => (s.mons || []).find(m => m.uid === uid)).filter(Boolean); }
    function monRegion(mon) { const reg = mon.reg === 'kanto2' ? 'johto' : mon.reg; return DATA.regions.some(r => r.key === reg) ? reg : 'kanto'; }
    function tasteProfile(m){return m.taste?[m.taste.h||'',...['atk','def','spa','spd','spe'].map(key=>Number(m.taste.up?.[key])||0)].join(':'):'';}
    function tasteMultiplier(taste,key){
        const config=DATA.combat.tastes;
        if(!taste||!config||!['atk','def','spa','spd','spe'].includes(key))return 1;
        const value=Math.min(Math.max(Number(taste.up?.[key])||0,0),config.MAX)/config.MAX;
        return 1+config.CAP*((1-config.LIN)*(1-(1-value)**2)+config.LIN*value)-(taste.h===key?config.DIS0:0);
    }
    function rosterFingerprint(s) { return (s.mons || []).map(m => `${m.uid}:${m.id}:${m.level}:${m.rank || 0}:${+!!m.shiny}:${monRegion(m)}:${m.statMult||1}:${m.hpMult||1}:${tasteProfile(m)}`).sort().join(',')+`|${s.link?.to||''}:${s.link?.side||''}`; }
    function teamEligible(s, mon, reg = currentRegion(s)) {
        if (!MONS.has(mon.id) || !mon.uid || String(mon.uid).startsWith('t:') || String(mon.uid).startsWith('c:')) return false;
        return !s.link || (reg === s.link.to) === (monRegion(mon) === s.link.to);
    }
