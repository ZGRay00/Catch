const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
// Extracted from public bundle f1ef0dd44e Adventure.counterParts in an isolated runtime.
const NATIVE_CASES=[[14,3,5,0.000003245727309741609,0,0],[14,3,50,0.6578732387867723,0,0],[14,3,100,5346.507705615365,0,0],[14,6,5,0.000032449452217312574,0.18480249237359275,0],[14,6,50,9.91229752587739,143.86064491432703,0],[14,6,100,75870.68986371711,0,0],[14,35,5,0.000006597056002009646,0,0],[14,35,50,0.4197035079653316,0,0],[14,35,100,2764.930626246461,0,0],[14,43,5,7.498705743560014e-7,0,0],[14,43,50,0.26560967450594775,0,0],[14,43,100,2111.137553545931,0,0],[14,80,5,0.000002125399200505411,0,0],[14,80,50,2.5536341967095963,0,0],[14,80,100,19855.215173055803,0,0],[14,94,5,0.00001378677105791594,0,0.11846006492502041],[14,94,50,2.1704249971324097,248.23260801174106,0],[14,94,100,32333.74597484178,22900.570031851763,0],[14,125,5,0.000003920516687091777,0,0.010122030720545112],[14,125,50,0.9574334097147511,0,28.818678413984763],[14,125,100,8209.38581494744,0,3783.664575792568],[14,126,5,0.000014823224941334143,0.08441957342846709,0],[14,126,50,3.6925596699698637,104.82042549393934,0],[14,126,100,33402.50882455713,0,0],[14,132,5,0.0000011962060429366585,0,0],[14,132,50,0.053441000128257525,0,0],[14,132,100,270.1536008439331,0,0],[35,3,5,0.000002810066840916322,0,0],[35,3,50,0.6641351066854954,0,0],[35,3,100,5370.247054556202,2725.296869256398,0],[35,6,5,0.0000027142365493649925,0.020776177524473177,0],[35,6,50,0.48348771109595834,18.34714766497649,0],[35,6,100,4045.601259806386,0,0],[35,35,5,6.643270210291346e-7,0,0],[35,35,50,0.08132362046079694,0,0],[35,35,100,718.4028844832982,0,0],[35,43,5,0.0000015360464329147692,0,0],[35,43,50,0.267819479092719,16.078780275116856,0],[35,43,100,2073.362208987547,1996.3216670085455,0],[35,80,5,0.0000010616042875069898,0,0],[35,80,50,0.25894160729214466,0,0],[35,80,100,2062.7677001586685,0,0],[35,94,5,0.00000194242156070015,0,0.009156358687481464],[35,94,50,0.5389423067561632,20.03542509786002,0],[35,94,100,4598.00707157781,2145.3819507542376,0],[35,125,5,0.0000013044287257287152,0,0.002239950738977603],[35,125,50,0.20751074622803617,0,5.433967383347829],[35,125,100,1617.220009713453,0,1000.0627931402331],[35,126,5,0.000002722515701805057,0.03100858243744648,0],[35,126,50,0.3398364090990719,9.968427663933937,0],[35,126,100,3088.3860758039286,883.3457850747582,0],[35,132,5,5.413321578107429e-7,0,0],[35,132,50,0.06486759047967498,0,0],[35,132,100,571.9995952262359,0,0],[130,3,5,3.817879121910612e-7,0,0],[130,3,50,0.04488343259259657,0,0],[130,3,100,357.52389748852596,0,0],[130,6,5,2.1532069271883702e-7,0,0],[130,6,50,0.03616909362887656,0,0],[130,6,100,305.6887675847768,0,0],[130,35,5,2.9679359466212895e-7,0,0],[130,35,50,0.026641575209410906,0,0],[130,35,100,175.87595846580385,0,0],[130,43,5,2.211428592173817e-7,0,0],[130,43,50,0.015270323485261349,1.1334830340128643,0],[130,43,100,136.40811414682685,108.2714783547275,0],[130,80,5,4.904529089354885e-7,0,0],[130,80,50,0.0954246860545625,0,0],[130,80,100,750.2691585689046,0,0],[130,94,5,4.317694491663138e-7,0,0.0010137027652803458],[130,94,50,0.04276336489651903,2.223600951950003,0],[130,94,100,360.63963953534517,241.7585460640217,0],[130,125,5,0.0000018613211749336366,0,0.0003999141623063692],[130,125,50,0.1817688616404663,0,0.8793344234121618],[130,125,100,1457.9041566472004,0,161.8301889374975],[130,126,5,1.5982003243775107e-7,0.001806060831788336,0],[130,126,50,0.01504475618211645,0,0],[130,126,100,119.97947439693618,52.414551315657626,0],[130,132,5,1.8606163721418255e-7,0,0],[130,132,50,0.03360443479995723,0,0],[130,132,100,331.78582841744014,0,0],[25,3,5,0.000002280366439888471,0,0],[25,3,50,0.43768938476287383,0,0],[25,3,100,3632.5565651959723,0,0],[25,6,5,7.397257690466844e-7,0.003977358032387991,0],[25,6,50,0.16209598826957966,3.550052498262655,0],[25,6,100,1387.3402770755386,0,0],[25,35,5,5.016096563142579e-7,0,0],[25,35,50,0.07538177572440981,0,0],[25,35,100,524.3748547607688,0,0],[25,43,5,0.0000012353557190929215,0,0],[25,43,50,0.14830667726819902,9.285557124116083,0],[25,43,100,1391.7112960369118,880.8215959870629,0],[25,80,5,5.363504422500417e-7,0,0],[25,80,50,0.16176177445385306,0,0],[25,80,100,1304.212545935666,0,0],[25,94,5,0.0000010156843342431078,0,0.0034334701046044927],[25,94,50,0.1800172091093565,7.740214012223745,0],[25,94,100,1568.6689842054127,836.5911264315113,0],[25,125,5,0.0000011990459932245592,0,0],[25,125,50,0.14573950984325884,0,3.713921430075648],[25,125,100,1374.955821887849,0,355.17265127954073],[25,126,5,0.0000011411796882745932,0.00613589574607685,0],[25,126,50,0.2057930206707391,3.756770435674669,0],[25,126,100,1894.3749717641747,334.6617672955465,0],[25,132,5,3.9083985042368975e-7,0,0],[25,132,50,0.05853369241121824,0,0],[25,132,100,354.51655360298275,0,0],[81,3,5,6.169606848271478e-7,0,0],[81,3,50,0.08754076385418655,0,0],[81,3,100,1027.6359828457119,0,0],[81,6,5,8.099135566389102e-7,0.001913125461604518,0],[81,6,50,0.166543129263512,1.719335092531137,0],[81,6,100,1431.1280639923766,0,0],[81,35,5,1.4216396204099552e-7,0,0],[81,35,50,0.03535636996348817,0,0],[81,35,100,201.92568455140582,0,0],[81,43,5,3.4813325563207905e-7,0,0],[81,43,50,0.04100968036585785,0,0],[81,43,100,385.57455221765866,0,0],[81,80,5,1.3678962828722082e-7,0,0],[81,80,50,0.08229356871183159,0,0],[81,80,100,623.8545237413739,0,0],[81,94,5,5.62182014798767e-7,0,0.0017395340649279775],[81,94,50,0.044130056171245095,4.272246985047696,0],[81,94,100,805.0207473125647,413.32391246929217,0],[81,125,5,6.928608217409065e-7,0,0.0014707762576115985],[81,125,50,0.11274244968582607,0,4.794577473407333],[81,125,100,1054.4043534225843,0,278.54193058419605],[81,126,5,0.0000014594392468539248,0.00344739307045083,0],[81,126,50,0.24718078493845536,4.964135529365215,0],[81,126,100,2305.158838876117,0,0],[81,132,5,1.4037361132980046e-7,0,0],[81,132,50,0.03345690426080576,0,0],[81,132,100,262.3440339806626,0,0]];

test('raid ally scores match 135 native counterParts cases including inherited status moves',()=>{
    for(const [boss,id,level,value,dot,para] of NATIVE_CASES){const expected=value+dot-(dot>0?para:0),actual=H.allyStrength([{id,level}],boss);assert.ok(Math.abs(expected-actual)<=Math.max(1,Math.abs(expected))*1e-9,JSON.stringify({boss,id,level,expected,actual}));}
});
test('native DOT saturates at two status members and paralysis can suppress that contribution',()=>{
    const [boss,id,level,value,dot,para]=NATIVE_CASES.find(row=>row[0]===130&&row[1]===43&&row[2]===100),mon={id,level};
    assert.ok(dot>0);const actual=H.allyStrength([mon,mon,mon],boss),expected=3*value+1.5*dot-(dot>0?3*para:0);assert.ok(Math.abs(actual-expected)<1e-8);
    assert.ok(H.allyStrength([{id:43,level:100}],130)>H.allyStrength([{id:35,level:100}],130),'native poison uptime can outweigh Clefairy\'s greater direct damage');
    const [,electricId,electricLevel,electricValue,electricDot,electricPara]=NATIVE_CASES.find(row=>row[0]===130&&row[1]===125&&row[2]===100);
    assert.ok(electricPara>0);assert.equal(electricDot,0);
    assert.ok(Math.abs(H.allyStrength([mon,{id:electricId,level:electricLevel}],boss)-(value+electricValue+dot-electricPara))<1e-8,'the native paralysis contribution is deducted when poison damage is already present');
});
function member(id,level,{shiny=false,rank='',capped=false}={}){
    const image={dataset:{id:String(id)},getAttribute:()=>`assets/pokemon/${shiny?'art/shiny/still/':''}${id}.png`};
    return {textContent:'',querySelector:sel=>sel==='.rt-lv'?{textContent:capped?`120 ${level}`:`Lv. ${level}`}:sel==='.rk-n'&&rank?{textContent:rank}:null,querySelectorAll:()=>[image]};
}
function pick(t,{boss=130,friends=[],bots=[],own=[],selected=[],unavailable=[]}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle};t.after(()=>{for(const key of Object.keys(previous))if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const choices=[...friends.map(({key,mons})=>({key,members:mons.map(m=>member(m.id,m.level,m))})),...bots.filter(bot=>!unavailable.includes(bot.key)).map(bot=>({key:bot.key,members:[]}))].map(({key,members})=>({dataset:{pick:key},querySelectorAll:()=>members}));
    const root={isConnected:true,hidden:false,closest:()=>null,getClientRects:()=>[{}],getAttribute:()=>null};
    for(const choice of choices)Object.assign(choice,root);
    global.document={querySelector:sel=>sel==='#modal-root.open .raid-dlg'?root:null,querySelectorAll:sel=>sel==='#modal-root.open .raid-dlg [data-pick]'?choices:[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const state={mons:own.map((m,i)=>({...m,uid:'own'+i})),eventTeams:{'raid:kanto':own.map((m,i)=>'own'+i)},raids:{bots:{kanto:bots},pick:{kanto:selected}}};
    let picked=null;const driver=new H.DOMDriver({});driver.raid={reg:'kanto',boss};driver.ownedDialog={type:'ally',started:Date.now()};driver.click=el=>{picked=el.dataset.pick;return true;};
    assert.equal(driver.dialog(state),true);return picked;
}
test('low-level friend is evaluated at the displayed level instead of being promoted to 100',t=>{
    assert.equal(pick(t,{friends:[{key:'friend',mons:[{id:125,level:5}]}],bots:[{key:'bot',mons:[{id:126,level:100}]}]}),'bot');
});
test('friend shiny sprites and capped displayed levels affect the comparison',t=>{
    assert.equal(pick(t,{friends:[{key:'plain',mons:[{id:125,level:100}]},{key:'shiny',mons:[{id:125,level:100,shiny:true,capped:true}]}]}),'shiny');
});
test('friend visible rank is retained when comparing otherwise identical members',t=>{
    assert.equal(pick(t,{friends:[{key:'plain',mons:[{id:125,level:100}]},{key:'ranked',mons:[{id:125,level:100,rank:'II'}]}]}),'ranked');
});
test('ally selection accounts for the player team rather than stacking redundant poison members',t=>{
    assert.ok(H.allyStrength([{id:43,level:100}],130)>H.allyStrength([{id:35,level:100}],130),'a poison ally wins before the existing player roster is considered');
    assert.equal(pick(t,{boss:130,own:[{id:43,level:100},{id:43,level:100}],bots:[{key:'poison',mons:[{id:43,level:100}]},{key:'damage',mons:[{id:35,level:100}]}]}),'damage');
});
test('a previously chosen ally contributes to the full roster and equal scores keep display order',t=>{
    const poison={id:43,level:100},damage={id:35,level:100};
    const bots=[{key:'chosen',mons:[poison,poison]},{key:'more-poison',mons:[poison]},
        {key:'first-damage',mons:[damage]},{key:'second-damage',mons:[damage]}];
    assert.equal(pick(t,{boss:130,bots,selected:['chosen'],unavailable:['chosen']}),'first-damage');
});

test('a queued native picker can mount on a later tick and an empty roster yields to the main task', t=>{
    const prev={document:global.document,getComputedStyle:global.getComputedStyle};
    t.after(()=>{for(const [k,v] of Object.entries(prev))if(v===undefined)delete global[k];else global[k]=v;});
    let open=false,closes=0;
    const close={},root={isConnected:true,closest:()=>null,getClientRects:()=>[{}],querySelector:k=>k==='.dc-x'?close:null};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    global.document={querySelector:k=>open&&k==='#modal-root.open .raid-dlg'?root:null,querySelectorAll:()=>[]};
    const e=new H.Engine({}),d=e.driver;e.raidProbe=true;
    d.raid={reg:'kanto',boss:35};d.ownedDialog={type:'ally',openingUntil:Date.now()+5000};
    d.click=el=>{assert.equal(el,close);closes++;return true;};
    assert.equal(d.dialog({}),true);assert.ok(d.ownedDialog);open=true;
    assert.equal(d.dialog({}),true);assert.equal(closes,0);d.ownedDialog.started=Date.now()-11000;
    assert.equal(d.dialog({}),true);assert.equal(closes,1);assert.equal(e.raidProbe,false);
    assert.equal(d.ownedDialog,null);assert.ok(e.nextRaid>Date.now());assert.ok(e.raidCooldown[H.parisDay()+'|kanto']>Date.now());
});
