// Optional differential check against a downloaded public app bundle.
// Usage: node tests/pokecatch-save-wire-native.cjs PATH_TO_PUBLIC_APP_JS
// Evaluates only the pure JSON SaveWire codec in a sandbox without network/storage APIs.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
assert.ok(process.argv[2],'Pass the path to a downloaded public game app.js');
const source=fs.readFileSync(process.argv[2],'utf8'),match=/([A-Za-z_$][\w$]*)\.SaveWire=function\(\)\{/.exec(source);
assert.ok(match,'Public SaveWire module not found; review the extraction boundary');
const start=match.index,end=source.indexOf('}}(),function(){',start);
assert.ok(end>start,'Public SaveWire module boundary changed; review before running');
const alias=match[1],context=vm.createContext({});
const native=vm.runInContext(`const ${alias}={};${source.slice(start,end+4)};${alias}.SaveWire`,context,{timeout:2000});
assert.equal(native.FMT,2,'Review the userscript decoder for a newer save format');
let samples=0;
for(let i=0;i<300;i++){
    const ids=[1,6,25,132,650],regions=['kanto','johto','hoenn','sinnoh','unova'];
    const state={money:i,mons:ids.slice(0,i%5+1).map((id,k)=>({
        uid:(1780000000000+i*5000+k).toString(36)+'seed00',id,level:1+(i+k)%100,xp:i*7,
        reg:regions[(i+k)%5],where:'place'+k,caughtAt:1780000001000+i*5000+k,
        shiny:!!(i%2),rank:i%6,taste:{atk:i%10},
    })),dex:Object.fromEntries(ids.map((id,k)=>[id,{caught:i+k,firstAt:1700000000000+i,regs:{[regions[k]]:1},shiny:i%2,n:i%3}])),
        seen:Object.fromEntries([...ids,700].map(id=>[id,true])),team:[],adv:{layout:6},pension:{mons:[]}};
    state.pcOrder=state.mons.map(mon=>mon.uid).reverse().concat('external');
    const packed=JSON.parse(JSON.stringify(native.pack(state))),before=JSON.stringify(packed);
    const expected=JSON.parse(JSON.stringify(native.unpack(packed))),actual=JSON.parse(JSON.stringify(H.decodeSave(packed)));
    assert.deepEqual(actual,expected,`native compact save sample ${i}`);
    assert.equal(JSON.stringify(packed),before,'Decoding must leave the source save unchanged');samples++;
}
console.log(`PASS: ${samples} compact save samples match native unpack; packed input unchanged; no game account or save writes.`);
