    const MONS = new Map(DATA.mons.map(m => [m.id, m]));
    const ROOTS = DATA.mons.filter(m => (m.num??m.id) <= (DATA.dexMax||493) && !m.baby && m.id === m.root);
    const CHAPTERS = new Map(DATA.chapters.map(c => [c.id, c]));
    const ITEMS = new Map((DATA.items || []).map(item => [item.id, item]));
    // Public CandyRun snapshot; each theme row follows poolCaps, including native small-pool fallbacks.
