'use strict';
const assert=require('node:assert/strict');
module.exports=async function verifyBossMoves(evaluate){
    const result=await evaluate('('+scenario.toString()+')()');
    assert.deepEqual(result,{initial:false,cancelled:true,rejected:true,disabledAgain:true,userDialog:true,inferno:true,overheat:true,again:true,restored:true,quiet:true,switchClicks:2});
};
async function scenario(){
    const e=window.__pcTest.engine,ui=document.querySelector('#pokecatch-auto-helper').shadowRoot;
    const toggle=ui.querySelector('#boss-moves'),initial=toggle.checked;
    const s=window.mock.state,mon=s.mons[0],original=['hex'],keys=['inferno','overheat','hex','shadow-ball','ember'];
    Object.assign(mon,{id:609,ban:original.slice()});
    Object.assign(s.adv,{zone:{id:150},battle:{kind:'static',zone:150,enemies:[{uid:'foe',id:150,hp:100}],foes:['foe'],allies:[mon.uid]}});
    window.mock.save();
    let clicks=0;
    const modal=document.querySelector('#modal-root'),team=document.createElement('div');
    team.id='adv-team';team.innerHTML='<button class="tcard"></button>';document.body.append(team);
    const card=team.firstChild;card.dataset.uid=mon.uid;
    card.onclick=()=>{
        modal.classList.add('open');
        modal.innerHTML='<div class="mon-modal"><div class="mon-card"><button class="dc-x"></button><button class="dc-move tap"></button></div></div>';
        modal.querySelector('.dc-x').onclick=()=>{modal.classList.remove('open');modal.replaceChildren();};
        modal.querySelector('.dc-move').onclick=()=>{
            const root=document.createElement('div');root.className='mvd-root';document.body.append(root);
            const paint=()=>{
                root.innerHTML='<aside class="mvd own"><div class="mvd-head"><button class="dc-x"></button></div>'+keys.map(k=>'<li data-k="'+k+'" class="mvd-row done '+(mon.ban.includes(k)?'ban':'')+'"><div class="mvd-mv"></div></li>').join('')+'</aside>';
                // Like the game, retain the aside while replacing its move rows after each click.
                root.querySelector('.dc-x').onclick=()=>root.remove();
                root.onclick=ev=>{
                    const row=ev.target.closest('.mvd-mv')?.parentElement;if(!row)return;
                    const k=row.dataset.k;mon.ban=mon.ban.includes(k)?mon.ban.filter(x=>x!==k):[...mon.ban,k];
                    window.mock.save();clicks++;
                    for(const old of root.querySelectorAll('.mvd-row')){
                        const fresh=old.cloneNode(true);fresh.classList.toggle('ban',mon.ban.includes(fresh.dataset.k));old.replaceWith(fresh);
                    }
                };
            };paint();
        };
    };
    const run=async(n=5)=>{for(let i=0;i<n;i++)await e.bossMoves.tick(Date.now()+10000+i*500);};
    modal.classList.add('open');
    const password=ui.querySelector('#boss-password'),form=ui.querySelector('#boss-unlock');
    toggle.click();password.value='cancel';ui.querySelector('#boss-unlock-cancel').click();
    const cancelled=!toggle.checked&&!e.bossMoves.enabled()&&!password.value&&form.classList.contains('hidden');
    toggle.click();password.value='Offline-fixture-pass';form.requestSubmit();
    for(let i=0;i<50&&!ui.querySelector('#boss-unlock-error').textContent;i++)await new Promise(r=>setTimeout(r,10));
    const rejected=!toggle.checked&&!e.bossMoves.enabled()&&ui.querySelector('#boss-unlock-error').textContent.includes('密码错误');
    password.value='offline-fixture-pass';form.requestSubmit();
    for(let i=0;i<50&&!toggle.checked;i++)await new Promise(r=>setTimeout(r,10));
    await run();const userDialog=clicks===0&&modal.classList.contains('open');
    modal.classList.remove('open');
    // The deliberately blocked dialog set a short retry delay.
    e.bossMoves.retry.clear();await run();
    const only=k=>keys.filter(x=>!mon.ban.includes(x)).join('')===k;
    const inferno=only('inferno'),before=clicks;await run();const quiet=before===clicks;
    const arena=document.createElement('div');arena.id='enemy-slot';arena.innerHTML='<div class="enemy" data-uid="foe"></div>';
    document.querySelector('#screen-adventure').append(arena);await run();
    // The arena can show a burn before the next persisted game snapshot.
    arena.firstChild.classList.add('st-burn');
    for(let i=0;i<25&&!only('overheat');i++)await new Promise(r=>setTimeout(r,20));
    const overheat=only('overheat'),switchClicks=clicks-before;
    arena.firstChild.classList.remove('st-burn');await run();const again=only('inferno');
    s.adv.battle=null;window.mock.save();await run();const restored=JSON.stringify(mon.ban)===JSON.stringify(original);
    toggle.click();await run();toggle.click();
    const disabledAgain=!toggle.checked&&!e.bossMoves.enabled()&&!password.value&&!form.classList.contains('hidden');
    return {initial,cancelled,rejected,disabledAgain,userDialog,inferno,overheat,again,restored,quiet,switchClicks};
}
