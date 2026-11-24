'use strict';
const assert=require('node:assert/strict');

module.exports=async function verifyNativeFamily({send,evaluate}){
    const visit=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
    const resize=width=>send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<500});
    const setUp=()=>{
        const modal=document.querySelector('#modal-root'),root=document.querySelector('#pokecatch-auto-helper').shadowRoot;
        const original=mock.state.mons,menu=document.createElement('div'),style=document.createElement('style');
        // The game supplies the light button face and inherited light text seen in the original card.
        style.textContent=`
          .family-test-modal{box-sizing:border-box;width:min(520px,calc(100vw - 20px));padding:16px;background:#1b2031;color:#edf3ff}
          .family-test-modal :where(button){color:inherit}
          .family-test-modal .evo-chain{display:flex;align-items:center}
          .family-test-modal .evo{flex:0 0 102px;text-align:center}
          .family-test-modal .arrow{min-width:36px}
          .family-test-light .family-test-modal{--text:#172033;--muted:#475569;--panel-2:#ebeff5;--line:#94a3b8;background:white;color:var(--text)}
        `;
        document.head.append(style);
        mock.state.mons=[{uid:'base',id:4,level:5},{uid:'flame',id:5,level:100},
            {uid:'shiny-flame',id:5,level:76,shiny:true},{uid:'wing',id:6,level:83}];
        mock.save();
        menu.id='dex-regions';
        menu.innerHTML='<div class="dex-region">'+[4,5,6].map(id=>'<button class="dex-cell" data-id="'+id+'"></button>').join('')+'</div>';
        document.body.append(menu);
        const names=__pcTest.DATA.mons.filter(m=>[4,5,6].includes(m.id));
        const tile=(id,cls)=>'<div class="evo '+cls+'"><img src="data:," data-id="'+id+'" alt=""><span>'+names.find(mon=>mon.id===id).name+'</span></div>';
        function card(owned){
            modal.className='open';
            modal.innerHTML='<div class="modal dexcard-modal family-test-modal"><div class="'+(owned?'mon-card':'dexcard')+'">'+
                '<div class="dc-sec fam-sec"><h3>家族</h3><div class="evo-chain">'+tile(4,'cur own')+
                '<div class="arrow">Lv.16</div>'+tile(5,'own')+'<div class="arrow">Lv.36</div>'+tile(6,'unknown')+
                '</div></div></div><button class="dc-nav next">下一只</button></div>';
            __pcTest.engine.onChange();
        }
        window.familyTest={root,modal,menu,style,original,card,names,button:(id,shiny=false)=>{
            const name=names.find(mon=>mon.id===id).name;
            return [...modal.querySelectorAll('.pch-native-family button')].find(b=>b.textContent.includes(name)&&
                (b.textContent.includes('异色')===shiny));
        }};
        card(true);
    };
    await visit(setUp);
    try{
        for(const [width,light] of [[1280,false],[320,false],[320,true]]){
            await resize(width);
            const state=await visit(light=>{
                const {modal,names}=familyTest,group=modal.querySelector('.pch-native-family');
                modal.classList.toggle('family-test-light',light);
                const all=[...group.querySelectorAll('button')],content=modal.querySelector('.fam-sec').getBoundingClientRect();
                const rgb=value=>value.match(/[\d.]+/g).map(Number);
                const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
                const lum=cols=>cols.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4)
                    .reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
                function contrast(node){
                    const layers=[];
                    for(let p=node;p;p=p.parentElement)layers.push(rgb(getComputedStyle(p).backgroundColor));
                    const bg=layers.reverse().reduce((back,front)=>blend(front,back),[255,255,255]);
                    const a=lum(blend(rgb(getComputedStyle(node).color),bg)),b=lum(bg);
                    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
                }
                const chain=modal.querySelector('.evo-chain');
                chain.scrollLeft=chain.scrollWidth;
                const scrolled=chain.scrollLeft,endVisible=chain.lastElementChild.getBoundingClientRect().right<=chain.getBoundingClientRect().right+1;
                chain.scrollLeft=0;
                return {count:all.length,labels:all.map(b=>b.getAttribute('aria-label')||b.textContent),
                    minimum:Math.min(...all.flatMap(b=>[b,...b.querySelectorAll('*')].filter(n=>
                        [...n.childNodes].some(c=>c.nodeType===Node.TEXT_NODE&&/[\p{L}\d]/u.test(c.textContent))).map(contrast))),
                    contained:all.every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>=44&&
                        r.left>=content.left-1&&r.right<=content.right+1&&b.scrollWidth<=b.clientWidth+1;}),
                    names:names.map(m=>m.name),rows:new Set(all.map(b=>Math.round(b.getBoundingClientRect().top))).size,
                    pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,scrolled,endVisible};
            },light);
            assert.equal(state.count,3,'One button per species and owned colour variant');
            assert.ok(state.labels.some(s=>s.includes(state.names[1])&&s.includes('异色')&&s.includes('76')));
            assert.ok(state.labels.some(s=>s.includes(state.names[1])&&s.includes('普通')&&s.includes('100')));
            assert.ok(state.minimum>=4.5,'Family button text contrast was '+state.minimum);
            assert.ok(state.contained,JSON.stringify(state));
            if(width===320){
                assert.ok(state.rows>1,'Family actions wrap within a narrow card');
                assert.ok(state.scrolled>0&&state.endVisible,'The last evolution tile is reachable by scrolling inside the chain');
                assert.ok(state.pageWidth<=state.viewport+1,'Overflow stays inside the evolution chain');
            }
        }
        await visit(()=>familyTest.button(5,true).focus());
        for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',
            windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
        assert.deepEqual(await visit(()=>{
            const {root}=familyTest;
            return [root.querySelector('[data-insight-view="compare"]').getAttribute('aria-pressed'),root.querySelector('[data-insight="a"]').value];
        }),['true','shiny-flame'],'Enter opens the exact shiny individual in route comparison');
        const adjacent=await visit(()=>{
            const {modal,menu,card,button}=familyTest;
            modal.className='';modal.replaceChildren();
            menu.querySelector('[data-id="4"]').onclick=()=>card(false);
            menu.querySelector('[data-id="4"]').click();
            let count=0;modal.querySelector('.dc-nav.next').onclick=()=>count++;
            button(5).click();
            return [count,modal.querySelectorAll('.pch-native-family button').length];
        });
        assert.deepEqual(adjacent,[1,2],'The native dex arrow is used once for adjacent species');
    }finally{
        await resize(1280);
        await visit(()=>{
            const {original,menu,style,modal,root}=familyTest;
            modal.className='';modal.replaceChildren();menu.remove();style.remove();
            mock.state.mons=original;mock.save();
            root.querySelector('[data-workspace="tasks"]').click();__pcTest.engine.onChange();delete window.familyTest;
        });
    }
};
