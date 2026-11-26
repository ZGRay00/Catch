    const speciesRankCache=new Map();
    function speciesRankings(type,source='sheet'){
        const data=SPECIES_RANKING_DATA;
        const group=data.groups[type];
        if(!Array.isArray(group))return [];
        const game=source==='game',cacheKey=type+(game?':game':':sheet');
        if(speciesRankCache.has(cacheKey))return speciesRankCache.get(cacheKey);
        const rows=group.map(([id,sheetMove,tier])=>{
            const mon=MONS.get(id),s=mon.stats;
            const correction=data.corrected[type]?.[id];
            const [move,category,power]=game&&correction?correction:[sheetMove,...data.moves[sheetMove]];
            const accuracyPoints=Math.round(10000-2000*Math.max(0,Math.min(1,(power-40)/110)));
            const attack=2*(category==='phys'?s.atk:s.spa)+5;
            // Keep the common denominators out of sorting, including ties between forms.
            const weight=power*accuracyPoints*attack;
            const bulk=(2*s.hp+110)*(2*s.def+2*s.spd+10);
            return {id,name:data.nameAliases[id]||mon.name,rarity:data.rarity[tier],move,category,power,
                accuracy:accuracyPoints/100,attack,weight,expected:1.5*weight/10000,bulk,product:weight*bulk,
                sheetMove,gameMove:correction?.[0]||sheetMove};
        });
        rows.sort((a,b)=>b.weight-a.weight||a.id-b.id);
        const maxWeight=rows[0].weight,maxBulk=Math.max(...rows.map(row=>row.bulk));
        rows.forEach((row,index)=>{
            row.powerRank=index+1;
            row.outputScore=100*row.weight/maxWeight;
            row.bulkScore=100*row.bulk/maxBulk;
        });
        rows.sort((a,b)=>b.product-a.product||a.powerRank-b.powerRank);
        const maxProduct=rows[0].product;
        rows.forEach((row,index)=>{
            row.overallRank=index+1;
            row.overallScore=100*row.product/maxProduct;
        });
        speciesRankCache.set(cacheKey,rows);
        return rows;
    }
