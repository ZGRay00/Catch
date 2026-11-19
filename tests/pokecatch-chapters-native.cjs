// Rebuild only chapter-planning fields from a downloaded public game client.
// The optional --write switch preserves translated names, items, combat data and other assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nativeRuntime = require('../tools/pokecatch-native-vm.cjs');
const fields = ['reward','units','trainers','wild','xpEstimate','pools','shinyPools','foes','foesByStarter','leaders','gymFoes'];

function chapterSnapshot(bundle) {
    const runtime = nativeRuntime(bundle);
    runtime.run(`globalThis.BUILD='chapter-audit';globalThis.__pcSnapshotParts={};
        __pcResearch.Game.load();__pcResearch.Adventure.ensure();__pcResearch.Game.stopSaving();
        __pcResearch.Clock={now:()=>Date.UTC(2026,10,16,4)};
        __pcResearch.DAYTIME.force('day');__pcResearch.DAYTIME.forceSeason('autumn');__pcResearch.WEATHER.force('clear');
        __pcResearch.CONFIG.DAILY_SPOTS=__pcResearch.CONFIG.DAILY_SPOTS.filter(s=>s.zones.length===1&&!s.rare);`);
    for (const name of ['pools','teams','targets','automation']) {
        const source = fs.readFileSync(path.join(__dirname,'fixtures','pokecatch-export-'+name+'.js'),'utf8');
        const value = runtime.run(source);
        runtime.context.__pcSnapshotParts[name] = JSON.parse(value);
    }
    const source = fs.readFileSync(path.join(__dirname,'fixtures','pokecatch-export-snapshot.js'),'utf8');
    const chapters = JSON.parse(runtime.run(source)).chapters;
    // Compare the exporters' configured rosters with what a native replay actually builds.
    const leagueRooms = JSON.parse(runtime.run(`JSON.stringify((()=>{
        const N=__pcResearch, rooms=[];
        for (const [id,chapter] of N.STORY.CHAPTERS.entries()) {
            if (!chapter.league) continue;
            N.Adventure.buildChapter(id);
            const weights={}, reg=chapter.reg||'kanto', config=N.CONFIG;
            let xp=0;
            for (const node of N.Game.S.adv.nodes) {
                if (!['trainer','gym'].includes(node.type)) continue;
                const roster=node.gym?N.STORY.gymTeam(id,node.gym):node.team;
                for (const [mon,level] of roster) {
                    const key=mon+':'+level;
                    weights[key]=(weights[key]||0)+(node.gym?3:1);
                    xp+=N.Game.levelXp(level)/config.XP_WINS_PER_LEVEL*
                        Math.sqrt((N.BASE_EXP[mon]||config.XP_BASE_REF)/config.XP_BASE_REF)*1.5*(config.LEAGUE_TRAINERS.xp[reg]||1);
                }
            }
            rooms.push({id,weights,xp:Math.round(xp)});
        }
        return rooms;
    })())`));
    for (const room of leagueRooms) {
        const exported=chapters[room.id];
        const weights=Object.fromEntries(exported.foes.map(([id,level,weight])=>[id+':'+level,weight]));
        assert.deepEqual(weights,room.weights,'league replay opponents in '+room.id);
        assert.equal(exported.xpEstimate,room.xp,'league replay XP in '+room.id);
    }
    return chapters;
}

function main() {
    const [bundle,flag] = process.argv.slice(2);
    assert.ok(bundle && (!flag || flag==='--write'), 'Pass a public game bundle and optionally --write');
    const chapters = chapterSnapshot(bundle);
    const file = path.join(__dirname,'../pokecatch-helper/data/game.json');
    const data = JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(chapters.length,data.chapters.length,'Review new/removed chapters and translated names');
    for (const current of chapters) {
        const saved = data.chapters[current.id];
        assert.ok(saved && saved.id===current.id && saved.reg===current.reg, 'Review chapter identity '+current.id);
        for (const key of fields) {
            if (flag==='--write') {
                if (current[key]===undefined) delete saved[key];
                else saved[key]=current[key];
            } else assert.deepEqual(saved[key],current[key],`chapter ${current.id} ${key}`);
        }
    }
    if (flag==='--write') fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
    console.log(`${flag==='--write'?'Updated':'Verified'} planning fields for ${chapters.length} chapters`);
}

try { main(); } catch (err) { console.error(err.message); process.exitCode=1; }
