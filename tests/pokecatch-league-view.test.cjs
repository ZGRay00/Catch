const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,view='elite'){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle};
    t.after(()=>{for(const key of Object.keys(previous))if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const node=(kind,classes=[])=>({kind,isConnected:true,hidden:false,disabled:false,dataset:{loop:'L'},closest:()=>null,getAttribute:key=>key==='aria-checked'?'true':null,getClientRects:()=>[{}],classList:{contains:name=>classes.includes(name)}});
    const reg=node('reg',['active']),list=node('list',['sel']),ordinary=node('ordinary'),loop=node('loop'),go=node('go');
    global.document={hidden:false,querySelector:selector=>selector.includes('.rg.open')?reg:selector.includes('.mp-row')?list:selector.includes('data-lg-view="league"')?view==='elite'?ordinary:null:selector.includes('.mp-go')&&view==='league'?go:null,
        querySelectorAll:selector=>selector==='#map-root [data-loop]'?[loop]:[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const s={trainer:{id:'league-view'},money:1000,mons:[{uid:'a',id:6,level:100}],team:['a'],road:['a'],dex:{},stats:{},travel:{to:[]},adv:{layout:6,chapter:0,unlocked:13,node:0,runs:0,speed:4,loops:[],gifts:{},badges:[],deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'progress',progressUntil:65,autoPrepare:false,autoTeam:false,raids:false});e.loadAccount(s);e.running=true;e.started=Date.now();e.schedule=()=>{};
    const actions=[];e.driver.nav=()=>true;e.driver.clearLoops=()=>true;e.driver.click=(el,label)=>{if(!el)return false;actions.push(label);if(el===ordinary)view='league';if(el===go)s.adv.chapter=9;return true;};
    const row=H.candidates(s,H.DEFAULTS).find(row=>row.key==='L');
    return{s,e,actions,row,view:()=>view};
}

test('replay navigation leaves the remembered elite view before enabling its ordinary league route',t=>{
    const {s,e,actions,row,view}=fixture(t);assert.equal(e.driver.map(row,s),false);assert.equal(view(),'league');assert.deepEqual(actions,['切回普通联盟']);
    assert.equal(e.driver.map(row,s),true);assert.deepEqual(actions,['切回普通联盟','前往'+row.name]);assert.equal(s.adv.chapter,9);e.stop();
});

test('mainline entry leaves the elite view before launching the ordinary league',t=>{
    const {s,e,actions,view}=fixture(t);e.progress(s,Date.now());assert.equal(view(),'league');assert.deepEqual(actions,['切回普通联盟，推进主线']);assert.equal(s.adv.chapter,0);
    e.progress(s,Date.now());assert.deepEqual(actions,['切回普通联盟，推进主线','推进当前主线']);assert.equal(s.adv.chapter,9);e.stop();
});

test('an already ordinary league replay launches without an extra tab click',t=>{
    const {s,e,actions,row}=fixture(t,'league');assert.equal(e.driver.map(row,s),true);assert.deepEqual(actions,['前往'+row.name]);e.stop();
});

test('an already ordinary mainline entry launches without an extra tab click',t=>{
    const {s,e,actions}=fixture(t,'league');e.progress(s,Date.now());assert.deepEqual(actions,['推进当前主线']);e.stop();
});

test('non-league map navigation does not touch the remembered elite tab',t=>{
    const {s,e,actions,view}=fixture(t);const row=H.candidates(s,H.DEFAULTS).find(row=>!row.league);e.driver.map(row,s);assert.equal(view(),'elite');assert.ok(!actions.some(label=>label.includes('切回普通联盟')));e.stop();
});
