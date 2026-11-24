'use strict';
const assert=require('node:assert/strict');

module.exports=async function verifyGameInsights({send,evaluate}){
    const visit=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
    async function viewport(width){
        await send('Emulation.setDeviceMetricsOverride',{
            width,height:width===320?680:900,deviceScaleFactor:1,mobile:width===320,
        });
        await send('Emulation.setTouchEmulationEnabled',{enabled:width===320,maxTouchPoints:1});
    }
    async function key(key,code,virtualKey){
        for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{
            type,key,code,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey,
            ...(type==='keyDown'&&key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{}),
        });
    }
    await visit(()=>{
        const root=document.querySelector('#pokecatch-auto-helper').shadowRoot;
        const original={mons:mock.state.mons,team:mock.state.team,chapter:mock.state.adv.chapter,build:window.BUILD};
        const reviewedBundle=document.createElement('script');
        reviewedBundle.type='application/json';reviewedBundle.src='bundle/app.f1ef0dd44e.js';document.head.append(reviewedBundle);
        const common={id:111,level:60};
        const mons=[{...common,uid:'rhino-normal',ban:['tackle']},{...common,uid:'rhino-shiny',shiny:true},
            {...common,id:6,uid:'third-uid-'+('long-'.repeat(13))}];
        mock.state.mons=[mons[2],mons[0],mons[1]];mock.state.team=mons.slice(0,2).map(m=>m.uid);mock.state.adv.chapter=0;mock.save();
        const get=selector=>{const node=root.querySelector(selector);if(!node)throw Error('Missing '+selector);return node;};
        const field=id=>get('[data-insight="'+id+'"]'),tab=id=>get('[data-insight-view="'+id+'"]');
        window.insightCheck={root,get,tab,field,original,reviewedBundle,save:localStorage.getItem('gachamon-save-v1'),actions:mock.actions,
            rows:()=>Object.fromEntries(['damage','accuracy','endurance'].map(metric=>[metric,
                [...get('[data-metric="'+metric+'"]').querySelectorAll('td')].map(cell=>cell.textContent.trim())])),
            choose:(id,value)=>{const select=field(id);select.value=value;if(select.value!==value)throw Error('Option not selectable: '+id+'='+value);
                select.dispatchEvent(new Event('change',{bubbles:true}));},
        };
        get('[data-workspace="dex"]').click();
    });
    try{
        for(const width of [1280,320]){
            await viewport(width);
            await visit(()=>{
                const {tab}=insightCheck;
                tab('catalog').click();
                tab('compare').focus();
            });
            await key('Enter','Enter',13);
            const state=await visit(()=>{
                const {root,get,tab,field}=insightCheck;
                return {pressed:tab('compare').getAttribute('aria-pressed'),workspace:get('[data-workspace="dex"]').getAttribute('aria-pressed'),
                    a:field('a').value,active:root.activeElement?.textContent?.slice(0,65),message:field('evaluation').textContent.slice(0,150)};
            });
            assert.equal(state.pressed,'true',JSON.stringify(state));
            assert.ok(state.message,JSON.stringify(state));
            const initial=await visit(()=>{
                const {tab,field,rows}=insightCheck;
                return {pressed:tab('compare').getAttribute('aria-pressed'),a:field('a').value,b:field('b').value,rows:rows()};
            });
            assert.equal(initial.pressed,'true','Compare opens from the keyboard');
            assert.deepEqual([initial.a,initial.b],['rhino-normal','rhino-shiny'],'Two owned UIDs of the same species remain distinct');
            assert.ok(Object.values(initial.rows).every(values=>values.length===2&&values.every(Boolean)));
            assert.notEqual(initial.rows.damage[0],initial.rows.damage[1],'The shiny individual has different damage');
            const teamOptions=await visit(()=>{
                const {field}=insightCheck,filter=field('filter');
                filter.value='在队';filter.dispatchEvent(new Event('input',{bubbles:true}));
                const options=[...field('a').options].map(o=>[o.value,o.textContent.includes('在队')]);
                filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}));
                return options;
            });
            assert.deepEqual(teamOptions,[['rhino-normal',true],['rhino-shiny',true]],'Team members are labeled and searchable independently of box order');
            const changed=await visit(()=>{
                const {choose,rows}=insightCheck;
                choose('chapter','4');return rows();
            });
            assert.notDeepEqual(changed.damage,initial.rows.damage,'Changing the opponent route recalculates both columns');
            const advice=await visit(()=>{
                const {tab,field,get}=insightCheck;
                tab('advice').click();
                const group=kind=>get('[data-move-group="'+kind+'"]');
                return {pressed:tab('advice').getAttribute('aria-pressed'),a:field('a').value,chapter:field('chapter').value,
                    bVisible:field('b').getClientRects().length>0,title:get('#insight-advice-title').textContent,
                    considerOpen:group('consider').open,consider:group('consider').textContent,
                    keep:group('keep').textContent,banned:group('banned').textContent};
            });
            assert.deepEqual([advice.pressed,advice.a,advice.chapter,advice.bVisible],['true','rhino-normal','4',false]);
            assert.ok(advice.title.trim()&&advice.considerOpen&&advice.consider.trim()&&advice.keep.trim());
            assert.match(advice.banned,/撞击|撞擊|Tackle|Charge/i,'The advice for A includes its native ban');
            await visit(()=>insightCheck.get('[data-move-group="keep"] summary').focus());
            const wasOpen=await visit(()=>insightCheck.get('[data-move-group="keep"]').open);
            await key('Enter','Enter',13);
            assert.equal(await visit(()=>insightCheck.get('[data-move-group="keep"]').open),!wasOpen);
            const retained=await visit(()=>{
                const {tab,field,rows}=insightCheck;
                tab('compare').click();return [field('a').value,field('b').value,field('chapter').value,rows()];
            });
            assert.deepEqual(retained,['rhino-normal','rhino-shiny','4',changed]);
            await visit(()=>insightCheck.field('inspect-b').focus());
            await key('Enter','Enter',13);
            const partner=await visit(()=>{
                const {tab,field,root}=insightCheck;
                const result=[field('a').value,!!field('moves').querySelector('[data-move-group="banned"]'),
                    root.activeElement?.id];
                tab('compare').click();return [...result,field('a').value,field('b').value];
            });
            assert.deepEqual(partner,['rhino-shiny',false,'insight-advice-title','rhino-normal','rhino-shiny'],
                'Inspecting B shows only its own bans and preserves the comparison pair');
            const singles=await visit(()=>{
                const {choose,field,rows}=insightCheck;
                choose('b','');const single=rows();choose('b','rhino-shiny');choose('a','rhino-shiny');
                return {single,b:field('b').value,a:field('a').value};
            });
            assert.ok(Object.values(singles.single).every(values=>values.length===1),'Opting out removes the comparison column');
            assert.equal(singles.a,'rhino-shiny');assert.notEqual(singles.a,singles.b);
            const filtered=await visit(()=>{
                const {field}=insightCheck,input=field('filter');
                input.focus();input.value='third-uid';input.dispatchEvent(new Event('input',{bubbles:true}));
                return [...field('a').options].some(option=>option.value.startsWith('third-uid'));
            });
            assert.ok(filtered);
            for(const view of ['advice','compare']){
                await visit(view=>{
                    const {tab,get}=insightCheck;
                    tab('catalog').click();
                    const search=get('#dex-search');search.value='#111';search.dispatchEvent(new Event('input',{bubbles:true}));
                    const select=get('.dex-owned-tools select');select.value='rhino-shiny';
                    select.dispatchEvent(new Event('change',{bubbles:true}));
                    get('[data-owned-view="'+view+'"]').focus();
                },view);
                await key('Enter','Enter',13);
                const opened=await visit(view=>{
                    const {tab,root,field,get}=insightCheck;
                    const target=view==='advice'?get('#insight-advice-title'):field('b');
                    return [tab(view).getAttribute('aria-pressed'),field('a').value,root.activeElement===target];
                },view);
                assert.deepEqual(opened,['true','rhino-shiny',true],'The species detail opens the selected UID and moves keyboard focus');
                await key('Tab','Tab',9);
                assert.ok(await visit(()=>insightCheck.root.activeElement?.getClientRects().length>0),
                    'Tab reaches another visible control after the detail handoff');
            }
            if(width===320){
                const point=await visit(()=>{
                    const button=insightCheck.tab('advice');button.scrollIntoView({block:'center'});
                    const box=button.getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2};
                });
                await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
                await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
                assert.equal(await visit(()=>insightCheck.tab('advice').getAttribute('aria-pressed')),'true',
                    'The advice page opens by tapping the visible button on the narrow screen');
                for(const view of ['compare','advice']){
                    const bounds=await visit(view=>{
                        const {root,get,tab,field,choose}=insightCheck;
                        tab(view).click();
                        choose('a',[...field('a').options].find(option=>option.value.startsWith('third-uid')).value);
                        const content=root.querySelector('.content'),panel=root.querySelector('.panel').getBoundingClientRect();
                        const nodes=[...get('#game-insights').querySelectorAll('button,select,input,summary,table')].filter(node=>node.getClientRects().length);
                        const outside=nodes.filter(node=>{const rect=node.getBoundingClientRect();return rect.left<panel.left-1||rect.right>panel.right+1;})
                            .map(node=>node.tagName+' '+node.getAttribute('data-insight'));
                        return {viewport:innerWidth,occupied:document.documentElement.scrollWidth,panel:[panel.left,panel.right],
                            scrollWidth:content.scrollWidth,clientWidth:content.clientWidth,outside};
                    },view);
                    assert.equal(bounds.viewport,320);
                    assert.ok(bounds.occupied<=321&&bounds.panel[0]>=0&&bounds.panel[1]<=321,JSON.stringify(bounds));
                    assert.ok(bounds.scrollWidth<=bounds.clientWidth+1,JSON.stringify(bounds));
                    assert.deepEqual(bounds.outside,[],view+' controls remain within the panel');
                }
            }
            await visit(()=>{
                const {tab,field,choose}=insightCheck;
                tab('compare').click();
                field('filter').value='';field('filter').dispatchEvent(new Event('input',{bubbles:true}));
                choose('a','rhino-normal');choose('b','rhino-shiny');choose('chapter','current');
            });
            assert.ok(await visit(()=>insightCheck.save===localStorage.getItem('gachamon-save-v1')&&insightCheck.actions===mock.actions),
                'Opening, filtering and comparing never changes the game save or executes a native action');
        }
        await visit(()=>{
            const {choose,field}=insightCheck;
            choose('chapter','4');field('inspect-a').click();
        });
        function readAdvice(){
            const {field}=insightCheck,advice=field('advice');
            const notices=[...advice.querySelectorAll('[data-insight="rule-notice"]')];
            const groups={};
            for(const group of advice.querySelectorAll('[data-move-group]')){
                groups[group.dataset.moveGroup]=[...group.querySelectorAll('li')].map(item=>[
                    item.querySelector('strong').textContent,item.querySelector('p')?.textContent||'',
                ]);
            }
            return {groups,visibleNotices:notices.filter(node=>node.getClientRects().length).map(node=>node.textContent),
                ruleMentions:(advice.textContent.match(/待核[验对]/g)||[]).length};
        }
        const reviewed=await visit(readAdvice);
        assert.deepEqual(reviewed.visibleNotices,[]);
        assert.equal(reviewed.ruleMentions,0);
        for(const key of ['consider','keep','banned']){
            assert.ok(reviewed.groups[key]?.length&&reviewed.groups[key].every(([name,reason])=>name&&reason),
                'All three groups have individual reasons for the reviewed A fixture');
        }
        for(const [bundle,build] of [['3bdd8140e1','b221fce46b'],['cafe000000','cafe111111']]){
            await visit((bundle,build)=>{
                const {reviewedBundle,choose}=insightCheck;
                window.BUILD=build;reviewedBundle.src='bundle/app.'+bundle+'.js';choose('chapter','4');
            },bundle,build);
            const reference=await visit(readAdvice);
            assert.equal(reference.visibleNotices.length,1,'Reference advice has one visible notice');
            assert.match(reference.visibleNotices[0],/参考|估算/);
            assert.equal(reference.ruleMentions,1,'The version reminder is not repeated in move rows');
            assert.deepEqual(reference.groups,reviewed.groups,'Old and unknown builds retain the same candidates, protections and individual reasons');
            const route=await visit(()=>{
                const {tab,field}=insightCheck;
                tab('compare').click();const selected=[field('a').value,field('b').value,field('chapter').value];
                field('inspect-b').click();return [...selected,field('a').value];
            });
            assert.deepEqual(route,['rhino-normal','rhino-shiny','4','rhino-shiny']);
            const partner=await visit(readAdvice);
            assert.equal(partner.ruleMentions,1);assert.equal(partner.visibleNotices.length,1);
            assert.ok(partner.groups.consider?.length&&!partner.groups.banned,'B gets its own candidates and has no native bans');
            await visit(()=>{insightCheck.tab('compare').click();insightCheck.field('inspect-a').click();});
        }
        await visit(()=>{
            const {reviewedBundle,original,choose}=insightCheck;
            window.BUILD=original.build;reviewedBundle.src='bundle/app.f1ef0dd44e.js';choose('chapter','4');
        });
        assert.deepEqual(await visit(readAdvice),reviewed,'The single reference notice clears when the reviewed rules return');
        assert.ok(await visit(()=>insightCheck.save===localStorage.getItem('gachamon-save-v1')&&insightCheck.actions===mock.actions),
            'Reference advice does not change the game save or execute any game action');
    }finally{
        await viewport(1280);
        await visit(()=>{
            const {original,tab,get,reviewedBundle}=insightCheck;
            reviewedBundle.remove();window.BUILD=original.build;
            tab('catalog').click();
            mock.state.mons=original.mons;mock.state.team=original.team;mock.state.adv.chapter=original.chapter;mock.save();
            get('[data-workspace="tasks"]').click();__pcTest.engine.onChange();
            delete window.insightCheck;
        });
    }
};
